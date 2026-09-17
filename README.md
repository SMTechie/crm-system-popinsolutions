# Pop In Solutions CRM Platform

Enterprise-grade modular CRM foundation for Pop In Solutions.

## What is included

- `apps/web`: Next.js App Router frontend with dashboards for CRM, Accounting, HR, and a working custom form builder experience.
- `apps/api`: NestJS service skeleton with multi-tenant-ready modules and API contracts.
- `apps/api/prisma/schema.prisma`: PostgreSQL schema for CRM, accounting, HR, workflows, forms, files, and audit logging.
- `docs/`: Architecture, frontend structure, and API design documentation.
- `.github/workflows/ci.yml`: Starter CI pipeline for lint/build checks.

## Run locally

Use `npm.cmd` on Windows PowerShell if `npm` script execution is restricted.

```bash
npm.cmd install
npm.cmd run dev:web
npm.cmd run dev:api
```

## Product direction

This scaffold is designed as a business operating system with:

- Multi-tenancy and RBAC
- CRM, accounting, HR, automation, and form builder modules
- Public form capture and workflow triggers
- Modular dashboards and extensible data models

See [docs/implementation-status.md](docs/implementation-status.md) for database setup, integration boundaries, and verification instructions.
