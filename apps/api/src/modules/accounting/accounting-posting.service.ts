import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AccountingPostingService {
  constructor(private readonly prisma: PrismaService) {}

  private async account(tenantId: string, code: string, name: string, category: string, balanceSide: string) {
    return this.prisma.chartAccount.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { active: true },
      create: { tenantId, code, name, category, balanceSide },
    });
  }

  private async post(tenantId: string, reference: string, memo: string, lines: Array<{ accountId: string; description: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>) {
    const existing = await this.prisma.journalEntry.findFirst({ where: { tenantId, reference }, select: { id: true } });
    if (existing) return existing;
    const debit = lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
    const credit = lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));
    if (!debit.eq(credit) || debit.lte(0)) throw new BadRequestException("Automatic journal entry is not balanced.");
    return this.prisma.journalEntry.create({ data: { tenantId, entryDate: new Date(), reference, memo, status: "POSTED", lines: { create: lines } }, select: { id: true } });
  }

  async postInvoice(tenantId: string, invoice: { id: string; status: string; total: Prisma.Decimal; subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal }) {
    if (invoice.status === "DRAFT" || invoice.status === "VOID") return null;
    const [receivables, revenue, vat] = await Promise.all([
      this.account(tenantId, "1100", "Trade Receivables", "Asset", "DEBIT"),
      this.account(tenantId, "4000", "Sales Revenue", "Income", "CREDIT"),
      this.account(tenantId, "2000", "Output VAT", "Liability", "CREDIT"),
    ]);
    return this.post(tenantId, `INV:${invoice.id}`, `Invoice ${invoice.id}`, [
      { accountId: receivables.id, description: "Invoice receivable", debit: new Prisma.Decimal(invoice.total), credit: new Prisma.Decimal(0) },
      { accountId: revenue.id, description: "Sales revenue", debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(invoice.subtotal) },
      { accountId: vat.id, description: "Output VAT", debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(invoice.taxAmount) },
    ].filter((line) => line.debit.gt(0) || line.credit.gt(0)));
  }

  async reverseInvoice(tenantId: string, invoice: { id: string; total: Prisma.Decimal; subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal }) {
    const [receivables, revenue, vat] = await Promise.all([
      this.account(tenantId, "1100", "Trade Receivables", "Asset", "DEBIT"),
      this.account(tenantId, "4000", "Sales Revenue", "Income", "CREDIT"),
      this.account(tenantId, "2000", "Output VAT", "Liability", "CREDIT"),
    ]);
    return this.post(tenantId, `REV:INV:${invoice.id}`, `Void invoice ${invoice.id}`, [
      { accountId: revenue.id, description: "Reverse sales revenue", debit: new Prisma.Decimal(invoice.subtotal), credit: new Prisma.Decimal(0) },
      { accountId: vat.id, description: "Reverse output VAT", debit: new Prisma.Decimal(invoice.taxAmount), credit: new Prisma.Decimal(0) },
      { accountId: receivables.id, description: "Reverse invoice receivable", debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(invoice.total) },
    ].filter((line) => line.debit.gt(0) || line.credit.gt(0)));
  }

  async postPayment(tenantId: string, payment: { id: string; amount: Prisma.Decimal; invoiceId: string }) {
    const [bank, receivables] = await Promise.all([
      this.account(tenantId, "1000", "Operating Bank", "Asset", "DEBIT"),
      this.account(tenantId, "1100", "Trade Receivables", "Asset", "DEBIT"),
    ]);
    const amount = new Prisma.Decimal(payment.amount);
    return this.post(tenantId, `PAY:${payment.id}`, `Payment for invoice ${payment.invoiceId}`, [
      { accountId: bank.id, description: "Cash received", debit: amount, credit: new Prisma.Decimal(0) },
      { accountId: receivables.id, description: "Receivable settled", debit: new Prisma.Decimal(0), credit: amount },
    ]);
  }

  async postExpense(tenantId: string, expense: { id: string; amount: Prisma.Decimal; vendor?: string | null }) {
    const [operatingExpense, bank] = await Promise.all([
      this.account(tenantId, "5000", "Operating Expenses", "Expense", "DEBIT"),
      this.account(tenantId, "1000", "Operating Bank", "Asset", "DEBIT"),
    ]);
    const amount = new Prisma.Decimal(expense.amount);
    return this.post(tenantId, `EXP:${expense.id}`, `Expense${expense.vendor ? ` - ${expense.vendor}` : ""}`, [
      { accountId: operatingExpense.id, description: "Operating expense", debit: amount, credit: new Prisma.Decimal(0) },
      { accountId: bank.id, description: "Expense paid", debit: new Prisma.Decimal(0), credit: amount },
    ]);
  }
}
