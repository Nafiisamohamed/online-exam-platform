// Prisma CLI configuration (migrations, status, diff).
//
// The CLI connects with MIGRATE_DATABASE_URL: the database OWNER, used only for
// migrations from an administrator's machine. The Express application uses
// DATABASE_URL (the restricted exam_app role) through Prisma Client instead.
// Both are read from backend/.env (copy .env.example to .env first).
//
// MIGRATE_DATABASE_URL is optional here so that `prisma generate` and
// `prisma validate` also work on the application server, where the owner
// credentials must not exist. Commands that connect to a database (migrate,
// status, diff) fail with a clear error when it is missing.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrateUrl = process.env.MIGRATE_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(migrateUrl ? { datasource: { url: migrateUrl } } : {}),
});
