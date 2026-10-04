export interface TarifaClienteConcepto {
  id: string;
  cliente_id: string;
  concepto_codigo: string;
  descripcion: string;
  tipo_unidad: 'm3_dia' | 'operacion' | 'bulto' | 'pallet' | 'servicio' | 'hora';
  precio_unitario: number;
  moneda: string;
  activo: boolean;
  creado_en?: string;
  actualizado_en?: string;
}

export interface LiquidacionClienteTramo {
  id: string;
  liquidacion_id: string;
  orden_tramo: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_en_tramo: number;
  volumen_m3: number;
  bultos_totales: number;
  m3_dias_acumulados: number;
  tarifa_m3_aplicada: number;
  subtotal_tramo: number;
}

export interface LiquidacionClienteItem {
  id: string;
  liquidacion_id: string;
  concepto_codigo: string;
  descripcion: string;
  origen: 'automatico' | 'manual';
  cantidad: number;
  unidad_medida: string;
  precio_unitario: number;
  subtotal: number;
  notas?: string | null;
  creado_en?: string;
}

export interface AuditoriaKardexResultado {
  desvios_count: number;
  estado: 'OK' | 'ALERTA';
  mensaje: string;
  stock_inventario_bultos?: number;
  stock_kardex_bultos?: number;
  diferencia_bultos?: number;
  stock_bultos_verificado?: number;
}

export interface RemitoRxAsociado {
  id: string;
  numero_remito_rx: string;
  fecha_emision: string;
  cae_o_autorizacion_fiscal?: string | null;
  total_bultos: number;
  total_pallets: number;
  peso_total_kg: number;
  volumen_total_m3: number;
  valor_declarado_total?: number;
  estado: string;
  destinatario?: {
    id: string;
    razon_social_destinatario: string;
    codigo_sucursal?: string;
    direccion_entrega?: string;
    ciudad?: string;
  };
}

export interface EmitirFacturaParams {
  liquidacionId: string;
  tipoComprobante: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C';
  puntoVenta: string;
  numeroFactura: string;
  cae: string;
  fechaVencimientoCae: string;
  alicuotaIva: number;
  remitos?: RemitoRxAsociado[];
  datosEmisor?: {
    razon_social: string;
    cuit: string;
    iibb: string;
    condicion_iva: string;
    direccion: string;
    inicio_actividades: string;
  };
  observaciones?: string;
}

export interface LiquidacionCliente {
  id: string;
  numero_liquidacion: string;
  cliente_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  estado: 'borrador' | 'aprobada' | 'facturada' | 'anulada';
  total_dias_periodo: number;
  total_m3_dias: number;
  total_bultos_stock: number;
  subtotal_estadia: number;
  subtotal_operativo: number;
  subtotal_manuales: number;
  monto_total: number;
  moneda: string;
  auditoria_desvios_detectados: AuditoriaKardexResultado;
  observaciones?: string | null;
  aprobado_por?: string | null;
  fecha_aprobacion?: string | null;

  // Campos Fiscales AFIP
  tipo_comprobante?: 'FACTURA_A' | 'FACTURA_B' | 'FACTURA_C' | 'NOTA_CREDITO_A' | 'NOTA_CREDITO_B' | null;
  punto_venta?: string | null;
  numero_factura?: string | null;
  cae?: string | null;
  fecha_vencimiento_cae?: string | null;
  alicuota_iva?: number | null;
  monto_neto_gravado?: number | null;
  monto_iva?: number | null;
  monto_total_facturado?: number | null;
  fecha_facturacion?: string | null;
  remitos_asociados?: RemitoRxAsociado[] | null;
  motivo_anulacion?: string | null;
  fecha_anulacion?: string | null;
  datos_emisor?: any | null;

  creado_en: string;
  actualizado_en?: string;
  cliente?: {
    codigo: string;
    razon_social: string;
    identificacion_fiscal?: string | null;
    direccion?: string | null;
  };
  tramos?: LiquidacionClienteTramo[];
  items?: LiquidacionClienteItem[];
}
