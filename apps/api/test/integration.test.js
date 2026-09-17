const test = require("node:test");
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");

const baseUrl = process.env.TEST_API_URL || "http://localhost:4000/api/v1";
const integrationEnabled = process.env.RUN_INTEGRATION === "1";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}

if (!integrationEnabled) {
  test("HTTP integration suite is opt-in", { skip: "Set RUN_INTEGRATION=1 with the API running to execute integration tests." }, () => {});
} else {
  test("authentication, tenant isolation, and core business workflows", async () => {
    const prisma = new PrismaClient();
    const created = { contactId: null, invoiceId: null, paymentId: null, leaveId: null, attendanceId: null, assignmentId: null, journalIds: [] };
    try {
      const login = await request("/auth/login", { method: "POST", body: JSON.stringify({ email: process.env.TEST_EMAIL || "admin@example.com", password: process.env.TEST_PASSWORD || "PopIn@2026!Demo", tenantId: process.env.TEST_TENANT || "demo-tenant" }) });
      assert.equal(login.response.status, 201);
      const token = login.body.accessToken;
      const tenant = login.body.user.tenantId;
      const headers = { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenant };

      const mismatch = await request("/crm/contacts", { headers: { ...headers, "X-Tenant-Id": "starter-demo" } });
      assert.equal(mismatch.response.status, 401);

      const contact = await request("/crm/contacts", { method: "POST", headers, body: JSON.stringify({ fullName: `Integration Contact ${Date.now()}`, email: `integration-${Date.now()}@example.test` }) });
      assert.equal(contact.response.status, 201);
      created.contactId = contact.body.item.id;

      const invoice = await request("/accounting/invoices", { method: "POST", headers, body: JSON.stringify({ customer: contact.body.item.fullName, contactId: created.contactId, lineItems: [{ description: "Integration service", quantity: 1, unitPrice: 100, taxRate: 15 }] }) });
      assert.equal(invoice.response.status, 201);
      created.invoiceId = invoice.body.item.id;
      assert.equal(Number(invoice.body.item.total), 115);

      const payment = await request("/accounting/payments", { method: "POST", headers, body: JSON.stringify({ invoiceId: created.invoiceId, amount: 115, reference: "integration-test" }) });
      assert.equal(payment.response.status, 201);
      created.paymentId = payment.body.item.id;

      const employee = await prisma.employee.findFirst({ where: { tenant: { slug: tenant }, user: { email: "employee@example.com" }, employmentStatus: "ACTIVE" } });
      const asset = await prisma.asset.findFirst({ where: { tenant: { slug: tenant } } });
      assert.ok(employee && asset, "seeded employee and asset are required for integration tests");
      const employeeHeaders = { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenant };
      const leave = await request("/hr/leave-requests", { method: "POST", headers: employeeHeaders, body: JSON.stringify({ employeeId: employee.id, startDate: "2030-01-02", endDate: "2030-01-03", type: "PTO", reason: "Integration test" }) });
      assert.equal(leave.response.status, 201);
      created.leaveId = leave.body.item.id;
      assert.equal((await request(`/hr/leave-requests/${created.leaveId}/approve`, { method: "POST", headers, body: JSON.stringify({ stage: "MANAGER" }) })).response.status, 201);
      assert.equal((await request(`/hr/leave-requests/${created.leaveId}/approve`, { method: "POST", headers, body: JSON.stringify({ stage: "HR" }) })).response.status, 201);

      const assignment = await request(`/assets/${asset.id}/assign`, { method: "POST", headers, body: JSON.stringify({ employeeId: employee.id, notes: "Integration test" }) });
      assert.equal(assignment.response.status, 201);
      created.assignmentId = assignment.body.item.id;
      assert.equal((await request(`/assets/${asset.id}/return`, { method: "POST", headers, body: JSON.stringify({ condition: "GOOD" }) })).response.status, 201);

      const employeeUser = await prisma.user.findFirst({ where: { tenant: { slug: tenant }, email: "employee@example.com" } });
      assert.ok(employeeUser, "seeded employee user is required for clock tests");
      const employeeToken = (await request("/auth/login", { method: "POST", body: JSON.stringify({ email: "employee@example.com", password: process.env.TEST_PASSWORD || "PopIn@2026!Demo", tenantId: tenant }) })).body.accessToken;
      const clockHeaders = { Authorization: `Bearer ${employeeToken}`, "X-Tenant-Id": tenant };
      const clockIn = await request("/attendance/clock-in", { method: "POST", headers: clockHeaders, body: JSON.stringify({ method: "WEB" }) });
      assert.equal(clockIn.response.status, 201);
      created.attendanceId = clockIn.body.item.id;
      assert.equal((await request("/attendance/clock-out", { method: "POST", headers: clockHeaders })).response.status, 201);
    } finally {
      if (created.paymentId) await prisma.payment.delete({ where: { id: created.paymentId } }).catch(() => {});
      if (created.invoiceId) {
        const journals = await prisma.journalEntry.findMany({ where: { reference: { in: [`INV:${created.invoiceId}`, ...(created.paymentId ? [`PAY:${created.paymentId}`] : [])] } }, select: { id: true } });
        for (const journal of journals) { await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: journal.id } }); await prisma.journalEntry.delete({ where: { id: journal.id } }).catch(() => {}); }
        await prisma.invoice.delete({ where: { id: created.invoiceId } }).catch(() => {});
      }
      if (created.contactId) await prisma.contact.delete({ where: { id: created.contactId } }).catch(() => {});
      if (created.leaveId) await prisma.leaveRequest.delete({ where: { id: created.leaveId } }).catch(() => {});
      if (created.attendanceId) await prisma.attendanceRecord.delete({ where: { id: created.attendanceId } }).catch(() => {});
      if (created.assignmentId) await prisma.assetAssignment.delete({ where: { id: created.assignmentId } }).catch(() => {});
      await prisma.$disconnect();
    }
  });
}
