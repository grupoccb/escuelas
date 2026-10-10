// V10 / EC-23 y ED-15: lo que el bot calcula en CADA mensaje no hace una consulta por grupo ni por sesión.
//   · EC-23: el catálogo cotizable cuenta los lugares ocupados de todos los grupos con UNA consulta (antes, un `count` por grupo).
//   · ED-15: las sesiones de un grupo con sus lugares cuentan las clases muestra agendadas con UNA consulta (antes, un `count` por sesión, hasta 60).
// Las pruebas cuentan las consultas que llegan a Prisma (ganchos) y, además, comparan el resultado con la cuenta grupo por grupo / sesión por sesión.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conGanchos } from "../testutil/carrera.ts";
import { sembrarAlumno, sembrarEmbudo, sembrarMotivoBaja, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { sembrarUsuario } from "../testutil/api.ts";
import { cargarCatalogoCotizable } from "../cotizador/cargar.ts";
import { proximasSesionesConLugar } from "../clases-muestra/agenda.ts";
import { InscripcionesActivas, ocupadosDeVarios, SinInscripciones } from "./cupo.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let programaId = "";
let grupos: { id: string; nombre: string }[] = [];

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Consultas por mensaje");
  await sembrarEmbudo(prisma, org);
  const p = await sembrarPrograma(prisma, org, {
    sucursalId: org.sucursales[0]!.id,
    nombre: "Programa N",
    edadMin: 3,
    edadMax: 14,
    precio: { inscripcion: "100.00", mensualidad: "500.00" },
    grupos: Array.from({ length: 6 }, (_, i) => ({ nombre: `Grupo ${i + 1}`, cupoMaximo: 10, horarios: [[1, 960 + i, 1020 + i], [3, 960 + i, 1020 + i]] as [number, number, number][] })),
  });
  programaId = p.id;
  grupos = p.grupos;
  // Inscripciones activas, una congelada y una baja (no cuentan): el grupo 1 tiene 2 activas, el 3 tiene 1, el resto 0.
  const nueva = async (grupoId: string, estatus: "activa" | "congelada" | "baja") => {
    const a = await sembrarAlumno(prisma, org);
    await prisma.inscripcion.create({
      data: { organizacion_id: org.organizacionId, alumno_id: a.alumnoId, programa_id: programaId, grupo_id: grupoId, fecha_inscripcion: new Date("2026-09-01"), fecha_inicio: new Date("2026-09-01"), precio_inscripcion_aplicado: "1.00", precio_mensualidad_aplicado: "1.00", dia_corte_pago: 5, estatus, ...(estatus === "baja" ? { fecha_baja: new Date("2026-09-20"), motivo_baja_id: await sembrarMotivoBaja(prisma, org) } : {}), ...(estatus === "congelada" ? { congelada_desde: new Date("2026-09-20") } : {}) },
    });
  };
  await nueva(grupos[0]!.id, "activa");
  await nueva(grupos[0]!.id, "activa");
  await nueva(grupos[0]!.id, "congelada");
  await nueva(grupos[2]!.id, "activa");
  await nueva(grupos[2]!.id, "baja");
});

after(async () => {
  await prisma.$disconnect();
});

test("EC-23: los ocupados de todos los grupos salen en UNA consulta y coinciden con la cuenta de cada grupo", async () => {
  const consultas = { contar: 0, agrupar: 0 };
  const raiz = conGanchos(
    prisma,
    { modelo: "inscripcion", operacion: "count", antes: async () => void (consultas.contar += 1) },
    { modelo: "inscripcion", operacion: "groupBy", antes: async () => void (consultas.agrupar += 1) },
  );
  const db = conAlcance(raiz, org.organizacionId);
  const cat = await cargarCatalogoCotizable(db, { verticalId: org.verticalId, fecha: "2026-10-12" });
  const ocupados = Object.fromEntries(cat.programas.flatMap((p) => p.grupos.map((g) => [g.nombre, g.ocupados])));
  assert.deepEqual(ocupados, { "Grupo 1": 2, "Grupo 2": 0, "Grupo 3": 1, "Grupo 4": 0, "Grupo 5": 0, "Grupo 6": 0 }, "solo las activas ocupan lugar");
  assert.deepEqual(consultas, { contar: 0, agrupar: 1 }, "ni un `count` por grupo: una sola consulta agrupada");
  // Lo mismo que preguntar grupo por grupo.
  const real = new InscripcionesActivas();
  const lote = await ocupadosDeVarios(real, conAlcance(prisma, org.organizacionId), grupos.map((g) => g.id));
  for (const g of grupos) assert.equal(lote.get(g.id), await real.ocupados(conAlcance(prisma, org.organizacionId), g.id), g.nombre);
  assert.deepEqual([...(await real.ocupadosPorGrupo(conAlcance(prisma, org.organizacionId), []))], [], "sin grupos no consulta nada");
  // Una fuente que no sabe de lotes (las de prueba) sigue funcionando, grupo por grupo.
  assert.deepEqual([...(await ocupadosDeVarios(new SinInscripciones(), conAlcance(prisma, org.organizacionId), ["a", "b"]))], [["a", 0], ["b", 0]]);
});

test("ED-15: las sesiones de un grupo con sus lugares cuentan las clases muestra en UNA consulta y los lugares coinciden con la cuenta sesión por sesión", async () => {
  const grupoId = grupos[0]!.id;
  const ahora = new Date("2026-10-12T15:00:00Z");
  // Tres clases muestra agendadas en las dos primeras sesiones del grupo (una cancelada en la segunda no cuenta).
  const base = await proximasSesionesConLugar(conAlcance(prisma, org.organizacionId), new InscripcionesActivas(), grupoId, ahora, { maximo: 60, incluirLlenas: true });
  assert.ok(base.length >= 8, `hay sesiones suficientes (${base.length})`);
  const admin = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const [s0, s1] = [base[0]!.fechaHora, base[1]!.fechaHora];
  for (const [fecha, estatus] of [[s0, "agendada"], [s0, "agendada"], [s1, "agendada"], [s1, "cancelada"]] as const) {
    const f = await sembrarFamilia(prisma, org, { sucursalId: org.sucursales[0]!.id });
    await prisma.clase_muestra.create({ data: { organizacion_id: org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: grupoId, fecha_hora: fecha, agendada_por: "usuario", agendada_por_usuario_id: admin.id, estatus } });
  }
  const consultas = { contar: 0, agrupar: 0 };
  const raiz = conGanchos(
    prisma,
    { modelo: "clase_muestra", operacion: "count", antes: async () => void (consultas.contar += 1) },
    { modelo: "clase_muestra", operacion: "groupBy", antes: async () => void (consultas.agrupar += 1) },
  );
  const sesiones = await proximasSesionesConLugar(conAlcance(raiz, org.organizacionId), new InscripcionesActivas(), grupoId, ahora, { maximo: 60, incluirLlenas: true });
  assert.deepEqual(consultas, { contar: 0, agrupar: 1 }, "ni un `count` por sesión");
  assert.equal(sesiones.length, base.length);
  // cupo 10 − 2 inscritas activas − muestras agendadas de esa fecha.
  assert.deepEqual(sesiones.slice(0, 3).map((s) => s.lugares), [10 - 2 - 2, 10 - 2 - 1, 10 - 2]);
  assert.ok(sesiones.slice(2).every((s) => s.lugares === 8));
  // Excluir la clase que se reprograma devuelve su lugar.
  const una = await prisma.clase_muestra.findFirstOrThrow({ where: { grupo_id: grupoId, fecha_hora: s0, estatus: "agendada" } });
  const sin = await proximasSesionesConLugar(conAlcance(prisma, org.organizacionId), new InscripcionesActivas(), grupoId, ahora, { maximo: 3, incluirLlenas: true, excluirClaseId: una.id });
  assert.deepEqual(sin.map((s) => s.lugares), [8 - 1, 8 - 1, 8], "la excluida no ocupa lugar; `maximo` se respeta");
});
