import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 no lee .env por su cuenta. En docker y en CI la variable ya viene del entorno.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Vacía basta para `prisma generate` (build sin base); migrate y el runtime sí la exigen.
  datasource: { url: process.env["DATABASE_URL"] ?? "" },
});
