// Un aviso corto para quien administra una escuela que todavía no está lista: en el embudo (la primera pantalla de quien entra) dice cuántos pasos faltan y lleva a «Para empezar».
// Solo lo ve quien puede administrar el catálogo; cuando la escuela está lista no ocupa lugar. Si el servidor no responde, simplemente no sale.

import { api } from "../../api/cliente.ts";
import { useSesion } from "../../sesion/SesionContext.tsx";
import { Aviso, EnlaceBoton } from "../../ui/basicos.tsx";
import { useCarga } from "../../ui/hooks.ts";
import type { PrimerosPasos } from "./tipos.ts";

export function AvisoDePrimerosPasos() {
  const { puede } = useSesion();
  const admin = puede("catalogo:escribir");
  // Quien no administra no pide nada (la API le respondería 403).
  const pasos = useCarga((senal) => api.get<PrimerosPasos>("/api/administracion/primeros-pasos", undefined, senal), [], admin);
  const datos = admin ? pasos.datos : null;
  if (!datos || datos.siguiente === null) return null;
  const siguiente = datos.pasos.find((p) => p.id === datos.siguiente);
  return (
    <Aviso titulo="Para empezar" tono="info">
      <div data-prueba="aviso-primeros-pasos" className="pila">
        <p>
          Tu escuela todavía no está lista: van {datos.hechos} de {datos.total} pasos. Lo que sigue: {siguiente?.titulo ?? "revisar Administración"}.
        </p>
        <div>
          <EnlaceBoton to="/admin" variante="primario">
            Ver los pasos
          </EnlaceBoton>
        </div>
      </div>
    </Aviso>
  );
}
