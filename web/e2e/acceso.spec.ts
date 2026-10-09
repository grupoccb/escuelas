import { comoRol, entrarPorPantalla, expect, mundo, test, type Rol } from "./fixtura.ts";

const SECCIONES_POR_ROL: Record<Rol, { vistas: string[]; ocultas: string[] }> = {
  maestro: { vistas: ["Hoy", "Pase de lista"], ocultas: ["Embudo", "Tareas", "Registrar pago", "Estado de cuenta", "Uniformes", "Ventas"] },
  asesor: { vistas: ["Hoy", "Embudo", "Tareas", "Estado de cuenta"], ocultas: ["Pase de lista", "Registrar pago", "Uniformes", "Ventas"] },
  recepcion: { vistas: ["Pase de lista", "Registrar pago", "Estado de cuenta", "Uniformes", "Ventas"], ocultas: ["Hoy", "Embudo", "Tareas"] },
  administrador: { vistas: ["Hoy", "Pase de lista", "Embudo", "Tareas", "Registrar pago", "Estado de cuenta", "Uniformes", "Ventas"], ocultas: [] },
};

const INICIO: Record<Rol, string> = { maestro: "/hoy", asesor: "/embudo", recepcion: "/pagos", administrador: "/embudo" };

test.describe("inicio de sesión", () => {
  for (const rol of ["maestro", "asesor", "recepcion", "administrador"] as const) {
    test(`${rol}: entra con sus credenciales y solo ve sus secciones`, async ({ page }) => {
      const u = mundo.usuarios[rol];
      await entrarPorPantalla(page, u.correo, u.contrasena);
      await expect(page).toHaveURL(new RegExp(`${INICIO[rol]}$`));
      await expect(page.getByTestId("usuario")).toHaveText(u.nombre);
      const lateral = page.getByRole("navigation", { name: "Secciones" });
      for (const etiqueta of SECCIONES_POR_ROL[rol].vistas) await expect(lateral.getByRole("link", { name: etiqueta })).toBeVisible();
      for (const etiqueta of SECCIONES_POR_ROL[rol].ocultas) await expect(lateral.getByRole("link", { name: etiqueta })).toHaveCount(0);
    });
  }

  test("una contraseña incorrecta no entra y no dice si el correo existe", async ({ page }) => {
    await entrarPorPantalla(page, "nadie@navegador.test", "contrasena-equivocada-1");
    await expect(page.getByRole("alert")).toContainText("Correo o contraseña incorrectos.");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await entrarPorPantalla(page, mundo.usuarios.maestro.correo, "contrasena-equivocada-1");
    await expect(page.getByRole("alert")).toContainText("Correo o contraseña incorrectos.");
  });

  test("tras cinco intentos fallidos el acceso se bloquea y la pantalla dice cuánto esperar", async ({ page }) => {
    const u = mundo.usuarios.bloqueable;
    for (let i = 0; i < 5; i++) {
      await entrarPorPantalla(page, u.correo, "contrasena-equivocada-1");
      await expect(page.getByRole("alert")).toContainText("Correo o contraseña incorrectos.");
    }
    // El sexto intento, aun con la contraseña correcta, está bloqueado.
    await entrarPorPantalla(page, u.correo, u.contrasena);
    await expect(page.getByRole("alert")).toContainText("Demasiados intentos");
    await expect(page.getByRole("alert")).toContainText(/minutos|segundos/);
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("la escuela es opcional: con una sola escuela no hace falta escribirla", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Escuela (opcional)")).toBeVisible();
    await entrarPorPantalla(page, mundo.usuarios.recepcion.correo, mundo.usuarios.recepcion.contrasena);
    await expect(page).toHaveURL(/\/pagos$/);
  });
});

test.describe("sesión", () => {
  test.use(comoRol("maestro"));

  test("cerrar sesión devuelve al acceso y la sesión ya no sirve", async ({ page }) => {
    // Esta prueba usa su PROPIA sesión (no la guardada) para no cerrar la de las demás.
    await page.context().clearCookies();
    await entrarPorPantalla(page, mundo.usuarios.maestro.correo, mundo.usuarios.maestro.contrasena);
    await expect(page).toHaveURL(/\/hoy$/);
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByText("Cerraste tu sesión.")).toBeVisible();
    const yo = await page.request.get("/api/yo");
    expect(yo.status()).toBe(401);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  });

  test("una sesión que venció avisa al volver a la pestaña y deja entrar de nuevo en el mismo lugar", async ({ page, context }) => {
    await context.clearCookies();
    await entrarPorPantalla(page, mundo.usuarios.maestro.correo, mundo.usuarios.maestro.contrasena);
    await expect(page).toHaveURL(/\/hoy$/);
    await page.goto("/pase");
    // La sesión se revoca del lado del servidor (otro dispositivo, el administrador, el vencimiento) pero la cookie sigue en el navegador.
    const cookies = await context.cookies();
    const cierre = await page.request.delete("/api/sesion", { headers: { "x-requested-with": "prueba" } });
    expect(cierre.status()).toBe(204);
    await context.addCookies(cookies);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByText("Tu sesión terminó")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await page.getByLabel("Correo").fill(mundo.usuarios.maestro.correo);
    await page.getByLabel("Contraseña").fill(mundo.usuarios.maestro.contrasena);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/pase$/);
  });
});

test.describe("permisos por URL directa", () => {
  test.use(comoRol("maestro"));

  test("un maestro no ve recepción ni por URL directa, y la pantalla ni pide los datos", async ({ page }) => {
    const peticiones: string[] = [];
    page.on("request", (r) => peticiones.push(new URL(r.url()).pathname));
    for (const ruta of ["/pagos", "/cuenta", "/uniformes", "/ventas", "/embudo", "/tareas"]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { name: "Sin acceso" })).toBeVisible();
    }
    expect(peticiones.filter((p) => /\/api\/(pagos|cargos|ventas|productos|beneficios|tareas|leads)/.test(p))).toEqual([]);
  });
});

test.describe("rutas y seguridad del servidor", () => {
  test.use(comoRol("asesor"));

  test("una dirección que no existe muestra la página 404 de la aplicación", async ({ page }) => {
    const r = await page.goto("/esto/no/existe");
    expect(r?.status()).toBe(200); // el fallback de SPA sirve la aplicación; ella decide
    await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
  });

  test("el fallback de la interfaz no tapa la API, la salud ni los archivos que no existen", async ({ page }) => {
    const api = await page.request.get("/api/ruta-inexistente");
    expect(api.status()).toBe(404);
    expect(api.headers()["content-type"]).toContain("application/json");
    expect((await api.json()).error.codigo).toBe("no_encontrado");
    expect((await page.request.get("/salud")).status()).toBe(200);
    expect((await page.request.get("/assets/no-existe.js")).status()).toBe(404);
    expect((await page.request.get("/otro.js")).status()).toBe(404);
  });

  test("la interfaz se sirve con su política de seguridad y sin que el navegador la viole", async ({ page }) => {
    const violaciones: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violaciones.push(m.text());
    });
    const r = await page.goto("/");
    const h = r!.headers();
    expect(h["content-security-policy"]).toContain("script-src 'self'");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["cache-control"]).toBe("no-cache");
    await expect(page.getByRole("link", { name: "Embudo" }).first()).toBeVisible();
    expect(violaciones).toEqual([]);
  });
});

test.describe("sucursal", () => {
  test.describe("con dos sucursales", () => {
    test.use(comoRol("recepcion"));
    test("recepción elige la sucursal con la que trabaja", async ({ page }) => {
      await page.goto("/pagos");
      const selector = page.getByLabel("Sucursal");
      await expect(selector).toBeVisible();
      await expect(selector.locator("option")).toHaveText(["Todas mis sucursales", mundo.sucursales.norte.nombre, mundo.sucursales.sur.nombre]);
      await selector.selectOption({ label: mundo.sucursales.sur.nombre });
      await page.reload();
      await expect(page.getByLabel("Sucursal")).toHaveValue(mundo.sucursales.sur.id);
    });
  });
  test.describe("con una sola", () => {
    test.use(comoRol("asesor"));
    test("el asesor de una sucursal no ve selector, solo su nombre", async ({ page }) => {
      await page.goto("/embudo");
      await expect(page.getByLabel("Sucursal")).toHaveCount(0);
      await expect(page.locator("header.cabecera")).toContainText(mundo.sucursales.norte.nombre);
    });
  });
});

test.describe("celular", () => {
  test.use({ ...comoRol("administrador"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("la barra inferior reúne las secciones y «Más» lleva al resto y a la sesión", async ({ page }) => {
    await page.goto("/embudo");
    const barra = page.getByRole("navigation", { name: "Secciones" });
    await expect(barra.getByRole("link")).toHaveCount(5);
    await barra.getByRole("link", { name: "Más" }).click();
    await expect(page.getByRole("heading", { name: "Más" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ventas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    const ancho = await page.evaluate(() => ({ cuerpo: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    expect(ancho.cuerpo).toBeLessThanOrEqual(ancho.ventana);
  });
});
