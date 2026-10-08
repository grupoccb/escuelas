// Un error que NO es del dato sino del momento (contención, base saturada…): repetir la operación puede resolverlo. Los webhooks lo responden con 5xx
// para que el proveedor reintente (WH, regla 5); cualquier otro error es un dato inesperado y se atrapa (src/webhooks/clasificar.ts).

export class ErrorTransitorio extends Error {}
