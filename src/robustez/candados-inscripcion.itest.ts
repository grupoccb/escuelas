// V10 / EK-22: el ORDEN de los candados también en la inscripción. La regla de la casa es LEAD → ADULTOS → GRUPO → CLASE (ED-08, EF-11); el bot, al agendar una clase muestra, toma el
// lead y luego el grupo. Si `inscribirAlumno` tomara el grupo antes que el lead (como antes de K2), una inscripción y el bot sobre el MISMO lead y el MISMO grupo se esperarían en cruz y
// Postgres abortaría una (40P01). La auditoría K9 mostró que quitar `bloquearLead` de `inscribir.ts` no hacía fallar ninguna prueba: esta fuerza el cruce.
//
// El «bot» es una transacción que toma el lead, espera, y luego pide el grupo (justo lo que hace al agendar). La inscripción pasa por la API. Un gancho detiene a la inscripción en
// cuanto toma su PRIMER candado (el lead, si respeta el orden; el grupo, si no): con el orden correcto la inscripción espera al bot (la barrera no se completa) y todo termina; con
// el orden invertido las dos se esperan en cruz y una muere.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { bloquearCupoDeGrupo } from "../catalogo/cupo.ts";
import { bloquearLead } from "../embudo/etapas.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarAlumno, sembrarDocumentosLegales, sembrarEmbudo, sembrarOrganizacion, sembrarPrograma } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 20);
});
after(async () => {
  await prisma.$disconnect();
});

const AHORA = new Date("2026-10-20T18:00:00Z");

test("EK-22: la inscripción toma el LEAD antes que el grupo — con los candados forzados en cruz contra el bot, ningún interbloqueo y la inscripción entra", async () => {
  const logs = colectarLogs();
  try {
    for (let ronda = 0; ronda < 3; ronda++) {
      const org = await sembrarOrganizacion(prisma, "Candados de inscripción");
      const etapas = await sembrarEmbudo(prisma, org);
      const docs = await sembrarDocumentosLegales(prisma, org);
      const p = await sembrarPrograma(prisma, org, { sucursalId: org.sucursales[0]!.id, nombre: "Programa", edadMin: 3, edadMax: 14, precio: { inscripcion: "500.00", mensualidad: "800.00" }, grupos: [{ nombre: "Grupo", cupoMaximo: 5, horarios: [[2, 960, 1020]] }] });
      const grupoId = p.grupos[0]!.id;
      const a = await sembrarAlumno(prisma, org, { docs, etapaId: etapas.negociacion });
      const db = conAlcance(prisma, org.organizacionId);

      // La inscripción, detenida en cuanto toma su primer candado (el del lead o el del grupo), a la espera del «bot».
      const barrera = new Barrera(2);
      let esperó = false;
      const alTomar = async () => {
        if (esperó) return;
        esperó = true;
        await barrera.esperar(1500);
      };
      const prismaApi = conGanchos(
        prisma,
        { modelo: "lead", operacion: "updateMany", cuando: (args) => JSON.stringify(args["where"]).includes(a.leadId), despues: alTomar },
        { modelo: "grupo", operacion: "updateMany", cuando: (args) => JSON.stringify(args["where"]).includes(grupoId), despues: alTomar },
      );
      const api = levantarApi(prismaApi, { reloj: () => AHORA, sensibles: { cifrador: crearCifrador(randomBytes(32)) } });
      try {
        const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
        const cliente = api.cliente();
        assert.equal((await cliente.login(org.slug, u.correo, u.contrasena)).estado, 201);
        // El «bot»: toma el lead, espera a que la inscripción tenga su primer candado y entonces pide el grupo.
        const bot = db.$transaction(async (tx) => {
          await bloquearLead(tx, a.leadId);
          await barrera.esperar(1500);
          await bloquearCupoDeGrupo(tx, grupoId);
          return "bot listo";
        });
        const inscripcion = cliente.post<{ id?: string }>("/api/inscripciones", { alumno_id: a.alumnoId, grupo_id: grupoId });
        const [rb, ri] = await Promise.allSettled([bot, inscripcion]);
        assert.equal(rb.status, "fulfilled", `el bot no se interbloquea: ${rb.status === "rejected" ? String(rb.reason) : ""}`);
        assert.equal(ri.status, "fulfilled");
        const estado = (ri as PromiseFulfilledResult<{ estado: number }>).value.estado;
        assert.equal(estado, 201, `la inscripción entra (sin 5xx): ${estado}`);
        assert.equal(await prisma.inscripcion.count({ where: { alumno_id: a.alumnoId, estatus: "activa" } }), 1);
        assert.equal(barrera.completa, false, "se pusieron en fila: la inscripción esperó al bot (si coincidieran, tomó el grupo antes que el lead)");
      } finally {
        await api.cerrar();
      }
    }
    assert.equal(logs.lineas.filter((l) => /40P01|deadlock|interbloqueo/i.test(l)).length, 0, "ningún interbloqueo en el log");
  } finally {
    logs.detener();
  }
});
