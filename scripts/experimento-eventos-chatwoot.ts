// Experimento A3: qué eventos de Chatwoot llegan al Agent Bot cuando una persona toma una
// conversación. Herramienta de desarrollo; no es parte del producto.
//
// Uso (con el Chatwoot de la demo en marcha y el receptor de capturas en otro puerto):
//
//   node scripts/receptor-captura.ts .tmp/a3/cap 4599 &
//   node --env-file=config/demo-local.env scripts/experimento-eventos-chatwoot.ts <cuenta> <bandeja> <identificador> <tokenBot> [--en-linea]
//
// La bandeja debe ser una bandeja API de pruebas con un Agent Bot que apunte al receptor. El
// script hace de contacto, de bot y de asesor (con el token del administrador) y deja una pausa
// entre pasos para que el receptor ordene las capturas.

const url = (process.env["CHATWOOT_URL_HOST"] ?? "http://localhost:3001").replace(/\/+$/, "");
const tokenAdmin = process.env["CHATWOOT_ADMIN_TOKEN"] ?? "";
const [cuenta, bandeja, identificador, tokenBot] = process.argv.slice(2);
if (!cuenta || !bandeja || !identificador || !tokenBot || !tokenAdmin) {
  throw new Error("Uso: experimento-eventos-chatwoot.ts <cuenta> <bandeja> <identificador> <tokenBot> [--en-linea]");
}
const enLinea = process.argv.includes("--en-linea");

async function pedir(metodo: string, ruta: string, token: string | null, cuerpo?: unknown): Promise<unknown> {
  const res = await fetch(`${url}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { api_access_token: token } : {}) },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${metodo} ${ruta} → ${res.status}: ${texto}`);
  return texto ? JSON.parse(texto) : null;
}
const pausa = (ms = 2500): Promise<void> => new Promise((r) => setTimeout(r, ms));
const paso = (texto: string): void => console.log(`\n== ${texto}`);

const ruta = `/api/v1/accounts/${cuenta}/conversations`;
const publica = `/public/api/v1/inboxes/${identificador}`;

if (enLinea) {
  paso("el asesor se pone en línea");
  await pedir("POST", "/api/v1/profile/availability", tokenAdmin, { profile: { availability: "online", account_id: Number(cuenta) } });
}

paso("1. el contacto escribe (crea contacto, conversación y mensaje)");
const telefono = `+52155${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
const contacto = ((await pedir("POST", `${publica}/contacts`, null, { name: "Contacto Experimento", phone_number: telefono })) as { source_id: string }).source_id;
const conversacion = ((await pedir("POST", `${publica}/contacts/${contacto}/conversations`, null, {})) as { id: number }).id;
await pedir("POST", `${publica}/contacts/${contacto}/conversations/${conversacion}/messages`, null, { content: "Hola" });
console.log(`conversación ${conversacion}`);
await pausa();

paso("2. el bot contesta y deja una nota privada");
await pedir("POST", `${ruta}/${conversacion}/messages`, tokenBot, { content: "Mucho gusto", message_type: "outgoing", private: false });
await pedir("POST", `${ruta}/${conversacion}/messages`, tokenBot, { content: "Nota del bot", message_type: "outgoing", private: true });
await pausa();

paso("3. el bot abre la conversación (como hace el sistema al pasarla a los asesores)");
await pedir("POST", `${ruta}/${conversacion}/toggle_status`, tokenBot, { status: "open" });
await pausa();

paso("4. un asesor se la asigna");
await pedir("POST", `${ruta}/${conversacion}/assignments`, tokenAdmin, { assignee_id: 2 });
await pausa();

paso("5. el asesor escribe su primer mensaje");
await pedir("POST", `${ruta}/${conversacion}/messages`, tokenAdmin, { content: "Hola, soy del equipo", message_type: "outgoing", private: false });
await pausa();

paso("6. el asesor escribe una nota privada");
await pedir("POST", `${ruta}/${conversacion}/messages`, tokenAdmin, { content: "Nota del asesor", message_type: "outgoing", private: true });
await pausa();

paso("7. el asesor la resuelve");
await pedir("POST", `${ruta}/${conversacion}/toggle_status`, tokenAdmin, { status: "resolved" });
await pausa();

paso("8. el contacto vuelve a escribir en la misma conversación");
await pedir("POST", `${publica}/contacts/${contacto}/conversations/${conversacion}/messages`, null, { content: "Sigo aquí" });
await pausa();

paso("9. el asesor se desasigna");
await pedir("POST", `${ruta}/${conversacion}/assignments`, tokenAdmin, { assignee_id: null });
await pausa();

console.log("\nlisto");
