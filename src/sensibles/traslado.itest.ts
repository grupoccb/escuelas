// EF-05: el traslado de la ficha de salud del prospecto al alumno (F2) — lo que el alumno ya tenía no se pisa, lo demás pasa cifrado bajo la fila del
// alumno, la ficha del prospecto queda dada de baja y SIN valores (el dato se mudó, no se duplicó), y el traslado deja constancia solo con nombres de campos.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { sembrarUsuario } from "../testutil/api.ts";
import { crearCifrador } from "./cifrado.ts";
import { guardarSensible, leerSensible } from "./ficha.ts";
import { trasladarFichaDeProspectoAAlumno } from "./traslado.ts";

const cifrador = crearCifrador(randomBytes(32));
let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let usuarioId: string;

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma, "Traslado de salud");
  usuarioId = (await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" })).id;
});
after(async () => {
  await prisma.$disconnect();
});

test("el traslado no pisa lo que el alumno ya tenía, pasa lo demás bajo la fila del alumno, vacía y da de baja la ficha del prospecto y deja constancia solo con nombres de campos", async () => {
  const db = conAlcance(prisma, org.organizacionId);
  const actor = { usuarioId, organizacionId: org.organizacionId, rol: "administrador" as const };
  const a = await sembrarAlumno(prisma, org, {});
  await guardarSensible(db, actor, { sujetoTipo: "prospecto", sujetoId: a.prospectoId, motivo: "prueba", valores: { alergias: "CENTINELA-DEL-PROSPECTO", medicamentos: "MEDICAMENTO-DEL-PROSPECTO" } }, { cifrador });
  await guardarSensible(db, actor, { sujetoTipo: "alumno", sujetoId: a.alumnoId, motivo: "prueba", valores: { alergias: "ALERGIA-YA-DEL-ALUMNO" } }, { cifrador });

  const campos = await db.$transaction((tx) => trasladarFichaDeProspectoAAlumno(tx, { organizacionId: org.organizacionId, prospectoId: a.prospectoId, alumnoId: a.alumnoId, usuarioId, cifrador }));
  assert.deepEqual(campos, ["medicamentos"], "solo pasó lo que el alumno no tenía");

  const leida = await leerSensible(db, actor, { sujetoTipo: "alumno", sujetoId: a.alumnoId, motivo: "verificar" }, { cifrador });
  assert.equal(leida.campos.alergias?.revelar(), "ALERGIA-YA-DEL-ALUMNO", "lo del alumno no se pisa");
  assert.equal(leida.campos.medicamentos?.revelar(), "MEDICAMENTO-DEL-PROSPECTO", "lo demás sí pasó (descifrable bajo la fila del alumno)");

  // El dato se mudó, no se duplicó: la ficha del prospecto quedó dada de baja y sin ningún valor.
  const origen = await prisma.ficha_salud.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, sujeto_tipo: "prospecto", sujeto_id: a.prospectoId } });
  assert.notEqual(origen.eliminado_en, null);
  for (const c of ["alergias", "condiciones_medicas", "medicamentos", "contacto_emergencia", "autorizacion_atencion_medica"] as const) assert.equal(origen[c], null, c);

  // Constancia: la acción `trasladar` con los NOMBRES de los campos y nunca sus valores.
  const accesos = await prisma.acceso_dato_sensible.findMany({ where: { organizacion_id: org.organizacionId, accion: "trasladar", sujeto_id: a.alumnoId } });
  assert.equal(accesos.length, 1);
  assert.deepEqual(accesos[0]!.campos, ["medicamentos"]);
  assert.ok(!JSON.stringify(accesos[0]).includes("CENTINELA"));
});
