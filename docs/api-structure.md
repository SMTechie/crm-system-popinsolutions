# API Structure

## Base conventions

- REST base path: `/api/v1`
- GraphQL endpoint: `/api/graphql`
- Tenant resolution: `X-Tenant-Id` header or subdomain mapping
- Auth: `Authorization: Bearer <token>`

## Core REST endpoints

### Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/oauth/google`
- `GET /api/v1/auth/oauth/microsoft`

### CRM

- `GET /api/v1/crm/overview`
- `GET /api/v1/crm/contacts`
- `POST /api/v1/crm/contacts`
- `GET /api/v1/crm/companies`
- `GET /api/v1/crm/deals`
- `POST /api/v1/crm/deals`
- `GET /api/v1/crm/pipelines`
- `POST /api/v1/crm/activities`

### Accounting

- `GET /api/v1/accounting/overview`
- `GET /api/v1/accounting/invoices`
- `POST /api/v1/accounting/invoices`
- `GET /api/v1/accounting/expenses`
- `POST /api/v1/accounting/payments/webhook/stripe`

### HR

- `GET /api/v1/hr/overview`
- `GET /api/v1/hr/employees`
- `POST /api/v1/hr/employees`
- `GET /api/v1/hr/leave-requests`
- `POST /api/v1/hr/attendance/check-in`

### Forms

- `GET /api/v1/forms`
- `POST /api/v1/forms`
- `POST /api/v1/forms/:formId/publish`
- `GET /api/v1/forms/public/:slug`
- `POST /api/v1/forms/public/:slug/responses`

### Workflows

- `GET /api/v1/workflows`
- `POST /api/v1/workflows`
- `POST /api/v1/workflows/:workflowId/test`

## GraphQL domains

- `crmDashboard(tenantId: ID!): CrmOverview`
- `formTemplates(module: String): [FormTemplate!]!`
- `dashboardWidgets(dashboardId: ID!): [DashboardWidget!]!`
- `workflowExecutions(workflowId: ID!): [WorkflowExecution!]!`

