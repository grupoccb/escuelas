// Tope del tamaño del cuerpo por ruta (B6). Un solo lugar: cada ruta pública toma el suyo de aquí.
// Los tamaños son los que la ruta realmente necesita, con holgura, y no más.

/** Inicio de sesión y cambio de contraseña: unos cuantos cientos de bytes. */
export const LIMITE_CUERPO_LOGIN = "4kb";
/** Resto de la API autenticada (JSON de recursos). */
export const LIMITE_CUERPO_API = "100kb";
/** Webhook del Agent Bot de Chatwoot (incluye el payload completo del mensaje). */
export const LIMITE_CUERPO_CHATWOOT = "1mb";
/** Webhooks de Twilio: los reales (con Referral*) pesan unos cuantos KB. */
export const LIMITE_CUERPO_TWILIO = "100kb";
/** Futura landing pública (E1): el cuestionario son unos campos de texto. */
export const LIMITE_CUERPO_LANDING = "16kb";
