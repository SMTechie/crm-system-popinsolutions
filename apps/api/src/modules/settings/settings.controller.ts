import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";
import { StorageService } from "../../common/services/storage.service";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("settings")
export class SettingsController {
  private readonly allowedModules = ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly authService: AuthService,
    private readonly storage: StorageService,
  ) {}

  private normalizeRole(role?: string): UserRole {
    const normalized = role?.toUpperCase();
    if (
      normalized === "SUPER_ADMIN" ||
      normalized === "ORGANISATION_ADMIN" ||
      normalized === "OWNER" ||
      normalized === "ADMIN" ||
      normalized === "FINANCE_MANAGER" ||
      normalized === "SALES_MANAGER" ||
      normalized === "ACCOUNTANT" ||
      normalized === "HR_MANAGER" ||
      normalized === "PROJECT_MANAGER" ||
      normalized === "IT_MANAGER" ||
      normalized === "AGENT" ||
      normalized === "EMPLOYEE" ||
      normalized === "VIEWER"
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
        return { crm: "Full", accounting: "Full", hr: "Full", attendance: "Full", assets: "Full", users: "Full", settings: "Full" };
      case "ADMIN":
        return { crm: "Full", accounting: "Edit", hr: "Edit", attendance: "Edit", assets: "Edit", users: "Edit", settings: "Edit" };
      case "SALES_MANAGER":
        return { crm: "Full", accounting: "Read", hr: "None", attendance: "None", assets: "None", users: "None", settings: "None" };
      case "ACCOUNTANT":
        return { crm: "Read", accounting: "Full", hr: "Read", attendance: "Read", assets: "None", users: "None", settings: "None" };
      case "HR_MANAGER":
        return { crm: "Read", accounting: "Read", hr: "Full", attendance: "Full", assets: "None", users: "Read", settings: "None" };
      case "PROJECT_MANAGER":
        return { crm: "Read", accounting: "Read", hr: "Read", attendance: "Read", assets: "Edit", users: "None", settings: "None" };
      case "IT_MANAGER":
        return { crm: "Read", accounting: "Read", hr: "Read", attendance: "Read", assets: "Full", users: "Full", settings: "Full" };
      case "AGENT":
        return { crm: "Edit", accounting: "None", hr: "Self", attendance: "Self", assets: "None", users: "None", settings: "None" };
      default:
        return { crm: "Read", accounting: "None", hr: "Self", attendance: "Self", assets: "None", users: "None", settings: "None" };
    }
  }

  private oauthEncryptionKey() { return createHash("sha256").update(process.env.JWT_SECRET || "popin-local-dev-secret").digest(); }

  private encryptOAuthConfig(value: { clientId: string; clientSecret: string }) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.oauthEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  private saveOAuthEnv(values: Record<string, string>) {
    const apiEnvPath = resolve(process.cwd(), "apps/api/.env");
    const envPath = existsSync(apiEnvPath) ? apiEnvPath : resolve(process.cwd(), ".env");
    let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    for (const [key, value] of Object.entries(values)) {
      const line = `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      content = pattern.test(content) ? content.replace(pattern, line) : `${content.replace(/\s*$/, "")}\n${line}\n`;
      process.env[key] = value;
    }
    writeFileSync(envPath, content, "utf8");
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
    const oauthConnections = await this.prisma.integrationConnection.findMany({ where: { tenantId: tenant.id, provider: { in: ["oauth_google", "oauth_microsoft"] } }, select: { provider: true, encryptedConfig: true, enabled: true } });
    const providerConfigured = (provider: "google" | "microsoft") => Boolean((provider === "google" ? process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) || oauthConnections.some((item) => item.provider === `oauth_${provider}` && item.enabled && item.encryptedConfig));

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
        sessionMode: tenant.allowLocalAuth ? "Password + OAuth bearer token" : "OAuth-only bearer token",
        oauthProviders: [
          {
            name: "Google",
            key: "google",
            configured: providerConfigured("google"),
          },
          {
            name: "Microsoft",
            key: "microsoft",
            configured: providerConfigured("microsoft"),
          },
        ],
        oauthRedirectUri: `${process.env.APP_BASE_URL || "http://localhost:4000"}/api/v1/auth/oauth/{provider}/callback`,
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
  @RequiresPermission("settings.manage")
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
    const oauthConnections = await this.prisma.integrationConnection.findMany({ where: { tenantId: tenant.id, provider: { in: ["oauth_google", "oauth_microsoft"] }, enabled: true }, select: { encryptedConfig: true } });
    const hasConfiguredOAuth = Boolean((process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) || (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) || oauthConnections.some((item) => item.encryptedConfig));

    if (body.allowLocalAuth === false && !hasConfiguredOAuth) {
      throw new BadRequestException("OAuth-only mode requires at least one configured provider.");
    }
    if (body.sessionTimeoutMinutes !== undefined && (!Number.isInteger(body.sessionTimeoutMinutes) || body.sessionTimeoutMinutes < 5 || body.sessionTimeoutMinutes > 10080)) {
      throw new BadRequestException("Session timeout must be a whole number between 5 and 10,080 minutes.");
    }

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

  @Post("logo")
  @RequiresPermission("settings.manage")
  @UseInterceptors(FileInterceptor("logo", { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadLogo(@Tenant() tenantId: string, @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype: string }) {
    if (!file) throw new BadRequestException("Please select a logo image.");
    if (!file.mimetype.startsWith("image/")) throw new BadRequestException("Logo must be an image file.");

    const tenant = await this.tenantService.ensureTenant(tenantId);
    const fileKey = await this.storage.put({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype });
    const logoUrl = fileKey.startsWith("http") ? fileKey : `${process.env.APP_BASE_URL || "http://localhost:4000"}${fileKey}`;
    await this.prisma.tenant.update({ where: { id: tenant.id }, data: { logoUrl } });
    return { logoUrl };
  }

  @Post("oauth/:provider")
  @RequiresPermission("settings.manage")
  async configureOAuth(@Tenant() tenantId: string, @Param("provider") provider: string, @Body() body: { clientId?: string; clientSecret?: string; enabled?: boolean }) {
    if (provider !== "google" && provider !== "microsoft") throw new BadRequestException("Unsupported OAuth provider.");
    const clientId = body.clientId?.trim() || "";
    const clientSecret = body.clientSecret?.trim() || "";
    if (clientId.length < 5 || clientSecret.length < 5 || /[\r\n]/.test(clientId) || /[\r\n]/.test(clientSecret)) throw new BadRequestException("Enter both the OAuth client ID and client secret.");
    const tenant = await this.tenantService.ensureTenant(tenantId);
    this.saveOAuthEnv(provider === "google" ? { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } : { MICROSOFT_CLIENT_ID: clientId, MICROSOFT_CLIENT_SECRET: clientSecret });
    await this.prisma.integrationConnection.upsert({ where: { tenantId_provider: { tenantId: tenant.id, provider: `oauth_${provider}` } }, update: { encryptedConfig: this.encryptOAuthConfig({ clientId, clientSecret }), enabled: body.enabled ?? true }, create: { tenantId: tenant.id, provider: `oauth_${provider}`, encryptedConfig: this.encryptOAuthConfig({ clientId, clientSecret }), enabled: body.enabled ?? true } });
    return { provider, configured: true };
  }

  @Post("payment/:provider")
  @RequiresPermission("settings.manage")
  async configurePaymentProvider(@Param("provider") provider: string, @Body() body: { secretKey?: string; publicKey?: string; appId?: string; appSecret?: string; entityId?: string; starterCents?: string; growthCents?: string; enterpriseCents?: string }) {
    if (provider !== "yoco" && provider !== "ikhokha") throw new BadRequestException("Unsupported payment provider.");
    const values: Record<string, string> = {};
    if (provider === "yoco") {
      if (!body.secretKey?.trim()) throw new BadRequestException("Enter the Yoco secret key.");
      values.YOCO_SECRET_KEY = body.secretKey.trim();
      if (body.publicKey?.trim()) values.YOCO_PUBLIC_KEY = body.publicKey.trim();
    } else {
      if (!body.appId?.trim() || !body.appSecret?.trim()) throw new BadRequestException("Enter the iKhokha App ID and App Secret.");
      values.IKHOKHA_APP_ID = body.appId.trim();
      values.IKHOKHA_APP_SECRET = body.appSecret.trim();
      if (body.entityId?.trim()) values.IKHOKHA_ENTITY_ID = body.entityId.trim();
    }
    const prices = { PAYMENT_PRICE_STARTER_MONTHLY_CENTS: body.starterCents, PAYMENT_PRICE_GROWTH_MONTHLY_CENTS: body.growthCents, PAYMENT_PRICE_ENTERPRISE_MONTHLY_CENTS: body.enterpriseCents };
    for (const [key, value] of Object.entries(prices)) if (value?.trim()) { if (!/^\d+$/.test(value.trim()) || Number(value) < 100) throw new BadRequestException("Plan prices must be whole amounts of at least 100 cents."); values[key] = value.trim(); }
    this.saveOAuthEnv(values);
    return { provider, configured: true };
  }

  @Post("team")
  @RequiresPermission("users.manage")
  async createTeamMember(
    @Tenant() tenantId: string,
    @Body()
    body: {
      email?: string;
      fullName?: string;
      role?: string;
      password?: string;
      employeeId?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.email?.trim() || !body.fullName?.trim()) throw new BadRequestException("Full name and email are required.");
    const employee = body.employeeId ? await this.prisma.employee.findFirst({ where: { id: body.employeeId, tenantId: tenant.id } }) : null;
    if (body.employeeId && !employee) throw new BadRequestException("Selected employee was not found in this workspace.");
    if (employee?.userId) throw new BadRequestException("This employee is already linked to another login.");
    const password = body.password?.trim() || randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 6);
    const item = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: body.email.trim().toLowerCase(),
        fullName: body.fullName.trim(),
        role: this.normalizeRole(body.role),
        passwordHash: this.authService.hashPassword(password),
      },
    });
    if (employee) await this.prisma.employee.update({ where: { id: employee.id }, data: { userId: item.id } });
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
  @RequiresPermission("users.manage")
  async updateTeamMember(
    @Tenant() tenantId: string,
    @Param("userId") userId: string,
    @Body()
    body: {
      email?: string;
      fullName?: string;
      role?: string;
      password?: string;
      employeeId?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, id: userId },
    });
    if (!existing) {
      return { status: "missing", userId };
    }
    const employee = body.employeeId ? await this.prisma.employee.findFirst({ where: { id: body.employeeId, tenantId: tenant.id } }) : null;
    if (body.employeeId && !employee) throw new BadRequestException("Selected employee was not found in this workspace.");
    if (employee?.userId && employee.userId !== existing.id) throw new BadRequestException("This employee is already linked to another login.");
    if (body.employeeId !== undefined) {
      await this.prisma.employee.updateMany({ where: { userId: existing.id, tenantId: tenant.id }, data: { userId: null } });
      if (employee) await this.prisma.employee.update({ where: { id: employee.id }, data: { userId: existing.id } });
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
  @RequiresPermission("users.manage")
  async deleteTeamMember(@Tenant() tenantId: string, @Param("userId") userId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, id: userId },
    });
    if (!existing) {
      return { status: "missing", userId };
    }
    await this.prisma.employee.updateMany({ where: { userId, tenantId: tenant.id }, data: { userId: null } });
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
