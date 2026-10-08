// Crea un usuario (o imprime solo el hash de una contraseña) desde la línea de comandos. Es la forma
// de dar de alta al PRIMER administrador de una organización (la API de usuarios exige uno).
//
//   node --env-file=.env scripts/crear-usuario.ts --organizacion escuela-demo \
//        --correo admin@ejemplo.com --nombre "Ana Pérez" --rol administrador
//   (la contraseña se lee de la variable CONTRASENA o se pide por la terminal)
//
//   node scripts/crear-usuario.ts --solo-hash        imprime el hash de la contraseña y termina
//
// Reglas: la política de contraseñas es la de la API (≥ 10 caracteres). Si el correo ya existe en la
// organización, no hace nada y sale con error.

import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { hashContrasena, problemasDeContrasena } from "../src/auth/contrasena.ts";
import { altaConAlcance, conAlcance } from "../src/datos/alcance.ts";
import { crearPrisma } from "../src/datos/prisma.ts";
import { resolverOrganizacionPorSlug } from "../src/datos/sistema.ts";
import { ROLES, esRol } from "../src/auth/roles.ts";

const { values } = parseArgs({
  options: {
    organizacion: { type: "string" },
    correo: { type: "string" },
    nombre: { type: "string" },
    rol: { type: "string", default: "administrador" },
    "solo-hash": { type: "boolean", default: false },
  },
});

async function leerContrasena(): Promise<string> {
  const deEntorno = process.env["CONTRASENA"];
  if (deEntorno) return deEntorno;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question("Contraseña: ");
  } finally {
    rl.close();
  }
}

const contrasena = await leerContrasena();

if (values["solo-hash"]) {
  console.log(await hashContrasena(contrasena));
  process.exit(0);
}

const { organizacion: slug, correo, nombre, rol } = values;
if (!slug || !correo || !nombre) throw new Error("Faltan --organizacion, --correo y --nombre");
if (!esRol(rol)) throw new Error(`--rol debe ser uno de: ${ROLES.join(", ")}`);
const problemas = problemasDeContrasena(contrasena, { correo, nombre });
if (problemas.length > 0) throw new Error(problemas.join("; "));

const prisma = crearPrisma();
try {
  const org = await resolverOrganizacionPorSlug(prisma, slug);
  if (!org) throw new Error(`No existe la organización «${slug}»`);
  const db = conAlcance(prisma, org.id);
  const normal = correo.trim().toLowerCase();
  if (await db.usuario.findFirst({ where: { correo: normal }, select: { id: true } })) throw new Error(`Ya existe un usuario con el correo ${normal}`);
  const u = await db.usuario.create({
    data: altaConAlcance({ correo: normal, nombre, rol, contrasena_hash: await hashContrasena(contrasena) }),
    select: { id: true },
  });
  console.log(`Usuario creado: ${u.id} (${rol})`);
} finally {
  await prisma.$disconnect();
}
