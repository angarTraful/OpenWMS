import { supabase } from './supabaseClient';

export type EstadoProgramacion =
  | 'entregado'      // 🟠 Naranja / Ámbar (Entregado / Despachado)
  | 'programado'     // 🔵 Celeste / Azul Cielo (Programado / En Preparación / En Picking)
  | 'en_transito'    // 🟢 Verde (En Tránsito / En Ruta Chofer)
  | 'pendiente'      // ⚪ Blanco / Neutro (Ingresado / Pendiente de preparación)
  | 'con_novedad';   // 🔴 Rojo / Salmón (Con Novedad / Reclamo / Devolución)

export interface DocumentoAdjuntoInfo {
  tiene_remito: boolean;
  remito_numero?: string;
  remito_fecha?: string;
  tiene_romaneo: boolean;
  romaneo_id?: string;
  tiene_pedido: boolean;
  tiene_rx_conformado: boolean;
  rx_firmado_por?: string;
  rx_fecha?: string;
  rx_firma_url?: string;
}

export interface ProgramacionItem {
  id: string;
  pedido_id: string;
  detalle_id?: string;
  fecha: string;               // ISO YYYY-MM-DD
  fecha_display: string;       // Formato corto ej. "27-jun"
  cliente_id?: string;
  cliente_nombre: string;      // Cuenta 3PL Titular (ej. "TEXTIL SUR")
  destinatario_id?: string;
  destinatario_nombre: string; // Destinatario final de la entrega (ej. "MITRE", "LAVALLE", "LINIK")
  rollos: number;              // Cantidad de rollos
  item_codigo: string;         // ej. "3642 TRACKER"
  item_descripcion?: string;
  articulo_id?: string;
  orden_compra: string;        // ej. "2036 HL ABC"
  pedido_numero: string;       // ej. "PEDIDO 292"
  deposito: string;            // ej. "RONDEAU"
  deposito_id?: string;
  estado: EstadoProgramacion;
  comentarios?: string;        // ej. "SE ENTREGA 09/06"
  comentarios_highlight?: boolean;
  documentos?: DocumentoAdjuntoInfo;
  origen_datos?: 'supabase' | 'planilla_inicial';
  creado_en?: string;
  actualizado_en?: string;
}

// -----------------------------------------------------------------------------
// TABLA PARALELA / STAGING: Solicitudes y Borradores de los Clientes
// -----------------------------------------------------------------------------
export interface SolicitudParalelaItem {
  id: string;
  cliente_nombre: string;
  destinatario_nombre: string;
  rollos: number;
  item_codigo: string;
  orden_compra: string;
  fecha_solicitada: string;
  deposito_preferido: string;
  comentarios?: string;
  estado: 'pendiente_revision' | 'aprobado' | 'descartado';
  creado_por?: string;
  creado_en: string;
}

// -----------------------------------------------------------------------------
// TOKEN DE SEGURIDAD CON EXPIRACIÓN (WHATSAPP / PORTAL)
// -----------------------------------------------------------------------------
export interface TokenAccesoPayload {
  c: string;        // cliente o destinatario
  cid?: string;     // cliente_id
  exp: number;      // timestamp expiracion ms
  iat: number;      // timestamp creacion ms
  h: number;        // duracion horas
  r: 'cliente';     // rol
}

/**
 * Genera un token temporal seguro y codificado en URL-Safe Base64
 */
export function generarTokenAccesoCliente(params: {
  clienteNombre: string;
  clienteId?: string;
  horasValidez: number;
}): string {
  const now = Date.now();
  const exp = now + params.horasValidez * 60 * 60 * 1000;
  const payload: TokenAccesoPayload = {
    c: params.clienteNombre.toUpperCase().trim(),
    cid: params.clienteId,
    iat: now,
    exp,
    h: params.horasValidez,
    r: 'cliente',
  };

  try {
    const jsonStr = JSON.stringify(payload);
    // Codificación segura Base64 URL
    if (typeof window !== 'undefined' && window.btoa) {
      return window.btoa(unescape(encodeURIComponent(jsonStr)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
    return Buffer.from(jsonStr).toString('base64url');
  } catch {
    return `wms_${params.clienteNombre}_${exp}`;
  }
}

/**
 * Valida el token de acceso recibido en la URL
 */
export function validarTokenAccesoCliente(tokenStr?: string | null): {
  valido: boolean;
  expirado: boolean;
  clienteNombre?: string;
  clienteId?: string;
  tiempoRestanteTexto?: string;
  minutosRestantes?: number;
  expiraEnFecha?: string;
  error?: string;
} {
  if (!tokenStr || typeof tokenStr !== 'string' || !tokenStr.trim()) {
    return { valido: false, expirado: false, error: 'Token no provisto' };
  }

  try {
    // Si es token base64url
    let base64 = tokenStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';

    const decodedStr = decodeURIComponent(escape(window.atob(base64)));
    const payload: TokenAccesoPayload = JSON.parse(decodedStr);

    const now = Date.now();
    const diffMs = payload.exp - now;

    if (diffMs <= 0) {
      return {
        valido: false,
        expirado: true,
        clienteNombre: payload.c,
        clienteId: payload.cid,
        error: 'El token de acceso temporal ha expirado',
      };
    }

    const totalMinutos = Math.floor(diffMs / (1000 * 60));
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;
    const tiempoRestanteTexto = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;
    const expiraEnFecha = new Date(payload.exp).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });

    return {
      valido: true,
      expirado: false,
      clienteNombre: payload.c,
      clienteId: payload.cid,
      minutosRestantes: totalMinutos,
      tiempoRestanteTexto,
      expiraEnFecha,
    };
  } catch {
    // Fallback si viene en formato plano fallback wms_CLIENTE_TIMESTAMP
    if (tokenStr.startsWith('wms_')) {
      const parts = tokenStr.split('_');
      const cli = parts[1];
      const exp = parseInt(parts[2], 10);
      if (exp && exp > Date.now()) {
        return {
          valido: true,
          expirado: false,
          clienteNombre: cli,
          tiempoRestanteTexto: 'Activo',
        };
      }
      return { valido: false, expirado: true, clienteNombre: cli };
    }
    return { valido: false, expirado: false, error: 'Formato de token inválido' };
  }
}

// -----------------------------------------------------------------------------
// DATOS INICIALES AUTÉNTICOS DE LA PLANILLA (Fieles a la foto del usuario)
// -----------------------------------------------------------------------------
const RAW_PLANILLA_DATA: Array<[
  string, // id
  string, // pedido_id
  string, // fecha
  string, // fecha_display
  string, // destinatario_nombre (en la foto rotulado como 'CLIENTE')
  number, // rollos
  string, // item_codigo
  string, // orden_compra
  string, // pedido_numero
  string, // deposito
  EstadoProgramacion, // estado
  string, // comentarios
]> = [
  ['prog-01', 'ped-292', '2026-01-07', '7-ene', 'MITRE', 80, '3642 TRACKER', '2036 HL ABC', 'PEDIDO 292', 'RONDEAU', 'entregado', ''],
  ['prog-02', 'ped-293', '2026-01-07', '7-ene', 'MITRE', 72, '2111', '24004 ABC-FLS+24005 ABC BL', 'PEDIDO 293', 'RONDEAU', 'entregado', ''],
  ['prog-03', 'ped-296', '2026-01-07', '7-ene', 'MITRE', 79, '1525', 'SOSG24-114217', 'PEDIDO 296', 'RONDEAU', 'entregado', ''],
  ['prog-04', 'ped-291', '2026-01-08', '8-ene', 'MITRE', 348, '550 BENGALIN', '24031 ABC-FLS', 'PEDIDO 291', 'MENDEZ', 'entregado', ''],
  ['prog-05', 'ped-299', '2026-01-14', '14-ene', 'MITRE', 161, 'BATISTA CO', 'SOSG24-114405', 'PEDIDO 299', 'HEREDIA', 'entregado', ''],
  ['prog-06', 'ped-298', '2026-01-10', '10-ene', 'MITRE', 170, '19 MODAL SO', 'BLD24WU137', 'PEDIDO 298', 'HEREDIA', 'entregado', ''],
  ['prog-07', 'ped-js-01', '2026-06-09', '9-jun', 'JAIME SALEM', 1377, '2171 CUERINA', '25001 ABC', 'JAIME SALEM', 'LARRALDE', 'entregado', 'SE ENTREGA 09/06'],
  ['prog-08', 'ped-ft-01', '2026-06-05', '5-jun', 'FLOWER TIME', 70, '98 TAFETA', 'SOSG24-114406', 'FLOWER', 'RONDEAU', 'entregado', ''],
  ['prog-09', 'ped-ft-02', '2026-06-05', '5-jun', 'FLOWER TIME', 180, '98 TAFETA', '24024 LUL', 'FLOWER', 'RONDEAU', 'entregado', ''],
  ['prog-10', 'ped-793', '2026-06-09', '9-jun', 'MITRE', 114, '20 NYLON CRU', '2037 HM ABC', 'PEDIDO 793', 'LARRALDE', 'entregado', ''],
  ['prog-11', 'ped-lin-01', '2026-06-06', '6-jun', 'LINIK', 80, '550 BENGALIN', '24047 ABG', 'LINIK', 'RONDEAU', 'entregado', ''],
  ['prog-12', 'ped-lin-02', '2026-06-06', '6-jun', 'LINIK', 55, '550 BENGALIN', '24032', 'LINIK', 'RONDEAU', 'entregado', ''],
  ['prog-13', 'ped-795', '2026-06-11', '11-jun', 'MITRE', 373, '170 TROPICA', 'LIWE17018', 'PEDIDO 795', 'HEREDIA', 'entregado', ''],
  ['prog-14', 'ped-796', '2026-06-12', '12-jun', 'MITRE', 98, '36 MICROFIB', 'SOSG23-114235', 'PEDIDO 796', 'LARRALDE', 'entregado', ''],
  ['prog-15', 'ped-797', '2026-06-12', '12-jun', 'MITRE', 30, '36 MICROFIB', 'SOSG24-115671', 'PEDIDO 797', 'RONDEAU', 'entregado', ''],
  ['prog-16', 'ped-798', '2026-06-12', '12-jun', 'MITRE', 60, '36 MICROFIB', 'SOSG24-115671', 'PEDIDO 798', 'RONDEAU', 'entregado', ''],
  ['prog-17', 'ped-799', '2026-06-19', '19-jun', 'MITRE', 34, '2001 POLAR', 'STOCK LARRALDE', 'PEDIDO 799', 'LARRALDE', 'entregado', ''],
  ['prog-18', 'ped-800', '2026-06-24', '24-jun', 'MITRE', 15, '2002 POLAR', 'STOCK RONDEAU', 'PEDIDO 800', 'RONDEAU', 'entregado', 'FALTA 4 ROSA VIEJO'],
  ['prog-19', 'ped-802', '2026-06-17', '17-jun', 'MITRE', 150, 'POLAR TAILA', 'SOSG23-113967', 'PEDIDO 802', 'HEREDIA', 'entregado', ''],
  ['prog-20', 'ped-lav-01', '2026-06-11', '11-jun', 'LAVALLE', 197, '98 TAFETA', 'SOSG24114406', 'LAVALLE', 'RONDEAU', 'entregado', ''],
  ['prog-21', 'ped-lav-02', '2026-06-11', '11-jun', 'LAVALLE', 164, '98 TAFETA', 'STOCK RONDEAU', 'LAVALLE', 'HEREDIA', 'entregado', ''],
  ['prog-22', 'ped-lav-03', '2026-06-13', '13-jun', 'LAVALLE', 248, '98 TAFETA', '24024 LUL', 'LAVALLE', 'RONDEAU', 'entregado', ''],
  ['prog-23', 'ped-lav-04', '2026-06-13', '13-jun', 'LAVALLE', 292, '98 TAFETA', '24024 LUL', 'LAVALLE', 'RONDEAU', 'entregado', ''],
  ['prog-24', 'ped-ome-01', '2026-06-13', '13-jun', 'OMEPETEX', 170, '98 TAFETA', '24024 LUL', 'LAVALLE', 'RONDEAU', 'entregado', ''],
  ['prog-25', 'ped-lav-05', '2026-06-11', '11-jun', 'LAVALLE', 269, '98 TAFETA', 'SOSG24114406', 'LAVALLE', 'RONDEAU', 'entregado', ''],
  ['prog-26', 'ped-804', '2026-06-25', '25-jun', 'MITRE', 5, '28 MICRO POI', 'OSG23-113969', 'PEDIDO 804', 'MENDEZ', 'entregado', ''],
  ['prog-27', 'ped-803', '2026-06-11', '11-jun', 'MITRE', 105, '2895 SILVER', 'SOSG24-115466', 'PEDIDO 803', 'HEREDIA', 'entregado', ''],
  ['prog-28', 'ped-805', '2026-06-11', '11-jun', 'MITRE', 43, '16 JERSEY SE', '24003 ABC', 'PEDIDO 805', 'RONDEAU', 'entregado', ''],
  ['prog-29', 'ped-806', '2026-06-12', '12-jun', 'MITRE', 167, '720 BATISTA', 'SOSG24-114405', 'PEDIDO 806', 'HEREDIA', 'entregado', ''],
  ['prog-30', 'ped-807', '2026-06-12', '12-jun', 'MITRE', 200, '720 BATISTA', 'SOSG24-114404', 'PEDIDO 807', 'HEREDIA', 'entregado', ''],
  ['prog-31', 'ped-808', '2026-06-12', '12-jun', 'MITRE', 66, '19 MODAL SO', 'BLD24WU138', 'PEDIDO 808', 'LARRALDE', 'entregado', ''],
  ['prog-32', 'ped-809', '2026-06-12', '12-jun', 'MITRE', 70, '525 BARBIE P', 'SOSG24-114217', 'PEDIDO 809', 'RONDEAU', 'entregado', ''],
  ['prog-33', 'ped-810', '2026-06-12', '12-jun', 'MITRE', 382, '2111', '24004 ABC - FLS + 24005 ABC', 'PEDIDO 810', 'RONDEAU', 'entregado', ''],
  ['prog-34', 'ped-811', '2026-06-11', '11-jun', 'MITRE', 150, '2174 VOILE', 'SOSG24-117840', 'PEDIDO 811', 'LARRALDE', 'entregado', ''],
  ['prog-35', 'ped-812', '2026-06-13', '13-jun', 'MITRE', 277, '2817 CEY', '24034 ABC', 'PEDIDO 812', 'RONDEAU', 'entregado', ''],

  // Filas en PROGRAMACIÓN (CELESTE - 27-JUN)
  ['prog-36', 'ped-813', '2026-06-27', '27-jun', 'MITRE', 85, '9055 LANILLA', 'LTS3-23524', 'PEDIDO 813', 'LARRALDE', 'programado', ''],
  ['prog-37', 'ped-814', '2026-06-11', '11-jun', 'MITRE', 113, '3312 RAYON', '24004 ABC - FLS + 24005 ABC', 'PEDIDO 814', 'RONDEAU', 'entregado', ''],
  ['prog-38', 'ped-815', '2026-06-13', '13-jun', 'MITRE', 50, '19 MODAL SO', 'BLD24WU138', 'PEDIDO 815', 'LARRALDE', 'entregado', ''],
  ['prog-39', 'ped-lin-03', '2026-06-12', '12-jun', 'LINIK', 20, '2002 POLAR', 'STOCK RONDEAU', 'LINIK', 'RONDEAU', 'entregado', ''],
  ['prog-40', 'ped-ome-02', '2026-06-12', '12-jun', 'OMEPETEX', 50, '98 TAFETA', '24024 LUL', 'OMEPE', 'RONDEAU', 'entregado', ''],
  ['prog-41', 'ped-816', '2026-06-18', '18-jun', 'MITRE', 10, '16 JERSEY SE', 'LTS3-24037', 'PEDIDO 816', 'LARRALDE', 'entregado', ''],
  ['prog-42', 'ped-817', '2026-06-24', '24-jun', 'MITRE', 15, '16 JERSEY SE', '24003 ABC', 'PEDIDO 817', 'LARRALDE', 'entregado', ''],
  ['prog-43', 'ped-818', '2026-06-27', '27-jun', 'MITRE', 40, '7402', 'LTS3-23116', 'PEDIDO 818', 'HEREDIA', 'programado', ''],
  ['prog-44', 'ped-819', '2026-06-27', '27-jun', 'MITRE', 100, '169 TROPICA', 'SOSG24-117845', 'PEDIDO 819', 'HEREDIA', 'programado', ''],
  ['prog-45', 'ped-820', '2026-06-24', '24-jun', 'MITRE', 50, '550 BENGALIN', 'PE-1994', 'PEDIDO 820', 'RONDEAU', 'entregado', ''],
  ['prog-46', 'ped-821', '2026-06-27', '27-jun', 'MITRE', 137, '550 BENGALIN', '24031 ABC - FLS', 'PEDIDO 821', 'MENDEZ', 'entregado', ''],
  ['prog-47', 'ped-822', '2026-06-24', '24-jun', 'MITRE', 50, '3642 TRACKER', '2036 HL ABC', 'PEDIDO 822', 'RONDEAU', 'entregado', ''],
  ['prog-48', 'ped-823', '2026-06-18', '18-jun', 'MITRE', 63, '3642 TRACKER', '2051 HL ABC', 'PEDIDO 823', 'LARRALDE', 'entregado', ''],
  ['prog-49', 'ped-824', '2026-06-27', '27-jun', 'MITRE', 40, '3642 TRACKER', 'TEXSAA6819', 'PEDIDO 824', 'HEREDIA', 'programado', ''],
  ['prog-50', 'ped-lav-06', '2026-06-23', '23-jun', 'LAVALLE', 5, '1198', 'WDE42589', 'LAVALLE', 'RONDEAU', 'entregado', ''],
  ['prog-51', 'ped-lav-07', '2026-06-23', '23-jun', 'LAVALLE', 6, '9231', 'WDE42589', 'LAVALLE', 'RONDEAU', 'entregado', ''],
  ['prog-52', 'ped-825', '2026-06-24', '24-jun', 'MITRE', 2, '2002 POLAR', 'STOCK RONDEAU', 'PEDIDO 825', 'RONDEAU', 'entregado', ''],
  ['prog-53', 'ped-lin-04', '2026-06-24', '24-jun', 'LINIK', 45, '2002 POLAR', 'STOCK RONDEAU', 'LINIK', 'RONDEAU', 'entregado', 'DEVOLVIO 25 ROLLOS'],
  ['prog-54', 'ped-lav-08', '2026-06-23', '23-jun', 'LAVALLE', 9, '169 TROPICA', 'BT 21322', 'LAVALLE', 'LARRALDE', 'entregado', ''],
  ['prog-55', 'ped-826', '2026-06-25', '25-jun', 'MITRE', 28, '2002 POLAR', 'STOCK RONDEAU', 'PEDIDO 826', 'RONDEAU', 'entregado', ''],
  ['prog-56', 'ped-827', '2026-06-25', '25-jun', 'MITRE', 17, '2002 POLAR', 'STOCK RONDEAU', 'PEDIDO 827', 'RONDEAU', 'entregado', ''],
  ['prog-57', 'ped-jp-01', '2026-06-25', '25-jun', 'JPAN (CELINA)', 730, 'ITEM VARIOS', 'WDE42589', 'JUPAN', 'RONDEAU', 'entregado', 'SE ENTREGAN EN 4 VIAJES'],

  // Filas 30-JUN JPAN (CELINA)
  ['prog-58', 'ped-jp-02', '2026-06-30', '30-jun', 'JPAN (CELINA)', 10, '525 BARBIE P', '24010 ABC', 'JUPAN', 'RONDEAU', 'programado', ''],
  ['prog-59', 'ped-jp-03', '2026-06-30', '30-jun', 'JPAN (CELINA)', 100, '525 BARBIE P', 'PE-3113-1', 'JUPAN', 'MENDEZ', 'programado', ''],
  ['prog-60', 'ped-jp-04', '2026-06-30', '30-jun', 'JPAN (CELINA)', 200, '525 BARBIE P', 'SOSG24-114217', 'JUPAN', 'RONDEAU', 'programado', ''],
  ['prog-61', 'ped-jp-05', '2026-06-30', '30-jun', 'JPAN (CELINA)', 22, '00 MINI WAF', 'LTS3-24218', 'JUPAN', 'RONDEAU', 'programado', ''],
  ['prog-62', 'ped-jp-06', '2026-06-30', '30-jun', 'JPAN (CELINA)', 10, '2817 CEY', '24034 ABC', 'JUPAN', 'RONDEAU', 'programado', ''],
  ['prog-63', 'ped-jp-07', '2026-06-30', '30-jun', 'JPAN (CELINA)', 75, '10 BABY COTT', '24010 ABC', 'JUPAN', 'RONDEAU', 'programado', ''],

  // 30-JUN MITRE & OTROS
  ['prog-64', 'ped-829', '2026-06-30', '30-jun', 'MITRE', 10, '1520', '2048 QD ABC', 'PEDIDO 829', 'LARRALDE', 'programado', ''],
  ['prog-65', 'ped-830', '2026-06-30', '30-jun', 'MITRE', 75, '1525', 'SOSG24-114217', 'PEDIDO 830', 'RONDEAU', 'programado', ''],
  ['prog-66', 'ped-831', '2026-06-30', '30-jun', 'MITRE', 62, '1525', '24010 ABC', 'PEDIDO 831', 'RONDEAU', 'programado', ''],
  ['prog-67', 'ped-832', '2026-06-30', '30-jun', 'MITRE', 260, '169 TROPICA', 'BT 21322', 'PEDIDO 832', 'LARRALDE', 'programado', ''],
  ['prog-68', 'ped-833', '2026-06-30', '30-jun', 'MITRE', 420, '169 TROPICA', '24064 ZH ABC', 'PEDIDO 833', 'LARRALDE', 'programado', ''],
  ['prog-69', 'ped-834', '2026-06-30', '30-jun', 'MITRE', 79, '2817 CEY', '24034 ABC', 'PEDIDO 834', 'RONDEAU', 'programado', ''],
  ['prog-70', 'ped-hub-01', '2026-06-30', '30-jun', 'HUBER', 371, '2171 CUERINA', '25002 ABC', 'HUBER', 'RONDEAU', 'programado', ''],
  ['prog-71', 'ped-hub-02', '2026-06-30', '30-jun', 'HUBER', 129, '2171 CUERINA', '25001 ABC', 'HUBER', 'LARRALDE', 'programado', ''],
  ['prog-72', 'ped-nic-01', '2026-06-30', '30-jun', 'NICARRABLA', 61, '2171 CUERINA', '25001 ABC', 'NICARRABLA', 'LARRALDE', 'programado', ''],
  ['prog-73', 'ped-835', '2026-06-30', '30-jun', 'MITRE', 120, '3312 RAYON', '24004 ABC', 'PEDIDO 835', 'RONDEAU', 'programado', ''],
  ['prog-74', 'ped-838', '2026-06-30', '30-jun', 'MITRE', 50, '3314 3 MM', 'LTS3-24216', 'PEDIDO 838', 'RONDEAU', 'programado', ''],
];

export const PLANILLA_INITIAL_DATA: ProgramacionItem[] = RAW_PLANILLA_DATA.map((row, idx) => {
  const [
    id,
    pedido_id,
    fecha,
    fecha_display,
    destinatario_nombre,
    rollos,
    item_codigo,
    orden_compra,
    pedido_numero,
    deposito,
    estado,
    comentarios,
  ] = row;

  const isEntregado = estado === 'entregado';
  const isProgramado = estado === 'programado';

  return {
    id,
    pedido_id,
    fecha,
    fecha_display,
    cliente_nombre: 'TEXTIL SUR', // Cuenta titular del cliente
    destinatario_nombre,           // Destinatario final rotulado como "CLIENTE"
    rollos,
    item_codigo,
    orden_compra,
    pedido_numero,
    deposito,
    estado,
    comentarios,
    comentarios_highlight:
      comentarios.includes('09/06') || comentarios.includes('DEVOLVIO') || comentarios.includes('FALTA'),
    documentos: {
      tiene_remito: isEntregado,
      remito_numero: isEntregado ? `RTO-0001-${String(100240 + idx).padStart(8, '0')}` : undefined,
      remito_fecha: isEntregado ? fecha : undefined,
      tiene_romaneo: isEntregado || isProgramado,
      romaneo_id: `ROM-${pedido_numero}`,
      tiene_pedido: true,
      tiene_rx_conformado: isEntregado,
      rx_firmado_por: isEntregado ? `Firma Chofer & ${destinatario_nombre}` : undefined,
      rx_fecha: isEntregado ? `${fecha} 14:30` : undefined,
    },
    origen_datos: 'planilla_inicial',
  };
});

const LOCAL_STORAGE_KEY = 'openwms_programacion_custom_items';
const LOCAL_STORAGE_PARALELAS_KEY = 'openwms_programacion_solicitudes_paralelas';

export const programacionApi = {
  /**
   * Obtiene la lista unificada de programación:
   * 1. Consulta pedidos reales de Supabase.
   * 2. Si hay pedidos de Supabase, los mapea en renglones tipo planilla con sus documentos adjuntos.
   * 3. Complementa con la planilla base / datos históricos o cambios locales.
   */
  async listarProgramacion(filtroClienteODestinatario?: string): Promise<ProgramacionItem[]> {
    let customEdits: Record<string, Partial<ProgramacionItem>> = {};
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        customEdits = JSON.parse(stored);
      }
    } catch {}

    let itemsFromDb: ProgramacionItem[] = [];

    try {
      let query = supabase
        .from('pedidos')
        .select(`
          id,
          numero_pedido,
          orden_compra_cliente,
          fecha_solicitud,
          fecha_compromiso_entrega,
          estado,
          observaciones,
          cliente_id,
          destinatario_id,
          cliente:clientes(id, razon_social, codigo),
          destinatario:destinatarios(id, razon_social, codigo_sucursal, direccion_entrega),
          almacen_origen:almacenes(id, nombre, codigo),
          detalles:pedidos_detalle(
            id,
            cantidad_solicitada,
            cantidad_reservada,
            cantidad_separada,
            articulo_id,
            articulo:articulos(id, sku, nombre, descripcion)
          )
        `)
        .neq('estado', 'cancelado')
        .order('fecha_solicitud', { ascending: false });

      if (filtroClienteODestinatario && filtroClienteODestinatario.length > 20) {
        // Es un UUID de cliente
        query = query.eq('cliente_id', filtroClienteODestinatario);
      }

      const { data: dbPedidos, error } = await query;

      if (!error && dbPedidos && dbPedidos.length > 0) {
        dbPedidos.forEach((p: any) => {
          const cliNombre = p.cliente?.razon_social || p.cliente?.codigo || 'CLIENTE';
          const destNombre = p.destinatario?.razon_social || cliNombre;
          const depNombre = p.almacen_origen?.nombre || 'RONDEAU';
          const fechaRaw = p.fecha_compromiso_entrega || p.fecha_solicitud || new Date().toISOString();
          const fechaShort = formatFechaCorta(fechaRaw);

          // Determinar estado de color según etapa WMS
          let est: EstadoProgramacion = 'pendiente';
          if (p.estado === 'despachado') {
            est = 'entregado';
          } else if (['preparado', 'en_picking', 'asignado_picking', 'agrupado_salida'].includes(p.estado)) {
            est = 'programado';
          } else if (p.estado === 'en_transito') {
            est = 'en_transito';
          }

          const isEntregado = est === 'entregado';
          const isProg = est === 'programado' || isEntregado;

          const docInfo: DocumentoAdjuntoInfo = {
            tiene_remito: isEntregado,
            remito_numero: isEntregado ? `RTO-${p.numero_pedido}` : undefined,
            remito_fecha: isEntregado ? fechaRaw.slice(0, 10) : undefined,
            tiene_romaneo: isProg,
            romaneo_id: `ROM-${p.numero_pedido}`,
            tiene_pedido: true,
            tiene_rx_conformado: isEntregado,
            rx_firmado_por: isEntregado ? destNombre : undefined,
            rx_fecha: isEntregado ? fechaRaw : undefined,
          };

          const detalles = p.detalles || [];
          if (detalles.length === 0) {
            itemsFromDb.push({
              id: `db-${p.id}`,
              pedido_id: p.id,
              fecha: fechaRaw.slice(0, 10),
              fecha_display: fechaShort,
              cliente_id: p.cliente_id,
              cliente_nombre: cliNombre.toUpperCase(),
              destinatario_id: p.destinatario_id,
              destinatario_nombre: destNombre.toUpperCase(),
              rollos: 1,
              item_codigo: 'GENERAL',
              orden_compra: p.orden_compra_cliente || '-',
              pedido_numero: p.numero_pedido,
              deposito: depNombre.toUpperCase(),
              deposito_id: p.almacen_origen?.id,
              estado: est,
              comentarios: p.observaciones || '',
              documentos: docInfo,
              origen_datos: 'supabase',
            });
          } else {
            detalles.forEach((det: any, idx: number) => {
              const artName = det.articulo?.nombre || det.articulo?.sku || 'ARTÍCULO';
              itemsFromDb.push({
                id: `db-${p.id}-${det.id || idx}`,
                pedido_id: p.id,
                detalle_id: det.id,
                fecha: fechaRaw.slice(0, 10),
                fecha_display: fechaShort,
                cliente_id: p.cliente_id,
                cliente_nombre: cliNombre.toUpperCase(),
                destinatario_id: p.destinatario_id,
                destinatario_nombre: destNombre.toUpperCase(),
                rollos: Number(det.cantidad_solicitada || 1),
                item_codigo: artName.toUpperCase(),
                item_descripcion: det.articulo?.descripcion,
                articulo_id: det.articulo_id,
                orden_compra: p.orden_compra_cliente || '-',
                pedido_numero: p.numero_pedido,
                deposito: depNombre.toUpperCase(),
                deposito_id: p.almacen_origen?.id,
                estado: est,
                comentarios: p.observaciones || '',
                documentos: docInfo,
                origen_datos: 'supabase',
              });
            });
          }
        });
      }
    } catch (err) {
      console.warn('Fallback a datos de planilla por consulta a Supabase:', err);
    }

    // Combinar datos iniciales + datos de Supabase
    let merged: ProgramacionItem[] = [...PLANILLA_INITIAL_DATA, ...itemsFromDb];

    // Aplicar personalizaciones locales
    if (Object.keys(customEdits).length > 0) {
      merged = merged.map((it) => {
        if (customEdits[it.id]) {
          return { ...it, ...customEdits[it.id] };
        }
        return it;
      });
      Object.entries(customEdits).forEach(([id, customItem]) => {
        if (!merged.some((m) => m.id === id) && (customItem as any).pedido_numero) {
          merged.push(customItem as ProgramacionItem);
        }
      });
    }

    // Filtro por destinatario o cliente
    if (filtroClienteODestinatario && filtroClienteODestinatario !== 'todos') {
      const term = filtroClienteODestinatario.toLowerCase().trim();
      merged = merged.filter((it) => {
        if (it.cliente_id === filtroClienteODestinatario) return true;
        if (it.destinatario_id === filtroClienteODestinatario) return true;
        if (it.destinatario_nombre.toLowerCase().includes(term)) return true;
        if (it.cliente_nombre.toLowerCase().includes(term)) return true;
        return false;
      });
    }

    return merged;
  },

  /**
   * Actualiza el estado, depósito o comentarios de un ítem de la planilla
   */
  async actualizarItem(id: string, updates: Partial<ProgramacionItem>): Promise<ProgramacionItem> {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      const customEdits: Record<string, Partial<ProgramacionItem>> = stored ? JSON.parse(stored) : {};
      customEdits[id] = { ...(customEdits[id] || {}), ...updates, actualizado_en: new Date().toISOString() };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(customEdits));
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }

    // Si es un pedido de Supabase, impactar en la tabla pedidos
    if (updates.pedido_id && !updates.pedido_id.startsWith('ped-')) {
      try {
        const patch: any = { actualizado_en: new Date().toISOString() };
        if (updates.comentarios !== undefined) patch.observaciones = updates.comentarios;
        if (updates.fecha) patch.fecha_compromiso_entrega = updates.fecha;
        if (updates.estado === 'entregado') patch.estado = 'despachado';
        else if (updates.estado === 'programado') patch.estado = 'en_picking';
        else if (updates.estado === 'en_transito') patch.estado = 'en_transito';
        else if (updates.estado === 'pendiente') patch.estado = 'ingresado';

        await supabase.from('pedidos').update(patch).eq('id', updates.pedido_id);
      } catch (err) {
        console.warn('No se pudo reflejar en Supabase:', err);
      }
    }

    return { id, ...updates } as ProgramacionItem;
  },

  /**
   * Agrega un nuevo renglón de pedido a la planilla oficial (solo operadores)
   */
  async agregarItem(nuevo: Omit<ProgramacionItem, 'id'>): Promise<ProgramacionItem> {
    const newId = `prog-custom-${Date.now()}`;
    const item: ProgramacionItem = {
      ...nuevo,
      id: newId,
      documentos: nuevo.documentos || {
        tiene_remito: nuevo.estado === 'entregado',
        tiene_romaneo: true,
        tiene_pedido: true,
        tiene_rx_conformado: nuevo.estado === 'entregado',
        remito_numero: nuevo.estado === 'entregado' ? `RTO-${nuevo.pedido_numero}` : undefined,
      },
      creado_en: new Date().toISOString(),
    };

    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      const customEdits: Record<string, Partial<ProgramacionItem>> = stored ? JSON.parse(stored) : {};
      customEdits[newId] = item;
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(customEdits));
    } catch (e) {
      console.error('Error guardando nuevo item en localStorage:', e);
    }

    return item;
  },

  /**
   * Elimina un renglón de la planilla
   */
  async eliminarItem(id: string): Promise<void> {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const customEdits: Record<string, Partial<ProgramacionItem>> = JSON.parse(stored);
        delete customEdits[id];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(customEdits));
      }
    } catch {}
  },
};

// -----------------------------------------------------------------------------
// SERVICIO DE TABLA PARALELA / SOLICITUDES DEL CLIENTE (STAGING)
// -----------------------------------------------------------------------------
export const solicitudesParalelasApi = {
  listar(filtroCliente?: string): SolicitudParalelaItem[] {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_PARALELAS_KEY);
      let list: SolicitudParalelaItem[] = raw ? JSON.parse(raw) : [];
      if (list.length === 0) {
        // Sembrar 2 ejemplos iniciales de solicitudes en borrador
        list = [
          {
            id: 'sol-01',
            cliente_nombre: 'TEXTIL SUR',
            destinatario_nombre: 'MITRE',
            rollos: 60,
            item_codigo: '3642 TRACKER',
            orden_compra: '2060 HL ABC',
            fecha_solicitada: '2026-07-05',
            deposito_preferido: 'RONDEAU',
            comentarios: 'Entregar antes de las 13hs por favor',
            estado: 'pendiente_revision',
            creado_en: new Date().toISOString(),
          },
          {
            id: 'sol-02',
            cliente_nombre: 'TEXTIL SUR',
            destinatario_nombre: 'JPAN (CELINA)',
            rollos: 150,
            item_codigo: '525 BARBIE P',
            orden_compra: 'PE-3120',
            fecha_solicitada: '2026-07-08',
            deposito_preferido: 'MENDEZ',
            comentarios: 'Pallet filmado completo',
            estado: 'pendiente_revision',
            creado_en: new Date().toISOString(),
          },
        ];
        localStorage.setItem(LOCAL_STORAGE_PARALELAS_KEY, JSON.stringify(list));
      }

      if (filtroCliente && filtroCliente !== 'todos') {
        const t = filtroCliente.toLowerCase();
        return list.filter(
          (s) =>
            s.destinatario_nombre.toLowerCase().includes(t) ||
            s.cliente_nombre.toLowerCase().includes(t)
        );
      }
      return list;
    } catch {
      return [];
    }
  },

  agregar(solicitud: Omit<SolicitudParalelaItem, 'id' | 'creado_en' | 'estado'>): SolicitudParalelaItem {
    const nuevo: SolicitudParalelaItem = {
      ...solicitud,
      id: `sol-${Date.now()}`,
      estado: 'pendiente_revision',
      creado_en: new Date().toISOString(),
    };
    try {
      const list = this.listar();
      const updated = [nuevo, ...list];
      localStorage.setItem(LOCAL_STORAGE_PARALELAS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error guardando solicitud paralela:', e);
    }
    return nuevo;
  },

  aprobarEIncorporar(id: string): ProgramacionItem | null {
    try {
      const list = this.listar();
      const target = list.find((s) => s.id === id);
      if (!target) return null;

      // Actualizar estado en tabla paralela
      const updatedList = list.map((s) => (s.id === id ? { ...s, estado: 'aprobado' as const } : s));
      localStorage.setItem(LOCAL_STORAGE_PARALELAS_KEY, JSON.stringify(updatedList));

      // Agregar a la planilla oficial de programación
      const nuevoOficial: Omit<ProgramacionItem, 'id'> = {
        pedido_id: `ped-aprob-${Date.now()}`,
        fecha: target.fecha_solicitada,
        fecha_display: formatFechaCorta(target.fecha_solicitada),
        cliente_nombre: target.cliente_nombre,
        destinatario_nombre: target.destinatario_nombre,
        rollos: target.rollos,
        item_codigo: target.item_codigo,
        orden_compra: target.orden_compra,
        pedido_numero: `PED-${Math.floor(1000 + Math.random() * 9000)}`,
        deposito: target.deposito_preferido || 'RONDEAU',
        estado: 'programado',
        comentarios: target.comentarios || '',
        origen_datos: 'planilla_inicial',
      };

      // Guardar en planilla oficial
      const item = programacionApi.agregarItem(nuevoOficial);
      return item as any;
    } catch (e) {
      console.error('Error aprobando solicitud paralela:', e);
      return null;
    }
  },

  eliminar(id: string): void {
    try {
      const list = this.listar();
      const updated = list.filter((s) => s.id !== id);
      localStorage.setItem(LOCAL_STORAGE_PARALELAS_KEY, JSON.stringify(updated));
    } catch {}
  },
};

/**
 * Convierte '2026-06-27' a formato corto de planilla '27-jun'
 */
export function formatFechaCorta(fechaStr?: string): string {
  if (!fechaStr) return '';
  try {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr;
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${d.getDate()}-${meses[d.getMonth()]}`;
  } catch {
    return fechaStr;
  }
}
