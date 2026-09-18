import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  LiveAttendancePage,
  LiveDocumentsPage,
  LiveEmployeesPage,
  LiveHr,
  LiveLeavePage,
  LivePayrollPage,
  LivePayslipsPage,
  LivePerformancePage,
} from "@/components/modules/live-hr";

const hrSubmodules: Record<string, { title: string; description: string }> = {
  employees: {
    title: "HR Employees",
    description: "Manage employee records, roles, departments, and live people data.",
  },
  leave: {
    title: "HR Leave",
    description: "Create, review, approve, and update leave requests inside the HR workspace.",
  },
  payroll: {
    title: "HR Payroll",
    description: "Prepare compensation records, payroll-related data, and workforce administration.",
  },
  payslips: {
    title: "HR Payslips",
    description: "Generate and download branded employee payslips from payroll records.",
  },
  attendance: {
    title: "HR Attendance",
    description: "Monitor presence, time-related operations, and workforce attendance status.",
  },
  performance: {
    title: "HR Performance",
    description: "Run employee reviews, feedback cycles, and performance tracking workflows.",
  },
  documents: {
    title: "HR Documents",
    description: "Manage employee contracts, IDs, compliance files, and supporting records.",
  },
};

export default async function HrSubmodulePage({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  const content = hrSubmodules[submodule];

  if (!content) {
    notFound();
  }

  const pageContent = {
    employees: <LiveEmployeesPage />,
    leave: <LiveLeavePage />,
    payroll: <LivePayrollPage />,
    payslips: <LivePayslipsPage />,
    attendance: <LiveAttendancePage />,
    performance: <LivePerformancePage />,
    documents: <LiveDocumentsPage />,
  }[submodule] ?? <LiveHr />;

  return (
    <AppShell title={content.title} description={content.description}>
      {pageContent}
    </AppShell>
  );
}
