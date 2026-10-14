import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';

export type RegistroInventario = Database['public']['Tables']['inventario']['Row'];
export type MovimientoInventario = Database['public']['Tables']['movimientos_inventario']['Row'];
export type PalletLpn = Database['public']['Tables']['pallets_lpn']['Row'];

export interface StockConsolidadoArticulo {
  articulo_id?: string;
  sku?: string;
  nombre?: string;
  descripcion?: string;
  unidad_medida?: string;
  disponible: number;
  reservado: number;
  total: number;
  stockFisico: number;
  stockFuturo: number;
  volumenM3Total?: number;
}

export type ResumenStockConsolidado = Record<string, StockConsolidadoArticulo>;

/**
 * Obtiene el stock consolidado por artículo para un cliente depositante.
 * Invoca prioritariamente el procedimiento RPC de Supabase 'wms_obtener_stock_consolidado_por_cliente'
 * (que agrupa existencias eficientemente en la base de datos), con fallback automático a agregación local.
 *
 * @param clienteId UUID del cliente depositante, su código comercial o teléfono
 * @returns Diccionario indexado por articulo_id con el detalle de stock disponible, reservado, físico y futuro
 */
export async function obtenerStockConsolidadoPorCliente(
  clienteId: string
): Promise<Record<string, StockConsolidadoArticulo>> {
  if (!clienteId || !clienteId.trim()) {
    return {};
  }

  const cleanId = clienteId.trim();

  // 1. Invocar RPC nativo de Supabase
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'wms_obtener_stock_consolidado_por_cliente',
      { p_cliente_id: cleanId }
    );

    if (!rpcError && rpcData && typeof rpcData === 'object' && !Array.isArray(rpcData)) {
      return rpcData as unknown as Record<string, StockConsolidadoArticulo>;
    }
  } catch (rpcErr) {
    console.warn('Fallback a agregación local en obtenerStockConsolidadoPorCliente:', rpcErr);
  }

  // 2. Fallback de agregación directa sobre la tabla inventario
  try {
    let query = supabase
      .from('inventario')
      .select('articulo_id, cantidad_disponible, cantidad_reservada, volumen_m3, unidad_medida');

    // Si cleanId parece UUID, filtrar directo
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
      query = query.eq('cliente_id', cleanId);
    } else {
      // Buscar el cliente por código o teléfono para obtener su UUID
      const { data: cli } = await supabase
        .from('clientes')
        .select('id')
        .or(`codigo.eq.${cleanId},telefono.eq.${cleanId}`)
        .maybeSingle();

      if (cli?.id) {
        query = query.eq('cliente_id', cli.id);
      } else {
        query = query.eq('cliente_id', cleanId);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    const resumen: Record<string, StockConsolidadoArticulo> = {};
    (data || []).forEach((row: any) => {
      const artId = row.articulo_id;
      if (!resumen[artId]) {
        resumen[artId] = {
          articulo_id: artId,
          disponible: 0,
          reservado: 0,
          total: 0,
          stockFisico: 0,
          stockFuturo: 0,
          volumenM3Total: 0,
          unidad_medida: row.unidad_medida,
        };
      }
      const disp = Number(row.cantidad_disponible || 0);
      const res = Number(row.cantidad_reservada || 0);
      const vol = Number(row.volumen_m3 || 0);
      resumen[artId].disponible += disp;
      resumen[artId].reservado += res;
      resumen[artId].total += disp + res;
      resumen[artId].stockFisico += disp + res;
      resumen[artId].stockFuturo += disp;
      if (resumen[artId].volumenM3Total !== undefined) {
        resumen[artId].volumenM3Total = Math.round(((resumen[artId].volumenM3Total || 0) + vol) * 10000) / 10000;
      }
    });

    return resumen;
  } catch (err) {
    console.error('Error al obtener stock consolidado por cliente:', err);
    throw err;
  }
}

export const inventarioApi = {
  // --- Stock por Cliente (con cubicaje M3) ---
  async consultarStock(filtros?: {
    clienteId?: string;
    articuloId?: string;
    loteId?: string;
    almacenId?: string;
    ubicacionId?: string;
    palletId?: string;
  }) {
    let query = supabase
      .from('inventario')
      .select(`
        *,
        cliente:clientes(id, razon_social, unidad_negocio),
        lote:lotes_cliente(id, numero_lote, fecha_vencimiento),
        articulo:articulos(id, sku, id_producto, nombre, color, marca_bulto, ean13, tipo_empaque, unidades_por_bulto, unidad_medida, rotacion_abc, valor_declarado, volumen_unitario_m3, peso_gw, medida_m3, categoria:categorias_articulos(id, nombre)),
        ubicacion:ubicaciones(id, codigo_etiqueta, pasillo, estante, nivel),
        pallet:pallets_lpn(id, codigo_lpn, estado)
      `)
      .or('cantidad_disponible.gt.0,cantidad_reservada.gt.0');

    if (filtros?.clienteId) query = query.eq('cliente_id', filtros.clienteId);
    if (filtros?.articuloId) query = query.eq('articulo_id', filtros.articuloId);
    if (filtros?.loteId) query = query.eq('lote_id', filtros.loteId);
    if (filtros?.almacenId) query = query.eq('almacen_id', filtros.almacenId);
    if (filtros?.ubicacionId) query = query.eq('ubicacion_id', filtros.ubicacionId);
    if (filtros?.palletId) query = query.eq('pallet_id', filtros.palletId);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // --- Resumen de M3 Ocupados por Cliente (Facturación de Espacio) ---
  async obtenerM3OcupadosPorCliente(clienteId: string) {
    const { data, error } = await supabase
      .from('inventario')
      .select('volumen_m3, cantidad_disponible')
      .eq('cliente_id', clienteId);

    if (error) throw error;

    const totalM3 = (data || []).reduce(
      (acc: number, row: { volumen_m3?: number | null }) => acc + Number(row.volumen_m3 || 0),
      0
    );
    return {
      clienteId,
      totalM3: Number(totalM3.toFixed(4)),
      totalRegistros: data?.length || 0
    };
  },

  // --- Pallets LPN ---
  async obtenerPalletPorCodigo(codigoLpn: string) {
    const { data, error } = await supabase
      .from('pallets_lpn')
      .select(`
        *,
        cliente:clientes(id, razon_social),
        existencias:inventario(
          cantidad_disponible,
          volumen_m3,
          articulo:articulos(sku, nombre),
          ubicacion:ubicaciones(codigo_etiqueta)
        )
      `)
      .eq('codigo_lpn', codigoLpn)
      .single();
    if (error) throw error;
    return data;
  },

  // --- Kardex / Movimientos Históricos ---
  async consultarKardex(clienteId?: string, articuloId?: string, limite = 100) {
    let query = supabase
      .from('movimientos_inventario')
      .select(`
        *,
        cliente:clientes(id, razon_social),
        articulo:articulos(id, sku, id_producto, nombre, color, tipo_empaque, ean13),
        lote:lotes_cliente(id, numero_lote, fecha_vencimiento),
        origen:ubicaciones!movimientos_inventario_ubicacion_origen_id_fkey(codigo_etiqueta),
        destino:ubicaciones!movimientos_inventario_ubicacion_destino_id_fkey(codigo_etiqueta)
      `)
      .order('fecha_hora', { ascending: false })
      .limit(limite);

    if (clienteId) query = query.eq('cliente_id', clienteId);
    if (articuloId) query = query.eq('articulo_id', articuloId);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // --- Stock Consolidado por Artículo para un Cliente (Validación en Pedidos y Outbound) ---
  obtenerStockConsolidadoPorCliente,
};
