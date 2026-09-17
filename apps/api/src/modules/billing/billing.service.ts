import { BadRequestException, Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private getAppBaseUrl() {
    return process.env.APP_BASE_URL || process.env.WEB_BASE_URL || "http://localhost:3000";
  }

  private getStripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY || "";
  }

  private getStripePublishableKey() {
    return process.env.STRIPE_PUBLISHABLE_KEY || "";
  }

  private getStripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || "";
  }

  private getPriceMap() {
    return {
      starter: process.env.STRIPE_PRICE_STARTER_MONTHLY || "",
      growth: process.env.STRIPE_PRICE_GROWTH_MONTHLY || "",
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || "",
    };
  }

  private getStripeClient() {
    const secretKey = this.getStripeSecretKey();
    if (!secretKey) {
      throw new BadRequestException("Stripe is not configured yet. Add STRIPE_SECRET_KEY and plan price IDs first.");
    }

    return new Stripe(secretKey);
  }

  private mapPriceIdToPlanCode(priceId?: string | null) {
    const priceMap = this.getPriceMap();
    if (!priceId) return null;
    if (priceId === priceMap.starter) return "starter";
    if (priceId === priceMap.growth) return "growth";
    if (priceId === priceMap.enterprise) return "enterprise";
    return null;
  }

  private async updateTenantFromSubscription(stripeSubscription: Stripe.Subscription) {
    const customerId = typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : stripeSubscription.customer?.id;
    const priceId = stripeSubscription.items.data[0]?.price?.id ?? null;
    const planCode = this.mapPriceIdToPlanCode(priceId) ?? undefined;
    const periodEnd = (stripeSubscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { stripeCustomerId: customerId ?? undefined },
          { stripeSubscriptionId: stripeSubscription.id },
        ],
      },
    });

    if (!tenant) {
      return null;
    }

    const normalizedStatus =
      stripeSubscription.status === "trialing" ||
      stripeSubscription.status === "active" ||
      stripeSubscription.status === "past_due" ||
      stripeSubscription.status === "canceled"
        ? stripeSubscription.status
        : "active";

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        stripeCustomerId: customerId ?? tenant.stripeCustomerId,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: priceId,
        planCode,
        subscriptionStatus: normalizedStatus,
        trialEndsAt: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        subscriptionRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: updated.id,
        action: "STRIPE_SUBSCRIPTION_SYNCED",
        entityType: "Tenant",
        entityId: updated.id,
        metadataJson: {
          planCode: updated.planCode,
          subscriptionStatus: updated.subscriptionStatus,
          stripeSubscriptionId: updated.stripeSubscriptionId,
        },
      },
    });

    return updated;
  }

  async getBillingConfig() {
    const priceMap = this.getPriceMap();
    return {
      configured: Boolean(
        this.getStripeSecretKey() &&
          this.getStripePublishableKey() &&
          priceMap.starter &&
          priceMap.growth &&
          priceMap.enterprise,
      ),
      publishableKey: this.getStripePublishableKey() || null,
      plans: [
        { code: "starter", priceId: priceMap.starter || null },
        { code: "growth", priceId: priceMap.growth || null },
        { code: "enterprise", priceId: priceMap.enterprise || null },
      ],
    };
  }

  async createCheckoutSession(tenantSlug: string, planCode: string) {
    const stripe = this.getStripeClient();
    const priceMap = this.getPriceMap();
    const priceId = priceMap[planCode as keyof typeof priceMap];

    if (!priceId) {
      throw new BadRequestException("Selected Stripe plan is not configured.");
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new BadRequestException("Tenant not found.");
    }

    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        email: tenant.billingEmail || tenant.supportEmail || undefined,
        metadata: {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
        },
      });
      customerId = customer.id;
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${this.getAppBaseUrl()}/settings/billing?stripe=success`,
      cancel_url: `${this.getAppBaseUrl()}/settings/billing?stripe=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          planCode,
        },
      },
      metadata: {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        planCode,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "STRIPE_CHECKOUT_CREATED",
        entityType: "Tenant",
        entityId: tenant.id,
        metadataJson: {
          planCode,
          sessionId: session.id,
        },
      },
    });

    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(tenantSlug: string) {
    const stripe = this.getStripeClient();
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant?.stripeCustomerId) {
      throw new BadRequestException("This tenant does not have a Stripe customer yet.");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${this.getAppBaseUrl()}/settings/billing`,
    });

    return { url: session.url };
  }

  async syncTenantSubscription(tenantSlug: string) {
    const stripe = this.getStripeClient();
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new BadRequestException("Tenant not found.");
    }

    if (!tenant.stripeSubscriptionId && !tenant.stripeCustomerId) {
      throw new BadRequestException("No Stripe subscription is linked to this tenant yet.");
    }

    let subscription: Stripe.Subscription | null = null;
    if (tenant.stripeSubscriptionId) {
      subscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
    } else if (tenant.stripeCustomerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: tenant.stripeCustomerId,
        limit: 1,
        status: "all",
      });
      subscription = subscriptions.data[0] ?? null;
    }

    if (!subscription) {
      throw new BadRequestException("No Stripe subscription record was found for this tenant.");
    }

    const updated = await this.updateTenantFromSubscription(subscription);
    if (!updated) {
      throw new BadRequestException("Stripe subscription was found but could not be matched back to this tenant.");
    }
    return { status: "synced", tenant: updated };
  }

  async handleWebhook(signature: string | undefined, rawBody: Buffer | string) {
    const stripe = this.getStripeClient();
    const webhookSecret = this.getStripeWebhookSecret();
    const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

    if (process.env.NODE_ENV === "production" && (!webhookSecret || !signature)) {
      throw new BadRequestException("Stripe webhook signature validation is required in production.");
    }

    const event =
      webhookSecret && signature
        ? stripe.webhooks.constructEvent(payload, signature, webhookSecret)
        : (JSON.parse(payload) as Stripe.Event);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const tenantSlug = session.metadata?.tenantSlug;
        if (tenantSlug) {
          await this.prisma.tenant.updateMany({
            where: { slug: tenantSlug },
            data: {
              stripeCustomerId: customerId ?? undefined,
              stripeSubscriptionId: subscriptionId ?? undefined,
            },
          });
        }
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await this.updateTenantFromSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await this.updateTenantFromSubscription(subscription);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await this.prisma.tenant.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "past_due" },
          });
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await this.prisma.tenant.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "active" },
          });
        }
        break;
      }
      default:
        break;
    }

    return { received: true, eventType: event.type };
  }
}
