// «Salud» del expediente, solo con permiso de salud (administrador y maestro del grupo). Es la misma vista de siempre (`salud/VistaDeSalud.tsx`): pide un motivo, lee los datos sin guardarlos en el
// dispositivo, los oculta solos y cada consulta queda registrada. Al salir de la pestaña el componente se desmonta y los datos se borran de la memoria.

import { VistaDeSalud } from "../../salud/VistaDeSalud.tsx";

export function PanelSalud({ alumnoId, nombre }: { alumnoId: string; nombre: string }) {
  return (
    <div className="pila expediente-panel expediente-salud" data-prueba="panel-salud">
      <h2>Salud de {nombre}</h2>
      <VistaDeSalud key={alumnoId} alumnoId={alumnoId} />
    </div>
  );
}
