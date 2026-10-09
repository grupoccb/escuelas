# BITACORA-V1.md

Sesión del 9 de octubre de 2026. Rama `v1-escuela` (desde `noche-2`). Plan: `docs/PLAN-V1.md`. Remoto: `origin` = `https://github.com/grupoccb/escuelas.git`.

| Bloque | Estado | Commit | Nota |
|---|---|---|---|
| V0 | HECHO | ver `git log` (`V0:`) | Remoto agregado y ramas/etiquetas subidas; rama `v1-escuela`; línea base |
| V1 | PENDIENTE | | Módulos por organización |
| V2 | PENDIENTE | | Decisiones 4 a 7 |
| V3 | PENDIENTE | | Segundo hijo |
| V4 | PENDIENTE | | Cierre con el maestro en sitio (EK-15) |
| V5 | PENDIENTE | | Configuración sin SQL |
| V6 | PENDIENTE | | Carga del catálogo real |
| V7 | PENDIENTE | | Recorrido por rol |
| V8 | PENDIENTE | | Guías de una página por rol |
| V9 | PENDIENTE | | Ensayo con WhatsApp real, preparado |
| V10 | PENDIENTE | | Hallazgos abiertos |
| V11 | PENDIENTE | | Decisiones para Eduardo |
| V12 | PENDIENTE | | Demo de un solo comando |
| V13 | PENDIENTE | | Auditoría final |

## V0. Preparación

**Qué se hizo**
- `origin` agregado (`https://github.com/grupoccb/escuelas.git`). `git ls-remote origin` devolvió vacío con exit 0: el remoto no traía commits, así que no hubo nada que chocara y no se forzó nada.
- `git push -u origin main noche-fase1 noche-2` y `git push origin --tags`: las tres ramas y las once etiquetas `etapa-A` … `etapa-K` subieron como ramas y etiquetas nuevas (exit 0).
- Rama `v1-escuela` creada desde `noche-2`.
- `docs/PLAN-V1.md` entra al repositorio en este commit. `.claude/settings.json` (permisos locales del agente) se queda sin commit: es configuración de la máquina de Eduardo.

**Línea base** (antes de tocar código)
- `npm run validar` → exit 0 (676 tests de backend + 48 de la interfaz, 0 fallas).
- `npm run test:int` → exit 0 (1125 tests, 0 fallas).
- `npm run test:navegador` → exit 0 (103 pruebas en Chromium, 2.3 min).

**Decisiones que tomé**
- Sin decisiones de producto.

**Para Eduardo**
- Nada.
