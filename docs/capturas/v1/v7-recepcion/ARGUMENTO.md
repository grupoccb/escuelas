# V7 — Recepción: el guion del día

Rita, recepcionista de la sucursal Norte (también cubre la Sur), en la computadora del mostrador (1366×768). Nunca vio el sistema. Cada paso deja una captura
`antes-NN-…` (antes de corregir) y `despues-NN-…` (mismos pasos, ya corregido) en esta carpeta. Lo hace `web/e2e/v7-recepcion.spec.ts`.

## La mañana (escritorio)

1. **Entra.** Correo y contraseña; ¿a dónde llega? ¿se entiende qué hacer primero?
2. **Llega una mamá a pagar.** La busca:
   - por el nombre del niño («Ángel»), sin acento y en mayúsculas («ANGEL»);
   - por el nombre de la mamá («lucia baez»);
   - por teléfono con `+52`, con `+521`, con espacios y guiones;
   - lo que no existe, un teléfono incompleto y una sola letra.
3. **Ve lo que debe.** Saldo, lo vencido y cada cargo por hijo. ¿Se lee a la primera?
4. **Cobra.**
   - Un pago parcial.
   - Se equivoca: lo cancela con motivo.
   - Un pago repartido a mano entre los dos hijos.
   - Un pago completo (lo que falta).
   - Doble clic en «Registrar pago».
5. **Importes absurdos.** `-50`, `0`, `12.345`, `abc`, `1e5`, `99999999999`, `$ 1,250.5`: ¿el mensaje dice qué hacer?
6. **Cobra a una familia que no debe nada.** ¿Qué pasa?
7. **Estado de cuenta.** ¿Cómo se lee el saldo? ¿Qué antigüedad tiene lo vencido? ¿Se puede imprimir o mandar a la familia?
8. **Uniforme.** Lista de por entregar, marcar entrega, entregarlo dos veces (dos pantallas abiertas), sin existencia de la talla.
9. **Vende un producto.** Con existencia, la última pieza, sin existencia, anula la venta, doble clic.
10. **Cierra el día.** ¿Cuánto se cobró hoy? ¿Cuánto en efectivo para cuadrar la caja? ¿Y qué se canceló?

## Otros días

11. **Módulo de finanzas apagado** (escuela con solo captación): ¿qué ve la recepcionista al entrar?
12. **Tableta (768×1024) y celular (390):** las pantallas de cobro, cuenta, uniformes, ventas y cierre caben, sin desborde, con botones de 44 px.
13. **Lo que no debe ver:** ficha de salud y notas del asesor, ni en pantalla ni por la API.
14. **Después de todo:** `npm run cuadratura` en verde.
