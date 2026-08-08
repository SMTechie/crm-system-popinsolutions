import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TenantService {
  private readonly defaultModules = ["crm", "accounting", "hr", "forms", "automation", "settings"];

  constructor(private readonly prisma: PrismaService) {}

  async ensureTenant(slug: string) {
    return this.prisma.tenant.upsert({
      where: { slug },
      update: {},
      create: {
        name: "Pop In Solutions",
        slug,
        enabledModules: this.defaultModules,
        planCode: "enterprise",
        subscriptionStatus: "active",
        onboardingCompleted: true,
        billingEmail: "billing@popinsolutions.co.za",
        emailFromName: "Pop In Solutions",
        emailFromAddress: "support@popinsolutions.co.za",
        replyToEmail: "support@popinsolutions.co.za",
        maxUsers: 250,
        maxStorageGb: 250,
      },
    });
  }
}
