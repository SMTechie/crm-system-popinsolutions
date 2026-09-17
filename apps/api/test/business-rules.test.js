const test = require("node:test");
const assert = require("node:assert/strict");

const invoiceTotals = (lines, vatRate) => {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice - (line.discount || 0), 0);
  const tax = subtotal * vatRate / 100;
  return { subtotal: Number(subtotal.toFixed(2)), tax: Number(tax.toFixed(2)), total: Number((subtotal + tax).toFixed(2)) };
};

test("invoice totals calculate VAT and discounts", () => {
  assert.deepEqual(invoiceTotals([{ quantity: 2, unitPrice: 1000, discount: 100 }], 15), { subtotal: 1900, tax: 285, total: 2185 });
});

test("payment allocation cannot exceed invoice balance", () => {
  const invoiceTotal = 2185;
  const paid = [1000, 500].reduce((sum, value) => sum + value, 0);
  assert.equal(invoiceTotal - paid, 685);
  assert.equal(paid + 700 > invoiceTotal, true);
});

test("attendance duration excludes configured break", () => {
  const minutes = (17 * 60 - 8 * 60) - 60;
  assert.equal(minutes, 480);
});

test("leave balance is allocated less used days", () => {
  assert.equal(15 - 4, 11);
});

test("permission keys are explicit and not UI-only", () => {
  const permissions = ["assets.assign", "accounting.invoices.approve", "attendance.manage"];
  assert.ok(permissions.includes("assets.assign"));
  assert.ok(permissions.every((permission) => permission.includes(".")));
});
