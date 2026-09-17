import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureTenant(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new UnauthorizedException("Workspace not found.");
    return tenant;
  }
}
