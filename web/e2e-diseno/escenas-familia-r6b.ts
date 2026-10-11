// Escenas de «Familias» y «Ficha de la familia» del rediseño v2 (R6b): las tarjetas con los hijos en el color de su disciplina y el estado de la cuenta, la ficha con sus hijos, adultos, saldo y
// mensajes. Las escenas viejas de estas pantallas siguen en `escenas-familia.ts`; aquí van las de los estados nuevos. Prefijo de ids: `familia-`.
//
// Va ANTES de `escenas-familia.ts` en el orden alfabético a propósito: ahí las últimas escenas dan de baja a los hijos de la familia de muestra, y estas necesitan verla activa. Ninguna escribe:
// lo que el mundo no trae (disciplinas con color, estados de la cuenta, adultos, la conversación) se arma editando la respuesta GET de la API, solo en esa escena.

import { irA, type Contexto, type Escena } from "./escenas.ts";

const GRUPO = "Familias, alumnos y expediente";
const P = "web/src/pantallas/familia/";
const FAMILIAS = `${P}Familias.tsx`;
const LISTA = [FAMILIAS, `${P}FamiliaEnLista.tsx`, `${P}EtiquetaDeHijoEnLista.tsx`];
const FICHA = `${P}FichaFamilia.tsx`;
const PIEZAS_DE_LA_FICHA = [FICHA, `${P}HijosDeLaFamilia.tsx`, `${P}AdultosDeLaFamilia.tsx`, `${P}SaldoDeLaFamilia.tsx`, `${P}MensajesDeLaFamilia.tsx`];

 
type Json = any;
type Coincide = (u: URL) => boolean;

const esRuta = (ruta: string): Coincide => (u) => u.pathname === ruta;
const termina = (final: string): Coincide => (u) => u.pathname.startsWith("/api/") && u.pathname.endsWith(final);

/** Edita la respuesta JSON de un GET de la API antes de que llegue a la página (las demás peticiones siguen su camino). */
async function editarGet(c: Contexto, coincide: Coincide, editar: (cuerpo: Json) => Json): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    async (r) => {
      if (r.request().method() !== "GET") return r.fallback();
      const resp = await r.fetch();
      if (!resp.ok()) return r.fulfill({ response: resp });
      const cuerpo = (await resp.json()) as Json;
      return r.fulfill({ response: resp, body: JSON.stringify(editar(cuerpo)) });
    },
  );
}

/** Un GET a la API que nunca termina. */
async function colgar(c: Contexto, coincide: Coincide): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) => (r.request().method() === "GET" ? new Promise<void>(() => undefined) : r.fallback()),
  );
}

/** Un GET a la API que falla con 500. */
async function romper(c: Contexto, coincide: Coincide): Promise<void> {
  await c.page.route(
    (u) => coincide(u),
    (r) => (r.request().method() === "GET" ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { codigo: "interno", mensaje: "Algo salió mal en el servidor. Inténtalo de nuevo.", detalles: [] } }) }) : r.fallback()),
  );
}

const rivera = (c: Contexto) => c.mundo.familia.rivera;
const rutaFicha = (c: Contexto): string => `/familias/${rivera(c).tutorId}`;

// Disciplinas de muestra: el color es un DATO de la disciplina (`color_marca`), nunca del nombre.
const DISCIPLINAS = [
  { nombre: "Disciplina Uno", color: "#c0502d" },
  { nombre: "Disciplina Dos", color: "#c8326a" },
  { nombre: "Disciplina Tres", color: "#1d8a7e" },
] as const;
const ESTADOS = ["con_vencido", "al_corriente", "por_pagar"] as const;

/** Un resumen de la API con disciplinas de colores distintos y los tres estados de la cuenta, en rotación por familia. */
function conDisciplinasYSaldos(b: Json): Json {
  b.datos.forEach((f: Json, n: number) => {
    const estado = ESTADOS[n % 3]!;
    f.saldo = f.saldo === null ? null : { estado, cargos_vencidos: estado === "con_vencido" ? 1 : 0, vencido: estado === "con_vencido" ? "650.00" : "0.00" };
    f.hijos.forEach((h: Json, i: number) => {
      const d = DISCIPLINAS[(n + i) % 3]!;
      h.inscripciones = h.inscripciones.map((x: Json) => ({ ...x, disciplina: { ...x.disciplina, nombre: d.nombre, color_marca: d.color } }));
    });
  });
  return b;
}

const esc = (e: Omit<Escena, "grupo">): Escena => ({ grupo: GRUPO, ...e });

/** El resumen de la familia de muestra para la ficha: dos disciplinas de colores, horarios y una promoción con descuento. */
function resumenDeLaFicha(b: Json): Json {
  const f = b.datos[0];
  if (!f) return b;
  f.hijos.forEach((h: Json, i: number) => {
    const d = DISCIPLINAS[i % 3]!;
    h.inscripciones = h.inscripciones.map((x: Json, k: number) => ({
      ...x,
      disciplina: { ...x.disciplina, nombre: d.nombre, color_marca: d.color },
      horarios: [{ dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 }, { dia_semana: 3, hora_inicio_min: 960, hora_fin_min: 1020 }],
      ...(i === 0 && k === 0 ? { promocion: { id: "promocion-de-muestra", nombre: "Promoción de muestra" }, descuento_mensualidad: "100.00" } : {}),
    }));
  });
  return b;
}

/** Un cargo vencido de 650 en la cuenta de la familia de muestra (saldo total 2,400.50). */
function cuentaConVencido(b: Json): Json {
  const cargo = { id: "cargo-vencido-de-muestra", inscripcion_id: null, concepto: "mensualidad", periodo: "2026-09", descripcion: null, monto_final: "650.00", monto_pagado: "0.00", saldo: "650.00", fecha_vencimiento: "2026-09-15", estatus: "vencido", estatus_efectivo: "vencido", dias_de_atraso: 26 };
  if (b.hijos[0]) b.hijos[0].cargos = [cargo, ...b.hijos[0].cargos];
  b.resumen = { ...b.resumen, saldo: "2400.50", vencido: "650.00", total_cargado: "3050.50", antiguedad: { de_0_a_30: "650.00", de_31_a_60: "0.00", de_61_a_90: "0.00", mas_de_90: "0.00" } };
  return b;
}

/** Cada hijo trae también a otro adulto (papá), con sus propias banderas. */
function conOtroAdulto(b: Json): Json {
  b.datos.forEach((a: Json, i: number) => {
    const yaEsta = a.tutores[0];
    if (!yaEsta) return;
    a.tutores = [
      { ...yaEsta, es_contacto_urgencia: true, puede_recoger: true },
      { ...yaEsta, tutor_id: "adulto-de-muestra", nombre: "Rodrigo", apellidos: yaEsta.apellidos ?? "", parentesco: "padre", es_responsable_pago: false, es_contacto_urgencia: true, puede_recoger: i === 0, lo_lleva: i === 0, telefono: "+525599010010", correo: null },
    ];
  });
  return b;
}

const MENSAJES_COMPLETOS = { promociones: "acepta", recordatorio_de_pago: "2026-09-15", asesor: "Daniela Ortiz", conversacion: { id: "conversacion-de-muestra", chatwoot: { cuenta_id: 1, bandeja_id: 3, conversacion_id: 42 } } };

export const ESCENAS: Escena[] = [
  // ═══ Familias (lista) ═══
  esc({
    id: "familia-familias-lista-disciplinas-color",
    rol: "recepcion",
    titulo: "Familias: tarjetas con los hijos en el color de su disciplina y el estado de la cuenta (con vencido, por pagar y al corriente)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: LISTA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), conDisciplinasYSaldos);
      await irA(c, "/familias");
    },
  }),
  esc({
    id: "familia-familias-lista-sin-resumen",
    rol: "recepcion",
    titulo: "Familias: si el resumen no carga, las tarjetas salen con etiquetas neutras y sin estado de cuenta",
    tipo: "estado",
    ruta: "/familias",
    fuentes: LISTA,
    ir: async (c) => {
      await romper(c, esRuta("/api/familias/resumen"));
      await irA(c, "/familias");
    },
  }),
  esc({
    id: "familia-familias-lista-tarjeta-hover",
    rol: "recepcion",
    titulo: "Familias: una tarjeta con el ratón encima (borde y sombra)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: LISTA,
    vistas: ["escritorio"],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), conDisciplinasYSaldos);
      await irA(c, "/familias");
      await c.page.locator(".familia-tarjeta").first().hover();
      await c.page.waitForTimeout(250);
    },
  }),
  esc({
    id: "familia-familias-lista-tarjeta-foco",
    rol: "recepcion",
    titulo: "Familias: una tarjeta con el foco del teclado (el anillo rodea toda la tarjeta)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: LISTA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), conDisciplinasYSaldos);
      await irA(c, "/familias");
      await c.page.keyboard.press("Tab");
      await c.page.locator(".familia-tarjeta-enlace").first().focus();
      await c.page.waitForTimeout(200);
    },
  }),
  esc({
    id: "familia-familias-lista-hijos-no-activos",
    rol: "recepcion",
    titulo: "Familias: hijos dados de baja o congelados («· baja», «· congelado») y una familia sin alumnos",
    tipo: "estado",
    ruta: "/familias",
    fuentes: LISTA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/tutores"), (b) => {
        const base = b.datos.find((t: Json) => t.alumnos.length >= 2) ?? b.datos[0];
        if (!base) return b;
        const otros = b.datos.filter((t: Json) => t.id !== base.id);
        const hijo = (n: number, estatus: string) => ({ ...base.alumnos[0], alumno_id: `a-muestra-${n}`, nombre: `Hijo ${estatus}`, estatus });
        return { ...b, datos: [{ ...base, alumnos: [base.alumnos[0], hijo(1, "baja"), hijo(2, "congelado")] }, { ...base, id: "00000000-0000-4000-8000-0000000000b1", nombre: "Familia", apellidos: "Sin alumnos", alumnos: [] }, ...otros] };
      });
      await irA(c, "/familias");
    },
  }),
  esc({
    id: "familia-familias-lista-nombres-largos",
    rol: "recepcion",
    titulo: "Familias: nombres muy largos de la familia y de los hijos (se parten en varias líneas, sin desbordar)",
    tipo: "estado",
    ruta: "/familias",
    fuentes: LISTA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/tutores"), (b) => ({ ...b, datos: b.datos.map((t: Json) => ({ ...t, nombre: "Maria de los Angeles Guadalupe", apellidos: "Fernandez de la Garza Hernandez-Villarreal", alumnos: t.alumnos.map((a: Json) => ({ ...a, nombre: "Juan Sebastian Alejandro Maximiliano" })) })) }));
      await irA(c, "/familias");
    },
  }),

  // ═══ Familias con un solo hijo ═══
  esc({
    id: "familia-un-solo-hijo-colores",
    rol: "asesor",
    titulo: "Familias con un solo hijo: el hijo y «Ya está en» con el color de su disciplina, el aviso con «Descargar la lista (CSV)»",
    tipo: "estado",
    ruta: "/familias/un-solo-hijo",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), conDisciplinasYSaldos);
      await irA(c, "/familias/un-solo-hijo");
    },
  }),
  esc({
    id: "familia-un-solo-hijo-sin-resumen",
    rol: "asesor",
    titulo: "Familias con un solo hijo: si el resumen no carga, todo en el neutro del sistema",
    tipo: "estado",
    ruta: "/familias/un-solo-hijo",
    fuentes: [FAMILIAS],
    ir: async (c) => {
      await romper(c, esRuta("/api/familias/resumen"));
      await irA(c, "/familias/un-solo-hijo");
    },
  }),

  // ═══ Ficha de la familia ═══
  esc({
    id: "familia-ficha-disciplinas-color",
    rol: "recepcion",
    titulo: "Ficha de la familia: hijos con su monograma en el tono de su disciplina, grupo, horario y sucursal, y la promoción activa",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), resumenDeLaFicha);
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-con-vencido",
    rol: "recepcion",
    titulo: "Ficha de la familia: saldo con un cargo vencido («1 cargo vencido · $650.00»)",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), resumenDeLaFicha);
      await editarGet(c, termina("/estado-cuenta"), cuentaConVencido);
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-adultos",
    rol: "recepcion",
    titulo: "Ficha de la familia: dos adultos con sus banderas por hijo («Marisol paga», «Recogen …», «Responsable de pago», «Contacto de urgencia»)",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), resumenDeLaFicha);
      await editarGet(c, esRuta("/api/alumnos"), conOtroAdulto);
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-con-conversacion",
    rol: "recepcion",
    titulo: "Ficha de la familia: «Abrir conversación» (hay conversación y Chatwoot configurado) y «Mensajes» completos",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/yo"), (yo) => {
        yo.configuracion.chatwoot_url_publica = "https://chat.ejemplo.invalid";
        return yo;
      });
      await editarGet(c, esRuta("/api/familias/resumen"), resumenDeLaFicha);
      await editarGet(c, esRuta(`/api/familias/${rivera(c).tutorId}/mensajes`), () => MENSAJES_COMPLETOS);
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-mensajes-sin-datos",
    rol: "recepcion",
    titulo: "Ficha de la familia: «Mensajes» sin recordatorio, sin registro de consentimiento y sin asesor",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta(`/api/familias/${rivera(c).tutorId}/mensajes`), () => ({ promociones: "sin_registro", recordatorio_de_pago: null, asesor: null, conversacion: null }));
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-mensajes-no-acepta",
    rol: "recepcion",
    titulo: "Ficha de la familia: «Mensajes» de una familia que pidió no recibir promociones",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta(`/api/familias/${rivera(c).tutorId}/mensajes`), () => ({ ...MENSAJES_COMPLETOS, promociones: "no_acepta", conversacion: null }));
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-mensajes-cargando",
    rol: "recepcion",
    titulo: "Ficha de la familia: «Mensajes» cargando",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await colgar(c, termina("/mensajes"));
      await c.page.goto(rutaFicha(c));
      await c.page.getByRole("heading", { name: "Mensajes" }).waitFor();
      await c.page.waitForTimeout(250);
    },
  }),
  esc({
    id: "familia-ficha-mensajes-error",
    rol: "recepcion",
    titulo: "Ficha de la familia: error al cargar «Mensajes» con «Reintentar» dentro de la tarjeta",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await romper(c, termina("/mensajes"));
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-sin-resumen",
    rol: "recepcion",
    titulo: "Ficha de la familia: si el resumen no carga, los hijos salen en el neutro del sistema y sin grupo",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await romper(c, esRuta("/api/familias/resumen"));
      await romper(c, esRuta("/api/alumnos"));
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-nombres-largos",
    rol: "recepcion",
    titulo: "Ficha de la familia: nombres muy largos (se parten en varias líneas, sin desbordar)",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta(`/api/tutores/${rivera(c).tutorId}`), (t) => {
        t.nombre = "Maria de los Angeles Guadalupe";
        t.apellidos = "Fernandez de la Garza Hernandez-Villarreal";
        t.correo = "maria.de.los.angeles.fernandez.de.la.garza@correo-de-muestra.example";
        t.alumnos = t.alumnos.map((a: Json) => ({ ...a, nombre: "Juan Sebastian Alejandro Maximiliano" }));
        return t;
      });
      await editarGet(c, esRuta("/api/familias/resumen"), resumenDeLaFicha);
      await irA(c, rutaFicha(c));
    },
  }),
  esc({
    id: "familia-ficha-asesor-vencido",
    rol: "asesor",
    titulo: "Ficha de la familia (asesor): ve el saldo y «Ver estado de cuenta» pero no «Registrar pago»",
    tipo: "estado",
    ruta: "/familias/:tutorId",
    fuentes: PIEZAS_DE_LA_FICHA,
    ir: async (c) => {
      await editarGet(c, esRuta("/api/familias/resumen"), resumenDeLaFicha);
      await editarGet(c, termina("/estado-cuenta"), cuentaConVencido);
      await irA(c, rutaFicha(c));
    },
  }),
];
