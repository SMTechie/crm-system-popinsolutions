import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";

type AuthTokenPayload = {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  exp: number;
};

@Injectable()
export class AuthService {
  private readonly planPresets = {
    starter: {
      enabledModules: ["crm", "settings"],
      maxUsers: 10,
      maxStorageGb: 10,
      trialDays: 14,
    },
    growth: {
      enabledModules: ["crm", "accounting", "forms", "automation", "settings"],
      maxUsers: 50,
      maxStorageGb: 50,
      trialDays: 14,
    },
    enterprise: {
      enabledModules: ["crm", "accounting", "hr", "forms", "automation", "settings"],
      maxUsers: 250,
      maxStorageGb: 250,
      trialDays: 30,
    },
  } as const;

  constructor(private readonly prisma: PrismaService) {}

  hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, passwordHash: string) {
    const [salt, storedHash] = passwordHash.split(":");
    if (!salt || !storedHash) {
      return false;
    }

    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(storedHash, "hex");

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }

  private getSecret() {
    return process.env.JWT_SECRET || "popin-local-dev-secret";
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  private resolvePlan(planCode?: string) {
    const normalized = planCode?.trim().toLowerCase();
    if (normalized === "starter" || normalized === "growth" || normalized === "enterprise") {
      return { planCode: normalized, preset: this.planPresets[normalized] };
    }
    return { planCode: "enterprise" as const, preset: this.planPresets.enterprise };
  }

  signToken(payload: Omit<AuthTokenPayload, "exp">, expiresInSeconds = 60 * 60 * 8) {
    const fullPayload: AuthTokenPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    };

    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
    const signature = createHmac("sha256", this.getSecret()).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }

  verifyToken(token: string): AuthTokenPayload {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException("Invalid token format.");
    }

    const expected = createHmac("sha256", this.getSecret()).update(encodedPayload).digest("base64url");
    if (signature !== expected) {
      throw new UnauthorizedException("Invalid token signature.");
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as AuthTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Token expired.");
    }

    return payload;
  }

  async login(email: string, password: string, tenantSlug: string) {
    const user = await this.prisma.user.findFirst({
      where: tenantSlug
        ? {
            email,
            tenant: { slug: tenantSlug },
          }
        : {
            email,
          },
      include: { tenant: true },
    });

    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const accessToken = this.signToken({
      sub: user.id,
      tenantId: user.tenant.slug,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        tenantId: user.tenant.slug,
        tenantName: user.tenant.name,
        enabledModules: user.tenant.enabledModules,
      },
    };
  }

  async workspaceAvailability(slug: string) {
    const normalizedSlug = this.slugify(slug);
    if (!normalizedSlug || normalizedSlug.length < 3) {
      return {
        slug: normalizedSlug,
        available: false,
        message: "Workspace slug must be at least 3 characters.",
      };
    }

    const existing = await this.prisma.tenant.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });

    return {
      slug: normalizedSlug,
      available: !existing,
      message: existing ? "Workspace slug is already taken." : "Workspace slug is available.",
    };
  }

  async signup(input: {
    workspaceName?: string;
    workspaceSlug?: string;
    ownerName?: string;
    ownerEmail?: string;
    password?: string;
    planCode?: string;
  }) {
    const workspaceName = input.workspaceName?.trim();
    const workspaceSlug = this.slugify(input.workspaceSlug ?? workspaceName ?? "");
    const ownerName = input.ownerName?.trim();
    const ownerEmail = input.ownerEmail?.trim().toLowerCase();
    const password = input.password ?? "";

    if (!workspaceName || !workspaceSlug || !ownerName || !ownerEmail || password.length < 10) {
      throw new BadRequestException("Workspace name, slug, owner details, and a password of at least 10 characters are required.");
    }

    const existingTenant = await this.prisma.tenant.findUnique({ where: { slug: workspaceSlug }, select: { id: true } });

    if (existingTenant) {
      throw new ConflictException("Workspace slug already exists.");
    }

    const { planCode, preset } = this.resolvePlan(input.planCode);
    const now = new Date("2026-08-04T12:00:00.000Z");
    const trialEndsAt = new Date(now.getTime() + preset.trialDays * 24 * 60 * 60 * 1000);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: workspaceName,
        slug: workspaceSlug,
        enabledModules: [...preset.enabledModules],
        planCode,
        subscriptionStatus: "trialing",
        onboardingCompleted: true,
        billingEmail: ownerEmail,
        emailFromName: workspaceName,
        emailFromAddress: ownerEmail,
        replyToEmail: ownerEmail,
        supportEmail: ownerEmail,
        trialEndsAt,
        subscriptionRenewsAt: trialEndsAt,
        maxUsers: preset.maxUsers,
        maxStorageGb: preset.maxStorageGb,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: ownerEmail,
        fullName: ownerName,
        role: "OWNER",
        passwordHash: this.hashPassword(password),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: user.id,
        action: "TENANT_SIGNED_UP",
        entityType: "Tenant",
        entityId: tenant.id,
        metadataJson: {
          planCode,
          ownerEmail,
          enabledModules: [...preset.enabledModules],
        },
      },
    });

    const accessToken = this.signToken({
      sub: user.id,
      tenantId: tenant.slug,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        tenantId: tenant.slug,
        tenantName: tenant.name,
        enabledModules: tenant.enabledModules,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        planCode: tenant.planCode,
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException("User not found.");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      tenantId: user.tenant.slug,
      tenantName: user.tenant.name,
      enabledModules: user.tenant.enabledModules,
    };
  }
}
