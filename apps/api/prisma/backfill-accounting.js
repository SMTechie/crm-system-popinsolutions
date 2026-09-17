const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function account(tenantId, code, name, category, balanceSide) {
  return prisma.chartAccount.upsert({
    where: { tenantId_code: { tenantId, code } },
    update: { active: true },
    create: { tenantId, code, name, category, balanceSide },
  });
}

async function post(tenantId, reference, memo, lines) {
  if (await prisma.journalEntry.findFirst({ where: { tenantId, reference }, select: { id: true } })) return false;
  const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
  if (Math.abs(debit - credit) > 0.005 || debit <= 0) throw new Error(`Unbalanced journal ${reference}`);
  await prisma.journalEntry.create({ data: { tenantId, entryDate: new Date(), reference, memo, status: "POSTED", lines: { create: lines } } });
  return true;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let created = 0;
  for (const tenant of tenants) {
    const [bank, receivables, vat, revenue, expenses] = await Promise.all([
      account(tenant.id, "1000", "Operating Bank", "Asset", "DEBIT"),
      account(tenant.id, "1100", "Trade Receivables", "Asset", "DEBIT"),
      account(tenant.id, "2000", "Output VAT", "Liability", "CREDIT"),
      account(tenant.id, "4000", "Sales Revenue", "Income", "CREDIT"),
      account(tenant.id, "5000", "Operating Expenses", "Expense", "DEBIT"),
    ]);
    const invoices = await prisma.invoice.findMany({ where: { tenantId: tenant.id, status: { notIn: ["DRAFT", "VOID"] } } });
    for (const invoice of invoices) {
      const lines = [
        { accountId: receivables.id, description: "Invoice receivable", debit: invoice.total, credit: 0 },
        { accountId: revenue.id, description: "Sales revenue", debit: 0, credit: invoice.subtotal },
        { accountId: vat.id, description: "Output VAT", debit: 0, credit: invoice.taxAmount },
      ].filter((line) => Number(line.debit) > 0 || Number(line.credit) > 0);
      if (await post(tenant.id, `INV:${invoice.id}`, `Invoice ${invoice.number}`, lines)) created += 1;
    }
    const payments = await prisma.payment.findMany({ where: { invoice: { tenantId: tenant.id } } });
    for (const payment of payments) if (await post(tenant.id, `PAY:${payment.id}`, `Payment for invoice ${payment.invoiceId}`, [
      { accountId: bank.id, description: "Cash received", debit: payment.amount, credit: 0 },
      { accountId: receivables.id, description: "Receivable settled", debit: 0, credit: payment.amount },
    ])) created += 1;
    const expenseItems = await prisma.expense.findMany({ where: { tenantId: tenant.id } });
    for (const expense of expenseItems) if (await post(tenant.id, `EXP:${expense.id}`, `Expense${expense.vendor ? ` - ${expense.vendor}` : ""}`, [
      { accountId: expenses.id, description: "Operating expense", debit: expense.amount, credit: 0 },
      { accountId: bank.id, description: "Expense paid", debit: 0, credit: expense.amount },
    ])) created += 1;
  }
  console.log(JSON.stringify({ created }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
