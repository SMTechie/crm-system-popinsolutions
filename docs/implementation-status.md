# Implementation status

The platform is a modular monorepo with a Next.js web application, NestJS API, and PostgreSQL/Prisma persistence.

Implemented foundation:

- Tenant-scoped Prisma data model for users, RBAC roles/permissions, sessions, departments, CRM, accounting, HR, attendance, assets, projects, tasks, time entries, notifications, audit logs, and integrations.
- CRM and supplier records include configurable customer/supplier numbers, South African VAT and registration identifiers, contact/address details, notes, source/status, and supplier banking information.
- Employee records include tenant-scoped employee numbers, personal and emergency-contact details, employment dates/type, salary, and protected banking fields for HR administration.
- Employee documents record the uploading user alongside employee, category, file, and expiry metadata; upload and manual document creation both populate uploader attribution.
- Invoices and expenses support tenant-validated project/department dimensions, and P&L, cash-flow, and VAT reports accept `projectId` and `departmentId` filters.
- The accounting reports screen exposes date, department, and project filters and carries them through to live report queries and exports.
- Password hashing, signed access tokens, protected API routes, account status checks, tenant mismatch protection, OAuth authorization/callback exchange, and last-login tracking.
- Authentication can issue and consume HttpOnly `popin_access`/`popin_refresh` cookies; set `AUTH_COOKIE_SECURE=true` in HTTPS production deployments. Bearer headers remain supported for API clients and local compatibility.
- Organisation-configurable access-token lifetime (with `ACCESS_TOKEN_TTL_SECONDS` fallback), refresh-token rotation, and session expiration enforcement.
- Reusable Zod request validation is applied to login, signup, password reset, email verification, and OAuth token exchange inputs.
- Billing configuration, checkout, portal, and subscription sync actions now require the server-side `settings.manage` permission in addition to authentication and module access.
- Configured SMTP email delivery is available through the shared email service for account verification and password-reset notifications; credentials are never returned in production responses.
- Idempotent operational notification refresh covers overdue invoices/tasks, expiring asset warranties and employee documents, and missing attendance clock-outs.
- Accounting reporting endpoints now include trial balance, profit and loss, balance sheet, general ledger, accounts receivable/payable, cash flow, VAT, customer statements, and supplier statements; expenses also carry approval workflow statuses.
- Major CRM, accounting, HR, operations, assets, users, projects, and tasks list endpoints use bounded server-side pagination and return total/page metadata while retaining the existing `items` response shape.
- Real API operations for assets, asset assignment/return, projects, tasks, notifications, and employee attendance.
- Asset and organisation attendance QR endpoints return printable QR image data URLs as well as signed scan URLs; attendance QR tokens are validated during QR clock-in.
- Asset and attendance screens expose authorised QR generation and display, including printable organisation attendance codes.
- Automatic balanced journal posting for invoices, payments, and approved/paid expenses, plus an idempotent `db:backfill-accounting` command for existing records. Expense status transitions protect posted amounts from unsafe edits.
- New customers, suppliers, invoices, and quote conversions receive tenant-scoped sequential identifiers (`CUS-000001`, `SUP-000001`, and the configured invoice prefix with six digits) unless an explicit number is supplied.
- Posted invoice financial values and posted payment/expense records are protected from direct mutation or deletion; users must use reversal, adjustment, credit-note, or replacement workflows.
- Server-generated invoice PDFs at `GET /api/v1/accounting/invoices/:invoiceId/pdf`, with tenant-scoped download controls.
- Validated CSV imports for contacts, employees, suppliers/vendors, and assets, including row-level errors and duplicate checks for employee emails and asset tags.
- CSV exports now cover contacts, employees, assets, invoices, and date-filterable profit-and-loss, cash-flow, and VAT summaries.
- PDF exports are available for all financial report families at `/accounting/reports/:report/pdf`, with customer/vendor query parameters for statements and date filtering where applicable.
- Encrypted server-side integration configuration, HMAC-validated website webhooks, signed one-time OAuth login codes, duplicate-event detection, integration logs, and retrying manual website sync with external contact IDs.
- S3-compatible attachment storage (including Cloudflare R2 through a custom endpoint) with local development fallback and provider-aware cleanup.
- `.env.example` files, Docker Compose PostgreSQL/Redis services, and module navigation in the web app.
- Production Dockerfiles use the locked dependency graph and generate the Prisma client during the API image build; `vercel.json` defines the Next.js monorepo build.
- Both Docker images have been built successfully from a clean, minimized build context (`popin-api-check` and `popin-web-check`).
- Public `/api/v1/health` readiness endpoint and Docker health checks.

## Database setup

Copy `.env.example` to `apps/api/.env`, set `DATABASE_URL`, then run:

```bash
npm install
npm run db:generate -w apps/api
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name foundation
npm run db:seed -w apps/api
npm run db:backfill-accounting -w apps/api
```

For an existing Neon database without migration history, first review the generated `apps/api/prisma/migrations/0001_foundation/migration.sql`, then apply the schema with `prisma db push --accept-data-loss=false`. After verifying the database, baseline the migration history with `prisma migrate resolve --applied 0001_foundation`, and run the seed. `migrate deploy` is then safe for future migrations. Do not mark the migration applied before the schema has been synchronized.

The checked-in migrations were generated from the current schema. The configured Neon database has been synchronized, migrations `0001_foundation` through `0008_employee_document_uploader` have been applied, and `prisma migrate status` reports the database schema is up to date.

## Website integration

The adapter boundary is ready at `/api/v1/integrations`. Configure a provider server-side using `POST /integrations/website/configure`, test it with `POST /integrations/website/test`, and send signed events to `POST /integrations/website/webhook` with `x-tenant-id` and `x-webhook-signature`. Event IDs are persisted to prevent duplicate processing. A website URL is still required before an assessment or provider-specific sync mapping can be implemented.

## OAuth configuration

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, and `MICROSOFT_CLIENT_SECRET`, and register the callback URLs `/api/v1/auth/oauth/google/callback` and `/api/v1/auth/oauth/microsoft/callback`. OAuth only signs in existing active CRM users whose email is linked to the requested workspace; it does not silently provision accounts.

## Verification

```bash
npm run lint
npm run build
```

The API and web packages currently pass TypeScript checks. Business tests run with `npm test`. HTTP integration tests run with `npm run start -w apps/api` in one terminal and `npm run test:integration -w apps/api` in another; they cover authentication, tenant isolation, customer creation, invoice/payment, leave approval, asset assignment, and clock-in/clock-out, and clean up their test records.

For Vercel, point the project at the repository root. The root Next.js application serves the NestJS API through the catch-all function under `/api/*`; set `NEXT_PUBLIC_API_URL=/api/v1` or leave it unset to use the production same-origin default. Configure the API's database, JWT, CORS, and object-storage variables in the same Vercel project. Persistent uploads must use `STORAGE_PROVIDER=s3` (or `r2`) and the storage bucket/key/secret/endpoint variables in production. `STORAGE_PUBLIC_BASE_URL` is optional when the bucket is publicly readable; otherwise the API should be extended with authenticated download URLs before exposing private attachments. The API Dockerfile remains available for a separate Node service deployment.
