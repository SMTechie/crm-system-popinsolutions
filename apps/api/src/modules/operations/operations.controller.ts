import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import * as QRCode from "qrcode";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../common/services/audit.service";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller()
export class OperationsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notificationService: NotificationsService) {}

  private pagination(page?: string, pageSize?: string) {
    const current = Math.max(1, Number.parseInt(page || "1", 10) || 1);
    const size = Math.min(100, Math.max(1, Number.parseInt(pageSize || "50", 10) || 50));
    return { page: current, pageSize: size, skip: (current - 1) * size, take: size };
  }

  private pageMeta(page: { page: number; pageSize: number }, total: number) {
    return { page: page.page, pageSize: page.pageSize, total, pageCount: Math.ceil(total / page.pageSize) };
  }

  private async tenantId(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new BadRequestException("Workspace not found.");
    return tenant.id;
  }

  @Get("dashboard/overview")
  @RequiresPermission("reports.view")
  async dashboard(@Tenant() slug: string) {
    const tenantId = await this.tenantId(slug);
    const [customers, leads, employees, attendanceToday, assets, projects, tasks, invoices, expenses] = await Promise.all([
      this.prisma.company.count({ where: { tenantId } }),
      this.prisma.contact.count({ where: { tenantId, tags: { has: "lead" } } }),
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.attendanceRecord.count({ where: { employee: { tenantId }, date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, checkInAt: { not: null }, checkOutAt: null } }),
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.project.count({ where: { tenantId, status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
      this.prisma.task.count({ where: { tenantId, status: { not: "COMPLETED" } } }),
      this.prisma.invoice.findMany({ where: { tenantId, status: { not: "VOID" } }, select: { total: true, status: true } }),
      this.prisma.expense.findMany({ where: { tenantId }, select: { amount: true } }),
    ]);
    const revenue = invoices.filter((item) => item.status === "PAID").reduce((sum, item) => sum + Number(item.total), 0);
    const outstanding = invoices.filter((item) => item.status !== "PAID").reduce((sum, item) => sum + Number(item.total), 0);
    const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
    return { financial: { revenue, expenses: expenseTotal, netIncome: revenue - expenseTotal, outstandingInvoices: outstanding }, crm: { customers, leads }, hr: { employees, attendanceToday }, assets: { total: assets }, projects: { active: projects, openTasks: tasks } };
  }

  @Get("search")
  @RequiresPermission("users.view")
  async search(@Tenant() slug: string, @Query("q") query?: string) {
    const tenantId = await this.tenantId(slug); const term = query?.trim(); if (!term) return { items: [] };
    const contains = { contains: term, mode: "insensitive" as const };
    const [companies, contacts, employees, assets, projects, tasks, invoices] = await Promise.all([
      this.prisma.company.findMany({ where: { tenantId, OR: [{ name: contains }, { industry: contains }] }, select: { id: true, name: true } }),
      this.prisma.contact.findMany({ where: { tenantId, OR: [{ fullName: contains }, { email: contains }] }, select: { id: true, fullName: true, email: true } }),
      this.prisma.employee.findMany({ where: { tenantId, OR: [{ fullName: contains }, { email: contains }, { title: contains }] }, select: { id: true, fullName: true, email: true } }),
      this.prisma.asset.findMany({ where: { tenantId, OR: [{ name: contains }, { assetTag: contains }, { serialNumber: contains }] }, select: { id: true, name: true, assetTag: true } }),
      this.prisma.project.findMany({ where: { tenantId, OR: [{ name: contains }, { customer: contains }] }, select: { id: true, name: true } }),
      this.prisma.task.findMany({ where: { tenantId, title: contains }, select: { id: true, title: true } }),
      this.prisma.invoice.findMany({ where: { tenantId, OR: [{ number: contains }, { customer: contains }] }, select: { id: true, number: true, customer: true } }),
    ]);
    return { items: [...companies.map((item) => ({ type: "company", id: item.id, label: item.name })), ...contacts.map((item) => ({ type: "contact", id: item.id, label: item.fullName, detail: item.email })), ...employees.map((item) => ({ type: "employee", id: item.id, label: item.fullName, detail: item.email })), ...assets.map((item) => ({ type: "asset", id: item.id, label: item.name, detail: item.assetTag })), ...projects.map((item) => ({ type: "project", id: item.id, label: item.name })), ...tasks.map((item) => ({ type: "task", id: item.id, label: item.title })), ...invoices.map((item) => ({ type: "invoice", id: item.id, label: item.number, detail: item.customer }))].slice(0, 100) };
  }

  @Get("assets")
  @RequiresPermission("assets.view")
  async assets(@Tenant() slug: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenantId = await this.tenantId(slug);
    const pagination = this.pagination(page, pageSize); const where = { tenantId };
    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({ where, include: { assignments: { where: { returnedAt: null }, include: { employee: true } } }, orderBy: { updatedAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      this.prisma.asset.count({ where }),
    ]);
    return { items, meta: this.pageMeta(pagination, total) };
  }

  @Get("users")
  @RequiresPermission("users.view")
  async users(@Tenant() slug: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenantId = await this.tenantId(slug);
    const pagination = this.pagination(page, pageSize); const where = { tenantId };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: { id: true, email: true, fullName: true, role: true, status: true, phone: true, lastLoginAt: true, createdAt: true }, orderBy: { fullName: "asc" }, skip: pagination.skip, take: pagination.take }),
      this.prisma.user.count({ where }),
    ]);
    return { items, meta: this.pageMeta(pagination, total) };
  }

  @Patch("users/:id/status")
  @RequiresPermission("users.manage")
  async updateUserStatus(@Tenant() slug: string, @Param("id") id: string, @Body() body: { status?: string }) {
    const tenantId = await this.tenantId(slug);
    if (!(await this.prisma.user.findFirst({ where: { id, tenantId } }))) throw new BadRequestException("User not found.");
    const status = body.status?.toUpperCase();
    if (status !== "ACTIVE" && status !== "INACTIVE" && status !== "SUSPENDED") throw new BadRequestException("Invalid account status.");
    return { item: await this.prisma.user.update({ where: { id }, data: { status, deactivatedAt: status === "ACTIVE" ? null : new Date() }, select: { id: true, email: true, fullName: true, role: true, status: true } }) };
  }

  @Patch("users/:id/role")
  @RequiresPermission("users.manage")
  async updateUserRole(@Tenant() slug: string, @Param("id") id: string, @Body() body: { role?: string }) {
    const tenantId = await this.tenantId(slug);
    if (!(await this.prisma.user.findFirst({ where: { id, tenantId } }))) throw new BadRequestException("User not found.");
    const allowed = Object.values(UserRole) as string[];
    const role = body.role?.toUpperCase();
    if (!role || !allowed.includes(role)) throw new BadRequestException("Invalid role.");
    return { item: await this.prisma.user.update({ where: { id }, data: { role: role as UserRole }, select: { id: true, email: true, fullName: true, role: true, status: true } }) };
  }

  @Get("departments")
  @RequiresPermission("users.view")
  async departments(@Tenant() slug: string) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.department.findMany({ where: { tenantId }, include: { employees: { select: { id: true, fullName: true } } }, orderBy: { name: "asc" } }) }; }

  @Post("departments")
  @RequiresPermission("users.manage")
  async createDepartment(@Tenant() slug: string, @Body() body: { name?: string; description?: string; budget?: number }) { const tenantId = await this.tenantId(slug); if (!body.name) throw new BadRequestException("Department name is required."); return { item: await this.prisma.department.create({ data: { tenantId, name: body.name.trim(), description: body.description, budget: body.budget === undefined ? undefined : new Prisma.Decimal(body.budget) } }) }; }

  @Get("asset-categories")
  @RequiresPermission("assets.view")
  async assetCategories(@Tenant() slug: string) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.assetCategory.findMany({ where: { tenantId }, orderBy: { name: "asc" } }) }; }

  @Post("asset-categories")
  @RequiresPermission("assets.create")
  async createAssetCategory(@Tenant() slug: string, @Body() body: { name?: string; description?: string }) { const tenantId = await this.tenantId(slug); if (!body.name) throw new BadRequestException("Category name is required."); return { item: await this.prisma.assetCategory.create({ data: { tenantId, name: body.name.trim(), description: body.description } }) }; }

  @Get("software-licences")
  @RequiresPermission("assets.view")
  async softwareLicences(@Tenant() slug: string) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.softwareLicence.findMany({ where: { tenantId }, orderBy: { renewalDate: "asc" } }) }; }

  @Post("software-licences")
  @RequiresPermission("assets.create")
  async createSoftwareLicence(@Tenant() slug: string, @Body() body: { software?: string; vendor?: string; licenceCount?: number; renewalDate?: string; keyReference?: string }) { const tenantId = await this.tenantId(slug); if (!body.software) throw new BadRequestException("Software name is required."); return { item: await this.prisma.softwareLicence.create({ data: { tenantId, software: body.software.trim(), vendor: body.vendor, licenceCount: body.licenceCount ?? 1, renewalDate: body.renewalDate ? new Date(body.renewalDate) : undefined, keyReference: body.keyReference } }) }; }

  @Get("time-entries")
  @RequiresPermission("projects.view")
  async timeEntries(@Tenant() slug: string) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.timeEntry.findMany({ where: { tenantId }, include: { employee: true, project: true }, orderBy: { startedAt: "desc" }, take: 200 }) }; }

  @Post("time-entries")
  @RequiresPermission("projects.manage")
  async createTimeEntry(@Tenant() slug: string, @Body() body: { employeeId?: string; projectId?: string; taskId?: string; startedAt?: string; endedAt?: string; description?: string }) { const tenantId = await this.tenantId(slug); if (!body.employeeId || !body.startedAt) throw new BadRequestException("Employee and start time are required."); const employee = await this.prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } }); if (!employee) throw new BadRequestException("Employee not found."); if (body.projectId && !(await this.prisma.project.findFirst({ where: { id: body.projectId, tenantId } }))) throw new BadRequestException("Project not found."); const startedAt = new Date(body.startedAt); const endedAt = body.endedAt ? new Date(body.endedAt) : undefined; if (endedAt && endedAt <= startedAt) throw new BadRequestException("End time must be after start time."); return { item: await this.prisma.timeEntry.create({ data: { tenantId, employeeId: employee.id, projectId: body.projectId, taskId: body.taskId, startedAt, endedAt, durationMin: endedAt ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60000) : undefined, description: body.description } }) }; }

  @Get("work-schedules")
  @RequiresPermission("attendance.view")
  async workSchedules(@Tenant() slug: string) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.workSchedule.findMany({ where: { tenantId }, include: { employee: true }, orderBy: { employee: { fullName: "asc" } } }) }; }

  @Post("work-schedules")
  @RequiresPermission("attendance.manage")
  async createWorkSchedule(@Tenant() slug: string, @Body() body: { employeeId?: string; weekdays?: number[]; startTime?: string; endTime?: string; breakMin?: number; timezone?: string }) { const tenantId = await this.tenantId(slug); if (!body.employeeId || !body.startTime || !body.endTime || !body.weekdays?.length) throw new BadRequestException("Employee, weekdays, start, and end times are required."); const employee = await this.prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } }); if (!employee) throw new BadRequestException("Employee not found."); if (body.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new BadRequestException("Weekdays must be numbers from 0 to 6."); return { item: await this.prisma.workSchedule.create({ data: { tenantId, employeeId: employee.id, weekdays: body.weekdays, startTime: body.startTime, endTime: body.endTime, breakMin: body.breakMin ?? 60, timezone: body.timezone ?? "Africa/Johannesburg" } }) }; }

  @Get("leave-balances")
  @RequiresPermission("hr.employees.view")
  async leaveBalances(@Tenant() slug: string) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.leaveBalance.findMany({ where: { tenantId }, include: { employee: true }, orderBy: [{ year: "desc" }, { leaveType: "asc" }] }) }; }

  @Post("leave-balances")
  @RequiresPermission("hr.employees.edit")
  async createLeaveBalance(@Tenant() slug: string, @Body() body: { employeeId?: string; leaveType?: string; year?: number; allocated?: number }) { const tenantId = await this.tenantId(slug); if (!body.employeeId || !body.leaveType || !body.year) throw new BadRequestException("Employee, leave type, and year are required."); const employee = await this.prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } }); if (!employee) throw new BadRequestException("Employee not found."); return { item: await this.prisma.leaveBalance.upsert({ where: { employeeId_leaveType_year: { employeeId: employee.id, leaveType: body.leaveType, year: body.year } }, update: { allocated: body.allocated === undefined ? undefined : new Prisma.Decimal(body.allocated) }, create: { tenantId, employeeId: employee.id, leaveType: body.leaveType, year: body.year, allocated: new Prisma.Decimal(body.allocated ?? 0) } }) }; }

  @Get("assets/:id/maintenance")
  @RequiresPermission("assets.view")
  async maintenance(@Tenant() slug: string, @Param("id") id: string) { const tenantId = await this.tenantId(slug); if (!(await this.prisma.asset.findFirst({ where: { id, tenantId } }))) throw new BadRequestException("Asset not found."); return { items: await this.prisma.assetMaintenance.findMany({ where: { assetId: id }, orderBy: { date: "desc" } }) }; }

  @Post("assets/:id/maintenance")
  @RequiresPermission("assets.create")
  async createMaintenance(@Tenant() slug: string, @Param("id") id: string, @Body() body: { issue?: string; date?: string; description?: string; provider?: string; cost?: number }) { const tenantId = await this.tenantId(slug); if (!(await this.prisma.asset.findFirst({ where: { id, tenantId } }))) throw new BadRequestException("Asset not found."); if (!body.issue) throw new BadRequestException("Maintenance issue is required."); return { item: await this.prisma.assetMaintenance.create({ data: { assetId: id, issue: body.issue, date: body.date ? new Date(body.date) : new Date(), description: body.description, provider: body.provider, cost: body.cost === undefined ? undefined : new Prisma.Decimal(body.cost) } }) }; }

  @Post("assets")
  @RequiresPermission("assets.create")
  async createAsset(@Tenant() slug: string, @Body() body: { assetTag?: string; name?: string; category?: string; serialNumber?: string; status?: string; purchasePrice?: number }) {
    const tenantId = await this.tenantId(slug);
    if (!body.assetTag || !body.name || !body.category) throw new BadRequestException("Asset tag, name, and category are required.");
    const item = await this.prisma.asset.create({ data: { tenantId, assetTag: body.assetTag.trim(), name: body.name.trim(), category: body.category.trim(), serialNumber: body.serialNumber, status: body.status?.toUpperCase() ?? "AVAILABLE", purchasePrice: body.purchasePrice === undefined ? undefined : new Prisma.Decimal(body.purchasePrice) } });
    await this.audit.record({ tenantId, action: "CREATE", entityType: "Asset", entityId: item.id, newValue: item });
    return { item };
  }

  @Post("assets/:id/qr")
  @RequiresPermission("assets.create")
  async assetQr(@Tenant() slug: string, @Param("id") id: string) {
    const tenantId = await this.tenantId(slug); const asset = await this.prisma.asset.findFirst({ where: { id, tenantId } }); if (!asset) throw new BadRequestException("Asset not found.");
    const item = await this.prisma.asset.update({ where: { id }, data: { qrToken: asset.qrToken ?? randomBytes(24).toString("base64url") }, select: { id: true, assetTag: true, qrToken: true } });
    const scanUrl = `${process.env.WEB_APP_URL || "http://localhost:3000"}/assets/${item.id}?qr=${item.qrToken}`;
    return { item, scanUrl, qrDataUrl: await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: "M", margin: 2, width: 320 }) };
  }

  @Get("assets/:id")
  @RequiresPermission("assets.view")
  async assetDetail(@Tenant() slug: string, @Param("id") id: string) { const tenantId = await this.tenantId(slug); const item = await this.prisma.asset.findFirst({ where: { id, tenantId }, include: { assignments: { include: { employee: true }, orderBy: { assignedAt: "desc" } }, maintenance: { orderBy: { date: "desc" } }, categoryRef: true } }); if (!item) throw new BadRequestException("Asset not found."); return { item }; }

  @Post("attendance/qr")
  @RequiresPermission("attendance.manage")
  async attendanceQr(@Tenant() slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } }); if (!tenant) throw new BadRequestException("Workspace not found.");
    const item = await this.prisma.tenant.update({ where: { id: tenant.id }, data: { attendanceQrToken: tenant.attendanceQrToken ?? randomBytes(24).toString("base64url") }, select: { slug: true, attendanceQrToken: true } });
    const scanUrl = `${process.env.WEB_APP_URL || "http://localhost:3000"}/attendance/clock-in?workspace=${item.slug}&qr=${item.attendanceQrToken}`;
    return { item, scanUrl, qrDataUrl: await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: "M", margin: 2, width: 320 }) };
  }

  @Patch("assets/:id")
  @RequiresPermission("assets.create")
  async updateAsset(@Tenant() slug: string, @Param("id") id: string, @Body() body: { name?: string; category?: string; status?: string; condition?: string; location?: string; notes?: string }) {
    const tenantId = await this.tenantId(slug);
    const existing = await this.prisma.asset.findFirst({ where: { id, tenantId } });
    if (!existing) throw new BadRequestException("Asset not found.");
    return { item: await this.prisma.asset.update({ where: { id }, data: { name: body.name, category: body.category, status: body.status?.toUpperCase(), condition: body.condition, location: body.location, notes: body.notes } }) };
  }

  @Post("assets/:id/assign")
  @RequiresPermission("assets.assign")
  async assignAsset(@Tenant() slug: string, @Param("id") id: string, @Body() body: { employeeId?: string; notes?: string }) {
    const tenantId = await this.tenantId(slug);
    if (!body.employeeId) throw new BadRequestException("Employee is required.");
    const [asset, employee] = await Promise.all([this.prisma.asset.findFirst({ where: { id, tenantId } }), this.prisma.employee.findFirst({ where: { id: body.employeeId, tenantId } })]);
    if (!asset || !employee) throw new BadRequestException("Asset or employee not found.");
    await this.prisma.assetAssignment.updateMany({ where: { assetId: id, returnedAt: null }, data: { returnedAt: new Date() } });
    const assignment = await this.prisma.assetAssignment.create({ data: { assetId: id, employeeId: employee.id, notes: body.notes } });
    await this.prisma.asset.update({ where: { id }, data: { status: "ASSIGNED" } });
    await this.audit.record({ tenantId, action: "ASSIGN", entityType: "Asset", entityId: id, newValue: { employeeId: employee.id, assignmentId: assignment.id } });
    return { item: assignment };
  }

  @Post("assets/:id/return")
  @RequiresPermission("assets.return")
  async returnAsset(@Tenant() slug: string, @Param("id") id: string, @Body() body: { condition?: string; notes?: string }) {
    const tenantId = await this.tenantId(slug);
    const asset = await this.prisma.asset.findFirst({ where: { id, tenantId } });
    if (!asset) throw new BadRequestException("Asset not found.");
    await this.prisma.assetAssignment.updateMany({ where: { assetId: id, returnedAt: null }, data: { returnedAt: new Date(), returnCondition: body.condition, notes: body.notes } });
    const item = await this.prisma.asset.update({ where: { id }, data: { status: "AVAILABLE", condition: body.condition } });
    await this.audit.record({ tenantId, action: "UNASSIGN", entityType: "Asset", entityId: id, newValue: { condition: body.condition } });
    return { item };
  }

  @Get("projects")
  @RequiresPermission("projects.view")
  async projects(@Tenant() slug: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenantId = await this.tenantId(slug); const pagination = this.pagination(page, pageSize); const where = { tenantId };
    const [items, total] = await Promise.all([
      this.prisma.project.findMany({ where, include: { tasks: true }, orderBy: { updatedAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      this.prisma.project.count({ where }),
    ]);
    return { items, meta: this.pageMeta(pagination, total) };
  }

  @Post("projects")
  @RequiresPermission("projects.manage")
  async createProject(@Tenant() slug: string, @Body() body: { name?: string; customer?: string; status?: string; budget?: number; description?: string }) {
    const tenantId = await this.tenantId(slug);
    if (!body.name) throw new BadRequestException("Project name is required.");
    const item = await this.prisma.project.create({ data: { tenantId, name: body.name.trim(), customer: body.customer, status: body.status?.toUpperCase() ?? "PLANNING", budget: body.budget === undefined ? undefined : new Prisma.Decimal(body.budget), description: body.description } }); await this.audit.record({ tenantId, action: "CREATE", entityType: "Project", entityId: item.id, newValue: item }); return { item };
  }

  @Get("tasks")
  @RequiresPermission("projects.view")
  async tasks(@Tenant() slug: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenantId = await this.tenantId(slug); const pagination = this.pagination(page, pageSize); const where = { tenantId };
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({ where, include: { project: true }, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], skip: pagination.skip, take: pagination.take }),
      this.prisma.task.count({ where }),
    ]);
    return { items, meta: this.pageMeta(pagination, total) };
  }

  @Post("tasks")
  @RequiresPermission("projects.manage")
  async createTask(@Tenant() slug: string, @Body() body: { title?: string; projectId?: string; assignedUserId?: string; priority?: string; dueDate?: string; description?: string }) {
    const tenantId = await this.tenantId(slug);
    if (!body.title) throw new BadRequestException("Task title is required.");
    if (body.projectId && !(await this.prisma.project.findFirst({ where: { id: body.projectId, tenantId } }))) throw new BadRequestException("Project not found.");
    const item = await this.prisma.task.create({ data: { tenantId, title: body.title.trim(), projectId: body.projectId, assignedUserId: body.assignedUserId, priority: body.priority?.toUpperCase() ?? "MEDIUM", dueDate: body.dueDate ? new Date(body.dueDate) : undefined, description: body.description } }); await this.audit.record({ tenantId, action: "CREATE", entityType: "Task", entityId: item.id, newValue: item }); return { item };
  }

  @Patch("tasks/:id")
  @RequiresPermission("projects.manage")
  async updateTask(@Tenant() slug: string, @Param("id") id: string, @Body() body: { status?: string; priority?: string; assignedUserId?: string; dueDate?: string }) {
    const tenantId = await this.tenantId(slug);
    if (!(await this.prisma.task.findFirst({ where: { id, tenantId } }))) throw new BadRequestException("Task not found.");
    return { item: await this.prisma.task.update({ where: { id }, data: { status: body.status?.toUpperCase(), priority: body.priority?.toUpperCase(), assignedUserId: body.assignedUserId, dueDate: body.dueDate ? new Date(body.dueDate) : undefined } }) };
  }

  @Get("notifications")
  @RequiresPermission("users.view")
  async notifications(@Tenant() slug: string, @Req() request: { user: { sub: string } }) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.notification.findMany({ where: { tenantId, userId: request.user.sub }, orderBy: { createdAt: "desc" }, take: 50 }) }; }

  @Post("notifications/refresh")
  @RequiresPermission("reports.view")
  async refreshNotifications(@Tenant() slug: string) { return this.notificationService.refreshTenant(await this.tenantId(slug)); }

  @Patch("notifications/:id/read")
  async markNotificationRead(@Tenant() slug: string, @Param("id") id: string, @Req() request: { user: { sub: string } }) { const tenantId = await this.tenantId(slug); const existing = await this.prisma.notification.findFirst({ where: { id, tenantId, userId: request.user.sub } }); if (!existing) throw new BadRequestException("Notification not found."); return { item: await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } }) }; }

  @Get("audit-logs")
  @RequiresPermission("reports.view")
  @RequiresPermission("reports.view")
  async auditLogs(@Tenant() slug: string, @Query("entityType") entityType?: string) { const tenantId = await this.tenantId(slug); return { items: await this.prisma.auditLog.findMany({ where: { tenantId, entityType: entityType || undefined }, orderBy: { createdAt: "desc" }, take: 200 }) }; }

  @Get("exports/:resource")
  @RequiresPermission("reports.view")
  @RequiresPermission("reports.view")
  async exportCsv(@Tenant() slug: string, @Param("resource") resource: string, @Query("from") from: string | undefined, @Query("to") to: string | undefined, @Res() response: { setHeader: (name: string, value: string) => void; send: (body: string) => void }) {
    const tenantId = await this.tenantId(slug); let rows: Array<Record<string, unknown>> = [];
    if (resource === "contacts") rows = await this.prisma.contact.findMany({ where: { tenantId }, select: { id: true, fullName: true, email: true, phone: true, createdAt: true } });
    else if (resource === "employees") rows = await this.prisma.employee.findMany({ where: { tenantId }, select: { id: true, fullName: true, email: true, phone: true, title: true, department: true, employmentStatus: true } });
    else if (resource === "assets") rows = await this.prisma.asset.findMany({ where: { tenantId }, select: { id: true, assetTag: true, name: true, category: true, serialNumber: true, status: true, condition: true } });
    else if (resource === "invoices") rows = await this.prisma.invoice.findMany({ where: { tenantId }, select: { id: true, number: true, customer: true, status: true, currency: true, subtotal: true, taxAmount: true, total: true, dueAt: true } });
    else if (resource === "profit-loss") {
      const [invoices, expenses] = await Promise.all([
        this.prisma.invoice.findMany({ where: { tenantId, status: { not: "VOID" }, issuedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { total: true } }),
        this.prisma.expense.findMany({ where: { tenantId, status: { in: ["APPROVED", "PAID"] }, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true, taxAmount: true } }),
      ]);
      const revenue = invoices.reduce((sum, item) => sum + Number(item.total), 0); const expensesTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
      rows = [{ metric: "revenue", value: revenue }, { metric: "expenses", value: expensesTotal }, { metric: "netIncome", value: revenue - expensesTotal }];
    } else if (resource === "cash-flow") {
      const [payments, expenses] = await Promise.all([
        this.prisma.payment.findMany({ where: { invoice: { tenantId }, receivedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true } }),
        this.prisma.expense.findMany({ where: { tenantId, status: { in: ["APPROVED", "PAID"] }, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true } }),
      ]);
      const inflow = payments.reduce((sum, item) => sum + Number(item.amount), 0); const outflow = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
      rows = [{ metric: "inflow", value: inflow }, { metric: "outflow", value: outflow }, { metric: "net", value: inflow - outflow }];
    } else if (resource === "vat") {
      const [invoices, expenses] = await Promise.all([
        this.prisma.invoice.findMany({ where: { tenantId, status: { not: "VOID" }, issuedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { subtotal: true, taxAmount: true } }),
        this.prisma.expense.findMany({ where: { tenantId, status: { in: ["APPROVED", "PAID"] }, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { amount: true } }),
      ]);
      const outputBase = invoices.reduce((sum, item) => sum + Number(item.subtotal), 0); const outputTax = invoices.reduce((sum, item) => sum + Number(item.taxAmount), 0); const inputBase = expenses.reduce((sum, item) => sum + Number(item.amount), 0); const inputTax = expenses.reduce((sum, item) => sum + Number(item.taxAmount), 0);
      rows = [{ metric: "outputBase", value: outputBase }, { metric: "outputTax", value: outputTax }, { metric: "inputBase", value: inputBase }, { metric: "inputTax", value: inputTax }, { metric: "netTax", value: outputTax - inputTax }];
    } else if (resource === "balance-sheet") {
      const lines = await this.prisma.journalEntryLine.findMany({ where: { journalEntry: { tenantId, status: "POSTED", entryDate: { lte: to ? new Date(to) : undefined } } }, include: { account: true } });
      const totals = { Asset: 0, Liability: 0, Equity: 0, Income: 0, Expense: 0 };
      for (const line of lines) { const category = line.account.category as keyof typeof totals; if (category in totals) totals[category] += Number(line.debit) - Number(line.credit); }
      rows = [{ metric: "assets", value: totals.Asset }, { metric: "liabilities", value: -totals.Liability }, { metric: "equity", value: -totals.Equity + totals.Income + totals.Expense }];
    } else if (resource === "trial-balance") {
      const lines = await this.prisma.journalEntryLine.findMany({ where: { journalEntry: { tenantId, status: "POSTED", entryDate: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } } }, include: { account: true } });
      const totals = new Map<string, { code: string; name: string; debit: number; credit: number }>();
      for (const line of lines) { const row = totals.get(line.accountId) ?? { code: line.account.code, name: line.account.name, debit: 0, credit: 0 }; row.debit += Number(line.debit); row.credit += Number(line.credit); totals.set(line.accountId, row); }
      rows = [...totals.values()].map((row) => ({ account: `${row.code} ${row.name}`, debit: row.debit, credit: row.credit, balance: row.debit - row.credit }));
    } else if (resource === "accounts-receivable") {
      const invoices = await this.prisma.invoice.findMany({ where: { tenantId, status: { notIn: ["PAID", "VOID", "DRAFT"] }, issuedAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, include: { payments: true }, orderBy: { dueAt: "asc" } });
      rows = invoices.map((invoice) => ({ number: invoice.number, customer: invoice.customer, outstanding: Number(invoice.total) - invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) }));
    } else if (resource === "accounts-payable") {
      rows = await this.prisma.expense.findMany({ where: { tenantId, incurredAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } }, select: { vendor: true, category: true, amount: true, currency: true, status: true }, orderBy: { incurredAt: "asc" } });
    }
    else throw new BadRequestException("Unsupported export resource.");
    const keys = rows.length ? Object.keys(rows[0]) : ["id"];
    const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => this.csvValue(row[key])).join(","))].join("\n");
    response.setHeader("Content-Type", "text/csv; charset=utf-8"); response.setHeader("Content-Disposition", `attachment; filename=${resource}.csv`); response.send(csv);
  }

  @Post("imports/contacts")
  @RequiresPermission("crm.customers.create")
  async importContacts(@Tenant() slug: string, @Body() body: { csv?: string }) {
    const tenantId = await this.tenantId(slug); if (!body.csv?.trim()) throw new BadRequestException("CSV content is required.");
    const lines = body.csv.trim().split(/\r?\n/); const headers = this.parseCsvLine(lines.shift() ?? "").map((header) => header.trim()); const required = ["fullName", "email", "phone"]; const errors: Array<{ row: number; error: string }> = []; const valid: Array<{ fullName: string; email?: string; phone?: string }> = [];
    for (let index = 0; index < lines.length; index += 1) { const values = this.parseCsvLine(lines[index]); const record = Object.fromEntries(headers.map((header, position) => [header, values[position] ?? ""])); if (!String(record.fullName ?? "").trim()) errors.push({ row: index + 2, error: "fullName is required" }); else valid.push({ fullName: String(record.fullName).trim(), email: String(record.email || "").trim() || undefined, phone: String(record.phone || "").trim() || undefined }); }
    const created = valid.length ? await this.prisma.contact.createMany({ data: valid.map((item) => ({ tenantId, ...item })) }) : { count: 0 };
    await this.audit.record({ tenantId, action: "IMPORT", entityType: "Contact", metadata: { processed: lines.length, created: created.count, errors: errors.length } });
    return { processed: lines.length, created: created.count, errors };
  }

  @Post("imports/:resource")
  @RequiresPermission("users.manage")
  async importResource(@Tenant() slug: string, @Param("resource") resource: string, @Body() body: { csv?: string }) {
    const tenantId = await this.tenantId(slug);
    if (!body.csv?.trim()) throw new BadRequestException("CSV content is required.");
    const normalized = resource.toLowerCase();
    if (!["employees", "suppliers", "vendors", "assets"].includes(normalized)) {
      throw new BadRequestException("Supported imports are employees, suppliers, and assets. Use /imports/contacts for customers.");
    }
    const lines = body.csv.trim().split(/\r?\n/);
    const headers = this.parseCsvLine(lines.shift() ?? "").map((header) => header.trim());
    const errors: Array<{ row: number; error: string }> = [];
    const records = lines.map((line, index) => ({ row: index + 2, values: Object.fromEntries(headers.map((header, position) => [header, this.parseCsvLine(line)[position] ?? ""])) }));
    const valid: Array<{ row: number; value: Record<string, string> }> = [];
    for (const record of records) {
      const value = Object.fromEntries(Object.entries(record.values).map(([key, item]) => [key, String(item ?? "").trim()]));
      const required = normalized === "employees" ? ["fullName", "email", "title"] : normalized === "assets" ? ["assetTag", "name", "category"] : ["name"];
      const missing = required.find((key) => !value[key]);
      if (missing) errors.push({ row: record.row, error: `${missing} is required` });
      else valid.push({ row: record.row, value });
    }
    let created = 0;
    if (normalized === "employees") {
      const existingEmails = new Set((await this.prisma.employee.findMany({ where: { tenantId }, select: { email: true } })).map((item) => item.email.toLowerCase()));
      const batch = valid.filter((item) => {
        const email = item.value.email.toLowerCase();
        if (existingEmails.has(email)) { errors.push({ row: item.row, error: "employee email already exists" }); return false; }
        existingEmails.add(email); return true;
      });
      if (batch.length) created = (await this.prisma.employee.createMany({ data: batch.map(({ value: item }) => ({ tenantId, fullName: item.fullName, email: item.email, title: item.title, phone: item.phone || undefined, department: item.department || undefined, employmentStatus: item.employmentStatus || "ACTIVE" })) })).count;
    } else if (normalized === "assets") {
      const existingTags = new Set((await this.prisma.asset.findMany({ where: { tenantId }, select: { assetTag: true } })).map((item) => item.assetTag.toLowerCase()));
      const batch = valid.filter((item) => {
        const tag = item.value.assetTag.toLowerCase();
        if (existingTags.has(tag)) { errors.push({ row: item.row, error: "asset tag already exists" }); return false; }
        existingTags.add(tag); return true;
      });
      if (batch.length) created = (await this.prisma.asset.createMany({ data: batch.map(({ value: item }) => ({ tenantId, assetTag: item.assetTag, name: item.name, category: item.category, serialNumber: item.serialNumber || undefined, status: item.status?.toUpperCase() || "AVAILABLE", condition: item.condition?.toUpperCase() || "GOOD", location: item.location || undefined })) })).count;
    } else {
      if (valid.length) created = (await this.prisma.vendor.createMany({ data: valid.map(({ value: item }) => ({ tenantId, name: item.name, email: item.email || undefined, phone: item.phone || undefined, category: item.category || undefined, paymentTerms: item.paymentTerms || undefined })) })).count;
    }
    await this.audit.record({ tenantId, action: "IMPORT", entityType: normalized === "assets" ? "Asset" : normalized === "employees" ? "Employee" : "Vendor", metadata: { processed: lines.length, created, errors: errors.length } });
    return { resource: normalized === "vendors" ? "suppliers" : normalized, processed: lines.length, created, errors };
  }

  private parseCsvLine(line: string) { const values: string[] = []; let value = ""; let quoted = false; for (let index = 0; index < line.length; index += 1) { const char = line[index]; if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { values.push(value); value = ""; } else value += char; } values.push(value); return values; }
  private csvValue(value: unknown) { const text = value instanceof Date ? value.toISOString() : String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

  @Get("attendance/history")
  @RequiresPermission("attendance.view")
  async attendanceHistory(@Tenant() slug: string, @Req() request: { user: { sub: string } }) {
    const tenantId = await this.tenantId(slug);
    const employee = await this.prisma.employee.findFirst({ where: { tenantId, userId: request.user.sub } });
    return { items: employee ? await this.prisma.attendanceRecord.findMany({ where: { employeeId: employee.id }, orderBy: { date: "desc" }, take: 100 }) : [] };
  }

  @Get("attendance/report")
  @RequiresPermission("attendance.view")
  async attendanceReport(@Tenant() slug: string, @Query("from") from?: string, @Query("to") to?: string, @Query("employeeId") employeeId?: string) {
    const tenantId = await this.tenantId(slug);
    const start = from ? new Date(from) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = to ? new Date(to) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) throw new BadRequestException("Attendance report dates are invalid.");
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
    const employees = await this.prisma.employee.findMany({ where: { tenantId, employmentStatus: "ACTIVE", id: employeeId || undefined }, include: { workSchedules: true }, orderBy: { fullName: "asc" } });
    const records = await this.prisma.attendanceRecord.findMany({ where: { employeeId: { in: employees.map((employee) => employee.id) }, date: { gte: start, lte: end } }, orderBy: { date: "asc" } });
    const byEmployeeDate = new Map(records.map((record) => [`${record.employeeId}:${record.date.toISOString().slice(0, 10)}`, record]));
    const daily: Array<{ date: string; employeeId: string; employee: string; status: string; late: boolean; missingClockOut: boolean; hours: number; overtime: number }> = [];
    for (const employee of employees) {
      for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const date = new Date(cursor); const dateKey = date.toISOString().slice(0, 10); const schedule = employee.workSchedules.find((item) => item.weekdays.includes(date.getDay()));
        if (!schedule) continue;
        const record = byEmployeeDate.get(`${employee.id}:${dateKey}`);
        const checkIn = record?.checkInAt ? new Date(record.checkInAt) : null; const checkOut = record?.checkOutAt ? new Date(record.checkOutAt) : null;
        const hours = checkIn && checkOut ? Math.max(0, (checkOut.getTime() - checkIn.getTime()) / 3600000 - schedule.breakMin / 60) : 0;
        const expectedHours = Math.max(0, (this.timeToMinutes(schedule.endTime) - this.timeToMinutes(schedule.startTime) - schedule.breakMin) / 60);
        const expectedStart = this.timeToMinutes(schedule.startTime); const actualStart = checkIn ? checkIn.getHours() * 60 + checkIn.getMinutes() : null;
        daily.push({ date: dateKey, employeeId: employee.id, employee: employee.fullName, status: record?.status || "ABSENT", late: actualStart !== null && actualStart > expectedStart, missingClockOut: Boolean(checkIn && !checkOut), hours: Number(hours.toFixed(2)), overtime: Number(Math.max(0, hours - expectedHours).toFixed(2)) });
      }
    }
    return { from: start.toISOString(), to: end.toISOString(), summary: { scheduled: daily.length, present: daily.filter((item) => item.status !== "ABSENT").length, absent: daily.filter((item) => item.status === "ABSENT").length, late: daily.filter((item) => item.late).length, missingClockOut: daily.filter((item) => item.missingClockOut).length, hours: Number(daily.reduce((sum, item) => sum + item.hours, 0).toFixed(2)), overtime: Number(daily.reduce((sum, item) => sum + item.overtime, 0).toFixed(2)) }, items: daily };
  }

  private timeToMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0); }

  @Post("attendance/clock-in")
  async clockIn(@Tenant() slug: string, @Req() request: { user: { sub: string }; ip?: string; headers: Record<string, string | undefined> }, @Body() body: { location?: string; method?: string; qrToken?: string }) {
    const tenantId = await this.tenantId(slug);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { attendanceQrToken: true } });
    if (body.method?.toUpperCase() === "QR" && (!body.qrToken || body.qrToken !== tenant?.attendanceQrToken)) throw new BadRequestException("Invalid organisation attendance QR code.");
    const employee = await this.prisma.employee.findFirst({ where: { tenantId, userId: request.user.sub, employmentStatus: "ACTIVE" } });
    if (!employee) throw new BadRequestException("An active employee profile is required to clock in.");
    const now = new Date();
    const day = new Date(now); day.setHours(0, 0, 0, 0);
    const existing = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: employee.id, date: day } } });
    if (existing?.checkInAt && !existing.checkOutAt) throw new BadRequestException("You are already clocked in.");
    const item = existing ? await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data: { checkInAt: now, checkOutAt: null, status: "PRESENT", location: body.location, device: request.headers["user-agent"], ipAddress: request.ip, clockInMethod: body.method?.toUpperCase() ?? "WEB" } }) : await this.prisma.attendanceRecord.create({ data: { employeeId: employee.id, date: day, status: "PRESENT", checkInAt: now, location: body.location, device: request.headers["user-agent"], ipAddress: request.ip, clockInMethod: body.method?.toUpperCase() ?? "WEB" } });
    return { item };
  }

  @Post("attendance/clock-out")
  async clockOut(@Tenant() slug: string, @Req() request: { user: { sub: string } }) {
    const tenantId = await this.tenantId(slug);
    const employee = await this.prisma.employee.findFirst({ where: { tenantId, userId: request.user.sub } });
    if (!employee) throw new BadRequestException("Employee profile not found.");
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const existing = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: employee.id, date: day } } });
    if (!existing?.checkInAt) throw new BadRequestException("You must clock in first.");
    if (existing.checkOutAt) throw new BadRequestException("You are already clocked out.");
    return { item: await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data: { checkOutAt: new Date() } }) };
  }
}
