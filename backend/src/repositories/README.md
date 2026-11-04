# Repositories (data access layer)

Repositories are the only code that calls Prisma Client. Services hold the business rules and call repository functions; routes call services.

```
routes  ->  services  ->  repositories  ->  Prisma Client (src/db/prisma.ts)  ->  PostgreSQL
```

Conventions:
- One file per data area (users, courses, questions, exams, attempts, …). A function does one query, or a small fixed group of queries, and is named after what it returns or changes.
- Every function takes an optional last argument `db: Db = prisma`. Inside a transaction, the service passes the transaction handle (`tx`), so several repository calls succeed or fail together. Services only pass `tx` along; they never query with it.
- No business rules here: permission checks, validation and status decisions stay in the services.
- `src/db/` also talks to the database, for infrastructure only: the client, transactions, the clock sync and the health check.
