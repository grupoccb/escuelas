// Directorio de agentes de Chatwoot (B5): quiénes son los asesores allá, para enlazar a cada uno con
// su usuario del sistema (por correo) y saber qué asesor tiene cada conversación. Es un ADAPTADOR
// (invariante 11): la implementación real habla con la API de Chatwoot (src/mensajeria/chatwoot/
// directorio.ts, invariante 4) y la falsa no sale a ninguna red.

export interface AgenteChatwoot {
  id: number;
  correo: string;
  nombre: string;
}

export class ErrorDirectorio extends Error {}

export interface DirectorioAgentes {
  /** Agentes de una cuenta de Chatwoot. Lanza `ErrorDirectorio` si no se puede consultar. */
  listarAgentes(chatwootAccountId: number): Promise<AgenteChatwoot[]>;
}

/** Implementación falsa: los agentes se declaran en la prueba. */
export class DirectorioAgentesFalso implements DirectorioAgentes {
  private readonly porCuenta = new Map<number, AgenteChatwoot[]>();
  /** Si se define, la consulta falla con este mensaje. */
  falla: string | undefined;
  consultas = 0;

  agregar(chatwootAccountId: number, agente: AgenteChatwoot): this {
    this.porCuenta.set(chatwootAccountId, [...(this.porCuenta.get(chatwootAccountId) ?? []), agente]);
    return this;
  }

  async listarAgentes(chatwootAccountId: number): Promise<AgenteChatwoot[]> {
    this.consultas++;
    if (this.falla) throw new ErrorDirectorio(this.falla);
    return [...(this.porCuenta.get(chatwootAccountId) ?? [])];
  }
}
