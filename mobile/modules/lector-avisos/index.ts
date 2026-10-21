import { requireOptionalNativeModule } from "expo";

// Lector de notificaciones de los bancos (solo Android). En iPhone no existe: `disponible` es false y todo es no-op.
export type EstadoLector = {
  permiso: boolean;      // la persona dio el acceso a las notificaciones en Ajustes
  activo: boolean;       // la app quiere leer (se apaga al desvincular)
  vinculado: boolean;    // tiene token y URL para mandar
  revocado: boolean;     // el servidor respondió 401: hay que volver a vincular
  escuchando: boolean;   // Android tiene el servicio conectado
  pendientes: number;    // avisos en la cola, sin mandar
  paquetes: number;      // apps bancarias en la lista
  versionPaquetes: number;
};

type Nativo = {
  estadoPermiso(): boolean;
  abrirAjustes(): boolean;
  abrirAjustesApp(): boolean;
  vincular(token: string, url: string): void;
  desvincular(): void;
  activar(activo: boolean): void;
  actualizarPaquetes(paquetes: string[], version: number): void;
  estado(): EstadoLector;
  enviarAhora(): void;
};

const nativo = requireOptionalNativeModule<Nativo>("LectorAvisos");

export const disponible = nativo !== null;

const VACIO: EstadoLector = { permiso: false, activo: false, vinculado: false, revocado: false, escuchando: false, pendientes: 0, paquetes: 0, versionPaquetes: 0 };

export const estado = (): EstadoLector => nativo?.estado() ?? VACIO;
export const abrirAjustes = () => nativo?.abrirAjustes() ?? false;
export const abrirAjustesApp = () => nativo?.abrirAjustesApp() ?? false;
export const vincular = (token: string, url: string) => nativo?.vincular(token, url);
export const desvincular = () => nativo?.desvincular();
export const activar = (activo: boolean) => nativo?.activar(activo);
export const actualizarPaquetes = (paquetes: string[], version: number) => nativo?.actualizarPaquetes(paquetes, version);
export const enviarAhora = () => nativo?.enviarAhora();
