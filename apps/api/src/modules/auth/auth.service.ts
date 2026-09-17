import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/services/email.service";

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
      enabledModules: ["crm", "accounting", "settings"],
      maxUsers: 50,
      maxStorageGb: 50,
      trialDays: 14,
    },
    enterprise: {
      enabledModules: ["crm", "accounting", "hr", "attendance", "assets", "projects", "users", "settings"],
      maxUsers: 250,
      maxStorageGb: 250,
      trialDays: 30,
    },
  } as const;

  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  verifyPassword(password: string, passwordHash: string) {
    try {
      const [salt, storedHash] = passwordHash.split(":");
      if (!salt || !storedHash) return false;
      const derived = scryptSync(password, salt, 64);
      const expected = Buffer.from(storedHash, "hex");
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  private getSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be configured in production.");
    return secret || "popin-local-dev-secret";
  }

  private hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

  private oauthState(provider: "google" | "microsoft", tenantSlug?: string) {
    const payload = Buffer.from(JSON.stringify({ provider, tenantSlug: tenantSlug?.trim() || "", nonce: randomBytes(18).toString("base64url"), exp: Date.now() + 10 * 60 * 1000 })).toString("base64url");
    const signature = createHmac("sha256", this.getSecret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private readOAuthState(value: string, provider: "google" | "microsoft") {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) throw new UnauthorizedException("Invalid OAuth state.");
    const expected = createHmac("sha256", this.getSecret()).update(payload).digest("base64url");
    const actual = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) throw new UnauthorizedException("Invalid OAuth state.");
    let parsed: { provider?: string; tenantSlug?: string; exp?: number };
    try { parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new UnauthorizedException("Invalid OAuth state."); }
    if (parsed.provider !== provider || !parsed.exp || parsed.exp < Date.now()) throw new UnauthorizedException("Expired OAuth state.");
    return parsed;
  }

  async oauthAuthorization(provider: "google" | "microsoft", tenantSlug?: string) {
    const clientId = provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) throw new BadRequestException(`${provider} OAuth is not configured.`);
    const redirectUri = `${process.env.APP_BASE_URL || "http://localhost:4000"}/api/v1/auth/oauth/${provider}/callback`;
    const state = this.oauthState(provider, tenantSlug);
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: provider === "google" ? "openid email profile" : "openid email profile User.Read", state });
    const base = provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    return { provider, url: `${base}?${params.toString()}` };
  }

  async oauthCallback(provider: "google" | "microsoft", code: string, state: string) {
    if (!code || !state) throw new BadRequestException("OAuth code and state are required.");
    const stateData = this.readOAuthState(state, provider);
    const clientId = provider === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = provider === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new BadRequestException(`${provider} OAuth is not configured.`);
    const redirectUri = `${process.env.APP_BASE_URL || "http://localhost:4000"}/api/v1/auth/oauth/${provider}/callback`;
    const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }), signal: AbortSignal.timeout(10000) });
    if (!tokenResponse.ok) throw new UnauthorizedException("OAuth token exchange failed.");
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) throw new UnauthorizedException("OAuth provider did not return an access token.");
    const profileResponse = await fetch(provider === "google" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!profileResponse.ok) throw new UnauthorizedException("OAuth profile lookup failed.");
    const profile = await profileResponse.json() as { email?: string; mail?: string; userPrincipalName?: string };
    const email = (profile.email || profile.mail || profile.userPrincipalName || "").trim().toLowerCase();
    if (!email) throw new UnauthorizedException("OAuth provider did not return an email address.");
    const user = await this.prisma.user.findFirst({ where: stateData.tenantSlug ? { email, tenant: { slug: stateData.tenantSlug } } : { email }, include: { tenant: true } });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("No active CRM account is linked to this OAuth email.");
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
    const loginCode = randomBytes(32).toString("base64url");
    await this.prisma.oAuthLoginCode.create({ data: { codeHash: this.hashToken(loginCode), userId: user.id, tenantId: user.tenant.id, expiresAt: new Date(Date.now() + 60 * 1000) } });
    return { code: loginCode };
  }

  async exchangeOAuthCode(code: string) {
    if (!code) throw new BadRequestException("OAuth login code is required.");
    const ticket = await this.prisma.oAuthLoginCode.findUnique({ where: { codeHash: this.hashToken(code) }, include: { user: { include: { tenant: true } } } });
    if (!ticket || ticket.consumedAt || ticket.expiresAt < new Date() || ticket.user.status !== "ACTIVE") throw new UnauthorizedException("OAuth login code is invalid or expired.");
    await this.prisma.oAuthLoginCode.update({ where: { id: ticket.id }, data: { consumedAt: new Date() } });
    return this.issueTokens(ticket.user);
  }

  private async issueTokens(user: { id: string; email: string; fullName: string; role: string; tenant: { id: string; slug: string; name: string; enabledModules: string[]; sessionTimeoutMinutes?: number } }) {
    const accessTtl = Math.max(5, user.tenant.sessionTimeoutMinutes ?? 480) * 60;
    const accessToken = this.signToken({ sub: user.id, tenantId: user.tenant.slug, email: user.email, role: user.role }, accessTtl);
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.session.create({ data: { tenantId: user.tenant.id, userId: user.id, tokenHash: this.hashToken(refreshToken), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) } });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.fullName, role: user.role, tenantId: user.tenant.slug, tenantName: user.tenant.name, enabledModules: user.tenant.enabledModules } };
  }

  private async issueEmailVerification(userId: string, tenantId: string) {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.emailVerificationToken.create({ data: { userId, tenantId, tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) } });
    return token;
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

  signToken(payload: Omit<AuthTokenPayload, "exp">, expiresInSeconds?: number) {
    const ttl = expiresInSeconds ?? Math.max(300, Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 60 * 8));
    const fullPayload: AuthTokenPayload = {
      ...payload,
      exp: Math.floor(Date.now() / 1000) + ttl,
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
    const actualSignature = Buffer.from(signature);
    const expectedSignature = Buffer.from(expected);
    if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
      throw new UnauthorizedException("Invalid token signature.");
    }

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<AuthTokenPayload>;
      if (!payload.sub || !payload.tenantId || !payload.email || !payload.role || typeof payload.exp !== "number") throw new Error("invalid payload");
      if (payload.exp < Math.floor(Date.now() / 1000)) throw new UnauthorizedException("Token expired.");
      return payload as AuthTokenPayload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid token payload.");
    }
  }

  async login(email: string, password: string, tenantSlug: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: tenantSlug
        ? {
            email: normalizedEmail,
            tenant: { slug: tenantSlug },
          }
        : {
            email: normalizedEmail,
          },
      include: { tenant: true },
    });

    if (!user || user.status !== "ACTIVE" || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: this.hashToken(refreshToken) }, include: { user: { include: { tenant: true } } } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== "ACTIVE") throw new UnauthorizedException("Refresh session expired or revoked.");
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const nextRefreshToken = randomBytes(48).toString("base64url");
    await this.prisma.session.create({ data: { tenantId: session.tenantId, userId: session.userId, tokenHash: this.hashToken(nextRefreshToken), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) } });
    const accessTtl = Math.max(5, session.user.tenant.sessionTimeoutMinutes ?? 480) * 60;
    return { accessToken: this.signToken({ sub: session.user.id, tenantId: session.user.tenant.slug, email: session.user.email, role: session.user.role }, accessTtl), refreshToken: nextRefreshToken };
  }

  async logout(refreshToken: string) { await this.prisma.session.updateMany({ where: { tokenHash: this.hashToken(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } }); return { status: "logged_out" }; }

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

  async workspaceBranding(slug: string) {
    const normalizedSlug = this.slugify(slug || "demo-tenant");
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalizedSlug },
      select: { name: true, logoUrl: true },
    });

    return {
      name: tenant?.name || "Pop In Solutions",
      logoUrl: tenant?.logoUrl || null,
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
    const now = new Date();
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
    const verificationToken = await this.issueEmailVerification(user.id, tenant.id);
    await this.email.send({ to: user.email, subject: "Verify your Pop In Solutions account", text: `Verify your account with this token: ${verificationToken}` });

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
    }, Math.max(5, tenant.sessionTimeoutMinutes) * 60);
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.session.create({ data: { tenantId: tenant.id, userId: user.id, tokenHash: this.hashToken(refreshToken), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) } });

    return {
      accessToken,
      refreshToken,
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
      verificationToken: process.env.NODE_ENV === "production" ? undefined : verificationToken,
    };
  }

  async requestPasswordReset(email: string, tenantSlug: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.trim().toLowerCase(), tenant: { slug: tenantSlug } } });
    if (!user) return { status: "requested" };
    const token = randomBytes(32).toString("base64url");
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tenantId: user.tenantId, tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + 1000 * 60 * 30) } });
    await this.email.send({ to: user.email, subject: "Reset your Pop In Solutions password", text: `Reset your password with this token: ${token}` });
    return { status: "requested", resetToken: process.env.NODE_ENV === "production" ? undefined : token };
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash: this.hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) throw new BadRequestException("Email verification token is invalid or expired.");
    await this.prisma.$transaction([this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }), this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })]);
    return { status: "verified" };
  }

  async resetPassword(token: string, password: string) {
    if (password.length < 10) throw new BadRequestException("Password must be at least 10 characters.");
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: this.hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) throw new BadRequestException("Password reset token is invalid or expired.");
    await this.prisma.$transaction([this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash: this.hashPassword(password) } }), this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }), this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
    return { status: "password_reset" };
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
