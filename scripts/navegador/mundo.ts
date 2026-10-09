// El mundo de datos de las pruebas en navegador: una organización con dos sucursales, un usuario por rol, el catálogo mínimo y, por bloque de la etapa J,
// lo que cada pantalla necesita. Todo ficticio (nombres genéricos, teléfonos de prueba, sin datos reales). Los tests lo leen de `.tmp/navegador/mundo.json`.
//
// Para agregar datos de una pantalla nueva: una función `sembrar<Pantalla>` aquí que devuelva los ids que el test necesita, y su campo en `Mundo`.

import type { Rol } from "../../src/auth/roles.ts";
import type { Mundo, UsuarioDelMundo } from "./tipos.ts";

export type { Mundo, UsuarioDelMundo };
import { CONTRASENA_DE_PRUEBA, sembrarUsuario, type ClienteApi } from "../../src/testutil/api.ts";
import type { PrismaPruebas } from "../../src/testutil/prisma-pruebas.ts";
import { sembrarDocumentosLegales, sembrarEmbudo, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../../src/testutil/semilla.ts";

/** Los siete días de la semana a las 16:00–17:00: así cualquier día es una sesión del grupo (el pase de ayer y la próxima clase muestra existen siempre). */
const TODOS_LOS_DIAS: [number, number, number][] = [0, 1, 2, 3, 4, 5, 6].map((d) => [d, 960, 1020]);

async function usuario(prisma: PrismaPruebas, org: OrganizacionDePrueba, rol: Rol, nombre: string, correo: string, sucursales: string[]): Promise<UsuarioDelMundo> {
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol, nombre, correo, contrasena: CONTRASENA_DE_PRUEBA, sucursales });
  return { id: u.id, correo: u.correo, contrasena: u.contrasena, nombre, rol };
}

export async function sembrarMundo(prisma: PrismaPruebas, _nuevoCliente: () => ClienteApi, base: string): Promise<Mundo> {
  const org = await sembrarOrganizacion(prisma, "Escuela de prueba");
  const etapas = await sembrarEmbudo(prisma, org);
  await sembrarDocumentosLegales(prisma, org);
  const norte = org.sucursales[0]!;
  const sur = org.sucursales[1]!;

  const administrador = await usuario(prisma, org, "administrador", "Adela Administradora", "admin@navegador.test", []);
  const asesor = await usuario(prisma, org, "asesor", "Alba Asesora", "asesor@navegador.test", [norte.id]);
  const maestro = await usuario(prisma, org, "maestro", "Mario Maestro", "maestro@navegador.test", []);
  const recepcion = await usuario(prisma, org, "recepcion", "Rita Recepción", "recepcion@navegador.test", [norte.id, sur.id]);
  const bloqueable = await usuario(prisma, org, "asesor", "Berta Bloqueable", "bloqueable@navegador.test", [norte.id]);

  const instructor = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: maestro.id, nombre: maestro.nombre } });
  const programa = await sembrarPrograma(prisma, org, {
    sucursalId: norte.id,
    nombre: "Programa de prueba",
    edadMin: 3,
    edadMax: 14,
    grupos: [
      { nombre: "Grupo A", cupoMaximo: 8, horarios: TODOS_LOS_DIAS },
      { nombre: "Grupo B", cupoMaximo: 8, horarios: TODOS_LOS_DIAS },
    ],
    precio: { inscripcion: "500.00", mensualidad: "1000.00", desde: "2020-01-01" },
  });
  const [grupoA, grupoB] = programa.grupos as [{ id: string; nombre: string }, { id: string; nombre: string }];
  await prisma.grupo.update({ where: { id: grupoA.id }, data: { instructor_id: instructor.id } });

  return {
    base,
    organizacion: { id: org.organizacionId, slug: org.slug },
    usuarios: { administrador, asesor, maestro, recepcion, bloqueable },
    sucursales: { norte, sur },
    verticalId: org.verticalId,
    etapas,
    programaId: programa.id,
    grupos: { a: grupoA, b: grupoB },
    instructorId: instructor.id,
  };
}
