import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AccountingPostingService } from "./accounting-posting.service";

@UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
@ModuleAccess("accounting")
@Controller("accounting")
export class AccountingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly posting: AccountingPostingService,
  ) {}

  private pagination(page?: string, pageSize?: string) { const current = Math.max(1, Number.parseInt(page || "1", 10) || 1); const size = Math.min(100, Math.max(1, Number.parseInt(pageSize || "50", 10) || 50)); return { page: current, pageSize: size, skip: (current - 1) * size, take: size }; }

  private async nextInvoiceNumber(tenantId: string, prefix: string) {
    const count = await this.prisma.invoice.count({ where: { tenantId } });
    return `${prefix || "INV"}-${String(count + 1).padStart(6, "0")}`;
  }

  private async nextSupplierNumber(tenantId: string) {
    const count = await this.prisma.vendor.count({ where: { tenantId } });
    return `SUP-${String(count + 1).padStart(6, "0")}`;
  }

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

  private normalizeExpenseStatus(status?: string) { const normalized = status?.toUpperCase(); return ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"].includes(normalized || "") ? normalized as "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID" : "DRAFT" as const; }

  private async recalculateInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, select: { total: true, status: true, dueAt: true } });
    if (!invoice) return;
    const payments = await this.prisma.payment.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    const paidAmount = new Prisma.Decimal(payments._sum.amount ?? 0);
    const total = new Prisma.Decimal(invoice.total);
    const status = invoice.status === "VOID" || invoice.status === "DRAFT" ? invoice.status : paidAmount.gte(total) ? "PAID" : paidAmount.gt(0) ? "SENT" : invoice.dueAt < new Date() ? "OVERDUE" : "SENT";
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { paidAmount, status } });
  }

  private calculateLineItems(lines?: Array<{ description?: string; quantity?: number; unitPrice?: number; discount?: number; taxRate?: number }>) {
    if (!lines?.length) return null;
    const items = lines.map((line) => {
      if (!line.description?.trim() || !line.quantity || line.quantity <= 0 || line.unitPrice === undefined || line.unitPrice < 0) throw new BadRequestException("Every line item needs a description, positive quantity, and non-negative price.");
      const net = line.quantity * line.unitPrice - (line.discount ?? 0);
      const tax = net * (line.taxRate ?? 0) / 100;
      return { description: line.description.trim(), quantity: new Prisma.Decimal(line.quantity), unitPrice: new Prisma.Decimal(line.unitPrice), discount: new Prisma.Decimal(line.discount ?? 0), taxRate: new Prisma.Decimal(line.taxRate ?? 0), lineTotal: new Prisma.Decimal(net.toFixed(2)), tax };
    });
    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    const taxAmount = items.reduce((sum, item) => sum + item.tax, 0);
    return { items, subtotal: new Prisma.Decimal(subtotal.toFixed(2)), taxAmount: new Prisma.Decimal(taxAmount.toFixed(2)) };
  }

  @Get("overview")
  @RequiresPermission("accounting.invoices.view")
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
  @RequiresPermission("accounting.invoices.view")
  async invoices(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { tenantId: tenant.id };
    const [items, total] = await Promise.all([this.prisma.invoice.findMany({ where, include: { payments: true, contact: true, company: true }, orderBy: { issuedAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.invoice.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("quotes")
  @RequiresPermission("accounting.invoices.view")
  async quotes(@Tenant() tenantId: string) { const tenant = await this.tenantService.ensureTenant(tenantId); return { tenantId: tenant.slug, items: await this.prisma.quote.findMany({ where: { tenantId: tenant.id }, include: { items: true }, orderBy: { createdAt: "desc" } }) }; }

  @Post("quotes")
  @RequiresPermission("accounting.invoices.create")
  async createQuote(@Tenant() tenantId: string, @Body() body: { customer?: string; number?: string; currency?: string; validUntil?: string; lineItems?: Array<{ description?: string; quantity?: number; unitPrice?: number; taxRate?: number }> }) {
    const tenant = await this.tenantService.ensureTenant(tenantId); if (!body.customer?.trim()) throw new BadRequestException("Quote customer is required.");
    const calculated = this.calculateLineItems(body.lineItems); if (!calculated) throw new BadRequestException("At least one quote line item is required.");
    return { status: "created", item: await this.prisma.quote.create({ data: { tenantId: tenant.id, customer: body.customer.trim(), number: body.number ?? `QUO-${Date.now()}`, currency: body.currency ?? tenant.currency, subtotal: calculated.subtotal, taxAmount: calculated.taxAmount, total: calculated.subtotal.plus(calculated.taxAmount), validUntil: body.validUntil ? new Date(body.validUntil) : undefined, items: { create: calculated.items.map(({ tax, discount, ...item }) => item) } }, include: { items: true } }) };
  }

  @Patch("quotes/:quoteId/status")
  @RequiresPermission("accounting.invoices.approve")
  async updateQuoteStatus(@Tenant() tenantId: string, @Param("quoteId") quoteId: string, @Body() body: { status?: string }) { const tenant = await this.tenantService.ensureTenant(tenantId); if (!(await this.prisma.quote.findFirst({ where: { id: quoteId, tenantId: tenant.id } }))) throw new BadRequestException("Quote not found."); const allowed = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"]; const status = body.status?.toUpperCase(); if (!status || !allowed.includes(status)) throw new BadRequestException("Invalid quote status."); return { item: await this.prisma.quote.update({ where: { id: quoteId }, data: { status } }) }; }

  @Post("quotes/:quoteId/convert")
  @RequiresPermission("accounting.invoices.create")
  async convertQuote(@Tenant() tenantId: string, @Param("quoteId") quoteId: string) { const tenant = await this.tenantService.ensureTenant(tenantId); const quote = await this.prisma.quote.findFirst({ where: { id: quoteId, tenantId: tenant.id }, include: { items: true } }); if (!quote) throw new BadRequestException("Quote not found."); if (quote.status === "CONVERTED") throw new BadRequestException("Quote has already been converted."); const invoice = await this.prisma.invoice.create({ data: { tenantId: tenant.id, customer: quote.customer, number: await this.nextInvoiceNumber(tenant.id, tenant.invoicePrefix), status: "DRAFT", currency: quote.currency, subtotal: quote.subtotal, taxAmount: quote.taxAmount, total: quote.total, issuedAt: new Date(), dueAt: new Date(Date.now() + 14 * 86400000), items: { create: quote.items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, discount: 0, taxRate: item.taxRate, lineTotal: item.lineTotal })) } }, include: { items: true } }); await this.prisma.quote.update({ where: { id: quote.id }, data: { status: "CONVERTED" } }); return { status: "converted", item: invoice }; }

  @Get("expenses")
  @RequiresPermission("accounting.invoices.view")
  async expenses(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { tenantId: tenant.id };
    const [items, total] = await Promise.all([this.prisma.expense.findMany({ where, orderBy: { incurredAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.expense.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("payments")
  @RequiresPermission("accounting.invoices.view")
  async payments(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { invoice: { tenantId: tenant.id } };
    const [items, total] = await Promise.all([this.prisma.payment.findMany({ where, include: { invoice: { select: { id: true, number: true, customer: true, currency: true } } }, orderBy: { receivedAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.payment.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Get("vendors")
  @RequiresPermission("accounting.invoices.view")
  async vendors(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.vendor.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("bank-accounts")
  @RequiresPermission("accounting.invoices.view")
  async bankAccounts(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.bankAccount.findMany({
      where: { tenantId: tenant.id },
      orderBy: { accountName: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("chart-accounts")
  @RequiresPermission("accounting.invoices.view")
  async chartAccounts(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.chartAccount.findMany({
      where: { tenantId: tenant.id },
      orderBy: { code: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("tax-rates")
  @RequiresPermission("accounting.invoices.view")
  async taxRates(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.taxRate.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("periods")
  @RequiresPermission("accounting.invoices.view")
  async periods(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.accountingPeriod.findMany({
      where: { tenantId: tenant.id },
      orderBy: { startDate: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Get("journal-entries")
  @RequiresPermission("accounting.invoices.view")
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

  @Get("reports/trial-balance")
  @RequiresPermission("reports.view")
  async trialBalance(@Tenant() tenantId: string, @Query("from") from?: string, @Query("to") to?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const lines = await this.prisma.journalEntryLine.findMany({ where: { journalEntry: { tenantId: tenant.id, entryDate: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } } }, include: { account: true } });
    const rows = new Map<string, { code: string; name: string; debit: number; credit: number }>();
    for (const line of lines) { const row = rows.get(line.accountId) ?? { code: line.account.code, name: line.account.name, debit: 0, credit: 0 }; row.debit += Number(line.debit); row.credit += Number(line.credit); rows.set(line.accountId, row); }
    return { from: from ?? null, to: to ?? null, items: [...rows.values()].map((row) => ({ ...row, balance: row.debit - row.credit })) };
  }

  @Get("reports/profit-loss")
  @RequiresPermission("reports.view")
  async profitLoss(@Tenant() tenantId: string, @Query("from") from?: string, @Query("to") to?: string, @Query("departmentId") departmentId?: string, @Query("projectId") projectId?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const [invoices, expenses] = await Promise.all([this.prisma.invoice.findMany({ where: { tenantId: tenant.id, projectId: projectId || undefined, issuedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined }, status: { not: "VOID" } }, select: { total: true } }), this.prisma.expense.findMany({ where: { tenantId: tenant.id, departmentId: departmentId || undefined, projectId: projectId || undefined, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true } })]);
    const revenue = invoices.reduce((sum, item) => sum + Number(item.total), 0); const expensesTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    return { revenue, expenses: expensesTotal, netIncome: revenue - expensesTotal, from: from ?? null, to: to ?? null };
  }

  @Get("reports/accounts-receivable")
  @RequiresPermission("reports.view")
  async accountsReceivable(@Tenant() tenantId: string) { const tenant = await this.tenantService.ensureTenant(tenantId); const items = await this.prisma.invoice.findMany({ where: { tenantId: tenant.id, status: { notIn: ["PAID", "VOID", "DRAFT"] } }, include: { payments: true }, orderBy: { dueAt: "asc" } }); return { items: items.map((invoice) => ({ id: invoice.id, number: invoice.number, customer: invoice.customer, dueAt: invoice.dueAt, total: Number(invoice.total), paid: invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0), outstanding: Number(invoice.total) - invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) })) }; }

  @Get("reports/cash-flow")
  @RequiresPermission("reports.view")
  async cashFlow(@Tenant() tenantId: string, @Query("from") from?: string, @Query("to") to?: string, @Query("departmentId") departmentId?: string, @Query("projectId") projectId?: string) { const tenant = await this.tenantService.ensureTenant(tenantId); const [payments, expenses] = await Promise.all([this.prisma.payment.findMany({ where: { invoice: { tenantId: tenant.id, projectId: projectId || undefined }, receivedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true } }), this.prisma.expense.findMany({ where: { tenantId: tenant.id, departmentId: departmentId || undefined, projectId: projectId || undefined, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true } })]); const inflow = payments.reduce((sum, item) => sum + Number(item.amount), 0); const outflow = expenses.reduce((sum, item) => sum + Number(item.amount), 0); return { inflow, outflow, net: inflow - outflow, from: from ?? null, to: to ?? null }; }

  @Get("reports/balance-sheet")
  @RequiresPermission("reports.view")
  async balanceSheet(@Tenant() tenantId: string, @Query("to") to?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const lines = await this.prisma.journalEntryLine.findMany({ where: { journalEntry: { tenantId: tenant.id, status: "POSTED", entryDate: { lte: to ? new Date(to) : undefined } } }, include: { account: true } });
    const totals = { Asset: 0, Liability: 0, Equity: 0, Income: 0, Expense: 0 };
    for (const line of lines) { const category = line.account.category as keyof typeof totals; if (category in totals) totals[category] += Number(line.debit) - Number(line.credit); }
    return { assets: totals.Asset, liabilities: -totals.Liability, equity: -totals.Equity + (totals.Income + totals.Expense), balanced: Number((totals.Asset + totals.Liability + totals.Equity + totals.Income + totals.Expense).toFixed(2)) === 0, to: to ?? null };
  }

  @Get("reports/general-ledger")
  @RequiresPermission("reports.view")
  async generalLedger(@Tenant() tenantId: string, @Query("accountId") accountId?: string, @Query("from") from?: string, @Query("to") to?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.journalEntryLine.findMany({ where: { accountId: accountId || undefined, journalEntry: { tenantId: tenant.id, status: "POSTED", entryDate: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } } }, include: { account: true, journalEntry: true }, orderBy: { journalEntry: { entryDate: "asc" } } });
    return { items: items.map((line) => ({ id: line.id, date: line.journalEntry.entryDate, reference: line.journalEntry.reference, memo: line.journalEntry.memo, account: line.account.code, accountName: line.account.name, description: line.description, debit: Number(line.debit), credit: Number(line.credit) })) };
  }

  @Get("reports/accounts-payable")
  @RequiresPermission("reports.view")
  async accountsPayable(@Tenant() tenantId: string, @Query("from") from?: string, @Query("to") to?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.expense.findMany({ where: { tenantId: tenant.id, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, orderBy: { incurredAt: "asc" } });
    return { items: items.map((item) => ({ id: item.id, vendor: item.vendor, category: item.category, incurredAt: item.incurredAt, currency: item.currency, amount: Number(item.amount), status: item.status })) };
  }

  @Get("reports/vat")
  @RequiresPermission("reports.view")
  async vatReport(@Tenant() tenantId: string, @Query("from") from?: string, @Query("to") to?: string, @Query("departmentId") departmentId?: string, @Query("projectId") projectId?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const [invoices, expenses] = await Promise.all([this.prisma.invoice.findMany({ where: { tenantId: tenant.id, projectId: projectId || undefined, status: { not: "VOID" }, issuedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { subtotal: true, taxAmount: true } }), this.prisma.expense.findMany({ where: { tenantId: tenant.id, departmentId: departmentId || undefined, projectId: projectId || undefined, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true, taxAmount: true } })]);
    const outputTax = invoices.reduce((sum, item) => sum + Number(item.taxAmount), 0); const outputBase = invoices.reduce((sum, item) => sum + Number(item.subtotal), 0); const inputBase = expenses.reduce((sum, item) => sum + Number(item.amount), 0); const inputTax = expenses.reduce((sum, item) => sum + Number(item.taxAmount), 0);
    return { outputBase, outputTax, inputBase, inputTax, netTax: outputTax - inputTax, from: from ?? null, to: to ?? null };
  }

  @Get("reports/customer-statement")
  @RequiresPermission("reports.view")
  async customerStatement(@Tenant() tenantId: string, @Query("customer") customer?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId); if (!customer?.trim()) throw new BadRequestException("Customer is required.");
    const invoices = await this.prisma.invoice.findMany({ where: { tenantId: tenant.id, customer: { contains: customer.trim(), mode: "insensitive" }, status: { not: "VOID" } }, include: { payments: true }, orderBy: { issuedAt: "asc" } });
    return { customer, items: invoices.map((invoice) => ({ number: invoice.number, issuedAt: invoice.issuedAt, total: Number(invoice.total), paid: invoice.payments.reduce((sum, item) => sum + Number(item.amount), 0), outstanding: Number(invoice.total) - invoice.payments.reduce((sum, item) => sum + Number(item.amount), 0) })) };
  }

  @Get("reports/supplier-statement")
  @RequiresPermission("reports.view")
  async supplierStatement(@Tenant() tenantId: string, @Query("vendor") vendor?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId); if (!vendor?.trim()) throw new BadRequestException("Supplier is required.");
    const items = await this.prisma.expense.findMany({ where: { tenantId: tenant.id, vendor: { contains: vendor.trim(), mode: "insensitive" } }, orderBy: { incurredAt: "asc" } });
    return { vendor, items: items.map((item) => ({ incurredAt: item.incurredAt, category: item.category, amount: Number(item.amount), currency: item.currency, status: item.status })) };
  }

  @Post("vendors")
  async createVendor(
    @Tenant() tenantId: string,
    @Body()
    body: {
      supplierNumber?: string;
      name?: string;
      contactPerson?: string;
      email?: string;
      phone?: string;
      address?: string;
      vatNumber?: string;
      registrationNumber?: string;
      bankInformation?: string;
      notes?: string;
      category?: string;
      paymentTerms?: string;
      active?: boolean;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.name?.trim()) throw new BadRequestException("Vendor name is required.");
    const item = await this.prisma.vendor.create({
      data: {
        tenantId: tenant.id,
        supplierNumber: body.supplierNumber || await this.nextSupplierNumber(tenant.id),
        name: body.name.trim(),
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        phone: body.phone || null,
        address: body.address || null,
        vatNumber: body.vatNumber || null,
        registrationNumber: body.registrationNumber || null,
        bankInformation: body.bankInformation || null,
        notes: body.notes || null,
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
      supplierNumber?: string | null;
      name?: string;
      contactPerson?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      vatNumber?: string | null;
      registrationNumber?: string | null;
      bankInformation?: string | null;
      notes?: string | null;
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
        supplierNumber: body.supplierNumber === "" ? null : body.supplierNumber ?? undefined,
        name: body.name ?? undefined,
        contactPerson: body.contactPerson === "" ? null : body.contactPerson ?? undefined,
        email: body.email === "" ? null : body.email ?? undefined,
        phone: body.phone === "" ? null : body.phone ?? undefined,
        address: body.address === "" ? null : body.address ?? undefined,
        vatNumber: body.vatNumber === "" ? null : body.vatNumber ?? undefined,
        registrationNumber: body.registrationNumber === "" ? null : body.registrationNumber ?? undefined,
        bankInformation: body.bankInformation === "" ? null : body.bankInformation ?? undefined,
        notes: body.notes === "" ? null : body.notes ?? undefined,
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
  @RequiresPermission("accounting.invoices.create")
  async createExpense(
    @Tenant() tenantId: string,
    @Body()
    body: {
      category?: string;
      vendor?: string;
      currency?: string;
      amount?: number;
      taxAmount?: number;
      incurredAt?: string;
      invoiceId?: string;
      departmentId?: string;
      projectId?: string;
      status?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const invoice =
      body.invoiceId
        ? await this.prisma.invoice.findFirst({ where: { tenantId: tenant.id, id: body.invoiceId } })
        : null;
    const department = body.departmentId ? await this.prisma.department.findFirst({ where: { tenantId: tenant.id, id: body.departmentId } }) : null;
    const project = body.projectId ? await this.prisma.project.findFirst({ where: { tenantId: tenant.id, id: body.projectId } }) : null;
    if (body.departmentId && !department) throw new BadRequestException("Department not found.");
    if (body.projectId && !project) throw new BadRequestException("Project not found.");
    if (body.amount === undefined || !Number.isFinite(body.amount) || body.amount <= 0) throw new BadRequestException("Expense amount must be greater than zero.");
    if (body.taxAmount !== undefined && (!Number.isFinite(body.taxAmount) || body.taxAmount < 0)) throw new BadRequestException("Expense VAT amount must be a non-negative number.");
    const incurredAt = body.incurredAt ? new Date(body.incurredAt) : new Date();
    if (Number.isNaN(incurredAt.getTime())) throw new BadRequestException("Expense date is invalid.");
    const item = await this.prisma.expense.create({
      data: {
        tenantId: tenant.id,
        invoiceId: invoice?.id,
        departmentId: department?.id,
        projectId: project?.id,
        category: body.category ?? "Operational",
        vendor: body.vendor ?? "Internal vendor",
        currency: body.currency ?? tenant.currency,
        amount: new Prisma.Decimal(body.amount),
        taxAmount: new Prisma.Decimal(body.taxAmount ?? 0),
        incurredAt,
        status: this.normalizeExpenseStatus(body.status),
      },
    });
    if (item.status === "APPROVED" || item.status === "PAID") await this.posting.postExpense(tenant.id, item);
    return { status: "created", item };
  }

  @Post("payments")
  @RequiresPermission("accounting.invoices.create")
  async createPayment(
    @Tenant() tenantId: string,
    @Body()
    body: {
      invoiceId?: string;
      provider?: string;
      method?: string;
      reference?: string;
      amount?: number;
      taxAmount?: number;
      receivedAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.invoiceId || body.amount === undefined) throw new BadRequestException("Invoice and payment amount are required.");
    const invoice = await this.prisma.invoice.findFirst({ where: { tenantId: tenant.id, id: body.invoiceId } });
    if (!invoice) throw new BadRequestException("Invoice not found.");
    const amount = new Prisma.Decimal(body.amount);
    if (amount.lte(0)) throw new BadRequestException("Payment amount must be greater than zero.");
    const currentPaid = await this.prisma.payment.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } });
    if (new Prisma.Decimal(currentPaid._sum.amount ?? 0).plus(amount).gt(new Prisma.Decimal(invoice.total))) throw new BadRequestException("Payment exceeds the invoice balance.");
    const item = await this.prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        provider: body.provider ?? "Manual",
        method: body.method?.toUpperCase() ?? "BANK_TRANSFER",
        reference: body.reference ?? null,
        amount,
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
    await this.posting.postPayment(tenant.id, item);
    await this.recalculateInvoice(invoice.id);
    return { status: "created", item };
  }

  @Post("invoices")
  @RequiresPermission("accounting.invoices.create")
  async createInvoice(
    @Tenant() tenantId: string,
    @Body()
    body: {
      customer?: string;
      contactId?: string;
      companyId?: string;
      projectId?: string;
      billingEmail?: string;
      billingPhone?: string;
      number?: string;
      purchaseOrder?: string;
      description?: string;
      notes?: string;
      subtotal?: number;
      taxAmount?: number;
      lineItems?: Array<{ description?: string; quantity?: number; unitPrice?: number; discount?: number; taxRate?: number }>;
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
    const project = body.projectId ? await this.prisma.project.findFirst({ where: { tenantId: tenant.id, id: body.projectId } }) : null;
    if (body.projectId && !project) throw new BadRequestException("Project not found.");
    const calculated = this.calculateLineItems(body.lineItems);
    if (!calculated && (body.subtotal === undefined || body.subtotal < 0 || body.taxAmount === undefined || body.taxAmount < 0)) throw new BadRequestException("Invoice subtotal and tax amount are required and cannot be negative.");
    const subtotal = calculated?.subtotal ?? new Prisma.Decimal(body.subtotal ?? 0);
    const taxAmount = calculated?.taxAmount ?? new Prisma.Decimal(body.taxAmount ?? 0);
    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        contactId: contact?.id,
        companyId: company?.id,
        projectId: project?.id,
        customer: body.customer?.trim() ?? contact?.fullName ?? company?.name ?? (() => { throw new BadRequestException("Invoice customer is required."); })(),
        billingEmail: body.billingEmail ?? contact?.email ?? null,
        billingPhone: body.billingPhone ?? contact?.phone ?? null,
        number: body.number ?? await this.nextInvoiceNumber(tenant.id, tenant.invoicePrefix),
        purchaseOrder: body.purchaseOrder ?? null,
        description: body.description ?? null,
        notes: body.notes ?? null,
        status: this.normalizeStatus(body.status),
        currency: body.currency ?? tenant.currency,
        subtotal,
        taxAmount,
        total: subtotal.plus(taxAmount),
        issuedAt: body.issuedAt ? new Date(body.issuedAt) : new Date(),
        dueAt: body.dueAt ? new Date(body.dueAt) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        ...(calculated ? { items: { create: calculated.items.map(({ tax, ...item }) => item) } } : {}),
      },
      include: { contact: true, company: true, payments: true, items: true },
    });
    await this.posting.postInvoice(tenant.id, invoice);
    return { status: "created", item: invoice };
  }

  @Patch("invoices/:invoiceId")
  @RequiresPermission("accounting.invoices.create")
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
    if (existing.status !== "DRAFT" && (body.subtotal !== undefined || body.taxAmount !== undefined || body.currency !== undefined)) {
      throw new BadRequestException("Posted invoices cannot have their financial values edited; use a credit note or reversal instead.");
    }
    if (existing.status !== "DRAFT" && body.status && this.normalizeStatus(body.status) === "DRAFT") {
      throw new BadRequestException("Posted invoices cannot be moved back to draft.");
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
    if (item.status === "VOID" && existing.status !== "VOID") {
      await this.posting.reverseInvoice(tenant.id, item);
    } else if (existing.status === "DRAFT") {
      await this.posting.postInvoice(tenant.id, item);
    }
    return { status: "updated", item };
  }

  @Get("reports/:report/pdf")
  @RequiresPermission("reports.view")
  async reportPdf(
    @Tenant() tenantId: string,
    @Param("report") report: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("customer") customer: string | undefined,
    @Query("vendor") vendor: string | undefined,
    @Res() response: { setHeader: (name: string, value: string) => void; end: (body: Buffer) => void },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const range = { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
    let rows: Array<{ label: string; value: string }>;
    if (report === "profit-loss") {
      const [invoices, expenses] = await Promise.all([
        this.prisma.invoice.findMany({ where: { tenantId: tenant.id, status: { not: "VOID" }, issuedAt: range }, select: { total: true } }),
        this.prisma.expense.findMany({ where: { tenantId: tenant.id, status: { in: ["APPROVED", "PAID"] }, incurredAt: range }, select: { amount: true, taxAmount: true } }),
      ]);
      const revenue = invoices.reduce((sum, item) => sum + Number(item.total), 0); const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
      rows = [{ label: "Revenue", value: revenue.toFixed(2) }, { label: "Expenses", value: expenseTotal.toFixed(2) }, { label: "Net income", value: (revenue - expenseTotal).toFixed(2) }];
    } else if (report === "cash-flow") {
      const [payments, expenses] = await Promise.all([
        this.prisma.payment.findMany({ where: { invoice: { tenantId: tenant.id }, receivedAt: range }, select: { amount: true } }),
        this.prisma.expense.findMany({ where: { tenantId: tenant.id, status: { in: ["APPROVED", "PAID"] }, incurredAt: range }, select: { amount: true } }),
      ]);
      const inflow = payments.reduce((sum, item) => sum + Number(item.amount), 0); const outflow = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
      rows = [{ label: "Cash inflow", value: inflow.toFixed(2) }, { label: "Cash outflow", value: outflow.toFixed(2) }, { label: "Net cash flow", value: (inflow - outflow).toFixed(2) }];
    } else if (report === "vat") {
      const [invoices, expenses] = await Promise.all([
        this.prisma.invoice.findMany({ where: { tenantId: tenant.id, status: { not: "VOID" }, issuedAt: range }, select: { subtotal: true, taxAmount: true } }),
        this.prisma.expense.findMany({ where: { tenantId: tenant.id, status: { in: ["APPROVED", "PAID"] }, incurredAt: range }, select: { amount: true } }),
      ]);
      const outputBase = invoices.reduce((sum, item) => sum + Number(item.subtotal), 0); const outputTax = invoices.reduce((sum, item) => sum + Number(item.taxAmount), 0); const inputBase = expenses.reduce((sum, item) => sum + Number(item.amount), 0); const inputTax = expenses.reduce((sum, item) => sum + Number(item.taxAmount), 0);
      rows = [{ label: "Output base", value: outputBase.toFixed(2) }, { label: "Output VAT", value: outputTax.toFixed(2) }, { label: "Input base", value: inputBase.toFixed(2) }, { label: "Input VAT", value: inputTax.toFixed(2) }, { label: "Net VAT", value: (outputTax - inputTax).toFixed(2) }];
    } else if (report === "balance-sheet") {
      const lines = await this.prisma.journalEntryLine.findMany({ where: { journalEntry: { tenantId: tenant.id, status: "POSTED", entryDate: { lte: to ? new Date(to) : undefined } } }, include: { account: true } });
      const totals = { Asset: 0, Liability: 0, Equity: 0, Income: 0, Expense: 0 };
      for (const line of lines) { const category = line.account.category as keyof typeof totals; if (category in totals) totals[category] += Number(line.debit) - Number(line.credit); }
      rows = [{ label: "Assets", value: totals.Asset.toFixed(2) }, { label: "Liabilities", value: (-totals.Liability).toFixed(2) }, { label: "Equity", value: (-totals.Equity + totals.Income + totals.Expense).toFixed(2) }];
    } else if (report === "trial-balance") {
      const lines = await this.prisma.journalEntryLine.findMany({ where: { journalEntry: { tenantId: tenant.id, status: "POSTED", entryDate: range } }, include: { account: true } });
      const totals = new Map<string, { debit: number; credit: number }>();
      for (const line of lines) { const row = totals.get(line.accountId) ?? { debit: 0, credit: 0 }; row.debit += Number(line.debit); row.credit += Number(line.credit); totals.set(line.accountId, row); }
      rows = lines.filter((line, index) => lines.findIndex((candidate) => candidate.accountId === line.accountId) === index).map((line) => { const total = totals.get(line.accountId)!; return { label: `${line.account.code} ${line.account.name}`, value: `Debit ${total.debit.toFixed(2)} / Credit ${total.credit.toFixed(2)}` }; });
    } else if (report === "general-ledger") {
      const lines = await this.prisma.journalEntryLine.findMany({ where: { journalEntry: { tenantId: tenant.id, status: "POSTED", entryDate: range } }, include: { account: true, journalEntry: true }, orderBy: { journalEntry: { entryDate: "asc" } }, take: 500 });
      rows = lines.map((line) => ({ label: `${line.journalEntry.entryDate.toISOString().slice(0, 10)} ${line.account.code}`, value: `Debit ${Number(line.debit).toFixed(2)} / Credit ${Number(line.credit).toFixed(2)}` }));
    } else if (report === "accounts-receivable") {
      const invoices = await this.prisma.invoice.findMany({ where: { tenantId: tenant.id, status: { notIn: ["PAID", "VOID", "DRAFT"] }, issuedAt: range }, include: { payments: true }, orderBy: { dueAt: "asc" } });
      rows = invoices.map((invoice) => ({ label: `${invoice.number} ${invoice.customer}`, value: `Outstanding ${(Number(invoice.total) - invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)).toFixed(2)}` }));
    } else if (report === "accounts-payable") {
      const expenses = await this.prisma.expense.findMany({ where: { tenantId: tenant.id, incurredAt: range }, orderBy: { incurredAt: "asc" } });
      rows = expenses.map((expense) => ({ label: `${expense.vendor ?? "Unassigned vendor"} ${expense.category}`, value: `${expense.currency} ${Number(expense.amount).toFixed(2)} (${expense.status})` }));
    } else if (report === "customer-statement") {
      if (!customer?.trim()) throw new BadRequestException("Customer is required for this report.");
      const invoices = await this.prisma.invoice.findMany({ where: { tenantId: tenant.id, customer: { contains: customer.trim(), mode: "insensitive" }, status: { not: "VOID" }, issuedAt: range }, include: { payments: true }, orderBy: { issuedAt: "asc" } });
      rows = invoices.map((invoice) => ({ label: `${invoice.issuedAt.toISOString().slice(0, 10)} ${invoice.number}`, value: `Total ${Number(invoice.total).toFixed(2)} / Outstanding ${(Number(invoice.total) - invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)).toFixed(2)}` }));
    } else if (report === "supplier-statement") {
      if (!vendor?.trim()) throw new BadRequestException("Supplier is required for this report.");
      const expenses = await this.prisma.expense.findMany({ where: { tenantId: tenant.id, vendor: { contains: vendor.trim(), mode: "insensitive" }, incurredAt: range }, orderBy: { incurredAt: "asc" } });
      rows = expenses.map((expense) => ({ label: `${expense.incurredAt.toISOString().slice(0, 10)} ${expense.category}`, value: `${expense.currency} ${Number(expense.amount).toFixed(2)} (${expense.status})` }));
    } else {
      throw new BadRequestException("Unsupported financial report PDF export.");
    }
    const chunks: Buffer[] = []; const document = new PDFDocument({ size: "A4", margin: 50 }); document.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      document.on("end", resolve); document.on("error", reject); document.fontSize(22).text(tenant.name); document.moveDown().fontSize(18).text(`${report} report`); document.fontSize(10).text(`Period: ${from ?? "All time"} to ${to ?? "Present"}`); document.moveDown();
      for (const row of rows) document.fontSize(12).text(`${row.label}: ${row.value}`);
      document.end();
    });
    response.setHeader("Content-Type", "application/pdf"); response.setHeader("Content-Disposition", `attachment; filename=${report}.pdf`); response.end(Buffer.concat(chunks));
  }

  @Get("invoices/:invoiceId/pdf")
  @RequiresPermission("accounting.invoices.view")
  async invoicePdf(
    @Tenant() tenantId: string,
    @Param("invoiceId") invoiceId: string,
    @Res() response: { setHeader: (name: string, value: string) => void; end: (body: Buffer) => void },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: tenant.id },
      include: { items: true },
    });
    if (!invoice) throw new BadRequestException("Invoice not found.");
    const chunks: Buffer[] = [];
    const document = new PDFDocument({ size: "A4", margin: 50 });
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      document.on("end", resolve);
      document.on("error", reject);
      document.fontSize(22).text(tenant.name, { align: "right" });
      document.moveDown().fontSize(18).text(`Invoice ${invoice.number}`);
      document.fontSize(10).text(`Issued: ${invoice.issuedAt.toISOString().slice(0, 10)}    Due: ${invoice.dueAt.toISOString().slice(0, 10)}`);
      document.moveDown().fontSize(12).text(`Bill to: ${invoice.customer}`);
      if (invoice.billingEmail) document.fontSize(10).text(invoice.billingEmail);
      document.moveDown().fontSize(11).text("Description                                      Quantity       Unit price       Total");
      document.moveTo(50, document.y + 4).lineTo(545, document.y + 4).stroke();
      document.moveDown();
      for (const item of invoice.items) {
        document.fontSize(10).text(`${item.description.slice(0, 48).padEnd(48)} ${String(Number(item.quantity)).padStart(8)} ${Number(item.unitPrice).toFixed(2).padStart(15)} ${Number(item.lineTotal).toFixed(2).padStart(14)}`);
      }
      document.moveDown().fontSize(11).text(`Subtotal: ${invoice.currency} ${Number(invoice.subtotal).toFixed(2)}`, { align: "right" });
      document.text(`Tax/VAT: ${invoice.currency} ${Number(invoice.taxAmount).toFixed(2)}`, { align: "right" });
      document.fontSize(14).text(`Total: ${invoice.currency} ${Number(invoice.total).toFixed(2)}`, { align: "right" });
      if (invoice.notes) document.moveDown().fontSize(10).text(`Notes: ${invoice.notes}`);
      document.end();
    });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename=${invoice.number}.pdf`);
    response.end(Buffer.concat(chunks));
  }

  @Delete("invoices/:invoiceId")
  @RequiresPermission("accounting.invoices.create")
  async deleteInvoice(@Tenant() tenantId: string, @Param("invoiceId") invoiceId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.invoice.findFirst({
      where: { tenantId: tenant.id, id: invoiceId },
    });
    if (!existing) {
      return { status: "missing", invoiceId };
    }
    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Posted invoices cannot be deleted; change the status to VOID to preserve the accounting audit trail.");
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
  @RequiresPermission("accounting.invoices.create")
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
      departmentId?: string | null;
      projectId?: string | null;
      status?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.expense.findFirst({
      where: { tenantId: tenant.id, id: expenseId },
    });
    if (!existing) {
      return { status: "missing", expenseId };
    }
    if ((existing.status === "APPROVED" || existing.status === "PAID") && body.status && !["APPROVED", "PAID"].includes(this.normalizeExpenseStatus(body.status))) {
      throw new BadRequestException("Posted expenses cannot be moved back to an unposted status.");
    }
    if ((existing.status === "APPROVED" || existing.status === "PAID") && body.amount !== undefined && !new Prisma.Decimal(body.amount).eq(existing.amount)) {
      throw new BadRequestException("Posted expenses cannot be edited; create an adjustment or reversal instead.");
    }
    if (body.taxAmount !== undefined && (!Number.isFinite(body.taxAmount) || body.taxAmount < 0)) throw new BadRequestException("Expense VAT amount must be a non-negative number.");
    let invoice: { id: string } | null | undefined;
    if (body.invoiceId === undefined) {
      invoice = undefined;
    } else if (body.invoiceId === "") {
      invoice = null;
    } else {
      const invoiceId = body.invoiceId as string;
      invoice = await this.prisma.invoice.findFirst({ where: { tenantId: tenant.id, id: invoiceId } });
    }
    const department = body.departmentId ? await this.prisma.department.findFirst({ where: { tenantId: tenant.id, id: body.departmentId } }) : null;
    const project = body.projectId ? await this.prisma.project.findFirst({ where: { tenantId: tenant.id, id: body.projectId } }) : null;
    if (body.departmentId && !department) throw new BadRequestException("Department not found.");
    if (body.projectId && !project) throw new BadRequestException("Project not found.");
    const item = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        category: body.category ?? undefined,
        vendor: body.vendor === "" ? null : body.vendor ?? undefined,
        currency: body.currency ?? undefined,
        amount: body.amount === undefined ? undefined : new Prisma.Decimal(body.amount),
        taxAmount: body.taxAmount === undefined ? undefined : new Prisma.Decimal(body.taxAmount),
        incurredAt: body.incurredAt ? new Date(body.incurredAt) : undefined,
        invoiceId: body.invoiceId === undefined ? undefined : invoice?.id ?? null,
        departmentId: body.departmentId === undefined ? undefined : department?.id ?? null,
        projectId: body.projectId === undefined ? undefined : project?.id ?? null,
        status: body.status === undefined ? undefined : this.normalizeExpenseStatus(body.status),
      },
    });
    if ((item.status === "APPROVED" || item.status === "PAID") && existing.status !== "APPROVED" && existing.status !== "PAID") await this.posting.postExpense(tenant.id, item);
    return { status: "updated", item };
  }

  @Delete("expenses/:expenseId")
  @RequiresPermission("accounting.invoices.create")
  async deleteExpense(@Tenant() tenantId: string, @Param("expenseId") expenseId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.expense.findFirst({
      where: { tenantId: tenant.id, id: expenseId },
    });
    if (!existing) {
      return { status: "missing", expenseId };
    }
    if (existing.status === "APPROVED" || existing.status === "PAID") {
      throw new BadRequestException("Posted expenses cannot be deleted; create an adjustment or reversal instead.");
    }
    await this.prisma.expense.delete({
      where: { id: expenseId },
    });
    return { status: "deleted", expenseId };
  }

  @Patch("payments/:paymentId")
  @RequiresPermission("accounting.invoices.create")
  async updatePayment(
    @Tenant() tenantId: string,
    @Param("paymentId") paymentId: string,
    @Body()
    body: {
      invoiceId?: string;
      provider?: string;
      amount?: number;
      method?: string;
      reference?: string | null;
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
    if (body.amount !== undefined || body.invoiceId !== undefined) {
      throw new BadRequestException("Posted payments cannot be edited; create a reversal and replacement payment instead.");
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
        method: body.method?.toUpperCase() ?? undefined,
        reference: body.reference === "" ? null : body.reference ?? undefined,
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
    await this.recalculateInvoice(existing.invoiceId);
    return { status: "updated", item };
  }

  @Delete("payments/:paymentId")
  @RequiresPermission("accounting.invoices.create")
  async deletePayment(@Tenant() tenantId: string, @Param("paymentId") paymentId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.payment.findFirst({
      where: { id: paymentId, invoice: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", paymentId };
    }
    throw new BadRequestException("Posted payments cannot be deleted; create a reversal transaction instead.");
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
      throw new BadRequestException("At least two journal lines are required.");
    }

    const accountIds = lines.map((line) => line.accountId);
    const accounts = await this.prisma.chartAccount.findMany({
      where: { tenantId, id: { in: accountIds } },
      select: { id: true },
    });
    const allowedIds = new Set(accounts.map((account) => account.id));

    const prepared = lines
      .filter((line) => allowedIds.has(line.accountId))
      .map((line) => ({
        accountId: line.accountId,
        description: line.description || null,
        debit: new Prisma.Decimal(line.debit ?? 0),
        credit: new Prisma.Decimal(line.credit ?? 0),
      }));
    if (prepared.length < 2) throw new BadRequestException("Journal lines must reference valid accounts.");
    const debitTotal = prepared.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
    const creditTotal = prepared.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
    if (!debitTotal.eq(creditTotal) || debitTotal.lte(0)) throw new BadRequestException("Journal entry must be balanced and greater than zero.");
    if (prepared.some((line) => line.debit.gt(0) && line.credit.gt(0) || line.debit.lt(0) || line.credit.lt(0))) throw new BadRequestException("Each journal line must contain either a non-negative debit or credit.");
    return prepared;
  }
}
