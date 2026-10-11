// «Nueva venta» (R5c): el alumno (se busca por nombre y se elige), el producto que se eligió a la izquierda, la cantidad con − y +, el total del cargo y «Registrar venta». La última pieza
// la gana una sola venta: el servidor descuenta la existencia de forma atómica y rechaza la otra con 409; la pantalla lo explica y vuelve a leer la existencia (`alFallar`).

import { useRef, useState, type FormEvent } from "react";
import { api, type Pagina } from "../../api/cliente.ts";
import { formatear, multiplicar } from "../../lib/dinero.ts";
import { Aviso, Boton, Cargando, ErrorDeAccion, ErrorDeCarga, Tarjeta } from "../../ui/basicos.tsx";
import { CampoBusqueda, CampoSelect } from "../../ui/campos.tsx";
import { useAccion, useCarga } from "../../ui/hooks.ts";
import { claveParaEnvio } from "./reparto.ts";
import type { Producto, Venta } from "./tipos.ts";
import { avisoDeTope, cantidadPermitida, nombreConTalla } from "./ventas.ts";

interface AlumnoBuscado {
  id: string;
  nombre: string;
  apellidos: string;
}

export function NuevaVenta({ producto, hayProductos, alVender, alFallar }: { producto: Producto | undefined; hayProductos: boolean; alVender: (v: Venta) => void; alFallar: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState<string | null>(null);
  const [alumnoId, setAlumnoId] = useState("");
  // La cantidad que se pidió es de UN producto: al elegir otro vuelve a 1 (sin efectos: se compara el producto con el que se pidió).
  const [pedida, setPedida] = useState<{ productoId: string; n: number }>({ productoId: "", n: 1 });
  const accion = useAccion();
  // UI-03: el mismo envío reintentado (corte de red, doble clic) lleva la MISMA clave y no duplica la venta; otro envío (o uno ya registrado) lleva una nueva.
  const claveRef = useRef<{ firma: string; clave: string } | null>(null);
  const alumnos = useCarga((senal) => api.get<Pagina<AlumnoBuscado>>("/api/alumnos", { nombre: consulta ?? "", limite: 10 }, senal), [consulta], consulta !== null);
  const n = cantidadPermitida(pedida.productoId === producto?.id ? pedida.n : 1, producto?.stock);
  const alumno = alumnos.datos?.datos.find((a) => a.id === alumnoId) ?? alumnos.datos?.datos[0];
  const tope = avisoDeTope(n, producto?.stock);
  const total = producto ? multiplicar(producto.precio, n) : null;
  const puede = alumno !== undefined && producto !== undefined;

  const buscarAlumno = () => {
    if (busqueda.trim().length < 2) return;
    setConsulta(busqueda.trim());
    setAlumnoId("");
  };
  const pedir = (nueva: number) => setPedida({ productoId: producto?.id ?? "", n: cantidadPermitida(nueva, producto?.stock) });

  const vender = (e: FormEvent) => {
    e.preventDefault();
    if (!alumno || !producto) return;
    claveRef.current = claveParaEnvio(claveRef.current, JSON.stringify([alumno.id, producto.id, n]), "venta");
    const clave = claveRef.current.clave;
    void accion
      .ejecutar(async () => {
        alVender(await api.post<Venta>("/api/ventas", { alumno_id: alumno.id, producto_id: producto.id, cantidad: n, clave_idempotencia: clave }));
        claveRef.current = null;
        setPedida({ productoId: producto.id, n: 1 });
        return true;
      })
      // Si falla (p. ej. alguien vendió la última pieza), la existencia que se ve ya no es la real: se vuelve a leer.
      .then((ok) => {
        if (!ok) alFallar();
      });
  };

  return (
    <Tarjeta titulo="Nueva venta" className="ventas-nueva">
      <form noValidate className="formulario" onSubmit={vender}>
        <div className="campo">
          <div className="busqueda-fila">
            {/* Enter en este campo BUSCA (antes mandaba el formulario de la venta y no pasaba nada). */}
            <CampoBusqueda etiqueta="Buscar al alumno por nombre" placeholder="Nombre del alumno" autoComplete="off" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarAlumno(); } }} aria-describedby="venta-busqueda-ayuda" />
            <Boton disabled={busqueda.trim().length < 2} onClick={buscarAlumno}>
              Buscar
            </Boton>
          </div>
          <p className={busqueda.trim().length === 1 ? "campo-error" : "campo-ayuda"} id="venta-busqueda-ayuda">
            {busqueda.trim().length === 1 ? "Escribe al menos dos letras." : "No importan los acentos ni las mayúsculas."}
          </p>
        </div>
        {alumnos.cargando ? <Cargando texto="Buscando…" /> : null}
        {alumnos.error ? <ErrorDeCarga error={alumnos.error} alReintentar={alumnos.recargar} /> : null}
        {alumnos.datos && alumnos.datos.datos.length === 0 ? <Aviso tono="alerta">No encontré a ese alumno.</Aviso> : null}
        <CampoSelect etiqueta="Alumno" value={alumno?.id ?? ""} disabled={!alumnos.datos || alumnos.datos.datos.length === 0} onChange={(e) => setAlumnoId(e.target.value)} vacio={alumno ? undefined : "Elige al alumno…"} opciones={(alumnos.datos?.datos ?? []).map((a) => ({ valor: a.id, texto: `${a.nombre} ${a.apellidos}` }))} />
        {!hayProductos ? <Aviso tono="alerta">No hay ningún producto con existencia para vender. Revisa los productos o avisa al administrador.</Aviso> : null}
        <div className="campo">
          <span className="campo-etiqueta" id="venta-producto-etiqueta">
            Producto
          </span>
          <span className="producto-elegido" aria-labelledby="venta-producto-etiqueta" data-prueba="producto-elegido">
            {producto ? nombreConTalla(producto) : "Elige un producto"}
          </span>
        </div>
        <div className="campo">
          <span className="campo-etiqueta" id="venta-cantidad-etiqueta">
            Cantidad
          </span>
          <div role="group" aria-labelledby="venta-cantidad-etiqueta" className="cantidad-paso">
            <button type="button" className="cantidad-boton" aria-label="Una menos" disabled={!producto || n <= 1} onClick={() => pedir(n - 1)}>
              −
            </button>
            <output className="cantidad-valor numero" aria-live="polite" data-prueba="cantidad-de-piezas">
              {n}
            </output>
            <button type="button" className="cantidad-boton" aria-label="Una más" disabled={!producto || tope !== null} onClick={() => pedir(n + 1)}>
              +
            </button>
          </div>
          {tope ? <p className="campo-ayuda">{tope}</p> : null}
        </div>
        <p role="status" data-prueba="total-de-la-venta" className="resumen-total">
          <span>Total del cargo</span> <strong className="cifra-principal numero">{formatear(total)}</strong>
        </p>
        <ErrorDeAccion error={accion.error} />
        {!alumno ? <p className="ventas-falta">Elige al alumno: el cargo queda a nombre de su responsable de pago.</p> : null}
        <Boton type="submit" variante="primario" grande ancho cargando={accion.ocupado} disabled={!puede}>
          {puede && total ? `Registrar venta por ${formatear(total)}` : "Registrar venta"}
        </Boton>
      </form>
    </Tarjeta>
  );
}
