import { BadRequestException, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { z } from "zod";

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  private key() { const secret = process.env.JWT_SECRET; if (!secret && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be configured in production."); return createHash("sha256").update(secret || "local-development-secret").digest(); }
  encrypt(value: object) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.key(), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]); return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`; }
  decrypt(value: string) { const [iv, tag, encrypted] = value.split("."); if (!iv || !tag || !encrypted) throw new BadRequestException("Invalid integration configuration."); const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as Record<string, string>; }

  verifyWebhook(rawBody: string, signature: string | undefined, secret: string) { if (!signature) return false; const expected = createHmac("sha256", secret).update(rawBody).digest("hex"); const a = Buffer.from(signature.replace(/^sha256=/, ""), "hex"); const b = Buffer.from(expected, "hex"); return a.length === b.length && timingSafeEqual(a, b); }

  private requestHeaders(config: Record<string, string>) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (config.accessToken) headers.Authorization = `Bearer ${config.accessToken}`;
    if (config.apiKey) headers["X-API-Key"] = config.apiKey;
    if (config.apiSecret) headers["X-API-Secret"] = config.apiSecret;
    return headers;
  }

  private async request(url: string, config: Record<string, string>, method = "GET") {
    let lastError = "Connection failed.";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, { method, headers: this.requestHeaders(config), signal: AbortSignal.timeout(8000) });
        if (response.ok) return response;
        lastError = `HTTP ${response.status}`;
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) { lastError = error instanceof Error ? error.message : "Connection failed."; }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    throw new BadRequestException(lastError);
  }

  private endpoint(value: string) {
    try { const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); return parsed.toString(); }
    catch { throw new BadRequestException("Integration URLs must use HTTP or HTTPS."); }
  }

  async receiveWebhook(tenantSlug: string | undefined, rawBody: string) {
    if (!tenantSlug) throw new BadRequestException("Webhook tenant context is required.");
    let event: { id?: string; type?: string; data?: unknown };
    try { event = JSON.parse(rawBody); } catch { throw new BadRequestException("Webhook body must be valid JSON."); }
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new BadRequestException("Workspace not found.");
    const connection = await this.prisma.integrationConnection.findUnique({ where: { tenantId_provider: { tenantId: tenant.id, provider: "website" } } });
    if (event.id) {
      const duplicate = await this.prisma.integrationLog.findUnique({ where: { externalEventId: event.id } });
      if (duplicate) return { accepted: true, duplicate: true, eventId: event.id };
    }
    await this.prisma.integrationLog.create({ data: { tenantId: tenant.id, connectionId: connection?.id, operation: event.type || "WEBHOOK_EVENT", status: "SUCCESS", recordsProcessed: 1, recordsSkipped: 0, externalEventId: event.id, payloadJson: event.data as any, startedAt: new Date(), completedAt: new Date() } });
    return { accepted: true, duplicate: false, eventId: event.id || null };
  }

  async list(slug: string) { const tenant = await this.prisma.tenant.findUnique({ where: { slug } }); if (!tenant) throw new BadRequestException("Workspace not found."); const items = await this.prisma.integrationConnection.findMany({ where: { tenantId: tenant.id }, include: { logs: { orderBy: { startedAt: "desc" }, take: 5 } } }); return items.map(({ encryptedConfig, ...safe }) => ({ ...safe, configured: Boolean(encryptedConfig) })); }
  async configure(slug: string, provider: string, input: { baseUrl?: string; config?: Record<string, string>; enabled?: boolean }) { const tenant = await this.prisma.tenant.findUnique({ where: { slug } }); if (!tenant) throw new BadRequestException("Workspace not found."); const baseUrl = input.baseUrl ? this.endpoint(input.baseUrl) : undefined; const item = await this.prisma.integrationConnection.upsert({ where: { tenantId_provider: { tenantId: tenant.id, provider } }, update: { baseUrl, encryptedConfig: input.config ? this.encrypt(input.config) : undefined, enabled: input.enabled ?? true }, create: { tenantId: tenant.id, provider, baseUrl, encryptedConfig: input.config ? this.encrypt(input.config) : undefined, enabled: input.enabled ?? true } }); const { encryptedConfig, ...safe } = item; return { ...safe, configured: Boolean(encryptedConfig) }; }
  async test(slug: string, provider: string) { const tenant = await this.prisma.tenant.findUnique({ where: { slug } }); if (!tenant) throw new BadRequestException("Workspace not found."); const connection = await this.prisma.integrationConnection.findUnique({ where: { tenantId_provider: { tenantId: tenant.id, provider } } }); if (!connection?.baseUrl) throw new BadRequestException("Configure an API URL before testing the connection."); const startedAt = new Date(); try { const config = connection.encryptedConfig ? this.decrypt(connection.encryptedConfig) : {}; const response = await this.request(connection.baseUrl, config); await this.prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastConnectedAt: new Date() } }); await this.prisma.integrationLog.create({ data: { tenantId: tenant.id, connectionId: connection.id, operation: "TEST_CONNECTION", status: "SUCCESS", startedAt, completedAt: new Date() } }); return { status: "SUCCESS", httpStatus: response.status }; } catch (error) { const message = error instanceof Error ? error.message : "Connection failed."; await this.prisma.integrationLog.create({ data: { tenantId: tenant.id, connectionId: connection.id, operation: "TEST_CONNECTION", status: "FAILED", startedAt, completedAt: new Date(), errorMessage: message.slice(0, 500) } }); return { status: "FAILED", error: message }; } }

  async sync(slug: string, provider: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new BadRequestException("Workspace not found.");
    const connection = await this.prisma.integrationConnection.findUnique({ where: { tenantId_provider: { tenantId: tenant.id, provider } } });
    if (!connection?.baseUrl) throw new BadRequestException("Configure an API URL before synchronising.");
    const config = connection.encryptedConfig ? this.decrypt(connection.encryptedConfig) : {};
    const syncUrl = this.endpoint(config.syncUrl || connection.baseUrl);
    const startedAt = new Date();
    try {
      const response = await this.request(syncUrl, config);
      const raw = await response.json();
      const recordsValue = Array.isArray(raw) ? raw : (raw as { records?: unknown; data?: { records?: unknown } }).records ?? (raw as { data?: { records?: unknown } }).data?.records ?? [];
      const records = z.array(z.object({ id: z.union([z.string(), z.number()]), fullName: z.string().optional(), name: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional(), updatedAt: z.string().optional() }).passthrough()).parse(recordsValue);
      let created = 0; let updated = 0; let skipped = 0;
      for (const record of records) {
        const externalId = String(record.id); const fullName = (record.fullName || record.name || "").trim();
        if (!fullName) { skipped += 1; continue; }
        const existing = await this.prisma.contact.findUnique({ where: { tenantId_externalSystem_externalId: { tenantId: tenant.id, externalSystem: provider, externalId } } });
        const data = { fullName, email: record.email, phone: record.phone, externalId, externalSystem: provider, externalUpdatedAt: record.updatedAt ? new Date(record.updatedAt) : new Date() };
        if (existing) { await this.prisma.contact.update({ where: { id: existing.id }, data }); updated += 1; } else { await this.prisma.contact.create({ data: { tenantId: tenant.id, ...data } }); created += 1; }
      }
      await this.prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), lastConnectedAt: new Date() } });
      await this.prisma.integrationLog.create({ data: { tenantId: tenant.id, connectionId: connection.id, operation: "SYNC", status: "SUCCESS", recordsProcessed: records.length, recordsCreated: created, recordsUpdated: updated, recordsSkipped: skipped, startedAt, completedAt: new Date() } });
      return { status: "SUCCESS", recordsProcessed: records.length, recordsCreated: created, recordsUpdated: updated, recordsSkipped: skipped };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Synchronisation failed.";
      await this.prisma.integrationLog.create({ data: { tenantId: tenant.id, connectionId: connection.id, operation: "SYNC", status: "FAILED", startedAt, completedAt: new Date(), errorMessage: message.slice(0, 500) } });
      return { status: "FAILED", error: message };
    }
  }
}
