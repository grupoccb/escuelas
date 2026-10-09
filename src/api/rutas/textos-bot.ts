// Textos del asistente de WhatsApp (V5): lo que el bot dice, que la escuela puede redactar a su manera. El bot sigue siendo una máquina de estados determinista (invariante 10): solo cambia la
// redacción de cada mensaje, con huecos como {nombre} que el sistema llena. Sin fila, el bot dice el texto de siempre. Solo el administrador los ve y los cambia; cada cambio queda en el registro.
//
//   GET    /api/textos-bot            (catalogo:escribir) — cada mensaje: cuándo lo dice, qué huecos admite, el texto de siempre, el texto actual y si está personalizado
//   PUT    /api/textos-bot/:clave     { texto }   (catalogo:escribir) — personaliza ese mensaje. 400 si trae un hueco que no existe, le falta uno obligatorio, es muy largo o lleva un enlace
//   DELETE /api/textos-bot/:clave     (catalogo:escribir) — vuelve al texto de siempre (baja lógica de la fila)
//
// Surte efecto en el siguiente mensaje que llegue (el bot lee la tabla en cada mensaje; sin reiniciar). Un texto de un módulo apagado se puede editar, pero el bot no lo dice hasta que el módulo se encienda.

import { Router } from "express";
import express from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { transaccionConBloqueo } from "../../datos/bloqueos.ts";
import { CATALOGO_DE_TEXTOS, CLAVES_DE_TEXTO, HUECOS, MAXIMO_DE_TEXTO, esClaveDeTexto, problemaDeTexto, type ClaveDeTexto, type DefinicionDeTexto } from "../../captacion/textos.ts";
import { leerModulos } from "../../modulos/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { noEncontrado, validacion } from "../errores.ts";
import { registrarCambio } from "../registro.ts";
import { objeto, parsear, textoLiteral } from "../validar.ts";

const esquemaCuerpo = objeto({ texto: textoLiteral({ min: 1, max: 5000 }) });

function claveDe(valor: string | string[] | undefined): ClaveDeTexto {
  if (typeof valor !== "string" || !esClaveDeTexto(valor)) throw noEncontrado("Ese mensaje del asistente no existe");
  return valor;
}

export function rutasDeTextosBot(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  const listar = async (ctx: ReturnType<typeof contextoDe>) => {
    const propios = new Map((await ctx.db.texto_bot.findMany({ select: { clave: true, texto: true } })).map((f) => [f.clave, f.texto]));
    const modulos = await leerModulos(ctx.db);
    return {
      maximo: MAXIMO_DE_TEXTO,
      datos: CLAVES_DE_TEXTO.map((clave) => {
        const def: DefinicionDeTexto = CATALOGO_DE_TEXTOS[clave];
        const propio = propios.get(clave);
        return {
          clave,
          cuando: def.cuando,
          modulo: def.modulo,
          modulo_encendido: modulos[def.modulo],
          huecos: def.huecos.map((h) => HUECOS[h]),
          obligatorios: [...(def.obligatorios ?? [])],
          defecto: def.defecto,
          texto: propio ?? def.defecto,
          personalizado: propio !== undefined,
        };
      }),
    };
  };

  r.get("/textos-bot", requierePermiso("catalogo:escribir"), async (_req, res) => {
    res.json(await listar(contextoDe(res)));
  });

  r.put("/textos-bot/:clave", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const clave = claveDe(req.params["clave"]);
    const { texto } = parsear(esquemaCuerpo, req.body);
    const problema = problemaDeTexto(clave, texto);
    if (problema) throw validacion([{ campo: "texto", mensaje: problema }]);
    const limpio = texto.trim();
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, "texto_bot", async (tx) => {
      const actual = await tx.texto_bot.findFirst({ where: { clave }, select: { id: true, texto: true } });
      // Escribir exactamente el texto de siempre es volver a él: no deja una fila que diga «personalizado» sin serlo.
      if (limpio === CATALOGO_DE_TEXTOS[clave].defecto) {
        if (!actual) return;
        await tx.texto_bot.update({ where: { id: actual.id }, data: { eliminado_en: new Date() } });
        await registrarCambio(tx, ctx, { entidad: "texto_bot", entidadId: actual.id, accion: "eliminar", antes: { clave, texto: actual.texto } });
        return;
      }
      if (actual) {
        if (actual.texto === limpio) return;
        await tx.texto_bot.update({ where: { id: actual.id }, data: { texto: limpio } });
        await registrarCambio(tx, ctx, { entidad: "texto_bot", entidadId: actual.id, accion: "actualizar", antes: { clave, texto: actual.texto }, despues: { clave, texto: limpio } });
      } else {
        const nuevo = await tx.texto_bot.create({ data: altaConAlcance({ clave, texto: limpio }), select: { id: true } });
        await registrarCambio(tx, ctx, { entidad: "texto_bot", entidadId: nuevo.id, accion: "crear", despues: { clave, texto: limpio } });
      }
    });
    res.json((await listar(ctx)).datos.find((d) => d.clave === clave));
  });

  r.delete("/textos-bot/:clave", requierePermiso("catalogo:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const clave = claveDe(req.params["clave"]);
    await transaccionConBloqueo(ctx.db, ctx.organizacionId, "texto_bot", async (tx) => {
      const actual = await tx.texto_bot.findFirst({ where: { clave }, select: { id: true, texto: true } });
      if (!actual) return;
      await tx.texto_bot.update({ where: { id: actual.id }, data: { eliminado_en: new Date() } });
      await registrarCambio(tx, ctx, { entidad: "texto_bot", entidadId: actual.id, accion: "eliminar", antes: { clave, texto: actual.texto } });
    });
    res.status(204).end();
  });

  return r;
}
