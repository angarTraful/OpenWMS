import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';
import { notifyDataChanged } from '../lib/dataSync';

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
        cliente:clientes(id, razon_social, identificacion_fiscal, unidad_negocio),
        articulo:articulos(id, sku, id_producto, nombre, color, tipo_empaque, ean13, descripcion, descripcion_full, unidades_por_bulto, unidad_medida, peso_unitario_kg, volumen_unitario_m3, valor_declarado),
        lote:lotes_cliente(id, numero_lote, fecha_vencimiento, fecha_fabricacion),
        origen:ubicaciones!movimientos_inventario_ubicacion_origen_id_fkey(id, codigo_etiqueta, pasillo, estante, nivel),
        destino:ubicaciones!movimientos_inventario_ubicacion_destino_id_fkey(id, codigo_etiqueta, pasillo, estante, nivel),
        pallet:pallets_lpn(id, codigo_lpn)
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

  // --- Procesamiento de Movimientos de Inventario (Unitario & Masivo CSV) ---
  procesarMovimientoInventario,
  importarMovimientosMasivos,
};

export interface MovimientoInventarioInput {
  cliente_id?: string;
  cliente?: string;
  cliente_codigo?: string;
  articulo_id?: string;
  sku?: string;
  articulo?: string;
  tipo_movimiento: string;
  cantidad: number;
  lote?: string;
  numero_lote?: string;
  fecha_vencimiento?: string | null;
  ubicacion_origen?: string | null;
  ubicacion_origen_id?: string | null;
  ubicacion_destino?: string | null;
  ubicacion_destino_id?: string | null;
  almacen_id?: string | null;
  almacen_codigo?: string | null;
  pallet?: string | null;
  codigo_lpn?: string | null;
  pallet_id?: string | null;
  documento_referencia?: string | null;
  notas?: string | null;
  fecha_hora?: string | null;
  usuario_id?: string | null;
}

export interface ResultadoImportacionMovimientos {
  ok: boolean;
  total: number;
  procesados: number;
  fallidos: number;
  resultados: any[];
  errores: Array<{ fila: number; datos: any; error: string }>;
}

/**
 * Procesa un movimiento individual de inventario.
 * Invoca primeramente la RPC atómica 'wms_procesar_movimiento_inventario' con fallback
 * a ejecución PostgREST directa.
 */
export async function procesarMovimientoInventario(
  movimiento: MovimientoInventarioInput
): Promise<any> {
  // 1. Intentar RPC en base de datos
  try {
    const { data, error } = await (supabase.rpc as any)(
      'wms_procesar_movimiento_inventario',
      { p_movimiento: movimiento }
    );
    if (!error && data) {
      notifyDataChanged();
      return data;
    }
    if (error && error.message && !error.message.includes('function') && !error.message.includes('not found')) {
      // Es un error de negocio de la función (ej: stock insuficiente), propagar
      throw new Error(error.message);
    }
  } catch (err: any) {
    if (err?.message && !err.message.includes('function') && !err.message.includes('does not exist')) {
      throw err;
    }
    console.warn('Fallback a ejecución directa local en procesarMovimientoInventario:', err);
  }

  // 2. Fallback de resolución y ejecución directa (PostgREST)
  const cant = Number(movimiento.cantidad);
  if (isNaN(cant) || cant <= 0) {
    throw new Error(`La cantidad debe ser mayor a 0 (recibido: ${movimiento.cantidad})`);
  }

  // Normalizar tipo de movimiento
  let tipoNorm = (movimiento.tipo_movimiento || '').toLowerCase().trim();
  if (['ingreso', 'ingreso_inicial', 'entrada'].includes(tipoNorm)) tipoNorm = 'recepcion';
  if (['ajuste+', 'ajuste_pos', '+'].includes(tipoNorm)) tipoNorm = 'ajuste_positivo';
  if (['salida', 'egreso'].includes(tipoNorm)) tipoNorm = 'despacho';
  if (['ajuste-', 'ajuste_neg', '-'].includes(tipoNorm)) tipoNorm = 'ajuste_negativo';
  if (['scrap', 'baja', 'rotura'].includes(tipoNorm)) tipoNorm = 'merma';
  if (['transferencia_interna', 'traslado', 'reubicacion'].includes(tipoNorm)) tipoNorm = 'transferencia';

  // Resolver Cliente
  const cliTerm = (movimiento.cliente_id || movimiento.cliente || movimiento.cliente_codigo || '').trim();
  if (!cliTerm) throw new Error('Cliente requerido para el movimiento.');

  let clienteId = cliTerm;
  let clienteCodigo = cliTerm;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cliTerm)) {
    const { data: cli } = await supabase
      .from('clientes')
      .select('id, codigo, razon_social')
      .or(`codigo.ilike.${cliTerm},razon_social.ilike.${cliTerm}`)
      .limit(1)
      .maybeSingle();
    if (!cli) throw new Error(`Cliente "${cliTerm}" no encontrado.`);
    clienteId = cli.id;
    clienteCodigo = cli.codigo;
  }

  // Resolver Artículo
  const artTerm = (movimiento.articulo_id || movimiento.sku || movimiento.articulo || '').trim();
  if (!artTerm) throw new Error('Artículo o SKU requerido.');

  let articulo: any = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artTerm)) {
    const { data: art } = await supabase
      .from('articulos')
      .select('id, sku, nombre, volumen_unitario_m3, unidad_medida')
      .eq('id', artTerm)
      .maybeSingle();
    articulo = art;
  } else {
    const { data: art } = await supabase
      .from('articulos')
      .select('id, sku, nombre, volumen_unitario_m3, unidad_medida')
      .eq('cliente_id', clienteId)
      .or(`sku.ilike.${artTerm},codigo_barras.eq.${artTerm},nombre.ilike.${artTerm}`)
      .limit(1)
      .maybeSingle();
    articulo = art;
  }
  if (!articulo) throw new Error(`Artículo "${artTerm}" no encontrado para el cliente.`);

  const volUnit = Number(articulo.volumen_unitario_m3 || 0);
  const volTotal = Math.round(cant * volUnit * 10000) / 10000;

  // Resolver o crear Lote
  const loteStr = (movimiento.lote || movimiento.numero_lote || 'LOTE-GENERAL').trim();
  let loteId: string;
  const { data: loteExistente } = await supabase
    .from('lotes_cliente')
    .select('id')
    .eq('cliente_id', clienteId)
    .ilike('numero_lote', loteStr)
    .maybeSingle();

  if (loteExistente?.id) {
    loteId = loteExistente.id;
  } else {
    const { data: nuevoLote, error: errLote } = await supabase
      .from('lotes_cliente')
      .insert({
        cliente_id: clienteId,
        numero_lote: loteStr,
        fecha_vencimiento: movimiento.fecha_vencimiento || null,
      })
      .select('id')
      .single();
    if (errLote || !nuevoLote) throw new Error(`Error al crear lote "${loteStr}": ${errLote?.message}`);
    loteId = nuevoLote.id;
  }

  // Resolver Pallet LPN
  let palletId: string | null = null;
  const palletStr = (movimiento.pallet || movimiento.codigo_lpn || movimiento.pallet_id || '').trim();
  if (palletStr) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(palletStr)) {
      palletId = palletStr;
    } else {
      const { data: pltExistente } = await supabase
        .from('pallets_lpn')
        .select('id')
        .eq('cliente_id', clienteId)
        .ilike('codigo_lpn', palletStr)
        .maybeSingle();
      if (pltExistente?.id) {
        palletId = pltExistente.id;
      } else {
        const { data: nuevoPlt } = await supabase
          .from('pallets_lpn')
          .insert({
            cliente_id: clienteId,
            codigo_lpn: palletStr,
            volumen_total_m3: volTotal,
            peso_total_kg: 0,
            estado: 'en_stock',
          })
          .select('id')
          .single();
        if (nuevoPlt) palletId = nuevoPlt.id;
      }
    }
  }

  // Resolver Ubicación Origen
  let ubicOrig: any = null;
  const origStr = (movimiento.ubicacion_origen || movimiento.ubicacion_origen_id || '').trim();
  if (origStr) {
    const query = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(origStr)
      ? supabase.from('ubicaciones').select('id, codigo_etiqueta, almacen_id').eq('id', origStr)
      : supabase.from('ubicaciones').select('id, codigo_etiqueta, almacen_id').ilike('codigo_etiqueta', origStr);
    const { data: uo } = await query.maybeSingle();
    ubicOrig = uo;
    if (!ubicOrig) throw new Error(`Ubicación origen "${origStr}" no encontrada.`);
  }

  // Resolver Ubicación Destino
  let ubicDest: any = null;
  const destStr = (movimiento.ubicacion_destino || movimiento.ubicacion_destino_id || '').trim();
  if (destStr) {
    const query = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(destStr)
      ? supabase.from('ubicaciones').select('id, codigo_etiqueta, almacen_id').eq('id', destStr)
      : supabase.from('ubicaciones').select('id, codigo_etiqueta, almacen_id').ilike('codigo_etiqueta', destStr);
    const { data: ud } = await query.maybeSingle();
    ubicDest = ud;
    if (!ubicDest) throw new Error(`Ubicación destino "${destStr}" no encontrada.`);
  }

  // Resolver Almacén
  let almacenId = (movimiento.almacen_id || movimiento.almacen_codigo || '').trim();
  if (!almacenId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(almacenId)) {
    if (almacenId) {
      const { data: alm } = await supabase.from('almacenes').select('id').ilike('codigo', almacenId).maybeSingle();
      if (alm?.id) almacenId = alm.id;
    }
    if (!almacenId) {
      almacenId = ubicDest?.almacen_id || ubicOrig?.almacen_id || '';
    }
    if (!almacenId) {
      const { data: defaultAlm } = await supabase.from('almacenes').select('id').eq('activo', true).limit(1).maybeSingle();
      if (defaultAlm?.id) {
        almacenId = defaultAlm.id;
      }
    }
  }

  if (!almacenId) {
    throw new Error('No se encontró un almacén activo para registrar el movimiento.');
  }

  // Procesamiento de Stock según Tipo
  const esEntrada = ['recepcion', 'ajuste_positivo'].includes(tipoNorm);
  const esSalida = ['despacho', 'ajuste_negativo', 'merma', 'picking'].includes(tipoNorm);

  if (esEntrada) {
    if (!ubicDest) {
      const { data: fallbackUbic } = await supabase
        .from('ubicaciones')
        .select('id, codigo_etiqueta, almacen_id')
        .eq('almacen_id', almacenId)
        .limit(1)
        .maybeSingle();
      ubicDest = fallbackUbic;
      if (!ubicDest) throw new Error('Se requiere ubicación de destino para entrada de stock.');
    }

    // Buscar existencia en inventario
    let invQuery = supabase
      .from('inventario')
      .select('id, cantidad_disponible, volumen_m3')
      .eq('cliente_id', clienteId)
      .eq('lote_id', loteId)
      .eq('articulo_id', articulo.id)
      .eq('almacen_id', almacenId)
      .eq('ubicacion_id', ubicDest.id);

    if (palletId) {
      invQuery = invQuery.eq('pallet_id', palletId);
    } else {
      invQuery = invQuery.is('pallet_id', null);
    }

    const { data: invRow } = await invQuery.maybeSingle();

    if (invRow?.id) {
      await (supabase.from('inventario') as any)
        .update({
          cantidad_disponible: Number(invRow.cantidad_disponible || 0) + cant,
          volumen_m3: Math.round((Number(invRow.volumen_m3 || 0) + volTotal) * 10000) / 10000,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', invRow.id);
    } else {
      await (supabase.from('inventario') as any).insert({
        cliente_id: clienteId,
        lote_id: loteId,
        articulo_id: articulo.id,
        almacen_id: almacenId,
        ubicacion_id: ubicDest.id,
        pallet_id: palletId,
        cantidad_disponible: cant,
        cantidad_reservada: 0,
        volumen_m3: volTotal,
        unidad_medida: articulo.unidad_medida || 'bulto',
      });
    }
  } else if (esSalida) {
    if (!ubicOrig) {
      // Buscar primera ubicación con stock disponible
      const { data: invRows } = await supabase
        .from('inventario')
        .select('id, ubicacion_id, cantidad_disponible, ubicacion:ubicaciones(codigo_etiqueta, almacen_id)')
        .eq('cliente_id', clienteId)
        .eq('lote_id', loteId)
        .eq('articulo_id', articulo.id)
        .gte('cantidad_disponible', cant)
        .limit(1);

      if (invRows && invRows.length > 0) {
        ubicOrig = {
          id: invRows[0].ubicacion_id,
          codigo_etiqueta: (invRows[0] as any).ubicacion?.codigo_etiqueta,
          almacen_id: (invRows[0] as any).ubicacion?.almacen_id,
        };
      }
      if (!ubicOrig) throw new Error('Ubicación de origen requerida (no se encontró stock disponible suficiente).');
    }

    let invQuery = supabase
      .from('inventario')
      .select('id, cantidad_disponible, cantidad_reservada, volumen_m3')
      .eq('cliente_id', clienteId)
      .eq('lote_id', loteId)
      .eq('articulo_id', articulo.id)
      .eq('ubicacion_id', ubicOrig.id);

    if (palletId) invQuery = invQuery.eq('pallet_id', palletId);

    const { data: invOrigRow } = await invQuery.maybeSingle();

    if (!invOrigRow) {
      throw new Error(`No se encontró stock en la ubicación ${ubicOrig.codigo_etiqueta} para el artículo y lote.`);
    }

    const disp = Number(invOrigRow.cantidad_disponible || 0);
    if (disp < cant) {
      throw new Error(`Stock insuficiente en ${ubicOrig.codigo_etiqueta}. Disponible: ${disp}, Solicitado: ${cant}`);
    }

    if (disp === cant && Number(invOrigRow.cantidad_reservada || 0) === 0) {
      await supabase.from('inventario').delete().eq('id', invOrigRow.id);
    } else {
      await (supabase.from('inventario') as any)
        .update({
          cantidad_disponible: disp - cant,
          volumen_m3: Math.max(0, Math.round((Number(invOrigRow.volumen_m3 || 0) - volTotal) * 10000) / 10000),
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', invOrigRow.id);
    }
  } else {
    // Traslado / Reubicación (transferencia, putaway, picking)
    if (!ubicOrig) throw new Error('Ubicación origen requerida para transferir.');
    if (!ubicDest) throw new Error('Ubicación destino requerida para transferir.');
    if (ubicOrig.id === ubicDest.id) throw new Error('Origen y destino no pueden ser iguales.');

    // 1. Descontar en origen
    const { data: invOrigRow } = await supabase
      .from('inventario')
      .select('id, cantidad_disponible, cantidad_reservada, volumen_m3')
      .eq('cliente_id', clienteId)
      .eq('lote_id', loteId)
      .eq('articulo_id', articulo.id)
      .eq('ubicacion_id', ubicOrig.id)
      .maybeSingle();

    if (!invOrigRow) throw new Error(`No hay stock en origen ${ubicOrig.codigo_etiqueta} para transferir.`);
    const disp = Number(invOrigRow.cantidad_disponible || 0);
    if (disp < cant) throw new Error(`Stock insuficiente en origen ${ubicOrig.codigo_etiqueta}. Disponible: ${disp}, Solicitado: ${cant}`);

    if (disp === cant && Number(invOrigRow.cantidad_reservada || 0) === 0) {
      await supabase.from('inventario').delete().eq('id', invOrigRow.id);
    } else {
      await (supabase.from('inventario') as any)
        .update({
          cantidad_disponible: disp - cant,
          volumen_m3: Math.max(0, Math.round((Number(invOrigRow.volumen_m3 || 0) - volTotal) * 10000) / 10000),
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', invOrigRow.id);
    }

    // 2. Incrementar en destino
    const { data: invDestRow } = await supabase
      .from('inventario')
      .select('id, cantidad_disponible, volumen_m3')
      .eq('cliente_id', clienteId)
      .eq('lote_id', loteId)
      .eq('articulo_id', articulo.id)
      .eq('ubicacion_id', ubicDest.id)
      .maybeSingle();

    if (invDestRow?.id) {
      await (supabase.from('inventario') as any)
        .update({
          cantidad_disponible: Number(invDestRow.cantidad_disponible || 0) + cant,
          volumen_m3: Math.round((Number(invDestRow.volumen_m3 || 0) + volTotal) * 10000) / 10000,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', invDestRow.id);
    } else {
      await (supabase.from('inventario') as any).insert({
        cliente_id: clienteId,
        lote_id: loteId,
        articulo_id: articulo.id,
        almacen_id: ubicDest.almacen_id || almacenId,
        ubicacion_id: ubicDest.id,
        pallet_id: palletId,
        cantidad_disponible: cant,
        cantidad_reservada: 0,
        volumen_m3: volTotal,
        unidad_medida: articulo.unidad_medida || 'bulto',
      });
    }
  }

  // Asiento inmutable en Kardex (movimientos_inventario)
  const { data: movRow, error: movErr } = await (supabase.from('movimientos_inventario') as any)
    .insert({
      cliente_id: clienteId,
      lote_id: loteId,
      articulo_id: articulo.id,
      pallet_id: palletId,
      ubicacion_origen_id: ubicOrig?.id || null,
      ubicacion_destino_id: ubicDest?.id || null,
      tipo_movimiento: tipoNorm,
      cantidad: cant,
      volumen_m3: volTotal,
      documento_referencia: movimiento.documento_referencia || null,
      notas: movimiento.notas || null,
      fecha_hora: movimiento.fecha_hora || new Date().toISOString(),
    })
    .select('id')
    .single();

  if (movErr) throw movErr;

  notifyDataChanged();
  return {
    ok: true,
    movimiento_id: movRow?.id,
    tipo_movimiento: tipoNorm,
    cliente_id: clienteId,
    cliente_codigo: clienteCodigo,
    articulo_id: articulo.id,
    sku: articulo.sku,
    articulo_nombre: articulo.nombre,
    lote_id: loteId,
    lote_numero: loteStr,
    cantidad: cant,
    volumen_m3: volTotal,
    ubicacion_origen: ubicOrig?.codigo_etiqueta,
    ubicacion_destino: ubicDest?.codigo_etiqueta,
    documento_referencia: movimiento.documento_referencia,
  };
}

/**
 * Importa un conjunto de movimientos de inventario en lote.
 * Soporta ejecución transaccional atómica en DB con fallback secuencial.
 */
export async function importarMovimientosMasivos(
  movimientos: MovimientoInventarioInput[],
  ignorarErrores = false
): Promise<ResultadoImportacionMovimientos> {
  if (!movimientos || movimientos.length === 0) {
    return {
      ok: true,
      total: 0,
      procesados: 0,
      fallidos: 0,
      resultados: [],
      errores: [],
    };
  }

  // 1. Intentar RPC batch en Supabase
  try {
    const { data, error } = await (supabase.rpc as any)(
      'wms_importar_movimientos_inventario',
      {
        p_movimientos: movimientos,
        p_ignorar_errores: ignorarErrores,
      }
    );

    if (!error && data) {
      notifyDataChanged();
      return data as ResultadoImportacionMovimientos;
    }
  } catch (rpcErr) {
    console.warn('Fallback a procesamiento iterativo local en importarMovimientosMasivos:', rpcErr);
  }

  // 2. Fallback de procesamiento iterativo
  const resultados: any[] = [];
  const errores: Array<{ fila: number; datos: any; error: string }> = [];

  for (let i = 0; i < movimientos.length; i++) {
    const mov = movimientos[i];
    try {
      const res = await procesarMovimientoInventario(mov);
      resultados.push(res);
    } catch (err: any) {
      const msg = err?.message || String(err);
      errores.push({
        fila: i + 1,
        datos: mov,
        error: msg,
      });
      if (!ignorarErrores) {
        throw new Error(`Error en fila ${i + 1} (SKU: ${mov.sku || mov.articulo || 'N/A'}): ${msg}`);
      }
    }
  }

  notifyDataChanged();
  return {
    ok: errores.length === 0,
    total: movimientos.length,
    procesados: resultados.length,
    fallidos: errores.length,
    resultados,
    errores,
  };
}

