import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("settings")
export class SettingsController {
  private readonly allowedModules = ["crm", "accounting", "hr", "forms", "automation", "settings"] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
  ) {}

  private normalizeRole(role?: string): UserRole {
    const normalized = role?.toUpperCase();
    if (
      normalized === "OWNER" ||
      normalized === "ADMIN" ||
      normalized === "SALES_MANAGER" ||
      normalized === "ACCOUNTANT" ||
      normalized === "HR_MANAGER" ||
      normalized === "AGENT" ||
      normalized === "EMPLOYEE"
    ) {
      return normalized;
    }
    return "EMPLOYEE";
  }

  private normalizeString(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return value;
  }

  private normalizeEnabledModules(modules?: string[]) {
    if (!modules) {
      return undefined;
    }

    const normalized = Array.from(
      new Set(
        modules
          .map((moduleKey) => moduleKey.trim().toLowerCase())
          .filter((moduleKey): moduleKey is (typeof this.allowedModules)[number] =>
            this.allowedModules.includes(moduleKey as (typeof this.allowedModules)[number]),
          ),
      ),
    );

    if (!normalized.includes("settings")) {
      normalized.push("settings");
    }

    return normalized.length ? normalized : ["settings"];
  }

  private roleScope(role: UserRole) {
    switch (role) {
      case "OWNER":
        return { crm: "Full", accounting: "Full", hr: "Full", forms: "Full", automation: "Full", settings: "Full" };
      case "ADMIN":
        return { crm: "Full", accounting: "Edit", hr: "Edit", forms: "Edit", automation: "Edit", settings: "Edit" };
      case "SALES_MANAGER":
        return { crm: "Full", accounting: "Read", hr: "None", forms: "Read", automation: "Read", settings: "None" };
      case "ACCOUNTANT":
        return { crm: "Read", accounting: "Full", hr: "Read", forms: "Read", automation: "Read", settings: "None" };
      case "HR_MANAGER":
        return { crm: "Read", accounting: "Read", hr: "Full", forms: "Read", automation: "Read", settings: "None" };
      case "AGENT":
        return { crm: "Edit", accounting: "None", hr: "Self", forms: "Read", automation: "None", settings: "None" };
      default:
        return { crm: "Read", accounting: "None", hr: "Self", forms: "Read", automation: "None", settings: "None" };
    }
  }

  @Get()
  async getSettings(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const [users, userCount, contactCount, companyCount, formCount, workflowCount, invoiceCount, expenseCount, attachmentAggregate] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { tenantId: tenant.id },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "asc" },
        }),
        this.prisma.user.count({ where: { tenantId: tenant.id } }),
        this.prisma.contact.count({ where: { tenantId: tenant.id } }),
        this.prisma.company.count({ where: { tenantId: tenant.id } }),
        this.prisma.formTemplate.count({ where: { tenantId: tenant.id } }),
        this.prisma.workflow.count({ where: { tenantId: tenant.id } }),
        this.prisma.invoice.count({ where: { tenantId: tenant.id } }),
        this.prisma.expense.count({ where: { tenantId: tenant.id } }),
        this.prisma.fileAttachment.aggregate({
          where: { tenantId: tenant.id },
          _sum: { sizeBytes: true },
        }),
      ]);

    const usedStorageBytes = attachmentAggregate._sum.sizeBytes ?? 0;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        enabledModules: tenant.enabledModules,
        planCode: tenant.planCode,
        subscriptionStatus: tenant.subscriptionStatus,
        onboardingCompleted: tenant.onboardingCompleted,
        billingEmail: tenant.billingEmail,
        customDomain: tenant.customDomain,
        emailFromName: tenant.emailFromName,
        emailFromAddress: tenant.emailFromAddress,
        replyToEmail: tenant.replyToEmail,
        trialEndsAt: tenant.trialEndsAt,
        subscriptionRenewsAt: tenant.subscriptionRenewsAt,
        maxUsers: tenant.maxUsers,
        maxStorageGb: tenant.maxStorageGb,
        supportEmail: tenant.supportEmail,
        supportPhone: tenant.supportPhone,
        website: tenant.website,
        addressLine1: tenant.addressLine1,
        city: tenant.city,
        country: tenant.country,
        logoUrl: tenant.logoUrl,
        timezone: tenant.timezone,
        currency: tenant.currency,
        defaultLanguage: tenant.defaultLanguage,
        invoicePrefix: tenant.invoicePrefix,
        themeMode: tenant.themeMode,
        requireMfa: tenant.requireMfa,
        allowLocalAuth: tenant.allowLocalAuth,
        sessionTimeoutMinutes: tenant.sessionTimeoutMinutes,
      },
      subscription: {
        planCode: tenant.planCode,
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
        subscriptionRenewsAt: tenant.subscriptionRenewsAt,
        billingEmail: tenant.billingEmail ?? tenant.supportEmail,
        moduleCount: tenant.enabledModules.length,
      },
      usage: {
        users: { used: userCount, limit: tenant.maxUsers },
        storage: {
          usedBytes: usedStorageBytes,
          limitBytes: tenant.maxStorageGb * 1024 * 1024 * 1024,
        },
        crmContacts: contactCount,
        crmCompanies: companyCount,
        forms: formCount,
        workflows: workflowCount,
        invoices: invoiceCount,
        expenses: expenseCount,
      },
      security: {
        sessionMode: tenant.allowLocalAuth ? "Local auth + bearer token" : "OAuth-first bearer token",
        oauthProviders: ["Google", "Microsoft"],
        passwordPolicy: "Minimum 10 characters for local admin accounts",
        requireMfa: tenant.requireMfa,
        allowLocalAuth: tenant.allowLocalAuth,
        sessionTimeoutMinutes: tenant.sessionTimeoutMinutes,
      },
      team: users,
      permissions: users.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        scope: this.roleScope(user.role),
      })),
    };
  }

  @Patch()
  async updateSettings(
    @Tenant() tenantId: string,
    @Body()
    body: {
      name?: string;
      enabledModules?: string[];
      supportEmail?: string;
      supportPhone?: string;
      website?: string;
      billingEmail?: string;
      customDomain?: string;
      emailFromName?: string;
      emailFromAddress?: string;
      replyToEmail?: string;
      addressLine1?: string;
      city?: string;
      country?: string;
      logoUrl?: string;
      timezone?: string;
      currency?: string;
      defaultLanguage?: string;
      invoicePrefix?: string;
      themeMode?: string;
      planCode?: string;
      subscriptionStatus?: string;
      trialEndsAt?: string | null;
      subscriptionRenewsAt?: string | null;
      maxUsers?: number;
      maxStorageGb?: number;
      requireMfa?: boolean;
      allowLocalAuth?: boolean;
      sessionTimeoutMinutes?: number;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        name: body.name ?? undefined,
        enabledModules: this.normalizeEnabledModules(body.enabledModules),
        supportEmail: this.normalizeString(body.supportEmail),
        supportPhone: this.normalizeString(body.supportPhone),
        website: this.normalizeString(body.website),
        billingEmail: this.normalizeString(body.billingEmail),
        customDomain: this.normalizeString(body.customDomain),
        emailFromName: this.normalizeString(body.emailFromName),
        emailFromAddress: this.normalizeString(body.emailFromAddress),
        replyToEmail: this.normalizeString(body.replyToEmail),
        addressLine1: this.normalizeString(body.addressLine1),
        city: this.normalizeString(body.city),
        country: this.normalizeString(body.country),
        logoUrl: this.normalizeString(body.logoUrl),
        timezone: body.timezone ?? undefined,
        currency: body.currency ?? undefined,
        defaultLanguage: body.defaultLanguage ?? undefined,
        invoicePrefix: body.invoicePrefix ?? undefined,
        themeMode: body.themeMode ?? undefined,
        planCode: body.planCode ?? undefined,
        subscriptionStatus: body.subscriptionStatus ?? undefined,
        trialEndsAt: body.trialEndsAt === undefined ? undefined : body.trialEndsAt ? new Date(body.trialEndsAt) : null,
        subscriptionRenewsAt:
          body.subscriptionRenewsAt === undefined ? undefined : body.subscriptionRenewsAt ? new Date(body.subscriptionRenewsAt) : null,
        maxUsers: body.maxUsers ?? undefined,
        maxStorageGb: body.maxStorageGb ?? undefined,
        requireMfa: body.requireMfa ?? undefined,
        allowLocalAuth: body.allowLocalAuth ?? undefined,
        sessionTimeoutMinutes: body.sessionTimeoutMinutes ?? undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "SETTINGS_UPDATED",
        entityType: "Tenant",
        entityId: tenant.id,
        metadataJson: {
          name: updated.name,
          enabledModules: updated.enabledModules,
          planCode: updated.planCode,
          subscriptionStatus: updated.subscriptionStatus,
          themeMode: updated.themeMode,
          timezone: updated.timezone,
        },
      },
    });

    return {
      tenant: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        enabledModules: updated.enabledModules,
        planCode: updated.planCode,
        subscriptionStatus: updated.subscriptionStatus,
        onboardingCompleted: updated.onboardingCompleted,
        billingEmail: updated.billingEmail,
        customDomain: updated.customDomain,
        emailFromName: updated.emailFromName,
        emailFromAddress: updated.emailFromAddress,
        replyToEmail: updated.replyToEmail,
        trialEndsAt: updated.trialEndsAt,
        subscriptionRenewsAt: updated.subscriptionRenewsAt,
        maxUsers: updated.maxUsers,
        maxStorageGb: updated.maxStorageGb,
        supportEmail: updated.supportEmail,
        supportPhone: updated.supportPhone,
        website: updated.website,
        addressLine1: updated.addressLine1,
        city: updated.city,
        country: updated.country,
        logoUrl: updated.logoUrl,
        timezone: updated.timezone,
        currency: updated.currency,
        defaultLanguage: updated.defaultLanguage,
        invoicePrefix: updated.invoicePrefix,
        themeMode: updated.themeMode,
        requireMfa: updated.requireMfa,
        allowLocalAuth: updated.allowLocalAuth,
        sessionTimeoutMinutes: updated.sessionTimeoutMinutes,
      },
    };
  }

  @Post("team")
  async createTeamMember(
    @Tenant() tenantId: string,
    @Body()
    body: {
      email?: string;
      fullName?: string;
      role?: string;
      password?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const password = body.password && body.password.length >= 10 ? body.password : `PopIn@2026!User`;
    const item = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: body.email ?? `user+${Date.now()}@popinsolutions.co.za`,
        fullName: body.fullName ?? `Team Member ${Date.now()}`,
        role: this.normalizeRole(body.role),
        passwordHash: this.authService.hashPassword(password),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "TEAM_MEMBER_CREATED",
        entityType: "User",
        entityId: item.id,
        metadataJson: { email: item.email, role: item.role },
      },
    });
    return {
      status: "created",
      item: {
        id: item.id,
        email: item.email,
        fullName: item.fullName,
        role: item.role,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
      generatedPassword: body.password ? null : password,
    };
  }

  @Patch("team/:userId")
  async updateTeamMember(
    @Tenant() tenantId: string,
    @Param("userId") userId: string,
    @Body()
    body: {
      email?: string;
      fullName?: string;
      role?: string;
      password?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, id: userId },
    });
    if (!existing) {
      return { status: "missing", userId };
    }
    const item = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: body.email ?? undefined,
        fullName: body.fullName ?? undefined,
        role: body.role ? this.normalizeRole(body.role) : undefined,
        passwordHash: body.password ? this.authService.hashPassword(body.password) : undefined,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "TEAM_MEMBER_UPDATED",
        entityType: "User",
        entityId: item.id,
        metadataJson: { email: item.email, role: item.role },
      },
    });
    return {
      status: "updated",
      item: {
        id: item.id,
        email: item.email,
        fullName: item.fullName,
        role: item.role,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
    };
  }

  @Delete("team/:userId")
  async deleteTeamMember(@Tenant() tenantId: string, @Param("userId") userId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, id: userId },
    });
    if (!existing) {
      return { status: "missing", userId };
    }
    await this.prisma.user.delete({ where: { id: userId } });
    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: "TEAM_MEMBER_DELETED",
        entityType: "User",
        entityId: userId,
        metadataJson: { email: existing.email },
      },
    });
    return { status: "deleted", userId };
  }
}
