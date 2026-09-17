import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async createOnce(input: { tenantId: string; userId: string; type: string; title: string; body: string }) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const existing = await this.prisma.notification.findFirst({ where: { tenantId: input.tenantId, userId: input.userId, type: input.type, title: input.title, createdAt: { gte: since } }, select: { id: true } });
    if (existing) return false;
    await this.prisma.notification.create({ data: input });
    return true;
  }

  async refreshTenant(tenantId: string) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [users, invoices, tasks, assets, documents, attendance] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId, status: "ACTIVE" }, select: { id: true } }),
      this.prisma.invoice.findMany({ where: { tenantId, status: { notIn: ["PAID", "VOID"] }, dueAt: { lt: now } }, select: { id: true, number: true, total: true } }),
      this.prisma.task.findMany({ where: { tenantId, status: { not: "COMPLETED" }, dueDate: { lt: now }, assignedUserId: { not: null } }, select: { id: true, title: true, assignedUserId: true } }),
      this.prisma.asset.findMany({ where: { tenantId, warrantyExpiry: { gte: now, lte: horizon } }, select: { id: true, name: true, warrantyExpiry: true } }),
      this.prisma.employeeDocument.findMany({ where: { employee: { tenantId }, expiresAt: { gte: now, lte: horizon } }, select: { id: true, label: true, expiresAt: true, employee: { select: { userId: true } } } }),
      this.prisma.attendanceRecord.findMany({ where: { employee: { tenantId }, date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, checkInAt: { not: null }, checkOutAt: null }, select: { id: true, employee: { select: { userId: true, fullName: true } } } }),
    ]);
    let created = 0;
    for (const invoice of invoices) for (const user of users) if (await this.createOnce({ tenantId, userId: user.id, type: "INVOICE_OVERDUE", title: `Invoice overdue: ${invoice.number}`, body: `${invoice.number} is overdue with a balance of ${invoice.total}.` })) created += 1;
    for (const task of tasks) if (task.assignedUserId && await this.createOnce({ tenantId, userId: task.assignedUserId, type: "TASK_OVERDUE", title: `Task overdue: ${task.title}`, body: `The task “${task.title}” is past its due date.` })) created += 1;
    for (const asset of assets) for (const user of users) if (await this.createOnce({ tenantId, userId: user.id, type: "ASSET_WARRANTY_EXPIRING", title: `Warranty expiring: ${asset.name}`, body: `The warranty for ${asset.name} expires on ${asset.warrantyExpiry?.toISOString().slice(0, 10)}.` })) created += 1;
    for (const document of documents) if (document.employee.userId && await this.createOnce({ tenantId, userId: document.employee.userId, type: "DOCUMENT_EXPIRING", title: `Document expiring: ${document.label}`, body: `${document.label} expires on ${document.expiresAt?.toISOString().slice(0, 10)}.` })) created += 1;
    for (const record of attendance) if (record.employee.userId && await this.createOnce({ tenantId, userId: record.employee.userId, type: "ATTENDANCE_MISSING_CLOCK_OUT", title: "Attendance issue: missing clock-out", body: `${record.employee.fullName} has not clocked out today.` })) created += 1;
    return { created, checked: { invoices: invoices.length, tasks: tasks.length, assets: assets.length, documents: documents.length, attendance: attendance.length } };
  }
}
