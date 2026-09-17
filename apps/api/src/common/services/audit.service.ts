import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private json(value: unknown) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

  async record(input: { tenantId: string; actorId?: string; action: string; entityType: string; entityId?: string; previousValue?: unknown; newValue?: unknown; ipAddress?: string; userAgent?: string; metadata?: unknown }) {
    return this.prisma.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, action: input.action, entityType: input.entityType, entityId: input.entityId, previousValue: this.json(input.previousValue), newValue: this.json(input.newValue), ipAddress: input.ipAddress, userAgent: input.userAgent, metadataJson: this.json(input.metadata) } });
  }
}
