// Carga del catálogo desde hojas de Excel (V6). Solo el administrador (`catalogo:escribir`); pertenece al módulo base (captación), como el resto del catálogo.
//
//   GET  /api/catalogo/plantillas                 las plantillas que se pueden descargar: cada hoja, las instrucciones y un zip con todo
//   GET  /api/catalogo/plantillas/:nombre         una descarga (`sucursales.csv`, `LEEME.txt`, `plantillas-catalogo.zip`…), CSV en UTF-8 con BOM para que Excel lo abra bien
//   POST /api/catalogo/importacion  { modo: "simulacion" | "aplicar", archivos: [{ nombre, contenido? | contenido_base64? }] }
//
// SIMULACIÓN: valida TODO (formato, obligatorios, rangos, referencias por nombre, duplicados dentro del archivo y contra lo que ya existe, traslapes de edad, choques de salón e
// instructor, cupo contra capacidad) y responde los errores por fila y columna, en español, SIN escribir nada (ni el registro de cambios). APLICAR: lo mismo, y si no hay errores
// escribe todo o nada bajo el candado del catálogo; es idempotente (volver a aplicar lo mismo responde `sin_cambios`), solo crea y actualiza (jamás borra) y cada cambio queda en el
// registro de cambios. Con errores responde 200 con `aplicado: false` y la misma lista de errores: no se guarda nada.
//
// El contenido de cada archivo llega como texto (`contenido`) o como bytes en base64 (`contenido_base64`, lo mejor: el servidor reconoce UTF-8, Windows-1252 y UTF-16 del Excel).
// Topes: 12 archivos, 5 000 filas por archivo, cuerpo de 8 MB.

import { Router } from "express";
import express from "express";
import { LIMITE_CUERPO_IMPORTACION } from "../cuerpos.ts";
import { descargasDePlantillas, importarCatalogo, ESQUEMAS, TIPOS, NOMBRE_DEL_ZIP, NOMBRE_DE_INSTRUCCIONES } from "../../catalogo/importacion/index.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { noEncontrado, validacion } from "../errores.ts";
import { enumerado, listaDe, objeto, opcional, parsear, texto, textoLiteral } from "../validar.ts";

const esquemaCarga = objeto({
  modo: enumerado(["simulacion", "aplicar"] as const),
  archivos: listaDe(
    objeto({
      nombre: texto({ max: 200 }),
      contenido: opcional(textoLiteral({ min: 0, max: 6_000_000 })),
      contenido_base64: opcional(textoLiteral({ min: 0, max: 8_000_000 })),
    }),
    { max: 12 },
  ),
});

const DESCRIPCION_DE_ARCHIVOS: Record<string, string> = {
  ...Object.fromEntries(TIPOS.map((t) => [ESQUEMAS[t].archivo, ESQUEMAS[t].descripcion])),
  [NOMBRE_DE_INSTRUCCIONES]: "Cómo llenar las plantillas, en una hoja.",
  [NOMBRE_DEL_ZIP]: "Todas las plantillas y las instrucciones en un solo archivo.",
};

export function rutasDeImportacionDeCatalogo(_deps: DepsApi): Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_IMPORTACION });

  r.get("/catalogo/plantillas", requierePermiso("catalogo:escribir"), (_req, res) => {
    res.json({ datos: descargasDePlantillas().map((a) => ({ nombre: a.nombre, descripcion: DESCRIPCION_DE_ARCHIVOS[a.nombre] ?? "", ruta: `/api/catalogo/plantillas/${encodeURIComponent(a.nombre)}` })) });
  });

  r.get("/catalogo/plantillas/:nombre", requierePermiso("catalogo:escribir"), (req, res) => {
    const archivo = descargasDePlantillas().find((a) => a.nombre === req.params["nombre"]);
    if (!archivo) throw noEncontrado("No hay una plantilla con ese nombre");
    res.setHeader("Content-Type", archivo.tipoDeContenido);
    res.setHeader("Content-Disposition", `attachment; filename="${archivo.nombre}"`);
    res.send(archivo.contenido);
  });

  r.post("/catalogo/importacion", requierePermiso("catalogo:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaCarga, req.body);
    const archivos = e.archivos.map((a, i) => {
      if ((a.contenido === undefined) === (a.contenido_base64 === undefined)) throw validacion([{ campo: `archivos[${i}]`, mensaje: "Manda `contenido` (texto) o `contenido_base64`, uno de los dos" }]);
      if (a.contenido_base64 !== undefined && !/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(a.contenido_base64)) throw validacion([{ campo: `archivos[${i}].contenido_base64`, mensaje: "No es base64 válido" }]);
      return { nombre: a.nombre, bytes: a.contenido_base64 !== undefined ? Buffer.from(a.contenido_base64, "base64") : Buffer.from(a.contenido ?? "", "utf8") };
    });
    res.json(await importarCatalogo(ctx.db, { archivos, modo: e.modo, organizacionId: ctx.organizacionId, usuarioId: ctx.usuario.id }));
  });

  return r;
}
