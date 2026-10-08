# CLAUDE.md — Sistema de captación y gestión para escuelas multi-disciplina

Producto de Grupo CCB. Primer cliente: una escuela con tres verticales (Karate, Ballet, Baile) y dos sucursales. Nombre comercial del producto: por definir.

## Documentos y precedencia

1. `CLAUDE.md` (este archivo): invariantes. Nunca se rompen.
2. `SPEC.md`: plan por fases con gates. Define qué se construye y en qué orden.
3. `docs/CONTEXTO-PROYECTO.md`: el negocio, el modelo de datos y el catálogo.

Si hay conflicto, gana el de número menor. `CONTEXTO-PROYECTO.md` tiene dos puntos ya superados:

- **Ventana de mensajería.** El contexto habla de una sola ventana de 72 h. Son dos (ver invariante 5).
- **Plantillas en Chatwoot.** El contexto dice que Chatwoot no soporta plantillas con Twilio. Ya las soporta (Twilio Content Templates).

## Stack

- **Runtime:** Node 22+ con TypeScript nativo (sin paso de build), ESM.
- **API:** Express 5.
- **Tests:** `node:test`.
- **Datos:** PostgreSQL + Prisma 7.
- **Interfaz propia, cuando exista:** React + Vite.
- **Bandeja de asesores:** Chatwoot autohospedado.
- **Mensajería:** Twilio WhatsApp Business API.
- **Despliegue:** AWS.

De Agenda Lista se heredan el runtime y las herramientas (configuración de TypeScript, `node:test`, guardas `scripts/check-*.ts`, CI), no la base de datos. El detalle está en `docs/REUSO-AGENDA-LISTA.md`.

Los índices únicos parciales del modelo (`WHERE estatus='activa'`, teléfono normalizado) no se expresan en el schema de Prisma: van como SQL en la migración.

## Invariantes

1. **Aislamiento por organización.** Toda tabla lleva `organizacion_id` y toda query filtra por él a través de un scope único, nunca a mano en cada consulta. Hay un test de no-fuga entre dos organizaciones. No se construye el alta de organizaciones: hoy existe una y se crea por seed.

2. **Cero términos de vertical en el código.** "Karate", "ballet", "baile", "cinturón", "cinta", "recital", "twerk" y nombres de sucursal no aparecen en código, tests de lógica ni plantillas fijas: viven en tablas. `npm run check:generico` falla el build si aparecen. Prueba de fuego: dar de alta una vertical nueva solo con filas de seed.

3. **Soft delete en todo.** Columna `eliminado_en`. Nunca `DELETE` físico.

4. **Todo mensaje saliente pasa por `MessagingProvider`.** Es el único lugar donde viven las reglas de ventana, plantilla, horario, opt-out, frecuencia y atención humana. Nadie llama al SDK de Twilio ni a la API de Chatwoot fuera de él.

5. **Dos ventanas, no una.**
   - `ventana_servicio_hasta`: 24 h desde el último mensaje entrante del contacto. Decide si se puede mandar mensaje libre.
   - `ventana_gratis_hasta`: 72 h desde la entrada por anuncio Click-to-WhatsApp. Solo afecta el costo.
   - Fuera de la ventana de servicio: plantilla aprobada o nada. Si no hay plantilla apta, no se manda y se crea tarea para el asesor.

6. **`en_atencion_humana` bloquea toda automatización.** Sin excepción. La verificación vive en `MessagingProvider`, no en cada automatización.

7. **Una sola función de teléfonos.** `normalizarTelefono()` convierte a E.164 y colapsa `+521` a `+52`. Ningún otro código toca el formato. Toda búsqueda o alta de contacto pasa por ella.

8. **Idempotencia.** Webhooks: único por identificador de mensaje del proveedor. Automatizaciones: único en `(automatizacion_id, entidad_tipo, entidad_id, ocurrencia)`. Un reintento nunca manda dos veces.

9. **Webhooks autenticados.** Los de Twilio validan `X-Twilio-Signature`. Los de Chatwoot validan un secreto compartido.

10. **Determinismo.** El bot de Fase 1 es una máquina de estados, sin LLM. Cupo, precios, promociones y cualquier cálculo son código determinista.

11. **Integraciones detrás de adaptadores con fakes.** Twilio y Chatwoot se usan a través de interfaces con implementación falsa offline. El loop completo se prueba sin credenciales; las reales se activan por variables de entorno.

12. **Local primero.** Todo corre con `docker compose` (Postgres, Chatwoot, backend) antes de tocar AWS.

13. **La familia es la entidad central.** `tutor` y `alumno` se relacionan M:N. El `lead` guarda nombre, edad y sucursal como datos estructurados para que la conversión posterior no recapture nada. Ningún atajo tipo `alumno.telefono_mama`.

14. **Horario de envío.** Nada automático fuera de 09:00–20:00 hora local de la sucursal. Lo programado fuera de rango se recorre al siguiente horario válido.

## Reglas de trabajo

- Se trabaja una fase del SPEC a la vez. No se empieza la siguiente hasta que Eduardo marque sus gates.
- Los gates los marca Eduardo, no Claude. Claude reporta evidencia (comando y salida) para cada gate.
- No se construyen tablas ni módulos de fases futuras "por adelantado".
- Nombres de dominio en español, como en el modelo de datos (`lead`, `tutor`, `inscripcion`).
- El repo de Agenda Lista es de solo lectura. Se porta copiando código, no como dependencia.
- Si una instrucción choca con un invariante, Claude se detiene y pregunta.
