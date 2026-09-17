import { BadRequestException, Injectable } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";

type Provider = "yoco" | "ikhokha";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private appUrl() { return process.env.APP_BASE_URL || process.env.WEB_BASE_URL || "http://localhost:3000"; }
  private planAmounts() {
    return { starter: Number(process.env.PAYMENT_PRICE_STARTER_MONTHLY_CENTS || 0), growth: Number(process.env.PAYMENT_PRICE_GROWTH_MONTHLY_CENTS || 0), enterprise: Number(process.env.PAYMENT_PRICE_ENTERPRISE_MONTHLY_CENTS || 0) };
  }
  private providerConfig(provider: Provider) {
    if (provider === "yoco") {
      const secret = process.env.YOCO_SECRET_KEY || "";
      return { provider, name: "Yoco", configured: Boolean(secret), secret };
    }
    const appId = process.env.IKHOKHA_APP_ID || "";
    const secret = process.env.IKHOKHA_APP_SECRET || "";
    return { provider, name: "iKhokha", configured: Boolean(appId && secret), appId, secret };
  }

  async getBillingConfig() {
    const plans = this.planAmounts();
    const planList = Object.entries(plans).map(([code, amountCents]) => ({ code, amountCents }));
    return { providers: (["yoco", "ikhokha"] as Provider[]).map((provider) => { const config = this.providerConfig(provider); return { provider, name: config.name, configured: config.configured }; }), plans: planList };
  }

  private amountFor(planCode: string) {
    const amount = this.planAmounts()[planCode as keyof ReturnType<BillingService["planAmounts"]>];
    if (!amount || !Number.isInteger(amount) || amount < 100) throw new BadRequestException("This plan does not have a valid monthly amount configured.");
    return amount;
  }

  async createCheckoutSession(provider: Provider, tenantSlug: string, planCode: string) {
    if (provider !== "yoco" && provider !== "ikhokha") throw new BadRequestException("Unsupported payment provider.");
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new BadRequestException("Tenant not found.");
    const amountCents = this.amountFor(planCode);
    const reference = `POP-${tenant.slug}-${planCode}-${randomUUID()}`;
    const successUrl = `${this.appUrl()}/settings/billing?payment=success&provider=${provider}`;
    const cancelUrl = `${this.appUrl()}/settings/billing?payment=cancelled&provider=${provider}`;
    let url: string | undefined;

    if (provider === "yoco") {
      const config = this.providerConfig("yoco");
      if (!config.configured) throw new BadRequestException("Yoco is not configured. Add YOCO_SECRET_KEY first.");
      const response = await fetch("https://payments.yoco.com/api/checkouts", { method: "POST", headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": "application/json", "Idempotency-Key": reference }, body: JSON.stringify({ amount: amountCents, currency: "ZAR", successUrl, cancelUrl, metadata: { tenantSlug: tenant.slug, planCode, reference } }), signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { redirectUrl?: string; message?: string };
      if (!response.ok || !result.redirectUrl) throw new BadRequestException(result.message || "Yoco checkout could not be created.");
      url = result.redirectUrl;
    } else {
      const config = this.providerConfig("ikhokha");
      if (!config.configured) throw new BadRequestException("iKhokha is not configured. Add IKHOKHA_APP_ID and IKHOKHA_APP_SECRET first.");
      const appId = process.env.IKHOKHA_APP_ID || "";
      const endpoint = "https://api.ikhokha.com/public-api/v1/api/payment";
      const body = JSON.stringify({ entityID: process.env.IKHOKHA_ENTITY_ID || appId, externalEntityID: tenant.id, amount: amountCents, currency: "ZAR", requesterUrl: this.appUrl(), mode: process.env.IKHOKHA_MODE || "live", description: `${planCode} monthly subscription`, externalTransactionID: reference, urls: { callbackUrl: `${this.appUrl()}/api/v1/billing/ikhokha/webhook`, successPageUrl: successUrl, failurePageUrl: cancelUrl, cancelUrl } });
      const signature = createHmac("sha256", config.secret).update(new URL(endpoint).pathname + body).digest("hex");
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "IK-APPID": appId, "IK-SIGN": signature }, body, signal: AbortSignal.timeout(15000) });
      const result = await response.json() as { paylinkUrl?: string; message?: string };
      if (!response.ok || !result.paylinkUrl) throw new BadRequestException(result.message || "iKhokha payment link could not be created.");
      url = result.paylinkUrl;
    }

    await this.prisma.auditLog.create({ data: { tenantId: tenant.id, action: `${provider.toUpperCase()}_CHECKOUT_CREATED`, entityType: "Tenant", entityId: tenant.id, metadataJson: { planCode, amountCents, reference } } });
    return { url, reference, provider };
  }
}
