# Website Integration Assessment

Status: pending website URL and access details.

The CRM now has a provider adapter boundary, encrypted server-side configuration, connection testing, sync-log persistence, and HMAC webhook verification. No website-specific API, authentication mechanism, endpoints, webhooks, data mapping, or source-of-truth rules have been assumed.

When the URL is supplied, assess and document:

1. Platform and technology
2. Official API and authentication
3. Read/write endpoints and webhook events
4. Forms, enquiries, customers, orders, bookings, or registrations available
5. Recommended API/secure endpoint method
6. CRM-to-website data mapping and duplicate keys
7. Source of truth per field
8. Sync frequency, pagination, rate limits, retries, and idempotency
9. Required website backend changes
10. Security and secret-storage controls
