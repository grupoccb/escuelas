Implementa el rediseño completo de la interfaz descrito en `design_handoff_rediseno_escuela/README.md`. Las referencias visuales están en `design_handoff_rediseno_escuela/pantallas/` (ábrelas en el navegador empezando por `Inicio.dc.html`; son prototipos HTML, no código para copiar).

Contexto y reglas:
- Lee primero `CLAUDE.md`, `docs/diseno/SISTEMA-VISUAL.md` y el README del handoff. CLAUDE.md gana sobre todo lo demás. En especial: cero términos de vertical o de sucursal en el código (`npm run check:generico`); todo lo que en los prototipos dice «Karate», «Águilas», nombres de grupos, precios o personas es dato de ejemplo y en el código viene de la API.
- El color por disciplina sale de `vertical.color`. Deriva el tono suave y la tinta con oklch como dice el README, nunca con un mapa por nombre.
- Trabaja dentro de `web/`: React + Vite, `web/src/estilos/base.css` (agrega ahí las variables y clases nuevas; ningún color ni medida suelta, `npm run check:estilo`), los componentes de `web/src/ui/` y los íconos de `Icono.tsx`. No agregues dependencias nuevas (ni de gráficas, ni de arrastre, ni de íconos).
- No cambies reglas de negocio ni la API, salvo para agregar endpoints de solo lectura que las gráficas nuevas necesiten. Si un endpoint no existe, déjalo anotado en `docs/` y usa los datos que sí hay.
- Accesibilidad AA, objetivos de 44 px, foco visible, el color nunca como única señal y una alternativa sin arrastre para todo lo que se arrastra.

Orden de trabajo (un bloque a la vez; cada uno termina con `npm test`, los `check:*`, el build y las capturas de `npm run diseno:...`):
1. Tokens y marco: variables nuevas en `base.css`, barra lateral agrupada en `Shell.tsx`, aviso global y diálogos como hoja inferior en celular.
2. Embudo: arrastrar y soltar con pointer events, selección en lote, columnas plegables, ficha lateral, diálogos de perdido, recuperar, inscribir y agendar, y la versión de celular.
3. Tableros: la página narrativa con las 8 secciones y sus gráficas propias.
4. Registrar pago, Hoy del maestro, Pase de lista y Registro del alumno.
5. Tareas, Ficha del lead, Conversión, Estado de cuenta, Uniformes, Ventas, Cierre del día.
6. Alumnos, Expediente, Familias y Ficha de familia.
7. Administración: inicio, el patrón compartido de catálogo, sistema, precios y cargar catálogo.
8. Acceso, Mi cuenta, estados de error y la página pública de captación.

Al terminar cada bloque, actualiza `docs/diseno/INVENTARIO.md` con `npm run diseno:inventario -- --escribir` y reporta qué quedó, qué faltó y la evidencia (comando y salida). No marques nada como terminado sin evidencia.
