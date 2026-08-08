import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { LeaveStatus } from "@prisma/client";
import { ModuleAccess } from "../../common/decorators/module-access.decorator";
import { Tenant } from "../../common/decorators/tenant.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ModuleAccessGuard } from "../../common/guards/module-access.guard";
import { TenantService } from "../../common/services/tenant.service";
import { PrismaService } from "../../prisma/prisma.service";

@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@ModuleAccess("hr")
@Controller("hr")
export class HrController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

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
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async resolveEmployee(tenantId: string, employeeId?: string | null) {
    if (!employeeId) return null;
    return this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId },
    });
  }

  @Get("overview")
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
  async employees(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.employee.findMany({
      where: { tenantId: tenant.id },
      include: {
        _count: {
          select: {
            leaveRequests: true,
            documents: true,
            attendanceRecords: true,
            payrollRuns: true,
            performanceReviews: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Post("employees")
  async createEmployee(
    @Tenant() tenantId: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string;
      title?: string;
      department?: string;
      location?: string;
      managerName?: string;
      employmentStatus?: string;
      startDate?: string;
      salaryAmount?: string | number;
    },
  ) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const item = await this.prisma.employee.create({
      data: {
        tenantId: tenant.id,
        fullName: body.fullName ?? `Employee ${Date.now()}`,
        email: body.email ?? `employee+${Date.now()}@popinsolutions.co.za`,
        phone: this.normalizeText(body.phone),
        title: body.title ?? "Operations Analyst",
        department: this.normalizeText(body.department),
        location: this.normalizeText(body.location),
        managerName: this.normalizeText(body.managerName),
        employmentStatus: body.employmentStatus ?? "ACTIVE",
        startDate: body.startDate ? new Date(body.startDate) : null,
        salaryAmount: this.parseDecimal(body.salaryAmount),
      },
    });
    return { status: "created", item };
  }

  @Patch("employees/:employeeId")
  async updateEmployee(
    @Tenant() tenantId: string,
    @Param("employeeId") employeeId: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string | null;
      title?: string;
      department?: string | null;
      location?: string | null;
      managerName?: string | null;
      employmentStatus?: string | null;
      startDate?: string | null;
      salaryAmount?: string | number | null;
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
        fullName: body.fullName ?? undefined,
        email: body.email ?? undefined,
        phone: this.normalizeText(body.phone),
        title: body.title ?? undefined,
        department: this.normalizeText(body.department),
        location: this.normalizeText(body.location),
        managerName: this.normalizeText(body.managerName),
        employmentStatus: this.normalizeText(body.employmentStatus),
        startDate:
          body.startDate === undefined ? undefined : body.startDate === null || body.startDate === "" ? null : new Date(body.startDate),
        salaryAmount: this.parseDecimal(body.salaryAmount),
      },
    });
    return { status: "updated", item };
  }

  @Delete("employees/:employeeId")
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
  async leaveRequests(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.leaveRequest.findMany({
      where: { employee: { tenantId: tenant.id } },
      include: { employee: true },
      orderBy: { startDate: "desc" },
    });
    return { tenantId: tenant.slug, items };
  }

  @Post("leave-requests")
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
    const employee =
      body.employeeId
        ? await this.resolveEmployee(tenant.id, body.employeeId)
        : await this.prisma.employee.findFirst({ where: { tenantId: tenant.id } });
    if (!employee) {
      return { status: "missing-employee" };
    }
    const item = await this.prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        endDate: body.endDate ? new Date(body.endDate) : new Date(Date.now() + 1000 * 60 * 60 * 24),
        type: body.type ?? "PTO",
        status: this.normalizeLeaveStatus(body.status),
        reason: this.normalizeText(body.reason),
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("leave-requests/:leaveRequestId")
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

  @Delete("leave-requests/:leaveRequestId")
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
  async attendance(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.attendanceRecord.findMany({
      where: { employee: { tenantId: tenant.id } },
      include: { employee: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return { tenantId: tenant.slug, items };
  }

  @Post("attendance")
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
    const employee =
      body.employeeId
        ? await this.resolveEmployee(tenant.id, body.employeeId)
        : await this.prisma.employee.findFirst({ where: { tenantId: tenant.id } });
    if (!employee) {
      return { status: "missing-employee" };
    }
    const item = await this.prisma.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        date: body.date ? new Date(body.date) : new Date(),
        status: body.status ?? "PRESENT",
        checkInAt: body.checkInAt ? new Date(body.checkInAt) : null,
        checkOutAt: body.checkOutAt ? new Date(body.checkOutAt) : null,
        notes: this.normalizeText(body.notes),
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("attendance/:attendanceId")
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
  async payrollRuns(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.payrollRun.findMany({
      where: { employee: { tenantId: tenant.id } },
      include: { employee: true },
      orderBy: [{ payDate: "desc" }, { createdAt: "desc" }],
    });
    return { tenantId: tenant.slug, items };
  }

  @Post("payroll-runs")
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
  async performanceReviews(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.performanceReview.findMany({
      where: { employee: { tenantId: tenant.id } },
      include: { employee: true },
      orderBy: [{ reviewDate: "desc" }, { createdAt: "desc" }],
    });
    return { tenantId: tenant.slug, items };
  }

  @Post("performance-reviews")
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
  async documents(@Tenant() tenantId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const items = await this.prisma.employeeDocument.findMany({
      where: { employee: { tenantId: tenant.id } },
      include: { employee: true },
      orderBy: [{ createdAt: "desc" }],
    });
    return { tenantId: tenant.slug, items };
  }

  @Post("documents")
  async createDocument(
    @Tenant() tenantId: string,
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
        label: body.label ?? "HR Document",
        category: this.normalizeText(body.category),
        fileKey: body.fileKey ?? "",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      include: { employee: true },
    });
    return { status: "created", item };
  }

  @Patch("documents/:documentId")
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
  async deleteDocument(@Tenant() tenantId: string, @Param("documentId") documentId: string) {
    const tenant = await this.tenantService.ensureTenant(tenantId);
    const existing = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, employee: { tenantId: tenant.id } },
    });
    if (!existing) {
      return { status: "missing", documentId };
    }
    await this.prisma.employeeDocument.delete({ where: { id: documentId } });
    return { status: "deleted", documentId };
  }
}
