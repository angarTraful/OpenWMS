import { supabase } from './supabaseClient';
import type { 
  TarifaClienteConcepto, 
  LiquidacionCliente,
  LiquidacionClienteTramo,
  LiquidacionClienteItem,
  RemitoRxAsociado,
  EmitirFacturaParams
} from '../types/billing.types';

export const billingApi = {
  // 1. Tarifas Comerciales por Concepto del Cliente
  async listarTarifasCliente(clienteId: string): Promise<TarifaClienteConcepto[]> {
    if (!clienteId) return [];
    const { data, error }: { data: any; error: any } = await (supabase as any)
      .from('tarifas_cliente_concepto')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('concepto_codigo');
    
    if (error) {
      console.warn('Error al listar tarifas:', error.message);
      return [];
    }
    return (data as TarifaClienteConcepto[]) || [];
  },

  async guardarTarifaConcepto(tarifa: Partial<TarifaClienteConcepto>): Promise<TarifaClienteConcepto> {
    const { data, error }: { data: any; error: any } = await (supabase as any)
      .from('tarifas_cliente_concepto')
      .upsert({
        cliente_id: tarifa.cliente_id,
        concepto_codigo: tarifa.concepto_codigo,
        descripcion: tarifa.descripcion,
        tipo_unidad: tarifa.tipo_unidad,
        precio_unitario: tarifa.precio_unitario,
        moneda: tarifa.moneda || '$',
        activo: tarifa.activo ?? true,
      }, { onConflict: 'cliente_id,concepto_codigo' })
      .select()
      .single();

    if (error) throw error;
    return data as TarifaClienteConcepto;
  },

  // 2. Liquidación por Período (Llama al Stored Procedure ACID wms_liquidar_estadia_periodo)
  async liquidarPeriodo(
    clienteId: string,
    fechaDesde: string,
    fechaHasta: string,
    recalcular: boolean = false
  ): Promise<{ success: boolean; liquidacion_id: string; numero_liquidacion: string; mensaje?: string; auditoria?: any }> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_liquidar_estadia_periodo', {
      p_cliente_id: clienteId,
      p_fecha_desde: fechaDesde,
      p_fecha_hasta: fechaHasta,
      p_recalcular: recalcular,
    });

    if (error) {
      throw new Error(error.message || 'Error ejecutando procedimiento de liquidación.');
    }

    return data;
  },

  // 3. Listar Historial de Liquidaciones de Clientes
  async listarLiquidaciones(clienteId?: string): Promise<LiquidacionCliente[]> {
    let query: any = (supabase as any)
      .from('liquidaciones_cliente')
      .select(`
        *,
        cliente:clientes(codigo, razon_social, identificacion_fiscal, direccion)
      `)
      .order('fecha_desde', { ascending: false });

    if (clienteId) {
      query = query.eq('cliente_id', clienteId);
    }

    const { data, error }: { data: any; error: any } = await query;
    if (error) {
      console.warn('Error al listar liquidaciones:', error.message);
      return [];
    }
    return (data as LiquidacionCliente[]) || [];
  },

  // 4. Obtener Detalle Completo de una Liquidación (Cabecera + Tramos + Items)
  async obtenerLiquidacionDetalle(liquidacionId: string): Promise<LiquidacionCliente | null> {
    const { data, error }: { data: any; error: any } = await (supabase as any)
      .from('liquidaciones_cliente')
      .select(`
        *,
        cliente:clientes(codigo, razon_social, identificacion_fiscal, direccion),
        tramos:liquidaciones_cliente_tramos(*),
        items:liquidaciones_cliente_items(*)
      `)
      .eq('id', liquidacionId)
      .single();

    if (error) throw error;
    if (!data) return null;

    const liq: LiquidacionCliente = {
      ...data,
      tramos: (data.tramos || []).sort(
        (a: LiquidacionClienteTramo, b: LiquidacionClienteTramo) => a.orden_tramo - b.orden_tramo
      ),
      items: data.items || [],
    };

    return liq;
  },

  // 5. Agregar Concepto / Renglón Manual a Mano
  async agregarItemManual(
    liquidacionId: string,
    item: {
      concepto_codigo?: string;
      descripcion: string;
      cantidad: number;
      unidad_medida: string;
      precio_unitario: number;
      notas?: string;
    }
  ): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_agregar_item_manual_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_concepto_codigo: item.concepto_codigo || 'MANUAL_AD_HOC',
      p_descripcion: item.descripcion,
      p_cantidad: item.cantidad,
      p_unidad_medida: item.unidad_medida,
      p_precio_unitario: item.precio_unitario,
      p_notas: item.notas || null,
    });

    if (error) throw error;
    return data;
  },

  // 6. Eliminar Concepto / Renglón (Sistema o Manual, mientras esté en borrador)
  async eliminarItem(itemId: string): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_eliminar_item_manual_liquidacion', {
      p_item_id: itemId,
    });

    if (error) throw error;
    return data;
  },

  // Alias retrocompatible
  async eliminarItemManual(itemId: string): Promise<any> {
    return this.eliminarItem(itemId);
  },

  // 7. Modificar Valores de Concepto (Cantidad, Precio, Descripción, Notas)
  async actualizarItemLiquidacion(
    itemId: string,
    cambios: {
      cantidad: number;
      precio_unitario: number;
      descripcion?: string;
      notas?: string;
    }
  ): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_actualizar_item_liquidacion', {
      p_item_id: itemId,
      p_cantidad: cambios.cantidad,
      p_precio_unitario: cambios.precio_unitario,
      p_descripcion: cambios.descripcion || null,
      p_notas: cambios.notas || null,
    });

    if (error) throw error;
    return data;
  },

  // 8. Aprobar Liquidación (Bloqueo Inmutable para Facturación)
  async aprobarLiquidacion(liquidacionId: string, usuarioId?: string): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_aprobar_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_usuario_id: usuarioId || null,
    });

    if (error) throw error;
    return data;
  },

  // 9. Marcar Liquidación como Facturada (Legacy simple)
  async facturarLiquidacion(liquidacionId: string, observaciones?: string): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_facturar_liquidacion', {
      p_liquidacion_id: liquidacionId,
      p_observaciones: observaciones || null,
    });

    if (error) throw error;
    return data;
  },

  // 10. Listar Remitos Rx de Tránsito vinculados al período a facturar
  async listarRemitosPorPeriodo(clienteId: string, fechaDesde: string, fechaHasta: string): Promise<RemitoRxAsociado[]> {
    if (!clienteId || !fechaDesde || !fechaHasta) return [];
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_obtener_remitos_periodo_cliente', {
      p_cliente_id: clienteId,
      p_fecha_desde: fechaDesde,
      p_fecha_hasta: fechaHasta,
    });

    if (error) {
      console.warn('Error al obtener remitos del período:', error.message);
      return [];
    }
    return (data as RemitoRxAsociado[]) || [];
  },

  // 11. Emisión Fiscal Electrónica Completa (Factura A / B con CAE, PV, IVA y Remitos Rx)
  async emitirFacturaFiscal(params: EmitirFacturaParams): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_emitir_factura_fiscal_liquidacion', {
      p_liquidacion_id: params.liquidacionId,
      p_tipo_comprobante: params.tipoComprobante,
      p_punto_venta: params.puntoVenta,
      p_numero_factura: params.numeroFactura,
      p_cae: params.cae,
      p_fecha_vencimiento_cae: params.fechaVencimientoCae,
      p_alicuota_iva: params.alicuotaIva,
      p_remitos: params.remitos ? JSON.parse(JSON.stringify(params.remitos)) : [],
      p_datos_emisor: params.datosEmisor || null,
      p_observaciones: params.observaciones || null,
    });

    if (error) {
      throw new Error(error.message || 'Error al emitir la factura fiscal electrónica.');
    }
    return data;
  },

  // 12. Anulación Fiscal / Nota de Crédito con Motivo de Auditoría
  async anularFacturaFiscal(liquidacionId: string, motivo: string): Promise<any> {
    const { data, error }: { data: any; error: any } = await (supabase as any).rpc('wms_anular_factura_fiscal', {
      p_liquidacion_id: liquidacionId,
      p_motivo: motivo,
    });

    if (error) {
      throw new Error(error.message || 'Error al anular la factura fiscal.');
    }
    return data;
  },
};

