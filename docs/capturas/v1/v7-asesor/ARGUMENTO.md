# V7 — Recorrido del asesor (escritorio 1366×768)

Persona: Alba, asesora de la sucursal Norte, que nunca vio el sistema. Un día normal, en el orden en que ocurriría. Meta: cada tarea diaria en 3 pasos o menos (un paso = un clic o una elección; escribir en un campo no cuenta).

Datos: el mundo sembrado de las pruebas en navegador (base propia `v7_asesor_inscripciones_navegador_pruebas`, puerto 4371, sin credenciales). Lo que «llega» durante el día se genera por los caminos reales: el bot (`procesarEntrante` con transporte falso, como lo haría un contacto de Chatwoot), la landing pública (`/l/<vertical>`) y las tareas con el texto que escribe el sistema de verdad.

## El guion

1. **Llega un lead por el bot.** Una mamá escribe a WhatsApp, contesta las tres preguntas y el bot la pasa al asesor. Alba abre el embudo, encuentra el lead, abre su ficha, lee el resumen y abre la conversación en Chatwoot desde la ficha.
2. **Llega un lead por la landing** (anuncio): aparece en el embudo con su origen.
3. **Agrega al segundo hijo** desde la ficha.
4. **Cotiza** a cada niño.
5. **Agenda la clase muestra.**
6. **Da seguimiento:** mueve de etapa con una nota.
7. **Reprograma y cancela** una clase muestra.
8. **Cierra tareas:** lead a medias, baja que vuelve a escribir, entrega fallida, listo para cerrar.
9. **Pierde y recupera** un lead (motivo y nota).
10. **Convierte e inscribe.**
11. **Consulta el embudo y los estancados.**
12. **Reporte de leads / exportar CSV.**
13. **Lead sin sucursal** (V2): lo atiende y le pone sucursal.
14. **Una escuela con solo captación** (V1): ¿entiende qué puede hacer?

Cada paso deja captura `antes-NN-…` (antes de corregir) y `despues-NN-…` (mismos pasos, ya corregido). Las fricciones y su tratamiento están en `docs/BITACORA-V1.md` → «V7 — asesor».
