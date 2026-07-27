# Production Checklist

- `NODE_ENV=production` is set.
- `JWT_SECRET` is unique and at least 32 characters.
- `ENCRYPTION_KEY` is unique and at least 32 characters.
- `DATABASE_URL` points to managed PostgreSQL with backups.
- `FRONTEND_URL` is the deployed web origin.
- Cashfree credentials are production credentials.
- Database migrations have been applied.
- `pnpm --filter smart-school-api test` passes.
- `pnpm --filter web lint` passes.
- `pnpm --filter web build` passes.
- `/health` returns `200`.
- `/ready` returns `200` after DB connectivity is verified.
- Admin account creation is controlled and staff accounts are admin-created.
- Audit logs are checked for redaction before launch.