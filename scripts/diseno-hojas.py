#!/usr/bin/env python3
"""Hojas de contacto de las capturas del rediseño, para revisarlas de a muchas sin perder el detalle.

  python3 scripts/diseno-hojas.py <prefijo> [despues|antes] [salida]

Deja en <salida> (por omisión .tmp/hojas/<fase>-<prefijo>/) hojas JPEG: `escritorio-NN.jpg` (6 escenas por hoja, a 640 px de ancho cada una, cortadas a 900 px de alto) y
`celular-NN.jpg` (5 escenas por hoja, a tamaño real de 390 px, cortadas a 1000 px de alto). Cada escena lleva su id arriba. Para ver una escena completa, abre su archivo en
docs/diseno/capturas/<fase>/<id>-<vista>.jpg.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

raiz = Path(__file__).resolve().parent.parent
prefijo = sys.argv[1]
fase = sys.argv[2] if len(sys.argv) > 2 else "despues"
salida = Path(sys.argv[3]) if len(sys.argv) > 3 else raiz / ".tmp" / "hojas" / f"{fase}-{prefijo.strip('-')}"
salida.mkdir(parents=True, exist_ok=True)
carpeta = raiz / "docs/diseno/capturas" / fase

CONFIG = {"escritorio": dict(ancho=640, alto=900, columnas=3, filas=2), "celular": dict(ancho=390, alto=1000, columnas=5, filas=1)}
for vista, c in CONFIG.items():
    archivos = sorted(carpeta.glob(f"{prefijo}*-{vista}.jpg"))
    por_hoja = c["columnas"] * c["filas"]
    for n in range(0, len(archivos), por_hoja):
        grupo = archivos[n : n + por_hoja]
        margen, titulo = 12, 22
        celda_w, celda_h = c["ancho"] + margen, c["alto"] + titulo + margen
        hoja = Image.new("RGB", (celda_w * c["columnas"] + margen, celda_h * c["filas"] + margen), (200, 200, 205))
        d = ImageDraw.Draw(hoja)
        for i, a in enumerate(grupo):
            im = Image.open(a).convert("RGB")
            if im.width != c["ancho"]:
                im = im.resize((c["ancho"], round(im.height * c["ancho"] / im.width)))
            im = im.crop((0, 0, im.width, min(im.height, c["alto"])))
            x = margen + (i % c["columnas"]) * celda_w
            y = margen + (i // c["columnas"]) * celda_h
            d.text((x, y), a.name.replace(f"-{vista}.jpg", ""), fill=(0, 0, 0))
            hoja.paste(im, (x, y + titulo))
        hoja.save(salida / f"{vista}-{n // por_hoja + 1:02d}.jpg", quality=80)
    print(f"{vista}: {len(archivos)} capturas en {-(-len(archivos) // por_hoja)} hojas")
print(salida)
