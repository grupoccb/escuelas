// Módulos de la organización (V1): qué partes del sistema tiene encendidas la escuela. Solo el administrador los ve y los cambia; cada cambio queda en el registro de cambios.
//
//   GET /api/modulos   (catalogo:escribir)   los siete módulos con su nombre, lo que incluye, qué necesita y si está encendido
//   PUT /api/modulos   { cotizador?, clase_muestra?, inscripcion?, operacion?, finanzas?, tableros? }   (catalogo:escribir)   enciende o apaga los que se mandan; los demás quedan igual
//
// Surte efecto en la siguiente petición (no hay caché ni reinicio). No hay cascada: encender algo a lo que le falta su base, o apagar algo de lo que otro depende, se rechaza
// con 409 y un mensaje que dice qué hacer primero. La captación no se apaga. La lectura en el resto del sistema es `leerModulos()` (src/modulos/).

import { type Router } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { COLUMNA_DE_MODULO, DEFINICION_DE_MODULOS, MODULOS, MODULOS_APAGABLES, SELECCION_DE_MODULOS, aFilaDeModulos, desdeFilaDeModulos, explicarProblemas, leerModulos, type ModulosEncendidos } from "../../modulos/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, validacion } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { booleano, objeto, opcional, parsear } from "../validar.ts";

const esquemaCambio = objeto({
  captacion: opcional(booleano()),
  cotizador: opcional(booleano()),
  clase_muestra: opcional(booleano()),
  inscripcion: opcional(booleano()),
  operacion: opcional(booleano()),
  finanzas: opcional(booleano()),
  tableros: opcional(booleano()),
});

function presentar(estado: ModulosEncendidos) {
  return {
    modulos: MODULOS.map((id) => ({
      id,
      nombre: DEFINICION_DE_MODULOS[id].nombre,
      incluye: DEFINICION_DE_MODULOS[id].incluye,
      requiere: DEFINICION_DE_MODULOS[id].requiere,
      obligatorio: id === "captacion",
      encendido: estado[id],
    })),
  };
}

export function rutasDeModulos(_deps: DepsApi): Router {
  const r = crearRouter();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  r.get("/modulos", requierePermiso("catalogo:escribir"), async (_req, res) => {
    res.json(presentar(await leerModulos(contextoDe(res).db)));
  });

  r.put("/modulos", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const c = parsear(esquemaCambio, req.body);
    if (Object.keys(c).length === 0) throw validacion([{ mensaje: "No hay nada que cambiar" }]);
    // Bajo el mismo candado que PATCH /api/configuracion: dos cambios simultáneos no se pisan ni chocan con el único de la fila.
    const salida = await transaccionConBloqueo(ctx.db, ctx.organizacionId, "configuracion_organizacion", async (tx) => {
      const previa = await tx.configuracion_organizacion.findFirst({ select: SELECCION_DE_MODULOS });
      const antes = previa ? desdeFilaDeModulos(previa) : await leerModulos(tx);
      const despues: ModulosEncendidos = { ...antes };
      for (const m of MODULOS) if (c[m] !== undefined) despues[m] = c[m];
      const problemas = explicarProblemas(antes, despues);
      if (problemas.length > 0) throw conflicto(problemas.join(" "), problemas.map((mensaje) => ({ mensaje })));
      const datos: Record<string, boolean> = {};
      for (const m of MODULOS_APAGABLES) if (despues[m] !== antes[m]) datos[COLUMNA_DE_MODULO[m]] = despues[m];
      if (Object.keys(datos).length === 0 && previa) return despues;
      if (previa) await tx.configuracion_organizacion.updateMany({ data: datos });
      else await tx.configuracion_organizacion.create({ data: altaConAlcance(aFilaDeModulos(despues)) });
      const fila = await tx.configuracion_organizacion.findFirst({ select: { id: true, ...SELECCION_DE_MODULOS } });
      if (!fila) throw new Error("Los módulos no quedaron guardados");
      await registrarCambio(tx, ctx, { entidad: "configuracion_organizacion", entidadId: fila.id, accion: "actualizar", antes: aFilaDeModulos(antes), despues: aFilaDeModulos(despues) });
      return despues;
    });
    res.json(presentar(salida));
  });

  return r;
}
