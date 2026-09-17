import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { LeaveStatus } from "@prisma/client";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequiresPermission } from "../../common/decorators/permission.decorator";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../common/services/storage.service";

@UseGuards(JwtAuthGuard, ModuleAccessGuard, PermissionGuard)
@ModuleAccess("hr")
@Controller("hr")
export class HrController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly storage: StorageService,
  ) {}

  private pagination(page?: string, pageSize?: string) { const current = Math.max(1, Number.parseInt(page || "1", 10) || 1); const size = Math.min(100, Math.max(1, Number.parseInt(pageSize || "50", 10) || 50)); return { page: current, pageSize: size, skip: (current - 1) * size, take: size }; }

  private async nextEmployeeNumber(tenantId: string) {
    const count = await this.prisma.employee.count({ where: { tenantId } });
    return `EMP-${String(count + 1).padStart(6, "0")}`;
  }

  private normalizeLeaveStatus(status?: string): LeaveStatus {
    const normalized = status?.toUpperCase();
    if (normalized === "PENDING" || normalized === "APPROVED" || normalized === "REJECTED") {
      return normalized;
    }
    return "PENDING";
  }

  private normalizeText(value?: string | null) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return value;
  }

  private parseDecimal(value?: string | number | null) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException("Decimal values must be non-negative numbers.");
    return parsed;
  }

  private async resolveEmployee(tenantId: string, employeeId?: string | null) {
    if (!employeeId) return null;
    return this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId },
    });
  }

  @Get("overview")
  @RequiresPermission("hr.employees.view")
  async overview(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const now = new Date();
    const [employees, onLeave, pendingLeave, attendanceEntries, payrollRuns, performanceReviews, documents] =
      await Promise.all([
        this.prisma.employee.count({ where: { tenantId: tenant.id } }),
        this.prisma.leaveRequest.count({
          where: {
            employee: { tenantId: tenant.id },
            status: "APPROVED",
            startDate: { lte: now },
            endDate: { gte: now },
          },
        }),
        this.prisma.leaveRequest.count({
          where: {
            employee: { tenantId: tenant.id },
            status: "PENDING",
          },
        }),
        this.prisma.attendanceRecord.count({
          where: { employee: { tenantId: tenant.id } },
        }),
        this.prisma.payrollRun.count({
          where: { employee: { tenantId: tenant.id } },
        }),
        this.prisma.performanceReview.count({
          where: { employee: { tenantId: tenant.id } },
        }),
        this.prisma.employeeDocument.count({
          where: { employee: { tenantId: tenant.id } },
        }),
      ]);

    return {
      tenantId: tenant.slug,
      employees,
      onLeave,
      pendingLeave,
      attendanceEntries,
      payrollRuns,
      performanceReviews,
      documents,
    };
  }

  @Get("employees")
  @RequiresPermission("hr.employees.view")
  async employees(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { tenantId: tenant.id };
    const [items, total] = await Promise.all([this.prisma.employee.findMany({ where, include: { _count: { select: { leaveRequests: true, documents: true, attendanceRecords: true, payrollRuns: true, performanceReviews: true } } }, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }), this.prisma.employee.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Post("employees")
  @RequiresPermission("hr.employees.edit")
  async createEmployee(
    @Tenant() tenantId: string,
    @Body()
    body: {
      employeeNumber?: string;
      fullName?: string;
      email?: string;
      phone?: string;
      idPassportNumber?: string;
      dateOfBirth?: string;
      gender?: string;
      address?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      title?: string;
      department?: string;
      location?: string;
      managerName?: string;
      employmentStatus?: string;
      employmentType?: string;
      startDate?: string;
      endDate?: string;
      salaryAmount?: string | number;
      bankName?: string;
      bankAccountHolder?: string;
      bankAccountNumber?: string;
      bankBranch?: string;
      bankAccountType?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.fullName?.trim() || !body.email?.trim() || !body.title?.trim()) throw new BadRequestException("Employee name, email, and title are required.");
    const item = await this.prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeNumber: body.employeeNumber || await this.nextEmployeeNumber(tenant.id),
        fullName: body.fullName.trim(),
        email: body.email.trim().toLowerCase(),
        phone: this.normalizeText(body.phone),
        idPassportNumber: this.normalizeText(body.idPassportNumber),
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        gender: this.normalizeText(body.gender),
        address: this.normalizeText(body.address),
        emergencyContactName: this.normalizeText(body.emergencyContactName),
        emergencyContactPhone: this.normalizeText(body.emergencyContactPhone),
        title: body.title.trim(),
        department: this.normalizeText(body.department),
        location: this.normalizeText(body.location),
        managerName: this.normalizeText(body.managerName),
        employmentStatus: body.employmentStatus?.toUpperCase() || "ACTIVE",
        employmentType: this.normalizeText(body.employmentType),
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        salaryAmount: this.parseDecimal(body.salaryAmount),
        bankName: this.normalizeText(body.bankName),
        bankAccountHolder: this.normalizeText(body.bankAccountHolder),
        bankAccountNumber: this.normalizeText(body.bankAccountNumber),
        bankBranch: this.normalizeText(body.bankBranch),
        bankAccountType: this.normalizeText(body.bankAccountType),
      },
    });
    return { status: "created", item };
  }

  @Patch("employees/:employeeId")
  @RequiresPermission("hr.employees.edit")
  async updateEmployee(
    @Tenant() tenantId: string,
    @Param("employeeId") employeeId: string,
    @Body()
    body: {
      employeeNumber?: string | null;
      fullName?: string;
      email?: string;
      phone?: string | null;
      idPassportNumber?: string | null;
      dateOfBirth?: string | null;
      gender?: string | null;
      address?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      title?: string;
      department?: string | null;
      location?: string | null;
      managerName?: string | null;
      employmentStatus?: string | null;
      employmentType?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      salaryAmount?: string | number | null;
      bankName?: string | null;
      bankAccountHolder?: string | null;
      bankAccountNumber?: string | null;
      bankBranch?: string | null;
      bankAccountType?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.employee.findFirst({
      where: { tenantId: tenant.id, id: employeeId },
    });
    if (!existing) {
      return { status: "missing", employeeId };
    }
    const item = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        employeeNumber: this.normalizeText(body.employeeNumber),
        fullName: body.fullName ?? undefined,
        email: body.email ?? undefined,
        phone: this.normalizeText(body.phone),
        idPassportNumber: this.normalizeText(body.idPassportNumber),
        dateOfBirth: body.dateOfBirth === undefined ? undefined : body.dateOfBirth === null || body.dateOfBirth === "" ? null : new Date(body.dateOfBirth),
        gender: this.normalizeText(body.gender),
        address: this.normalizeText(body.address),
        emergencyContactName: this.normalizeText(body.emergencyContactName),
        emergencyContactPhone: this.normalizeText(body.emergencyContactPhone),
        title: body.title ?? undefined,
        department: this.normalizeText(body.department),
        location: this.normalizeText(body.location),
        managerName: this.normalizeText(body.managerName),
        employmentStatus: this.normalizeText(body.employmentStatus),
        employmentType: this.normalizeText(body.employmentType),
        startDate:
          body.startDate === undefined ? undefined : body.startDate === null || body.startDate === "" ? null : new Date(body.startDate),
        salaryAmount: this.parseDecimal(body.salaryAmount),
        endDate: body.endDate === undefined ? undefined : body.endDate === null || body.endDate === "" ? null : new Date(body.endDate),
        bankName: this.normalizeText(body.bankName),
        bankAccountHolder: this.normalizeText(body.bankAccountHolder),
        bankAccountNumber: this.normalizeText(body.bankAccountNumber),
        bankBranch: this.normalizeText(body.bankBranch),
        bankAccountType: this.normalizeText(body.bankAccountType),
      },
    });
    return { status: "updated", item };
  }

  @Delete("employees/:employeeId")
  @RequiresPermission("hr.employees.edit")
  async deleteEmployee(@Tenant() tenantId: string, @Param("employeeId") employeeId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.employee.findFirst({
      where: { tenantId: tenant.id, id: employeeId },
    });
    if (!existing) {
      return { status: "missing", employeeId };
    }
    await this.prisma.employee.delete({ where: { id: employeeId } });
    return { status: "deleted", employeeId };
  }

  @Get("leave-requests")
  @RequiresPermission("hr.employees.view")
  async leaveRequests(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { employee: { tenantId: tenant.id } };
    const [items, total] = await Promise.all([this.prisma.leaveRequest.findMany({
      where,
      include: { employee: true },
      orderBy: { startDate: "desc" },
      skip: pagination.skip, take: pagination.take,
    }), this.prisma.leaveRequest.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Post("leave-requests")
  @RequiresPermission("hr.employees.edit")
  async createLeaveRequest(
    @Tenant() tenantId: string,
    @Body()
    body: {
      employeeId?: string;
      startDate?: string;
      endDate?: string;
      type?: string;
      status?: string;
      reason?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.employeeId || !body.startDate || !body.endDate || !body.type?.trim()) throw new BadRequestException("Employee, dates, and leave type are required.");
    const employee =
      body.employeeId
        ? await this.resolveEmployee(tenant.id, body.employeeId)
        : null;
    if (!employee) {
      throw new BadRequestException("Employee not found.");
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) throw new BadRequestException("Leave dates are invalid.");
    const item = await this.prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        startDate,
        endDate,
        type: body.type.trim().toUpperCase(),
        status: this.normalizeLeaveStatus(body.status),
        reason: this.normalizeText(body.reason),
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("leave-requests/:leaveRequestId")
  @RequiresPermission("hr.employees.edit")
  async updateLeaveRequest(
    @Tenant() tenantId: string,
    @Param("leaveRequestId") leaveRequestId: string,
    @Body()
    body: {
      employeeId?: string;
      startDate?: string;
      endDate?: string;
      type?: string;
      status?: string;
      reason?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveRequestId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", leaveRequestId };
    }
    const employee = body.employeeId ? await this.resolveEmployee(tenant.id, body.employeeId) : null;
    const item = await this.prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        employeeId: employee?.id ?? existing.employeeId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        type: body.type ?? undefined,
        status: body.status ? this.normalizeLeaveStatus(body.status) : undefined,
        reason: this.normalizeText(body.reason),
      },
      include: { employee: true },
    });
    return { status: "updated", item };
  }

  @Post("leave-requests/:leaveRequestId/approve")
  @RequiresPermission("hr.employees.edit")
  async approveLeaveRequest(@Tenant() tenantId: string, @Param("leaveRequestId") leaveRequestId: string, @Body() body: { stage?: string; approverId?: string }) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.leaveRequest.findFirst({ where: { id: leaveRequestId, employee: { tenantId: tenant.id } } });
    if (!existing) return { status: "missing", leaveRequestId };
    const stage = body.stage?.toUpperCase() ?? existing.approvalStage;
    if (stage !== "MANAGER" && stage !== "HR") throw new BadRequestException("Approval stage must be MANAGER or HR.");
    const finalApproval = stage === "HR";
    const item = await this.prisma.leaveRequest.update({ where: { id: leaveRequestId }, data: { approvalStage: finalApproval ? "COMPLETE" : "HR", status: finalApproval ? "APPROVED" : "PENDING", managerApprovedAt: stage === "MANAGER" ? new Date() : existing.managerApprovedAt, hrApprovedAt: finalApproval ? new Date() : undefined, approvedBy: body.approverId } });
    return { status: finalApproval ? "approved" : "manager-approved", item };
  }

  @Delete("leave-requests/:leaveRequestId")
  @RequiresPermission("hr.employees.edit")
  async deleteLeaveRequest(@Tenant() tenantId: string, @Param("leaveRequestId") leaveRequestId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveRequestId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", leaveRequestId };
    }
    await this.prisma.leaveRequest.delete({ where: { id: leaveRequestId } });
    return { status: "deleted", leaveRequestId };
  }

  @Get("attendance")
  @RequiresPermission("attendance.view")
  async attendance(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { employee: { tenantId: tenant.id } };
    const [items, total] = await Promise.all([this.prisma.attendanceRecord.findMany({
      where,
      include: { employee: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: pagination.skip, take: pagination.take,
    }), this.prisma.attendanceRecord.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Post("attendance")
  @RequiresPermission("attendance.manage")
  async createAttendance(
    @Tenant() tenantId: string,
    @Body()
    body: {
      employeeId?: string;
      date?: string;
      status?: string;
      checkInAt?: string;
      checkOutAt?: string;
      notes?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!body.employeeId || !body.date) throw new BadRequestException("Employee and date are required.");
    const employee =
      body.employeeId
        ? await this.resolveEmployee(tenant.id, body.employeeId)
        : null;
    if (!employee) {
      throw new BadRequestException("Employee not found.");
    }
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Attendance date is invalid.");
    const existing = await this.prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: employee.id, date } } });
    if (existing) throw new BadRequestException("An attendance record already exists for this employee and date.");
    const item = await this.prisma.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        date,
        status: body.status?.toUpperCase() ?? "PRESENT",
        checkInAt: body.checkInAt ? new Date(body.checkInAt) : null,
        checkOutAt: body.checkOutAt ? new Date(body.checkOutAt) : null,
        notes: this.normalizeText(body.notes),
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("attendance/:attendanceId")
  @RequiresPermission("attendance.manage")
  async updateAttendance(
    @Tenant() tenantId: string,
    @Param("attendanceId") attendanceId: string,
    @Body()
    body: {
      employeeId?: string;
      date?: string;
      status?: string;
      checkInAt?: string | null;
      checkOutAt?: string | null;
      notes?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { id: attendanceId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", attendanceId };
    }
    const employee = body.employeeId ? await this.resolveEmployee(tenant.id, body.employeeId) : null;
    const item = await this.prisma.attendanceRecord.update({
      where: { id: attendanceId },
      data: {
        employeeId: employee?.id ?? existing.employeeId,
        date: body.date ? new Date(body.date) : undefined,
        status: body.status ?? undefined,
        checkInAt:
          body.checkInAt === undefined ? undefined : body.checkInAt === null || body.checkInAt === "" ? null : new Date(body.checkInAt),
        checkOutAt:
          body.checkOutAt === undefined ? undefined : body.checkOutAt === null || body.checkOutAt === "" ? null : new Date(body.checkOutAt),
        notes: this.normalizeText(body.notes),
      },
      include: { employee: true },
    });
    return { status: "updated", item };
  }

  @Delete("attendance/:attendanceId")
  @RequiresPermission("attendance.manage")
  async deleteAttendance(@Tenant() tenantId: string, @Param("attendanceId") attendanceId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { id: attendanceId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", attendanceId };
    }
    await this.prisma.attendanceRecord.delete({ where: { id: attendanceId } });
    return { status: "deleted", attendanceId };
  }

  @Get("payroll-runs")
  @RequiresPermission("hr.employees.view")
  async payrollRuns(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { employee: { tenantId: tenant.id } };
    const [items, total] = await Promise.all([this.prisma.payrollRun.findMany({
      where,
      include: { employee: true },
      orderBy: [{ payDate: "desc" }, { createdAt: "desc" }],
      skip: pagination.skip, take: pagination.take,
    }), this.prisma.payrollRun.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Post("payroll-runs")
  @RequiresPermission("hr.employees.edit")
  async createPayrollRun(
    @Tenant() tenantId: string,
    @Body()
    body: {
      employeeId?: string;
      periodLabel?: string;
      payDate?: string;
      grossAmount?: string | number;
      deductions?: string | number;
      netAmount?: string | number;
      status?: string;
      notes?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const employee =
      body.employeeId
        ? await this.resolveEmployee(tenant.id, body.employeeId)
        : await this.prisma.employee.findFirst({ where: { tenantId: tenant.id } });
    if (!employee) {
      return { status: "missing-employee" };
    }
    const grossAmount = Number(this.parseDecimal(body.grossAmount) ?? 0);
    const deductions = Number(this.parseDecimal(body.deductions) ?? 0);
    const netAmount = body.netAmount === undefined ? grossAmount - deductions : Number(this.parseDecimal(body.netAmount) ?? 0);
    const item = await this.prisma.payrollRun.create({
      data: {
        employeeId: employee.id,
        periodLabel: body.periodLabel ?? "Current Period",
        payDate: body.payDate ? new Date(body.payDate) : new Date(),
        grossAmount,
        deductions,
        netAmount,
        status: body.status ?? "DRAFT",
        notes: this.normalizeText(body.notes),
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("payroll-runs/:payrollRunId")
  @RequiresPermission("hr.employees.edit")
  async updatePayrollRun(
    @Tenant() tenantId: string,
    @Param("payrollRunId") payrollRunId: string,
    @Body()
    body: {
      employeeId?: string;
      periodLabel?: string;
      payDate?: string;
      grossAmount?: string | number | null;
      deductions?: string | number | null;
      netAmount?: string | number | null;
      status?: string;
      notes?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", payrollRunId };
    }
    const employee = body.employeeId ? await this.resolveEmployee(tenant.id, body.employeeId) : null;
    const grossAmount = body.grossAmount === undefined ? undefined : Number(this.parseDecimal(body.grossAmount) ?? 0);
    const deductions = body.deductions === undefined ? undefined : Number(this.parseDecimal(body.deductions) ?? 0);
    const netAmount = body.netAmount === undefined ? undefined : Number(this.parseDecimal(body.netAmount) ?? 0);

    const item = await this.prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        employeeId: employee?.id ?? existing.employeeId,
        periodLabel: body.periodLabel ?? undefined,
        payDate: body.payDate ? new Date(body.payDate) : undefined,
        grossAmount,
        deductions,
        netAmount,
        status: body.status ?? undefined,
        notes: this.normalizeText(body.notes),
      },
      include: { employee: true },
    });
    return { status: "updated", item };
  }

  @Delete("payroll-runs/:payrollRunId")
  @RequiresPermission("hr.employees.edit")
  async deletePayrollRun(@Tenant() tenantId: string, @Param("payrollRunId") payrollRunId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.payrollRun.findFirst({
      where: { id: payrollRunId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", payrollRunId };
    }
    await this.prisma.payrollRun.delete({ where: { id: payrollRunId } });
    return { status: "deleted", payrollRunId };
  }

  @Get("performance-reviews")
  @RequiresPermission("hr.employees.view")
  async performanceReviews(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { employee: { tenantId: tenant.id } };
    const [items, total] = await Promise.all([this.prisma.performanceReview.findMany({
      where,
      include: { employee: true },
      orderBy: [{ reviewDate: "desc" }, { createdAt: "desc" }],
      skip: pagination.skip, take: pagination.take,
    }), this.prisma.performanceReview.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Post("performance-reviews")
  @RequiresPermission("hr.employees.edit")
  async createPerformanceReview(
    @Tenant() tenantId: string,
    @Body()
    body: {
      employeeId?: string;
      reviewDate?: string;
      score?: number;
      reviewerName?: string;
      status?: string;
      summary?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const employee =
      body.employeeId
        ? await this.resolveEmployee(tenant.id, body.employeeId)
        : await this.prisma.employee.findFirst({ where: { tenantId: tenant.id } });
    if (!employee) {
      return { status: "missing-employee" };
    }
    const item = await this.prisma.performanceReview.create({
      data: {
        employeeId: employee.id,
        reviewDate: body.reviewDate ? new Date(body.reviewDate) : new Date(),
        score: body.score ?? null,
        reviewerName: this.normalizeText(body.reviewerName),
        status: body.status ?? "SCHEDULED",
        summary: this.normalizeText(body.summary),
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("performance-reviews/:reviewId")
  @RequiresPermission("hr.employees.edit")
  async updatePerformanceReview(
    @Tenant() tenantId: string,
    @Param("reviewId") reviewId: string,
    @Body()
    body: {
      employeeId?: string;
      reviewDate?: string;
      score?: number | null;
      reviewerName?: string | null;
      status?: string;
      summary?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.performanceReview.findFirst({
      where: { id: reviewId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", reviewId };
    }
    const employee = body.employeeId ? await this.resolveEmployee(tenant.id, body.employeeId) : null;
    const item = await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        employeeId: employee?.id ?? existing.employeeId,
        reviewDate: body.reviewDate ? new Date(body.reviewDate) : undefined,
        score: body.score === undefined ? undefined : body.score,
        reviewerName: this.normalizeText(body.reviewerName),
        status: body.status ?? undefined,
        summary: this.normalizeText(body.summary),
      },
      include: { employee: true },
    });
    return { status: "updated", item };
  }

  @Delete("performance-reviews/:reviewId")
  @RequiresPermission("hr.employees.edit")
  async deletePerformanceReview(@Tenant() tenantId: string, @Param("reviewId") reviewId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.performanceReview.findFirst({
      where: { id: reviewId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", reviewId };
    }
    await this.prisma.performanceReview.delete({ where: { id: reviewId } });
    return { status: "deleted", reviewId };
  }

  @Get("documents")
  @RequiresPermission("hr.employees.view")
  async documents(@Tenant() tenantId: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const pagination = this.pagination(page, pageSize); const where = { employee: { tenantId: tenant.id } };
    const [items, total] = await Promise.all([this.prisma.employeeDocument.findMany({
      where,
      include: { employee: true, uploadedBy: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ createdAt: "desc" }],
      skip: pagination.skip, take: pagination.take,
    }), this.prisma.employeeDocument.count({ where })]);
    return { tenantId: tenant.slug, items, meta: { page: pagination.page, pageSize: pagination.pageSize, total, pageCount: Math.ceil(total / pagination.pageSize) } };
  }

  @Post("documents")
  @RequiresPermission("hr.employees.edit")
  async createDocument(
    @Tenant() tenantId: string,
    @Req() request: { user: { sub: string } },
    @Body()
    body: {
      employeeId?: string;
      label?: string;
      category?: string;
      fileKey?: string;
      expiresAt?: string;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const employee =
      body.employeeId
        ? await this.resolveEmployee(tenant.id, body.employeeId)
        : await this.prisma.employee.findFirst({ where: { tenantId: tenant.id } });
    if (!employee) {
      return { status: "missing-employee" };
    }
    const item = await this.prisma.employeeDocument.create({
      data: {
        employeeId: employee.id,
        uploadedById: request.user.sub,
        label: body.label ?? "HR Document",
        category: this.normalizeText(body.category),
        fileKey: body.fileKey ?? "",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Post("documents/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const allowed = ["application/pdf", "image/png", "image/jpeg", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
        callback(null, allowed.includes(file.mimetype ?? ""));
      },
    }),
  )
  async uploadDocument(
    @Tenant() tenantId: string,
    @Req() request: { user: { sub: string } },
    @UploadedFile() file?: { buffer: Buffer; originalname: string; mimetype?: string; size?: number },
    @Body() body?: { employeeId?: string; label?: string; category?: string; expiresAt?: string },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    if (!file) throw new BadRequestException("A supported document file is required.");
    if (!body?.employeeId) throw new BadRequestException("Employee is required.");
    const employee = await this.resolveEmployee(tenant.id, body.employeeId);
    if (!employee) throw new BadRequestException("Employee not found.");
    const fileKey = await this.storage.put({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype ?? "application/octet-stream" });
    const item = await this.prisma.employeeDocument.create({
      data: { employeeId: employee.id, uploadedById: request.user.sub, label: body.label?.trim() || file.originalname, category: this.normalizeText(body.category), fileKey, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("documents/:documentId")
  @RequiresPermission("hr.employees.edit")
  async updateDocument(
    @Tenant() tenantId: string,
    @Param("documentId") documentId: string,
    @Body()
    body: {
      employeeId?: string;
      label?: string;
      category?: string | null;
      fileKey?: string;
      expiresAt?: string | null;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", documentId };
    }
    const employee = body.employeeId ? await this.resolveEmployee(tenant.id, body.employeeId) : null;
    const item = await this.prisma.employeeDocument.update({
      where: { id: documentId },
      data: {
        employeeId: employee?.id ?? existing.employeeId,
        label: body.label ?? undefined,
        category: this.normalizeText(body.category),
        fileKey: body.fileKey ?? undefined,
        expiresAt:
          body.expiresAt === undefined ? undefined : body.expiresAt === null || body.expiresAt === "" ? null : new Date(body.expiresAt),
      },
      include: { employee: true },
    });
    return { status: "updated", item };
  }

  @Delete("documents/:documentId")
  @RequiresPermission("hr.employees.edit")
  async deleteDocument(@Tenant() tenantId: string, @Param("documentId") documentId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", documentId };
    }
    if (!existing.fileKey.includes("://")) await this.storage.remove(existing.fileKey);
    await this.prisma.employeeDocument.delete({ where: { id: documentId } });
    return { status: "deleted", documentId };
  }

  @Get("documents/:documentId/download")
  @RequiresPermission("hr.employees.view")
  async downloadDocument(
    @Tenant() tenantId: string,
    @Param("documentId") documentId: string,
    @Res() response: { setHeader: (name: string, value: string) => void; end: (body: Buffer) => void },
  ) {
    await this.tenantService.ensureTenant(tenantId);
    const document = await this.prisma.employeeDocument.findFirst({ where: { id: documentId, employee: { tenantId } } });
    if (!document) throw new BadRequestException("Employee document not found.");
    const content = await this.storage.read(document.fileKey);
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename="${document.label.replace(/[^a-zA-Z0-9._-]/g, "-")}"`);
    response.end(content);
  }
}
