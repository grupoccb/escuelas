// Direcciones IP de los clientes. Una sola forma de escribirlas, para el bloqueo de login (B1) y
// los límites de peticiones (B6).

/** Quita el prefijo de IPv4 mapeada en IPv6 (`::ffff:1.2.3.4` → `1.2.3.4`) y pasa a minúsculas. */
export function normalizarIp(ip: string | undefined | null): string {
  if (!ip) return "desconocida";
  const minusculas = ip.trim().toLowerCase();
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(minusculas);
  return mapeada?.[1] ?? minusculas;
}

/**
 * Llave para limitar por cliente. IPv4: la dirección. IPv6: el prefijo /64 (un cliente suele tener
 * un /64 entero; limitar por dirección completa sería trivial de esquivar).
 */
export function llaveDeIp(ip: string | undefined | null): string {
  const n = normalizarIp(ip);
  if (!n.includes(":")) return n;
  const [sinZona = n] = n.split("%");
  const partes = expandirIpv6(sinZona);
  return partes ? `${partes.slice(0, 4).join(":")}::/64` : n;
}

/** Ocho grupos de una IPv6 (expande `::`), o null si no tiene forma de IPv6. */
function expandirIpv6(ip: string): string[] | null {
  const [izquierda = "", derecha, ...resto] = ip.split("::");
  if (resto.length > 0) return null;
  const a = izquierda === "" ? [] : izquierda.split(":");
  const b = derecha === undefined || derecha === "" ? [] : derecha.split(":");
  if (derecha === undefined && a.length !== 8) return null;
  const faltan = 8 - a.length - b.length;
  if (faltan < 0 || (derecha !== undefined && faltan < 1)) return null;
  const grupos = [...a, ...Array<string>(derecha === undefined ? 0 : faltan).fill("0"), ...b];
  if (grupos.length !== 8 || grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return grupos.map((g) => g.replace(/^0+(?=.)/, ""));
}
