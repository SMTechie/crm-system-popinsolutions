const { PrismaClient, DealStage, InvoiceStatus, LeaveStatus, UserRole } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

const prisma = new PrismaClient();

async function main() {
  const hashPassword = (password, salt = randomBytes(16).toString("hex")) => {
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  };
  const demoToday = new Date();
  demoToday.setHours(0, 0, 0, 0);
  const demoCheckIn = new Date(demoToday);
  demoCheckIn.setHours(7, 58, 0, 0);
  const demoCheckOut = new Date(demoToday);
  demoCheckOut.setHours(17, 4, 0, 0);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-tenant" },
    update: {},
    create: {
      name: "Pop In Solutions",
      slug: "demo-tenant",
      enabledModules: ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"],
      planCode: "enterprise",
      subscriptionStatus: "active",
      onboardingCompleted: true,
      billingEmail: "billing@popinsolutions.co.za",
      emailFromName: "Pop In Solutions",
      emailFromAddress: "support@popinsolutions.co.za",
      replyToEmail: "support@popinsolutions.co.za",
      trialEndsAt: null,
      subscriptionRenewsAt: new Date("2027-09-03T00:00:00.000Z"),
      maxUsers: 250,
      maxStorageGb: 250,
      supportEmail: "support@popinsolutions.co.za",
      supportPhone: "+27 11 555 0100",
      website: "https://popinsolutions.co.za",
      addressLine1: "14 Rivonia Road",
      city: "Johannesburg",
      country: "South Africa",
      timezone: "Africa/Johannesburg",
      currency: "ZAR",
      defaultLanguage: "en",
      invoicePrefix: "POP",
      themeMode: "light",
      requireMfa: false,
      allowLocalAuth: true,
      sessionTimeoutMinutes: 480,
    },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      enabledModules: ["crm", "accounting", "hr", "attendance", "assets", "users", "settings"],
      planCode: "enterprise",
      subscriptionStatus: "active",
      onboardingCompleted: true,
      billingEmail: "billing@popinsolutions.co.za",
      emailFromName: "Pop In Solutions",
      emailFromAddress: "support@popinsolutions.co.za",
      replyToEmail: "support@popinsolutions.co.za",
      trialEndsAt: null,
      subscriptionRenewsAt: new Date("2027-09-03T00:00:00.000Z"),
      maxUsers: 250,
      maxStorageGb: 250,
      supportEmail: "support@popinsolutions.co.za",
      supportPhone: "+27 11 555 0100",
      website: "https://popinsolutions.co.za",
      addressLine1: "14 Rivonia Road",
      city: "Johannesburg",
      country: "South Africa",
      timezone: "Africa/Johannesburg",
      currency: "ZAR",
      defaultLanguage: "en",
      invoicePrefix: "POP",
      themeMode: "light",
      requireMfa: false,
      allowLocalAuth: true,
      sessionTimeoutMinutes: 480,
    },
  });

  const johannesburgOffice = await prisma.officeLocation.upsert({
    where: { id: `${tenant.id}-johannesburg-hq` },
    update: { name: "Johannesburg HQ", address: "14 Rivonia Road, Sandton, Johannesburg", latitude: -26.1076, longitude: 28.0567, radiusMeters: 250, active: true },
    create: { id: `${tenant.id}-johannesburg-hq`, tenantId: tenant.id, name: "Johannesburg HQ", address: "14 Rivonia Road, Sandton, Johannesburg", latitude: -26.1076, longitude: 28.0567, radiusMeters: 250, active: true },
  });
  const pretoriaOffice = await prisma.officeLocation.upsert({
    where: { id: `${tenant.id}-pretoria-office` },
    update: { name: "Pretoria Office", address: "425 Government Avenue, Pretoria", latitude: -25.7479, longitude: 28.2293, radiusMeters: 250, active: true },
    create: { id: `${tenant.id}-pretoria-office`, tenantId: tenant.id, name: "Pretoria Office", address: "425 Government Avenue, Pretoria", latitude: -25.7479, longitude: 28.2293, radiusMeters: 250, active: true },
  });

  await prisma.fileAttachment.upsert({
    where: { id: `${tenant.id}-seed-contract-file` },
    update: { fileName: "lerato-employment-contract.pdf", mimeType: "application/pdf", sizeBytes: 1843200, fileKey: "seed/hr/lerato-employment-contract.pdf", entityType: "Employee", entityId: `${tenant.id}-lerato-dlamini` },
    create: { id: `${tenant.id}-seed-contract-file`, tenantId: tenant.id, entityType: "Employee", entityId: `${tenant.id}-lerato-dlamini`, fileKey: "seed/hr/lerato-employment-contract.pdf", fileName: "lerato-employment-contract.pdf", mimeType: "application/pdf", sizeBytes: 1843200 },
  });
  await prisma.fileAttachment.upsert({
    where: { id: `${tenant.id}-seed-invoice-file` },
    update: { fileName: "invoice-inv-2026-0001.pdf", mimeType: "application/pdf", sizeBytes: 921600, fileKey: "seed/accounting/invoice-inv-2026-0001.pdf", entityType: "Invoice", entityId: "INV-2026-0001" },
    create: { id: `${tenant.id}-seed-invoice-file`, tenantId: tenant.id, entityType: "Invoice", entityId: "INV-2026-0001", fileKey: "seed/accounting/invoice-inv-2026-0001.pdf", fileName: "invoice-inv-2026-0001.pdf", mimeType: "application/pdf", sizeBytes: 921600 },
  });

  const user = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: "devops@popinsolutions.co.za",
      },
    },
    update: {
      fullName: "Jones Mayekiso",
      role: UserRole.OWNER,
      passwordHash: hashPassword("PopIn@2026!SuperAdmin"),
    },
    create: {
      tenantId: tenant.id,
      email: "devops@popinsolutions.co.za",
      fullName: "Jones Mayekiso",
      role: UserRole.OWNER,
      passwordHash: hashPassword("PopIn@2026!SuperAdmin"),
    },
  });

  const permissionKeys = [
    "crm.customers.view", "crm.customers.create", "crm.customers.edit", "accounting.invoices.view",
    "accounting.invoices.create", "accounting.invoices.approve", "hr.employees.view", "hr.employees.edit",
    "attendance.view", "attendance.manage", "assets.view", "assets.create", "assets.assign", "assets.return",
    "projects.view", "projects.manage", "users.view", "users.manage", "reports.view", "settings.manage",
  ];
  for (const key of permissionKeys) {
    await prisma.permission.upsert({ where: { tenantId_key: { tenantId: tenant.id, key } }, update: {}, create: { tenantId: tenant.id, key } });
  }
  const ownerRole = await prisma.role.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: "Organisation Administrator" } }, update: {}, create: { tenantId: tenant.id, name: "Organisation Administrator", description: "Full access to the organisation workspace." } });
  const permissions = await prisma.permission.findMany({ where: { tenantId: tenant.id } });
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: ownerRole.id, permissionId: permission.id } }, update: {}, create: { roleId: ownerRole.id, permissionId: permission.id } });
  }

  const companyPositions = [
    ["Sales Manager", "Leads sales pipeline and customer relationship activity.", ["crm.customers.view", "crm.customers.create", "crm.customers.edit", "reports.view"]],
    ["Project Manager", "Coordinates projects, tasks, and delivery workflows.", ["projects.view", "projects.manage", "reports.view"]],
    ["IT Manager", "Manages systems, assets, access, and operational support.", ["assets.view", "assets.create", "assets.assign", "assets.return", "users.view", "users.manage", "settings.manage"]],
    ["Operations Manager", "Oversees attendance, assets, and daily operations.", ["attendance.view", "attendance.manage", "assets.view", "assets.assign", "reports.view"]],
    ["Customer Support Agent", "Handles customer records and support activity.", ["crm.customers.view", "crm.customers.create", "crm.customers.edit", "attendance.view"]],
    ["Marketing Manager", "Manages customer engagement and reporting activity.", ["crm.customers.view", "crm.customers.create", "crm.customers.edit", "reports.view"]],
  ];
  for (const [name, description, rolePermissionKeys] of companyPositions) {
    const position = await prisma.role.upsert({ where: { tenantId_name: { tenantId: tenant.id, name } }, update: { description }, create: { tenantId: tenant.id, name, description } });
    for (const key of rolePermissionKeys) {
      const permission = permissions.find((item) => item.key === key);
      if (permission) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: position.id, permissionId: permission.id } }, update: {}, create: { roleId: position.id, permissionId: permission.id } });
    }
  }

  await prisma.role.deleteMany({ where: { tenantId: tenant.id, name: { in: ["Demo Administrator", "Demo Finance Manager", "Demo HR Manager", "Demo Employee"] } } });
  await prisma.userRoleAssignment.upsert({ where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } }, update: {}, create: { userId: user.id, roleId: ownerRole.id } });
  const demoUsers = [];
  for (const demo of [
    ["admin@example.com", "Administrator", UserRole.ADMIN],
    ["finance@example.com", "Finance Manager", UserRole.ACCOUNTANT],
    ["hr@example.com", "HR Manager", UserRole.HR_MANAGER],
    ["employee@example.com", "Employee", UserRole.EMPLOYEE],
  ]) {
    const demoUser = await prisma.user.upsert({ where: { tenantId_email: { tenantId: tenant.id, email: demo[0] } }, update: { fullName: demo[1], role: demo[2], status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash: hashPassword("PopIn@2026!Demo") }, create: { tenantId: tenant.id, email: demo[0], fullName: demo[1], role: demo[2], status: "ACTIVE", emailVerifiedAt: new Date(), passwordHash: hashPassword("PopIn@2026!Demo") } });
    demoUsers.push(demoUser);
  }
  const demoRolePermissions = {
    Administrator: permissionKeys,
    "Finance Manager": ["accounting.invoices.view", "accounting.invoices.create", "accounting.invoices.approve", "reports.view"],
    "HR Manager": ["hr.employees.view", "hr.employees.edit", "attendance.view", "attendance.manage"],
    Employee: ["attendance.view"],
  };
  for (const demoUser of demoUsers) {
    const roleName = demoUser.fullName;
    const rolePermissions = demoRolePermissions[roleName] || [];
    const role = await prisma.role.upsert({ where: { tenantId_name: { tenantId: tenant.id, name: roleName } }, update: {}, create: { tenantId: tenant.id, name: roleName, description: `Seeded ${roleName} role.` } });
    for (const key of rolePermissions) {
      const permission = await prisma.permission.findUnique({ where: { tenantId_key: { tenantId: tenant.id, key } } });
      if (permission) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
    await prisma.userRoleAssignment.upsert({ where: { userId_roleId: { userId: demoUser.id, roleId: role.id } }, update: {}, create: { userId: demoUser.id, roleId: role.id } });
  }
  const employeeDemoUser = demoUsers.find((user) => user.email === "employee@example.com");
  if (employeeDemoUser) {
    await prisma.employee.upsert({
      where: { id: `${tenant.id}-employee-demo` },
      update: { userId: employeeDemoUser.id, fullName: employeeDemoUser.fullName, email: employeeDemoUser.email, title: "Operations Employee", employmentStatus: "ACTIVE", officeLocationId: johannesburgOffice.id },
      create: { id: `${tenant.id}-employee-demo`, tenantId: tenant.id, userId: employeeDemoUser.id, officeLocationId: johannesburgOffice.id, fullName: employeeDemoUser.fullName, email: employeeDemoUser.email, title: "Operations Employee", employmentStatus: "ACTIVE" },
    });
  }

  const starterTenant = await prisma.tenant.upsert({
    where: { slug: "starter-demo" },
    update: {
      enabledModules: ["crm", "settings"],
      planCode: "starter",
      subscriptionStatus: "trialing",
      onboardingCompleted: true,
      billingEmail: "hello@starterdemo.example.com",
      emailFromName: "Starter Demo",
      emailFromAddress: "hello@starterdemo.example.com",
      replyToEmail: "hello@starterdemo.example.com",
      trialEndsAt: new Date("2026-08-18T00:00:00.000Z"),
      subscriptionRenewsAt: new Date("2026-08-18T00:00:00.000Z"),
      maxUsers: 10,
      maxStorageGb: 10,
      supportEmail: "hello@starterdemo.example.com",
      website: "https://starterdemo.example.com",
      city: "Cape Town",
      country: "South Africa",
      timezone: "Africa/Johannesburg",
      currency: "ZAR",
      defaultLanguage: "en",
      invoicePrefix: "STD",
      themeMode: "light",
      requireMfa: false,
      allowLocalAuth: true,
      sessionTimeoutMinutes: 480,
    },
    create: {
      name: "Starter Demo",
      slug: "starter-demo",
      enabledModules: ["crm", "settings"],
      planCode: "starter",
      subscriptionStatus: "trialing",
      onboardingCompleted: true,
      billingEmail: "hello@starterdemo.example.com",
      emailFromName: "Starter Demo",
      emailFromAddress: "hello@starterdemo.example.com",
      replyToEmail: "hello@starterdemo.example.com",
      trialEndsAt: new Date("2026-08-18T00:00:00.000Z"),
      subscriptionRenewsAt: new Date("2026-08-18T00:00:00.000Z"),
      maxUsers: 10,
      maxStorageGb: 10,
      supportEmail: "hello@starterdemo.example.com",
      website: "https://starterdemo.example.com",
      city: "Cape Town",
      country: "South Africa",
      timezone: "Africa/Johannesburg",
      currency: "ZAR",
      defaultLanguage: "en",
      invoicePrefix: "STD",
      themeMode: "light",
      requireMfa: false,
      allowLocalAuth: true,
      sessionTimeoutMinutes: 480,
    },
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: starterTenant.id,
        email: "owner@starterdemo.example.com",
      },
    },
    update: {
      fullName: "Starter Workspace Owner",
      role: UserRole.OWNER,
      passwordHash: hashPassword("Starter@2026!Owner"),
    },
    create: {
      tenantId: starterTenant.id,
      email: "owner@starterdemo.example.com",
      fullName: "Starter Workspace Owner",
      role: UserRole.OWNER,
      passwordHash: hashPassword("Starter@2026!Owner"),
    },
  });

  const starterCompany = await prisma.company.upsert({
    where: { id: `${starterTenant.id}-starter-logistics` },
    update: {
      name: "Starter Logistics",
      industry: "Logistics",
      website: "https://starterlogistics.example.com",
    },
    create: {
      id: `${starterTenant.id}-starter-logistics`,
      tenantId: starterTenant.id,
      name: "Starter Logistics",
      industry: "Logistics",
      website: "https://starterlogistics.example.com",
    },
  });

  await prisma.contact.upsert({
    where: { id: `${starterTenant.id}-owner@starterlogistics.example.com` },
    update: {
      fullName: "Anele Jacobs",
      email: "owner@starterlogistics.example.com",
      phone: "+27 21 555 1000",
      companyId: starterCompany.id,
      tags: ["lead", "starter"],
    },
    create: {
      id: `${starterTenant.id}-owner@starterlogistics.example.com`,
      tenantId: starterTenant.id,
      companyId: starterCompany.id,
      fullName: "Anele Jacobs",
      email: "owner@starterlogistics.example.com",
      phone: "+27 21 555 1000",
      tags: ["lead", "starter"],
    },
  });

  await prisma.deal.upsert({
    where: { id: `${starterTenant.id}-starter-crm-rollout` },
    update: {
      title: "Starter CRM Rollout",
      amount: 18500,
      currency: "ZAR",
      stage: DealStage.NEW,
      companyId: starterCompany.id,
    },
    create: {
      id: `${starterTenant.id}-starter-crm-rollout`,
      tenantId: starterTenant.id,
      companyId: starterCompany.id,
      title: "Starter CRM Rollout",
      amount: 18500,
      currency: "ZAR",
      stage: DealStage.NEW,
    },
  });

  const companyNames = [
    ["Atlas Freight", "Logistics", "https://atlasfreight.example.com"],
    ["Verta Group", "Professional Services", "https://verta.example.com"],
    ["Kibo Stores", "Retail", "https://kibo.example.com"],
  ];

  const companies = [];
  for (const [name, industry, website] of companyNames) {
    const company = await prisma.company.upsert({
      where: {
        id: `${tenant.id}-${name}`.replace(/\s+/g, "-").toLowerCase(),
      },
      update: { industry, website },
      create: {
        id: `${tenant.id}-${name}`.replace(/\s+/g, "-").toLowerCase(),
        tenantId: tenant.id,
        name,
        industry,
        website,
      },
    });
    companies.push(company);
  }

  const contacts = [
    { firstName: "Lerato", surname: "Dlamini", initials: "LD", employeeNumber: "AT-001", email: "lerato@atlasfreight.co.za", phone: "+27 11 000 1111", companyId: companies[0].id, monthlyContribution: 450, contributionStartDate: "2026-08-01", contributions: "Monthly membership contribution" },
    { firstName: "Zinhle", surname: "Mhlambi", initials: "ZM", employeeNumber: "VG-014", email: "zinhle@verta.co.za", phone: "+27 11 000 2222", companyId: companies[1].id, monthlyContribution: 300, contributionStartDate: "2026-08-01", contributions: "Monthly membership contribution" },
    { firstName: "Ernest", surname: "Molelekwa", initials: "EM", employeeNumber: "KS-027", email: "ernest@kibo.co.za", phone: "+27 11 000 3333", companyId: companies[2].id, monthlyContribution: 275, contributionStartDate: "2026-08-01", contributions: "Monthly membership contribution" },
  ];

  for (const contact of contacts) {
    const fullName = `${contact.firstName} ${contact.surname}`;
    await prisma.contact.upsert({
      where: {
        id: `${tenant.id}-${contact.email}`,
      },
      update: { fullName, firstName: contact.firstName, surname: contact.surname, initials: contact.initials, employeeNumber: contact.employeeNumber, phone: contact.phone, companyId: contact.companyId, monthlyContribution: contact.monthlyContribution, contributionStartDate: new Date(contact.contributionStartDate), contributionActive: true, contributions: contact.contributions, tags: ["crm", "priority"] },
      create: {
        id: `${tenant.id}-${contact.email}`,
        tenantId: tenant.id,
        companyId: contact.companyId,
        fullName,
        firstName: contact.firstName,
        surname: contact.surname,
        initials: contact.initials,
        employeeNumber: contact.employeeNumber,
        email: contact.email,
        phone: contact.phone,
        monthlyContribution: contact.monthlyContribution,
        contributionStartDate: new Date(contact.contributionStartDate),
        contributionActive: true,
        contributions: contact.contributions,
        tags: ["crm", "priority"],
      },
    });
  }

  const contributionPeriods = [
    { period: "2026-08", paid: [true, true, false] },
    { period: "2026-09", paid: [true, false, false] },
  ];
  for (const period of contributionPeriods) {
    for (const [index, contact] of contacts.entries()) {
      const contactId = `${tenant.id}-${contact.email}`;
      const isPaid = period.paid[index];
      await prisma.contributionPayment.upsert({
        where: { tenantId_contactId_period: { tenantId: tenant.id, contactId, period: period.period } },
        update: { amountDue: contact.monthlyContribution, amountPaid: isPaid ? contact.monthlyContribution : 0, status: isPaid ? "PAID" : "UNPAID", paidAt: isPaid ? new Date(`${period.period}-05T10:00:00.000Z`) : null, reference: isPaid ? `PAY-${period.period.replace("-", "")}-${String(index + 1).padStart(3, "0")}` : null },
        create: { tenantId: tenant.id, contactId, period: period.period, amountDue: contact.monthlyContribution, amountPaid: isPaid ? contact.monthlyContribution : 0, status: isPaid ? "PAID" : "UNPAID", paidAt: isPaid ? new Date(`${period.period}-05T10:00:00.000Z`) : null, reference: isPaid ? `PAY-${period.period.replace("-", "")}-${String(index + 1).padStart(3, "0")}` : null },
      });
    }
  }

  const deals = [
    ["Ops Stack", 67000, DealStage.DISCOVERY, companies[0].id],
    ["Multi-site CRM", 115000, DealStage.PROPOSAL, companies[1].id],
    ["Retail Service Hub", 94000, DealStage.PROPOSAL, companies[2].id],
    ["Partner Portal", 76000, DealStage.NEGOTIATION, companies[1].id],
  ];

  for (const [title, amount, stage, companyId] of deals) {
    await prisma.deal.upsert({
      where: {
        id: `${tenant.id}-${title}`.replace(/\s+/g, "-").toLowerCase(),
      },
      update: { amount, stage, companyId, currency: "ZAR" },
      create: {
        id: `${tenant.id}-${title}`.replace(/\s+/g, "-").toLowerCase(),
        tenantId: tenant.id,
        companyId,
        title,
        amount,
        stage,
        currency: "ZAR",
      },
    });
  }

  const invoices = [
    ["INV-2026-0001", "Atlas Freight", InvoiceStatus.PAID, 42000, 6300],
    ["INV-2026-0002", "Verta Group", InvoiceStatus.SENT, 86000, 12900],
    ["INV-2026-0003", "Kibo Stores", InvoiceStatus.OVERDUE, 54000, 8100],
    ["INV-2026-0004", "Atlas Freight", InvoiceStatus.SENT, 24000, 3600],
  ];

  for (const [number, customer, status, subtotal, taxAmount] of invoices) {
    await prisma.invoice.upsert({
      where: {
        tenantId_number: {
          tenantId: tenant.id,
          number,
        },
      },
      update: { customer, status, subtotal, taxAmount, total: subtotal + taxAmount },
      create: {
        tenantId: tenant.id,
        customer,
        number,
        status,
        currency: "ZAR",
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        issuedAt: new Date("2026-08-01T08:00:00.000Z"),
        dueAt: new Date("2026-08-21T08:00:00.000Z"),
      },
    });
  }

  const seededInvoice = await prisma.invoice.findUnique({ where: { tenantId_number: { tenantId: tenant.id, number: "INV-2026-0001" } } });
  if (seededInvoice) {
    await prisma.invoiceItem.upsert({ where: { id: `${seededInvoice.id}-services` }, update: { description: "CRM implementation services", quantity: 1, unitPrice: 42000, discount: 0, taxRate: 15, lineTotal: 42000 }, create: { id: `${seededInvoice.id}-services`, invoiceId: seededInvoice.id, description: "CRM implementation services", quantity: 1, unitPrice: 42000, discount: 0, taxRate: 15, lineTotal: 42000 } });
    await prisma.payment.upsert({ where: { id: `${seededInvoice.id}-payment` }, update: { provider: "Nedbank", method: "BANK_TRANSFER", reference: "POP-PAY-0001", amount: 48300, receivedAt: new Date("2026-08-18T10:00:00.000Z") }, create: { id: `${seededInvoice.id}-payment`, invoiceId: seededInvoice.id, provider: "Nedbank", method: "BANK_TRANSFER", reference: "POP-PAY-0001", amount: 48300, receivedAt: new Date("2026-08-18T10:00:00.000Z") } });
  }
  const septemberInvoice = await prisma.invoice.findUnique({ where: { tenantId_number: { tenantId: tenant.id, number: "INV-2026-0004" } } });
  if (septemberInvoice) {
    await prisma.invoiceItem.upsert({ where: { id: `${septemberInvoice.id}-support` }, update: { description: "September support retainer", quantity: 1, unitPrice: 24000, discount: 0, taxRate: 15, lineTotal: 24000 }, create: { id: `${septemberInvoice.id}-support`, invoiceId: septemberInvoice.id, description: "September support retainer", quantity: 1, unitPrice: 24000, discount: 0, taxRate: 15, lineTotal: 24000 } });
    await prisma.payment.upsert({ where: { id: `${septemberInvoice.id}-payment` }, update: { provider: "FNB", method: "CARD", reference: "POP-PAY-0004", amount: 10000, receivedAt: new Date("2026-09-12T10:00:00.000Z") }, create: { id: `${septemberInvoice.id}-payment`, invoiceId: septemberInvoice.id, provider: "FNB", method: "CARD", reference: "POP-PAY-0004", amount: 10000, receivedAt: new Date("2026-09-12T10:00:00.000Z") } });
  }

  const seededQuote = await prisma.quote.upsert({ where: { tenantId_number: { tenantId: tenant.id, number: "QUO-2026-0001" } }, update: { customer: "Atlas Freight", status: "SENT", currency: "ZAR", subtotal: 52000, taxAmount: 7800, total: 59800, validUntil: new Date("2026-10-15T00:00:00.000Z") }, create: { tenantId: tenant.id, customer: "Atlas Freight", number: "QUO-2026-0001", status: "SENT", currency: "ZAR", subtotal: 52000, taxAmount: 7800, total: 59800, validUntil: new Date("2026-10-15T00:00:00.000Z") } });
  await prisma.quoteItem.upsert({ where: { id: `${seededQuote.id}-implementation` }, update: { description: "CRM implementation package", quantity: 1, unitPrice: 52000, taxRate: 15, lineTotal: 52000 }, create: { id: `${seededQuote.id}-implementation`, quoteId: seededQuote.id, description: "CRM implementation package", quantity: 1, unitPrice: 52000, taxRate: 15, lineTotal: 52000 } });

  // Current invoice and quote forms are represented by Invoice records. Draft
  // QUO numbers are therefore visible in the Quotes screen while retaining all
  // of the updated billing, CRM-link, and line-item fields.
  const updatedDocuments = [
    {
      number: "INV-2026-0005", customer: "Verta Group", billingEmail: "accounts@verta.co.za", billingPhone: "+27 11 000 2222", contactId: `${tenant.id}-zinhle@verta.co.za`, companyId: companies[1].id, purchaseOrder: "VG-PO-2026-091", description: "Monthly customer success and CRM support", notes: "Payment due within 30 days.", status: InvoiceStatus.PAID, subtotal: 31500, taxAmount: 4725, issuedAt: "2026-09-01T08:00:00.000Z", dueAt: "2026-10-01T08:00:00.000Z", paidAmount: 36225, items: [{ id: "support", description: "Customer success retainer", quantity: 1, unitPrice: 28000, discount: 0, taxRate: 15 }, { id: "training", description: "CRM training session", quantity: 1, unitPrice: 3500, discount: 0, taxRate: 15 }], payment: { provider: "Standard Bank", method: "BANK_TRANSFER", reference: "VG-PAY-2026-005", amount: 36225, receivedAt: "2026-09-20T10:00:00.000Z" },
    },
    {
      number: "INV-2026-0006", customer: "Kibo Stores", billingEmail: "accounts@kibo.co.za", billingPhone: "+27 11 000 3333", contactId: `${tenant.id}-ernest@kibo.co.za`, companyId: companies[2].id, purchaseOrder: "KS-PO-418", description: "Field support and asset maintenance services", notes: "Please reference the invoice number with payment.", status: InvoiceStatus.SENT, subtotal: 18750, taxAmount: 2812.5, issuedAt: "2026-09-05T08:00:00.000Z", dueAt: "2026-10-05T08:00:00.000Z", paidAmount: 0, items: [{ id: "field-support", description: "Field support services", quantity: 3, unitPrice: 5000, discount: 0, taxRate: 15 }, { id: "maintenance", description: "Equipment maintenance", quantity: 1, unitPrice: 3750, discount: 0, taxRate: 15 }],
    },
    {
      number: "INV-2026-0007", customer: "Atlas Freight", billingEmail: "finance@atlasfreight.co.za", billingPhone: "+27 11 000 1111", contactId: `${tenant.id}-lerato@atlasfreight.co.za`, companyId: companies[0].id, purchaseOrder: "AT-PO-777", description: "Operations dashboard implementation", notes: "Includes reporting dashboard configuration and handover.", status: InvoiceStatus.OVERDUE, subtotal: 64000, taxAmount: 9600, issuedAt: "2026-07-15T08:00:00.000Z", dueAt: "2026-08-15T08:00:00.000Z", paidAmount: 20000, items: [{ id: "dashboard", description: "Operations dashboard implementation", quantity: 1, unitPrice: 64000, discount: 0, taxRate: 15 }],
    },
    {
      number: "QUO-2026-0002", customer: "Verta Group", billingEmail: "accounts@verta.co.za", billingPhone: "+27 11 000 2222", contactId: `${tenant.id}-zinhle@verta.co.za`, companyId: companies[1].id, purchaseOrder: "Verta CRM expansion", description: "Proposed CRM expansion and automation package", notes: "Quote valid for 30 days and subject to final scope approval.", status: InvoiceStatus.DRAFT, subtotal: 78000, taxAmount: 11700, issuedAt: "2026-09-18T08:00:00.000Z", dueAt: "2026-10-18T08:00:00.000Z", paidAmount: 0, items: [{ id: "automation", description: "CRM automation package", quantity: 1, unitPrice: 78000, discount: 0, taxRate: 15 }],
    },
    {
      number: "QUO-2026-0003", customer: "Kibo Stores", billingEmail: "accounts@kibo.co.za", billingPhone: "+27 11 000 3333", contactId: `${tenant.id}-ernest@kibo.co.za`, companyId: companies[2].id, purchaseOrder: "Kibo support proposal", description: "Annual support and reporting proposal", notes: "Includes quarterly service reviews and priority support.", status: InvoiceStatus.DRAFT, subtotal: 45000, taxAmount: 6750, issuedAt: "2026-09-18T08:00:00.000Z", dueAt: "2026-10-18T08:00:00.000Z", paidAmount: 0, items: [{ id: "annual-support", description: "Annual support plan", quantity: 1, unitPrice: 36000, discount: 0, taxRate: 15 }, { id: "reporting", description: "Quarterly reporting setup", quantity: 1, unitPrice: 9000, discount: 0, taxRate: 15 }],
    },
  ];
  for (const document of updatedDocuments) {
    const total = document.subtotal + document.taxAmount;
    const invoice = await prisma.invoice.upsert({
      where: { tenantId_number: { tenantId: tenant.id, number: document.number } },
      update: { customer: document.customer, billingEmail: document.billingEmail, billingPhone: document.billingPhone, contactId: document.contactId, companyId: document.companyId, purchaseOrder: document.purchaseOrder, description: document.description, notes: document.notes, status: document.status, currency: "ZAR", subtotal: document.subtotal, taxAmount: document.taxAmount, total, paidAmount: document.paidAmount, issuedAt: new Date(document.issuedAt), dueAt: new Date(document.dueAt) },
      create: { tenantId: tenant.id, customer: document.customer, billingEmail: document.billingEmail, billingPhone: document.billingPhone, contactId: document.contactId, companyId: document.companyId, purchaseOrder: document.purchaseOrder, description: document.description, notes: document.notes, number: document.number, status: document.status, currency: "ZAR", subtotal: document.subtotal, taxAmount: document.taxAmount, total, paidAmount: document.paidAmount, issuedAt: new Date(document.issuedAt), dueAt: new Date(document.dueAt) },
    });
    for (const item of document.items) {
      const lineTotal = item.quantity * item.unitPrice - item.discount;
      await prisma.invoiceItem.upsert({ where: { id: `${invoice.id}-${item.id}` }, update: { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount, taxRate: item.taxRate, lineTotal }, create: { id: `${invoice.id}-${item.id}`, invoiceId: invoice.id, description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, discount: item.discount, taxRate: item.taxRate, lineTotal } });
    }
    if (document.payment) await prisma.payment.upsert({ where: { id: `${invoice.id}-payment` }, update: document.payment, create: { invoiceId: invoice.id, ...document.payment, id: `${invoice.id}-payment` } });
  }

  const leratoContact = await prisma.contact.findUnique({ where: { id: `${tenant.id}-lerato@atlasfreight.co.za` } });
  if (leratoContact) {
    await prisma.activity.upsert({ where: { id: `${leratoContact.id}-kickoff` }, update: { type: "MEETING", title: "Implementation kickoff", occurredAt: new Date("2026-08-12T09:00:00.000Z"), ownerId: user.id }, create: { id: `${leratoContact.id}-kickoff`, tenantId: tenant.id, contactId: leratoContact.id, ownerId: user.id, type: "MEETING", title: "Implementation kickoff", occurredAt: new Date("2026-08-12T09:00:00.000Z") } });
  }

  await prisma.expense.deleteMany({
    where: {
      tenantId: tenant.id,
      category: { in: ["Cloud", "Payroll"] },
    },
  });

  await prisma.expense.createMany({
    data: [
      {
        tenantId: tenant.id,
        category: "Cloud",
        vendor: "AWS",
        currency: "ZAR",
        amount: 8900,
        incurredAt: new Date("2026-08-02T08:00:00.000Z"),
      },
      {
        tenantId: tenant.id,
        category: "Payroll",
        vendor: "Internal",
        currency: "ZAR",
        amount: 42000,
        incurredAt: new Date("2026-08-03T08:00:00.000Z"),
      },
    ],
  });

  const vendors = [
    ["AWS", "billing@aws.example.com", "+27 11 555 0001", "Cloud", "30 days"],
    ["Sage Payroll Services", "support@sagepay.example.com", "+27 11 555 0002", "Payroll", "Monthly"],
    ["Office Hub", "accounts@officehub.example.com", "+27 11 555 0003", "Office", "15 days"],
  ];

  for (const [name, email, phone, category, paymentTerms] of vendors) {
    await prisma.vendor.upsert({
      where: { id: `${tenant.id}-${name}`.replace(/\s+/g, "-").toLowerCase() },
      update: { email, phone, category, paymentTerms, active: true },
      create: {
        id: `${tenant.id}-${name}`.replace(/\s+/g, "-").toLowerCase(),
        tenantId: tenant.id,
        name,
        email,
        phone,
        category,
        paymentTerms,
        active: true,
      },
    });
  }

  const bankAccounts = [
    ["Nedbank", "Primary Operating", "1020304050", "ZAR", 286500],
    ["FNB", "Reserve Account", "5566778899", "ZAR", 124000],
  ];

  for (const [bankName, accountName, accountNumber, currency, currentBalance] of bankAccounts) {
    await prisma.bankAccount.upsert({
      where: { id: `${tenant.id}-${accountName}`.replace(/\s+/g, "-").toLowerCase() },
      update: { bankName, accountNumber, currency, currentBalance, active: true },
      create: {
        id: `${tenant.id}-${accountName}`.replace(/\s+/g, "-").toLowerCase(),
        tenantId: tenant.id,
        bankName,
        accountName,
        accountNumber,
        currency,
        currentBalance,
        active: true,
      },
    });
  }

  const chartAccounts = [
    ["1000", "Operating Bank", "Asset", "DEBIT"],
    ["1100", "Trade Receivables", "Asset", "DEBIT"],
    ["2000", "Output VAT", "Liability", "CREDIT"],
    ["4000", "Sales Revenue", "Income", "CREDIT"],
    ["5000", "Operating Expenses", "Expense", "DEBIT"],
  ];

  for (const [code, name, category, balanceSide] of chartAccounts) {
    await prisma.chartAccount.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code,
        },
      },
      update: { name, category, balanceSide, active: true },
      create: {
        tenantId: tenant.id,
        code,
        name,
        category,
        balanceSide,
        active: true,
      },
    });
  }

  const taxRates = [
    ["VAT 15%", "VAT15", 15, "SALES"],
    ["Input VAT 15%", "IVAT15", 15, "PURCHASES"],
  ];

  for (const [name, code, ratePercent, appliesTo] of taxRates) {
    await prisma.taxRate.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code,
        },
      },
      update: { name, ratePercent, appliesTo, active: true },
      create: {
        tenantId: tenant.id,
        name,
        code,
        ratePercent,
        appliesTo,
        active: true,
      },
    });
  }

  const periods = [
    ["August 2026", "2026-08-01T00:00:00.000Z", "2026-08-31T23:59:59.000Z", "OPEN"],
    ["July 2026", "2026-07-01T00:00:00.000Z", "2026-07-31T23:59:59.000Z", "CLOSED"],
  ];

  for (const [label, startDate, endDate, status] of periods) {
    await prisma.accountingPeriod.upsert({
      where: {
        tenantId_label: {
          tenantId: tenant.id,
          label,
        },
      },
      update: {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status,
        closedAt: status === "CLOSED" ? new Date("2026-08-01T08:00:00.000Z") : null,
      },
      create: {
        tenantId: tenant.id,
        label,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status,
        closedAt: status === "CLOSED" ? new Date("2026-08-01T08:00:00.000Z") : null,
      },
    });
  }

  const employee = await prisma.employee.upsert({
    where: { id: `${tenant.id}-jones-mayekiso` },
    update: {
      fullName: "Jones Mayekiso",
      email: "devops@popinsolutions.co.za",
      phone: "+27 10 555 0000",
      title: "Super Admin",
      department: "Operations",
      location: "Johannesburg",
      managerName: "Executive Team",
      employmentStatus: "ACTIVE",
      startDate: new Date("2024-04-01T08:00:00.000Z"),
      userId: user.id,
      salaryAmount: 55000,
      officeLocationId: johannesburgOffice.id,
    },
    create: {
      id: `${tenant.id}-jones-mayekiso`,
      tenantId: tenant.id,
      userId: user.id,
      fullName: "Jones Mayekiso",
      email: "devops@popinsolutions.co.za",
      phone: "+27 10 555 0000",
      title: "Super Admin",
      department: "Operations",
      location: "Johannesburg",
      managerName: "Executive Team",
      employmentStatus: "ACTIVE",
      startDate: new Date("2024-04-01T08:00:00.000Z"),
      salaryAmount: 55000,
      officeLocationId: johannesburgOffice.id,
    },
  });

  const hrEmployees = [
    {
      id: `${tenant.id}-lerato-dlamini`,
      fullName: "Lerato Dlamini",
      email: "lerato@popinsolutions.co.za",
      phone: "+27 11 000 1111",
      title: "People Operations Lead",
      department: "HR",
      location: "Johannesburg",
      managerName: "Jones Mayekiso",
      employmentStatus: "ACTIVE",
      startDate: new Date("2025-01-15T08:00:00.000Z"),
      salaryAmount: 42000,
      officeLocationId: johannesburgOffice.id,
    },
    {
      id: `${tenant.id}-ernest-molelekwa`,
      fullName: "Ernest Molelekwa",
      email: "ernest.m@popinsolutions.co.za",
      phone: "+27 11 000 3333",
      title: "Field Support Agent",
      department: "Service",
      location: "Pretoria",
      managerName: "Lerato Dlamini",
      employmentStatus: "ACTIVE",
      startDate: new Date("2025-06-01T08:00:00.000Z"),
      salaryAmount: 26000,
      officeLocationId: pretoriaOffice.id,
    },
  ];

  for (const item of hrEmployees) {
    await prisma.employee.upsert({
      where: { id: item.id },
      update: item,
      create: {
        tenantId: tenant.id,
        ...item,
      },
    });
  }

  await prisma.leaveRequest.upsert({
    where: { id: `${employee.id}-leave-aug` },
    update: {
      type: "PTO",
      status: LeaveStatus.PENDING,
    },
    create: {
      id: `${employee.id}-leave-aug`,
      employeeId: employee.id,
      startDate: new Date("2026-08-12T08:00:00.000Z"),
      endDate: new Date("2026-08-14T08:00:00.000Z"),
      type: "PTO",
      status: LeaveStatus.PENDING,
      reason: "Family travel",
    },
  });

  const lerato = await prisma.employee.findUnique({ where: { id: `${tenant.id}-lerato-dlamini` } });
  const ernest = await prisma.employee.findUnique({ where: { id: `${tenant.id}-ernest-molelekwa` } });
  const demoEmployee = await prisma.employee.findUnique({ where: { id: `${tenant.id}-employee-demo` } });

  // Seed a useful attendance history for every demo employee. The deterministic
  // IDs and compound upsert keep this safe to run repeatedly.
  const attendanceEmployees = [employee, lerato, ernest, demoEmployee].filter(Boolean);
  for (const [employeeIndex, attendanceEmployee] of attendanceEmployees.entries()) {
    await prisma.workSchedule.upsert({
      where: { id: `${attendanceEmployee.id}-weekday-schedule` },
      update: { weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "17:00", breakMin: 60, timezone: "Africa/Johannesburg", active: true },
      create: { id: `${attendanceEmployee.id}-weekday-schedule`, tenantId: tenant.id, employeeId: attendanceEmployee.id, weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "17:00", breakMin: 60, timezone: "Africa/Johannesburg", active: true },
    });

    let seededDays = 0;
    for (let offset = 0; offset < 24 && seededDays < 15; offset += 1) {
      const date = new Date(demoToday);
      date.setDate(date.getDate() - offset);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const dateKey = date.toISOString().slice(0, 10);
      const isAbsent = seededDays === 6 && employeeIndex % 2 === 0;
      const isMissingClockOut = seededDays === 2 && employeeIndex % 2 === 1;
      const isLate = seededDays === 1;
      const checkInAt = isAbsent ? null : new Date(`${dateKey}T${isLate ? "08:28" : "07:58"}:00`);
      const checkOutAt = isAbsent || isMissingClockOut ? null : new Date(`${dateKey}T17:04:00`);
      await prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: attendanceEmployee.id, date } },
        update: { status: isAbsent ? "ABSENT" : isLate ? "LATE" : "PRESENT", checkInAt, checkOutAt, officeLocationId: attendanceEmployee.officeLocationId, location: attendanceEmployee.officeLocationId === pretoriaOffice.id ? "-25.747900, 28.229300" : "-26.107600, 28.056700", clockInMethod: "WEB", notes: isAbsent ? "Scheduled absence" : isMissingClockOut ? "Awaiting clock-out" : isLate ? "Late arrival" : "Seeded demo attendance" },
        create: { id: `${attendanceEmployee.id}-attendance-${dateKey}`, employeeId: attendanceEmployee.id, date, status: isAbsent ? "ABSENT" : isLate ? "LATE" : "PRESENT", checkInAt, checkOutAt, officeLocationId: attendanceEmployee.officeLocationId, location: attendanceEmployee.officeLocationId === pretoriaOffice.id ? "-25.747900, 28.229300" : "-26.107600, 28.056700", clockInMethod: "WEB", notes: isAbsent ? "Scheduled absence" : isMissingClockOut ? "Awaiting clock-out" : isLate ? "Late arrival" : "Seeded demo attendance" },
      });
      seededDays += 1;
    }
  }

  if (lerato) {
    await prisma.attendanceRecord.deleteMany({ where: { id: `${lerato.id}-attendance-2026-08-04` } });
    await prisma.attendanceRecord.upsert({
      where: { id: `${lerato.id}-attendance-demo-today` },
      update: {
        date: demoToday,
        status: "PRESENT",
        checkInAt: demoCheckIn,
        checkOutAt: demoCheckOut,
        officeLocationId: johannesburgOffice.id,
        notes: "Head office attendance",
      },
      create: {
        id: `${lerato.id}-attendance-demo-today`,
        employeeId: lerato.id,
        date: demoToday,
        status: "PRESENT",
        checkInAt: demoCheckIn,
        checkOutAt: demoCheckOut,
        officeLocationId: johannesburgOffice.id,
        notes: "Head office attendance",
      },
    });

    await prisma.payrollRun.upsert({
      where: { id: `${lerato.id}-payroll-aug-2026` },
      update: {
        periodLabel: "August 2026",
        payDate: new Date("2026-08-25T08:00:00.000Z"),
        grossAmount: 42000,
        deductions: 3200,
        netAmount: 38800,
        status: "APPROVED",
        notes: "Ready for payment release",
      },
      create: {
        id: `${lerato.id}-payroll-aug-2026`,
        employeeId: lerato.id,
        periodLabel: "August 2026",
        payDate: new Date("2026-08-25T08:00:00.000Z"),
        grossAmount: 42000,
        deductions: 3200,
        netAmount: 38800,
        status: "APPROVED",
        notes: "Ready for payment release",
      },
    });

    await prisma.performanceReview.upsert({
      where: { id: `${lerato.id}-review-q3-2026` },
      update: {
        reviewDate: new Date("2026-08-20T09:00:00.000Z"),
        score: 4,
        reviewerName: "Jones Mayekiso",
        status: "SCHEDULED",
        summary: "Quarterly review scheduled for people operations delivery and onboarding process optimization.",
      },
      create: {
        id: `${lerato.id}-review-q3-2026`,
        employeeId: lerato.id,
        reviewDate: new Date("2026-08-20T09:00:00.000Z"),
        score: 4,
        reviewerName: "Jones Mayekiso",
        status: "SCHEDULED",
        summary: "Quarterly review scheduled for people operations delivery and onboarding process optimization.",
      },
    });

    await prisma.employeeDocument.upsert({
      where: { id: `${lerato.id}-employment-contract` },
      update: {
        label: "Employment Contract",
        category: "Contract",
        fileKey: "https://files.popinsolutions.co.za/hr/contracts/lerato-dlamini.pdf",
        expiresAt: new Date("2027-01-15T00:00:00.000Z"),
      },
      create: {
        id: `${lerato.id}-employment-contract`,
        employeeId: lerato.id,
        label: "Employment Contract",
        category: "Contract",
        fileKey: "https://files.popinsolutions.co.za/hr/contracts/lerato-dlamini.pdf",
        expiresAt: new Date("2027-01-15T00:00:00.000Z"),
      },
    });
  }

  if (ernest) {
    await prisma.leaveRequest.upsert({
      where: { id: `${ernest.id}-leave-aug` },
      update: {
        startDate: new Date("2026-08-18T08:00:00.000Z"),
        endDate: new Date("2026-08-20T17:00:00.000Z"),
        type: "SICK",
        status: LeaveStatus.APPROVED,
        reason: "Recovery period",
      },
      create: {
        id: `${ernest.id}-leave-aug`,
        employeeId: ernest.id,
        startDate: new Date("2026-08-18T08:00:00.000Z"),
        endDate: new Date("2026-08-20T17:00:00.000Z"),
        type: "SICK",
        status: LeaveStatus.APPROVED,
        reason: "Recovery period",
      },
    });
  }

  const assetCategory = await prisma.assetCategory.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "Computing" } },
    update: { description: "Laptops, desktops, monitors, and related equipment." },
    create: { tenantId: tenant.id, name: "Computing", description: "Laptops, desktops, monitors, and related equipment." },
  });
  const demoAsset = await prisma.asset.upsert({
    where: { tenantId_assetTag: { tenantId: tenant.id, assetTag: "POP-LAP-001" } },
    update: { name: "Dell Latitude 7440", category: "Computing", categoryId: assetCategory.id, status: "ASSIGNED", condition: "GOOD" },
    create: { tenantId: tenant.id, assetTag: "POP-LAP-001", name: "Dell Latitude 7440", category: "Computing", categoryId: assetCategory.id, manufacturer: "Dell", model: "Latitude 7440", serialNumber: "DEMO-SN-001", purchasePrice: 24500, purchaseDate: new Date("2026-01-15T00:00:00.000Z"), status: "ASSIGNED", condition: "GOOD", location: "Johannesburg" },
  });
  await prisma.assetAssignment.upsert({
    where: { id: `${demoAsset.id}-assignment` },
    update: { returnedAt: null, employeeId: employee.id },
    create: { id: `${demoAsset.id}-assignment`, assetId: demoAsset.id, employeeId: employee.id, notes: "Demo onboarding allocation." },
  });
  await prisma.expense.upsert({
    where: { id: `${tenant.id}-september-software-expense` },
    update: { category: "Software", vendor: "Microsoft 365", currency: "ZAR", amount: 4200, taxAmount: 630, incurredAt: new Date("2026-09-06T08:00:00.000Z"), status: "APPROVED" },
    create: { id: `${tenant.id}-september-software-expense`, tenantId: tenant.id, category: "Software", vendor: "Microsoft 365", currency: "ZAR", amount: 4200, taxAmount: 630, incurredAt: new Date("2026-09-06T08:00:00.000Z"), status: "APPROVED" },
  });
  await prisma.assetMaintenance.upsert({
    where: { id: `${demoAsset.id}-maintenance-1` },
    update: { date: new Date("2026-08-20T08:00:00.000Z"), issue: "Routine service check", description: "Preventive inspection and operating system updates.", provider: "Internal IT", cost: 850, status: "COMPLETED", completedAt: new Date("2026-08-20T16:00:00.000Z") },
    create: { id: `${demoAsset.id}-maintenance-1`, assetId: demoAsset.id, date: new Date("2026-08-20T08:00:00.000Z"), issue: "Routine service check", description: "Preventive inspection and operating system updates.", provider: "Internal IT", cost: 850, status: "COMPLETED", completedAt: new Date("2026-08-20T16:00:00.000Z") },
  });
  const demoProject = await prisma.project.upsert({
    where: { id: `${tenant.id}-crm-rollout` },
    update: { status: "ACTIVE", customer: "Atlas Freight" },
    create: { id: `${tenant.id}-crm-rollout`, tenantId: tenant.id, name: "Atlas CRM rollout", customer: "Atlas Freight", status: "ACTIVE", budget: 180000, startDate: new Date("2026-08-01T00:00:00.000Z"), endDate: new Date("2026-10-31T00:00:00.000Z"), description: "CRM and workflow implementation for the demo customer." },
  });
  await prisma.task.upsert({
    where: { id: `${demoProject.id}-discovery` },
    update: { status: "IN_PROGRESS", projectId: demoProject.id, assignedUserId: user.id },
    create: { id: `${demoProject.id}-discovery`, tenantId: tenant.id, projectId: demoProject.id, title: "Complete discovery workshop", description: "Capture business processes and integration requirements.", status: "IN_PROGRESS", priority: "HIGH", assignedUserId: user.id, dueDate: new Date("2026-09-25T00:00:00.000Z"), estimatedHours: 8 },
  });

  await prisma.formTemplate.upsert({
    where: { slug: "lead-capture-form" },
    update: {
      published: true,
    },
    create: {
      tenantId: tenant.id,
      name: "Lead Capture Form",
      slug: "lead-capture-form",
      moduleKey: "crm",
      published: true,
      schemaJson: {
        fields: [
          { key: "fullName", type: "text", label: "Full Name", required: true },
          { key: "workEmail", type: "email", label: "Work Email", required: true },
          { key: "services", type: "multi-select", label: "Services Interested In", required: true },
        ],
      },
    },
  });

  const leadCaptureForm = await prisma.formTemplate.findUnique({
    where: { slug: "lead-capture-form" },
  });

  if (leadCaptureForm) {
    await prisma.formResponse.upsert({
      where: { id: `${leadCaptureForm.id}-sample-response` },
      update: {
        payloadJson: {
          fullName: "Sibongile Ndlovu",
          workEmail: "sibongile.ndlovu@example.com",
          services: ["CRM", "Automation"],
          source: "website",
        },
      },
      create: {
        id: `${leadCaptureForm.id}-sample-response`,
        formTemplateId: leadCaptureForm.id,
        payloadJson: {
          fullName: "Sibongile Ndlovu",
          workEmail: "sibongile.ndlovu@example.com",
          services: ["CRM", "Automation"],
          source: "website",
        },
      },
    });
  }

  await prisma.workflow.upsert({
    where: { id: `${tenant.id}-lead-assignment` },
    update: {
      name: "Lead Assignment",
      triggerKey: "form.response.created",
      definitionJson: {
        actions: [
          { type: "assign_owner", target: "sales_manager" },
          { type: "notify", target: "email" },
        ],
      },
    },
    create: {
      id: `${tenant.id}-lead-assignment`,
      tenantId: tenant.id,
      name: "Lead Assignment",
      triggerKey: "form.response.created",
      definitionJson: {
        actions: [
          { type: "assign_owner", target: "sales_manager" },
          { type: "notify", target: "email" },
        ],
      },
    },
  });

  await prisma.auditLog.upsert({
    where: { id: `${tenant.id}-workflow-log-1` },
    update: {
      action: "WORKFLOW_CREATED",
      entityType: "Workflow",
      entityId: `${tenant.id}-lead-assignment`,
      metadataJson: {
        name: "Lead Assignment",
        triggerKey: "form.response.created",
      },
      createdAt: new Date("2026-08-04T09:15:00.000Z"),
    },
    create: {
      id: `${tenant.id}-workflow-log-1`,
      tenantId: tenant.id,
      action: "WORKFLOW_CREATED",
      entityType: "Workflow",
      entityId: `${tenant.id}-lead-assignment`,
      metadataJson: {
        name: "Lead Assignment",
        triggerKey: "form.response.created",
      },
      createdAt: new Date("2026-08-04T09:15:00.000Z"),
    },
  });

  if (leadCaptureForm) {
    await prisma.auditLog.upsert({
      where: { id: `${tenant.id}-form-log-1` },
      update: {
        action: "FORM_PUBLISHED",
        entityType: "FormTemplate",
        entityId: leadCaptureForm.id,
        metadataJson: {
          slug: leadCaptureForm.slug,
          name: leadCaptureForm.name,
        },
        createdAt: new Date("2026-08-04T09:18:00.000Z"),
      },
      create: {
        id: `${tenant.id}-form-log-1`,
        tenantId: tenant.id,
        action: "FORM_PUBLISHED",
        entityType: "FormTemplate",
        entityId: leadCaptureForm.id,
        metadataJson: {
          slug: leadCaptureForm.slug,
          name: leadCaptureForm.name,
        },
        createdAt: new Date("2026-08-04T09:18:00.000Z"),
      },
    });
  }

  const revenueAccount = await prisma.chartAccount.findFirst({
    where: { tenantId: tenant.id, code: "4000" },
  });
  const bankAccount = await prisma.chartAccount.findFirst({
    where: { tenantId: tenant.id, code: "1000" },
  });

  if (revenueAccount && bankAccount) {
    await prisma.journalEntry.upsert({
      where: { id: `${tenant.id}-journal-sales-receipt` },
      update: {
        memo: "Seeded sales receipt",
        entryDate: new Date("2026-08-02T09:00:00.000Z"),
      },
      create: {
        id: `${tenant.id}-journal-sales-receipt`,
        tenantId: tenant.id,
        entryDate: new Date("2026-08-02T09:00:00.000Z"),
        reference: "JE-2026-0001",
        memo: "Seeded sales receipt",
        status: "POSTED",
        lines: {
          create: [
            {
              accountId: bankAccount.id,
              description: "Cash received",
              debit: 48300,
              credit: 0,
            },
            {
              accountId: revenueAccount.id,
              description: "Revenue recognized",
              debit: 0,
              credit: 48300,
            },
          ],
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
