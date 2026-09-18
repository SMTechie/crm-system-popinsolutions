# Pop In Solutions CRM Platform

Enterprise-grade modular CRM foundation for Pop In Solutions.

## What is included

- Root Next.js App Router frontend with dashboards for CRM, Accounting, HR, and a working custom form builder experience.
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

## Deploying to Vercel

Deploy the repository root as a Next.js project. The root `vercel.json` uses the root `next` build directly and exposes the NestJS API through the Vercel catch-all function at `/api/*`.

Set this required Vercel environment variable for Production, Preview, and Development:

```text
NEXT_PUBLIC_API_URL=https://your-api-domain.example.com/api/v1
```

For the unified Vercel deployment, configure the API variables in the same Vercel project: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `WEB_APP_URL` (the Vercel URL), `APP_BASE_URL` (the same Vercel URL), and production object storage variables. Do not use local file storage in production. The API Dockerfile remains available for a separate Node/Docker deployment if required.

The web production build can be verified locally with `npm run build`; the API build uses `npm run build:api`.
