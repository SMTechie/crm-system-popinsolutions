import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";

@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess("accounting")
@Controller("accounting")
export class AccountingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private normalizeStatus(status?: string): "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "VOID" {
    const normalized = status?.toUpperCase();
    if (
      normalized === "DRAFT" ||
      normalized === "SENT" ||
      normalized === "PAID" ||
      normalized === "OVERDUE" ||
      normalized === "VOID"
    ) {
      return normalized;
    }
    return "SENT";
  }

  @Get("overview")
  async overview(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const [invoices, expenses, bankAccounts, periods, journalEntries] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId: tenant.id },
        select: { total: true, status: true },
      }),
      this.prisma.expense.findMany({
        where: { tenantId: tenant.id },
        select: { amount: true },
      }),
      this.prisma.bankAccount.findMany({
        where: { tenantId: tenant.id, active: true },
        select: { currentBalance: true },
      }),
      this.prisma.accountingPeriod.findMany({
        where: { tenantId: tenant.id },
        select: { status: true },
      }),
      this.prisma.journalEntry.count({
        where: { tenantId: tenant.id },
      }),
    ]);

    const revenue = invoices
      .filter((invoice) => invoice.status === "PAID")
      .reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const outstanding = invoices
      .filter((invoice) => invoice.status !== "PAID" && invoice.status !== "VOID")
      .reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const cash = bankAccounts.reduce((sum, account) => sum + Number(account.currentBalance), 0);
    const openPeriods = periods.filter((period) => period.status !== "CLOSED").length;

    return { tenantId: tenant.slug, revenue, outstanding, expenses: expenseTotal, cash, openPeriods, journalEntries };
  }

  @Get("invoices")
  async invoices(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.invoice.findMany({
      where: { tenantId: tenant.id },
      include: { payments: true, contact: true, company: true },
      orderBy: { issuedAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("expenses")
  async expenses(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.expense.findMany({
      where: { tenantId: tenant.id },
      orderBy: { incurredAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("payments")
  async payments(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.payment.findMany({
      where: { invoice: { tenantId: tenant.id } },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            customer: true,
            currency: true,
          },
        },
      },
      orderBy: { receivedAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("vendors")
  async vendors(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.vendor.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("bank-accounts")
  async bankAccounts(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.bankAccount.findMany({
      where: { tenantId: tenant.id },
      orderBy: { accountName: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("chart-accounts")
  async chartAccounts(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.chartAccount.findMany({
      where: { tenantId: tenant.id },
      orderBy: { code: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("tax-rates")
  async taxRates(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.taxRate.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("periods")
  async periods(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.accountingPeriod.findMany({
      where: { tenantId: tenant.id },
      orderBy: { startDate: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("journal-entries")
  async journalEntries(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.journalEntry.findMany({
      where: { tenantId: tenant.id },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                category: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { entryDate: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Post("vendors")
  async createVendor(
    @Tenant() tenantId: string,
    @Body()
    body: {
      name?: string;
      email?: string;
      phone?: string;
      category?: string;
      paymentTerms?: string;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.vendor.create({
      data: {
        tenantId: tenant.id,
        name: body.name ?? "New Vendor",
        email: body.email || null,
        phone: body.phone || null,
        category: body.category || null,
        paymentTerms: body.paymentTerms || null,
        active: body.active ?? true,
      },
    });
    return { status: "created", item };
  }

  @Patch("vendors/:vendorId")
  async updateVendor(
    @Tenant() tenantId: string,
    @Param("vendorId") vendorId: string,
    @Body()
    body: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      category?: string | null;
      paymentTerms?: string | null;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.vendor.findFirst({ where: { tenantId: tenant.id, id: vendorId } });
    if (!existing) return { status: "missing", vendorId };
    const item = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        name: body.name ?? undefined,
        email: body.email === "" ? null : body.email ?? undefined,
        phone: body.phone === "" ? null : body.phone ?? undefined,
        category: body.category === "" ? null : body.category ?? undefined,
        paymentTerms: body.paymentTerms === "" ? null : body.paymentTerms ?? undefined,
        active: body.active ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("vendors/:vendorId")
  async deleteVendor(@Tenant() tenantId: string, @Param("vendorId") vendorId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.vendor.findFirst({ where: { tenantId: tenant.id, id: vendorId } });
    if (!existing) return { status: "missing", vendorId };
    await this.prisma.vendor.delete({ where: { id: vendorId } });
    return { status: "deleted", vendorId };
  }

  @Post("bank-accounts")
  async createBankAccount(
    @Tenant() tenantId: string,
    @Body()
    body: {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      currency?: string;
      currentBalance?: number;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.bankAccount.create({
      data: {
        tenantId: tenant.id,
        bankName: body.bankName ?? "Business Bank",
        accountName: body.accountName ?? "Operating Account",
        accountNumber: body.accountNumber ?? "0000000000",
        currency: body.currency ?? tenant.currency,
        currentBalance: new Prisma.Decimal(body.currentBalance ?? 0),
        active: body.active ?? true,
      },
    });
    return { status: "created", item };
  }

  @Patch("bank-accounts/:accountId")
  async updateBankAccount(
    @Tenant() tenantId: string,
    @Param("accountId") accountId: string,
    @Body()
    body: {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      currency?: string;
      currentBalance?: number;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.bankAccount.findFirst({ where: { tenantId: tenant.id, id: accountId } });
    if (!existing) return { status: "missing", accountId };
    const item = await this.prisma.bankAccount.update({
      where: { id: accountId },
      data: {
        bankName: body.bankName ?? undefined,
        accountName: body.accountName ?? undefined,
        accountNumber: body.accountNumber ?? undefined,
        currency: body.currency ?? undefined,
        currentBalance: body.currentBalance === undefined ? undefined : new Prisma.Decimal(body.currentBalance),
        active: body.active ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("bank-accounts/:accountId")
  async deleteBankAccount(@Tenant() tenantId: string, @Param("accountId") accountId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.bankAccount.findFirst({ where: { tenantId: tenant.id, id: accountId } });
    if (!existing) return { status: "missing", accountId };
    await this.prisma.bankAccount.delete({ where: { id: accountId } });
    return { status: "deleted", accountId };
  }

  @Post("chart-accounts")
  async createChartAccount(
    @Tenant() tenantId: string,
    @Body()
    body: {
      code?: string;
      name?: string;
      category?: string;
      balanceSide?: string;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.chartAccount.create({
      data: {
        tenantId: tenant.id,
        code: body.code ?? `ACC-${Date.now()}`,
        name: body.name ?? "New Account",
        category: body.category ?? "Asset",
        balanceSide: body.balanceSide ?? "DEBIT",
        active: body.active ?? true,
      },
    });
    return { status: "created", item };
  }

  @Patch("chart-accounts/:accountId")
  async updateChartAccount(
    @Tenant() tenantId: string,
    @Param("accountId") accountId: string,
    @Body()
    body: {
      code?: string;
      name?: string;
      category?: string;
      balanceSide?: string;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.chartAccount.findFirst({ where: { tenantId: tenant.id, id: accountId } });
    if (!existing) return { status: "missing", accountId };
    const item = await this.prisma.chartAccount.update({
      where: { id: accountId },
      data: {
        code: body.code ?? undefined,
        name: body.name ?? undefined,
        category: body.category ?? undefined,
        balanceSide: body.balanceSide ?? undefined,
        active: body.active ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("chart-accounts/:accountId")
  async deleteChartAccount(@Tenant() tenantId: string, @Param("accountId") accountId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.chartAccount.findFirst({ where: { tenantId: tenant.id, id: accountId } });
    if (!existing) return { status: "missing", accountId };
    await this.prisma.journalEntryLine.deleteMany({ where: { accountId } });
    await this.prisma.chartAccount.delete({ where: { id: accountId } });
    return { status: "deleted", accountId };
  }

  @Post("tax-rates")
  async createTaxRate(
    @Tenant() tenantId: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      ratePercent?: number;
      appliesTo?: string;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.taxRate.create({
      data: {
        tenantId: tenant.id,
        name: body.name ?? "VAT",
        code: body.code ?? `TAX-${Date.now()}`,
        ratePercent: new Prisma.Decimal(body.ratePercent ?? 15),
        appliesTo: body.appliesTo ?? "SALES",
        active: body.active ?? true,
      },
    });
    return { status: "created", item };
  }

  @Patch("tax-rates/:taxRateId")
  async updateTaxRate(
    @Tenant() tenantId: string,
    @Param("taxRateId") taxRateId: string,
    @Body()
    body: {
      name?: string;
      code?: string;
      ratePercent?: number;
      appliesTo?: string;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.taxRate.findFirst({ where: { tenantId: tenant.id, id: taxRateId } });
    if (!existing) return { status: "missing", taxRateId };
    const item = await this.prisma.taxRate.update({
      where: { id: taxRateId },
      data: {
        name: body.name ?? undefined,
        code: body.code ?? undefined,
        ratePercent: body.ratePercent === undefined ? undefined : new Prisma.Decimal(body.ratePercent),
        appliesTo: body.appliesTo ?? undefined,
        active: body.active ?? undefined,
      },
    });
    return { status: "updated", item };
  }

  @Delete("tax-rates/:taxRateId")
  async deleteTaxRate(@Tenant() tenantId: string, @Param("taxRateId") taxRateId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.taxRate.findFirst({ where: { tenantId: tenant.id, id: taxRateId } });
    if (!existing) return { status: "missing", taxRateId };
    await this.prisma.taxRate.delete({ where: { id: taxRateId } });
    return { status: "deleted", taxRateId };
  }

  @Post("periods")
  async createPeriod(
    @Tenant() tenantId: string,
    @Body()
    body: {
      label?: string;
      startDate?: string;
      endDate?: string;
      status?: "OPEN" | "REVIEW" | "CLOSED";
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.accountingPeriod.create({
      data: {
        tenantId: tenant.id,
        label: body.label ?? `Period ${Date.now()}`,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        endDate: body.endDate ? new Date(body.endDate) : new Date(),
        status: body.status ?? "OPEN",
        closedAt: body.status === "CLOSED" ? new Date() : null,
      },
    });
    return { status: "created", item };
  }

  @Patch("periods/:periodId")
  async updatePeriod(
    @Tenant() tenantId: string,
    @Param("periodId") periodId: string,
    @Body()
    body: {
      label?: string;
      startDate?: string;
      endDate?: string;
      status?: "OPEN" | "REVIEW" | "CLOSED";
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.accountingPeriod.findFirst({ where: { tenantId: tenant.id, id: periodId } });
    if (!existing) return { status: "missing", periodId };
    const item = await this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: {
        label: body.label ?? undefined,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        status: body.status ?? undefined,
        closedAt: body.status === "CLOSED" ? new Date() : body.status === "OPEN" ? null : undefined,
      },
    });
    return { status: "updated", item };
  }

  @Post("periods/:periodId/close")
  async closePeriod(@Tenant() tenantId: string, @Param("periodId") periodId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.accountingPeriod.findFirst({ where: { tenantId: tenant.id, id: periodId } });
    if (!existing) return { status: "missing", periodId };
    const item = await this.prisma.accountingPeriod.update({
      where: { id: periodId },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    return { status: "closed", item };
  }

  @Delete("periods/:periodId")
  async deletePeriod(@Tenant() tenantId: string, @Param("periodId") periodId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.accountingPeriod.findFirst({ where: { tenantId: tenant.id, id: periodId } });
    if (!existing) return { status: "missing", periodId };
    await this.prisma.accountingPeriod.delete({ where: { id: periodId } });
    return { status: "deleted", periodId };
  }

  @Post("journal-entries")
  async createJournalEntry(
    @Tenant() tenantId: string,
    @Body()
    body: {
      entryDate?: string;
      reference?: string;
      memo?: string;
      status?: string;
      lines?: Array<{
        accountId: string;
        description?: string;
        debit?: number;
        credit?: number;
      }>;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const lines = await this.prepareJournalLines(tenant.id, body.lines);
    const item = await this.prisma.journalEntry.create({
      data: {
        tenantId: tenant.id,
        entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
        reference: body.reference || null,
        memo: body.memo || null,
        status: body.status ?? "POSTED",
        lines: {
          create: lines,
        },
      },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                category: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return { status: "created", item };
  }

  @Patch("journal-entries/:entryId")
  async updateJournalEntry(
    @Tenant() tenantId: string,
    @Param("entryId") entryId: string,
    @Body()
    body: {
      entryDate?: string;
      reference?: string | null;
      memo?: string | null;
      status?: string;
      lines?: Array<{
        accountId: string;
        description?: string;
        debit?: number;
        credit?: number;
      }>;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.journalEntry.findFirst({ where: { tenantId: tenant.id, id: entryId } });
    if (!existing) return { status: "missing", entryId };
    const lines = body.lines ? await this.prepareJournalLines(tenant.id, body.lines) : null;
    if (lines) {
      await this.prisma.journalEntryLine.deleteMany({ where: { journalEntryId: entryId } });
    }
    const item = await this.prisma.journalEntry.update({
      where: { id: entryId },
      data: {
        entryDate: body.entryDate ? new Date(body.entryDate) : undefined,
        reference: body.reference === "" ? null : body.reference ?? undefined,
        memo: body.memo === "" ? null : body.memo ?? undefined,
        status: body.status ?? undefined,
        lines: lines
          ? {
              create: lines,
            }
          : undefined,
      },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
                category: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return { status: "updated", item };
  }

  @Delete("journal-entries/:entryId")
  async deleteJournalEntry(@Tenant() tenantId: string, @Param("entryId") entryId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.journalEntry.findFirst({ where: { tenantId: tenant.id, id: entryId } });
    if (!existing) return { status: "missing", entryId };
    await this.prisma.journalEntryLine.deleteMany({ where: { journalEntryId: entryId } });
    await this.prisma.journalEntry.delete({ where: { id: entryId } });
    return { status: "deleted", entryId };
  }

  @Post("expenses")
  async createExpense(
    @Tenant() tenantId: string,
    @Body()
    body: {
      category?: string;
      vendor?: string;
      currency?: string;
      amount?: number;
      incurredAt?: string;
      invoiceId?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const invoice =
      body.invoiceId
        ? await this.prisma.invoice.findFirst({ where: { tenantId: tenant.id, id: body.invoiceId } })
        : null;
    const item = await this.prisma.expense.create({
      data: {
        tenantId: tenant.id,
        invoiceId: invoice?.id,
        category: body.category ?? "Operational",
        vendor: body.vendor ?? "Internal vendor",
        currency: body.currency ?? tenant.currency,
        amount: new Prisma.Decimal(body.amount ?? 0),
        incurredAt: body.incurredAt ? new Date(body.incurredAt) : new Date(),
      },
    });
    return { status: "created", item };
  }

  @Post("payments")
  async createPayment(
    @Tenant() tenantId: string,
    @Body()
    body: {
      invoiceId?: string;
      provider?: string;
      amount?: number;
      receivedAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const invoice =
      body.invoiceId
        ? await this.prisma.invoice.findFirst({ where: { tenantId: tenant.id, id: body.invoiceId } })
        : await this.prisma.invoice.findFirst({ where: { tenantId: tenant.id } });
    if (!invoice) {
      return { status: "missing-invoice" };
    }
    const item = await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        provider: body.provider ?? "Manual",
        amount: new Prisma.Decimal(body.amount ?? Number(invoice.total)),
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
      },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            customer: true,
            currency: true,
          },
        },
      },
    });
    return { status: "created", item };
  }

  @Post("invoices")
  async createInvoice(
    @Tenant() tenantId: string,
    @Body()
    body: {
      customer?: string;
      contactId?: string;
      companyId?: string;
      billingEmail?: string;
      billingPhone?: string;
      number?: string;
      purchaseOrder?: string;
      description?: string;
      notes?: string;
      subtotal?: number;
      taxAmount?: number;
      currency?: string;
      status?: string;
      issuedAt?: string;
      dueAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const contact =
      body.contactId
        ? await this.prisma.contact.findFirst({ where: { tenantId: tenant.id, id: body.contactId }, include: { company: true } })
        : null;
    const company =
      body.companyId
        ? await this.prisma.company.findFirst({ where: { tenantId: tenant.id, id: body.companyId } })
        : contact?.company ?? null;
    const subtotal = body.subtotal ?? 12000;
    const taxAmount = body.taxAmount ?? 1800;
    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        contactId: contact?.id,
        companyId: company?.id,
        customer: body.customer ?? contact?.fullName ?? company?.name ?? "Pop In Client",
        billingEmail: body.billingEmail ?? contact?.email ?? null,
        billingPhone: body.billingPhone ?? contact?.phone ?? null,
        number: body.number ?? `INV-${Date.now()}`,
        purchaseOrder: body.purchaseOrder ?? null,
        description: body.description ?? null,
        notes: body.notes ?? null,
        status: this.normalizeStatus(body.status),
        currency: body.currency ?? tenant.currency,
        subtotal: new Prisma.Decimal(subtotal),
        taxAmount: new Prisma.Decimal(taxAmount),
        total: new Prisma.Decimal(subtotal + taxAmount),
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : new Date(),
        dueAt: body.dueAt ? new Date(body.dueAt) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      },
      include: { contact: true, company: true, payments: true },
    });
    return { status: "created", item: invoice };
  }

  @Patch("invoices/:invoiceId")
  async updateInvoice(
    @Tenant() tenantId: string,
    @Param("invoiceId") invoiceId: string,
    @Body()
    body: {
      customer?: string;
      contactId?: string | null;
      companyId?: string | null;
      billingEmail?: string | null;
      billingPhone?: string | null;
      number?: string;
      purchaseOrder?: string | null;
      description?: string | null;
      notes?: string | null;
      subtotal?: number;
      taxAmount?: number;
      currency?: string;
      status?: string;
      issuedAt?: string;
      dueAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.invoice.findFirst({
      where: { tenantId: tenant.id, id: invoiceId },
    });
    if (!existing) {
      return { status: "missing", invoiceId };
    }

    const subtotal = body.subtotal ?? Number(existing.subtotal);
    const taxAmount = body.taxAmount ?? Number(existing.taxAmount);
    let contactId: string | null | undefined;
    if (body.contactId === undefined) {
      contactId = undefined;
    } else if (body.contactId === "") {
      contactId = null;
    } else {
      const incomingContactId = body.contactId as string;
      const contact = await this.prisma.contact.findFirst({ where: { tenantId: tenant.id, id: incomingContactId } });
      contactId = contact?.id ?? existing.contactId ?? null;
    }
    let companyId: string | null | undefined;
    if (body.companyId === undefined) {
      companyId = undefined;
    } else if (body.companyId === "") {
      companyId = null;
    } else {
      const incomingCompanyId = body.companyId as string;
      const company = await this.prisma.company.findFirst({ where: { tenantId: tenant.id, id: incomingCompanyId } });
      companyId = company?.id ?? existing.companyId ?? null;
    }

    const item = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        contactId,
        companyId,
        customer: body.customer ?? undefined,
        billingEmail: body.billingEmail === "" ? null : body.billingEmail ?? undefined,
        billingPhone: body.billingPhone === "" ? null : body.billingPhone ?? undefined,
        number: body.number ?? undefined,
        purchaseOrder: body.purchaseOrder === "" ? null : body.purchaseOrder ?? undefined,
        description: body.description === "" ? null : body.description ?? undefined,
        notes: body.notes === "" ? null : body.notes ?? undefined,
        status: body.status ? this.normalizeStatus(body.status) : undefined,
        currency: body.currency ?? undefined,
        subtotal: body.subtotal === undefined ? undefined : new Prisma.Decimal(subtotal),
        taxAmount: body.taxAmount === undefined ? undefined : new Prisma.Decimal(taxAmount),
        total:
          body.subtotal === undefined && body.taxAmount === undefined
            ? undefined
            : new Prisma.Decimal(subtotal + taxAmount),
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      },
      include: { contact: true, company: true, payments: true },
    });
    return { status: "updated", item };
  }

  @Delete("invoices/:invoiceId")
  async deleteInvoice(@Tenant() tenantId: string, @Param("invoiceId") invoiceId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.invoice.findFirst({
      where: { tenantId: tenant.id, id: invoiceId },
    });
    if (!existing) {
      return { status: "missing", invoiceId };
    }
    await this.prisma.payment.deleteMany({
      where: { invoiceId },
    });
    await this.prisma.expense.updateMany({
      where: { tenantId: tenant.id, invoiceId },
      data: { invoiceId: null },
    });
    await this.prisma.invoice.delete({
      where: { id: invoiceId },
    });
    return { status: "deleted", invoiceId };
  }

  @Patch("expenses/:expenseId")
  async updateExpense(
    @Tenant() tenantId: string,
    @Param("expenseId") expenseId: string,
    @Body()
    body: {
      category?: string;
      vendor?: string | null;
      currency?: string;
      amount?: number;
      incurredAt?: string;
      invoiceId?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.expense.findFirst({
      where: { tenantId: tenant.id, id: expenseId },
    });
    if (!existing) {
      return { status: "missing", expenseId };
    }
    let invoice: { id: string } | null | undefined;
    if (body.invoiceId === undefined) {
      invoice = undefined;
    } else if (body.invoiceId === "") {
      invoice = null;
    } else {
      const invoiceId = body.invoiceId as string;
      invoice = await this.prisma.invoice.findFirst({ where: { tenantId: tenant.id, id: invoiceId } });
    }
    const item = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        category: body.category ?? undefined,
        vendor: body.vendor === "" ? null : body.vendor ?? undefined,
        currency: body.currency ?? undefined,
        amount: body.amount === undefined ? undefined : new Prisma.Decimal(body.amount),
        incurredAt: body.incurredAt ? new Date(body.incurredAt) : undefined,
        invoiceId: body.invoiceId === undefined ? undefined : invoice?.id ?? null,
      },
    });
    return { status: "updated", item };
  }

  @Delete("expenses/:expenseId")
  async deleteExpense(@Tenant() tenantId: string, @Param("expenseId") expenseId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.expense.findFirst({
      where: { tenantId: tenant.id, id: expenseId },
    });
    if (!existing) {
      return { status: "missing", expenseId };
    }
    await this.prisma.expense.delete({
      where: { id: expenseId },
    });
    return { status: "deleted", expenseId };
  }

  @Patch("payments/:paymentId")
  async updatePayment(
    @Tenant() tenantId: string,
    @Param("paymentId") paymentId: string,
    @Body()
    body: {
      invoiceId?: string;
      provider?: string;
      amount?: number;
      receivedAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.payment.findFirst({
      where: { id: paymentId, invoice: { tenantId: tenant.id } },
      include: { invoice: true },
    });
    if (!existing) {
      return { status: "missing", paymentId };
    }
    let invoiceId: string | undefined;
    if (body.invoiceId === undefined) {
      invoiceId = undefined;
    } else if (body.invoiceId === "") {
      invoiceId = existing.invoiceId;
    } else {
      const invoice = await this.prisma.invoice.findFirst({
        where: { tenantId: tenant.id, id: body.invoiceId },
      });
      invoiceId = invoice?.id ?? existing.invoiceId;
    }
    const item = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        invoiceId,
        provider: body.provider ?? undefined,
        amount: body.amount === undefined ? undefined : new Prisma.Decimal(body.amount),
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      },
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            customer: true,
            currency: true,
          },
        },
      },
    });
    return { status: "updated", item };
  }

  @Delete("payments/:paymentId")
  async deletePayment(@Tenant() tenantId: string, @Param("paymentId") paymentId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.payment.findFirst({
      where: { id: paymentId, invoice: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", paymentId };
    }
    await this.prisma.payment.delete({
      where: { id: paymentId },
    });
    return { status: "deleted", paymentId };
  }

  @Post("payments/webhook/stripe")
  stripeWebhook() {
    return { status: "accepted" };
  }

  private async prepareJournalLines(
    tenantId: string,
    lines?: Array<{
      accountId: string;
      description?: string;
      debit?: number;
      credit?: number;
    }>,
  ) {
    if (!lines?.length) {
      return [];
    }

    const accountIds = lines.map((line) => line.accountId);
    const accounts = await this.prisma.chartAccount.findMany({
      where: { tenantId, id: { in: accountIds } },
      select: { id: true },
    });
    const allowedIds = new Set(accounts.map((account) => account.id));

    return lines
      .filter((line) => allowedIds.has(line.accountId))
      .map((line) => ({
        accountId: line.accountId,
        description: line.description || null,
        debit: new Prisma.Decimal(line.debit ?? 0),
        credit: new Prisma.Decimal(line.credit ?? 0),
      }));
  }
}
