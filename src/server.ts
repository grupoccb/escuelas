import { crearPrisma } from "./db.ts";
import { crearApp } from "./http/app.ts";

const prisma = crearPrisma();
const app = crearApp({
  pingDb: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

const port = Number(process.env["PORT"] ?? 3000);
const server = app.listen(port, () => {
  console.log(`backend escuchando en :${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
