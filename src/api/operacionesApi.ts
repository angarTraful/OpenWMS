import { supabase } from './supabaseClient';
import type { Database } from '../../types/database.types';
import { notifyDataChanged } from '../lib/dataSync';

export type Operacion = Database['public']['Tables']['operaciones']['Row'];
export type OperacionInsert = Database['public']['Tables']['operaciones']['Insert'];
export type OperacionUpdate = Database['public']['Tables']['operaciones']['Update'];

export interface FiltrosOperaciones {
  clienteId?: string;
  tipoOp?: 'entrada' | 'pedido' | 'salida' | 'entrega' | 'todos' | '';
  estado?: 'en_proceso' | 'completada' | 'cancelada' | 'todos' | '';
  search?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  soloConDesvios?: boolean;
}

export interface ItemOperacionDetalle {
  id?: string;
  articulo_codigo: string;
  articulo_descripcion: string;
  lote?: string | null;
  ubicacion?: string | null;
  cantidad_solicitada?: number;
  cantidad_efectiva?: number;
  unidad_medida?: string;
  volumen_m3?: number;
  peso_kg?: number;
}

export interface DocumentoRespaldoOperacion {
  tipo:
    | 'remito'
    | 'hoja_ruta'
    | 'orden_compra'
    | 'guia_transporte'
    | 'despacho_aduana'
    | 'hoja_trabajo'
    | 'orden_salida'
    | 'comprobante_ingreso';
  titulo: string;
  numero: string;
  fecha?: string | null;
  estado?: string | null;
  detalles?: string | null;
  accion?: 'ver_remito' | 'ver_hoja_trabajo' | 'imprimir_etiqueta' | null;
  data?: any;
}

export interface TransporteOperacion {
  empresa?: string | null;
  chofer?: string | null;
  patente?: string | null;
  muelle?: string | null;
  contenedor?: string | null;
  precintos?: string | null;
  hora_salida?: string | null;
  hora_arribo?: string | null;
}

export interface EntidadRelacionadaOperacion {
  tipo: 'proveedor' | 'destinatario' | 'cliente';
  nombre: string;
  identificacion_fiscal?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  contacto?: string | null;
}

export interface OperacionDetalleCompleto {
  operacion: Operacion;
  items: ItemOperacionDetalle[];
  documentos: DocumentoRespaldoOperacion[];
  transporte?: TransporteOperacion | null;
  entidad_relacionada?: EntidadRelacionadaOperacion | null;
  raw?: any;
}

export interface EstadisticasOperaciones {
  total: number;
  entradas: number;
  pedidos: number;
  salidas: number;
  entregas: number;
  enProceso: number;
  completadas: number;
  conDesvios: number;
  totalCantidad: number;
  totalM3: number;
}

export const operacionesApi = {
  // --- Listar operaciones con filtros combinables ---
  async listarOperaciones(filtros?: FiltrosOperaciones): Promise<Operacion[]> {
    try {
      let query = supabase
        .from('operaciones')
        .select('*')
        .order('fechahora_alta', { ascending: false });

      if (filtros?.clienteId && filtros.clienteId.trim()) {
        query = query.eq('cliente_id', filtros.clienteId.trim());
      }

      if (filtros?.tipoOp && filtros.tipoOp !== 'todos') {
        query = query.eq('tipo_op', filtros.tipoOp);
      }

      if (filtros?.estado && filtros.estado !== 'todos') {
        query = query.eq('estado', filtros.estado);
      }

      if (filtros?.fechaDesde) {
        query = query.gte('fechahora_alta', `${filtros.fechaDesde}T00:00:00Z`);
      }

      if (filtros?.fechaHasta) {
        query = query.lte('fechahora_alta', `${filtros.fechaHasta}T23:59:59Z`);
      }

      if (filtros?.soloConDesvios) {
        query = query.not('novedad_desvio', 'is', null).neq('novedad_desvio', '');
      }

      const { data, error } = await query;
      if (error) {
        // Si la tabla aún no existe en Supabase o schema cache pendiente, fallback silencioso
        if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
          console.warn('Aviso: tabla operaciones pendiente de migración en Supabase:', error.message);
          return [];
        }
        throw error;
      }

      let res = (data || []).filter((op) => {
        // Este módulo es exclusivamente seguimiento operativo de clientes:
        // Excluir rutas multicliente y registros sin cliente asignado
        if (
          !op.cliente_id ||
          op.id_operacion?.startsWith('RUTA-') ||
          op.cliente_nombre === 'Multi-Destinatario Reparto'
        ) {
          return false;
        }
        return true;
      });

      // Filtrado por texto libre del buscador
      if (filtros?.search && filtros.search.trim()) {
        const q = filtros.search.trim().toLowerCase();
        res = res.filter((op) => {
          return (
            op.id_operacion?.toLowerCase().includes(q) ||
            op.cliente_nombre?.toLowerCase().includes(q) ||
            op.unidad_negocio?.toLowerCase().includes(q) ||
            op.documento_movimiento?.toLowerCase().includes(q) ||
            op.documento_heredado?.toLowerCase().includes(q) ||
            op.lotes_despacho?.toLowerCase().includes(q) ||
            op.novedad_desvio?.toLowerCase().includes(q) ||
            op.usuario_creador?.toLowerCase().includes(q)
          );
        });
      }

      return res;
    } catch (err: any) {
      console.error('Error al listar operaciones:', err);
      return [];
    }
  },

  // --- Resumen de estadísticas acumuladas ---
  async obtenerEstadisticas(clienteId?: string): Promise<EstadisticasOperaciones> {
    const ops = await this.listarOperaciones(clienteId ? { clienteId } : undefined);

    let totalCantidad = 0;
    let totalM3 = 0;
    let entradas = 0;
    let pedidos = 0;
    let salidas = 0;
    let entregas = 0;
    let enProceso = 0;
    let completadas = 0;
    let conDesvios = 0;

    ops.forEach((op) => {
      totalCantidad += Number(op.cantidad_total || 0);
      totalM3 += Number(op.m3_totales || 0);

      if (op.tipo_op === 'entrada') entradas++;
      else if (op.tipo_op === 'pedido') pedidos++;
      else if (op.tipo_op === 'salida') salidas++;
      else if (op.tipo_op === 'entrega') entregas++;

      if (op.estado === 'en_proceso') enProceso++;
      else if (op.estado === 'completada') completadas++;

      if (op.novedad_desvio && op.novedad_desvio.trim().length > 0) {
        conDesvios++;
      }
    });

    return {
      total: ops.length,
      entradas,
      pedidos,
      salidas,
      entregas,
      enProceso,
      completadas,
      conDesvios,
      totalCantidad: Math.round(totalCantidad * 100) / 100,
      totalM3: Math.round(totalM3 * 10000) / 10000,
    };
  },

  // --- Crear o Registrar Operación ---
  async registrarOperacion(operacion: OperacionInsert): Promise<Operacion | null> {
    try {
      const { data, error } = await supabase
        .from('operaciones')
        .insert(operacion)
        .select()
        .single();

      if (error) {
        // Si hay conflicto de clave única (id_operacion + tipo_op), actualizar
        if (error.code === '23505') {
          const { data: updated, error: errUpdate } = await supabase
            .from('operaciones')
            .update(operacion)
            .match({ id_operacion: operacion.id_operacion, tipo_op: operacion.tipo_op })
            .select()
            .single();
          if (errUpdate) throw errUpdate;
          notifyDataChanged();
          return updated;
        }
        throw error;
      }

      notifyDataChanged();
      return data;
    } catch (err: any) {
      console.warn('Aviso registrando operación en colector:', err.message);
      return null;
    }
  },

  // --- Actualizar Operación ---
  async actualizarOperacion(id: string, updates: OperacionUpdate): Promise<Operacion | null> {
    try {
      const { data, error } = await supabase
        .from('operaciones')
        .update({
          ...updates,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      notifyDataChanged();
      return data;
    } catch (err: any) {
      console.error('Error al actualizar operación:', err);
      throw err;
    }
  },

  // --- Recolector y Sincronizador Integral de Datos ---
  // Escanea y totaliza todas las órdenes del sistema (recepción, pedidos, salidas, entregas)
  // garantizando que la tabla 'operaciones' esté 100% al día
  async recolectarHistoricoCompleto(): Promise<{
    exito: boolean;
    procesadas: number;
    mensaje: string;
  }> {
    // 1. Intentar procedimiento RPC en base de datos si existe
    try {
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)('wms_recolectar_operaciones');
      if (!rpcErr && rpcRes && rpcRes.exito) {
        notifyDataChanged();
        return {
          exito: true,
          procesadas: rpcRes.total_operaciones_procesadas || 0,
          mensaje: `Se recolectaron ${rpcRes.total_operaciones_procesadas} operaciones correctamente mediante el motor de base de datos.`,
        };
      }
    } catch (rpcEx) {
      console.warn('Fallback a recolección local de operaciones:', rpcEx);
    }

    // 2. Colector de respaldo directo en TypeScript
    try {
      let procesadas = 0;

      // A. Cargar Clientes para resolver unidades de negocio y razones sociales
      const { data: clientesList } = await supabase.from('clientes').select('id, razon_social, unidad_negocio');
      const clientesMap = new Map((clientesList || []).map((c) => [c.id, c]));

      // B. Recolectar Recepciones (IN)
      const { data: recs } = await supabase
        .from('ordenes_recepcion')
        .select(`
          id,
          numero_recepcion,
          cliente_id,
          creado_en,
          actualizado_en,
          fecha_hora_arribo,
          nro_contenedor_oc,
          despacho_aduana,
          lote_defecto,
          observaciones,
          estado,
          detalles:ordenes_recepcion_detalle(
            cantidad_esperada,
            lote_declarado,
            articulo:articulos(volumen_unitario_m3)
          )
        `);

      if (recs) {
        for (const r of recs) {
          const cli = clientesMap.get(r.cliente_id);
          const detalles = r.detalles || [];
          let cantTotal = 0;
          let m3Total = 0;
          const lotesSet = new Set<string>();

          if (r.lote_defecto) lotesSet.add(r.lote_defecto);
          if (r.despacho_aduana) lotesSet.add(`Desp: ${r.despacho_aduana}`);

          detalles.forEach((d: any) => {
            const cant = Number(d.cantidad_esperada || 0);
            const vol = Number(d.articulo?.volumen_unitario_m3 || 0);
            cantTotal += cant;
            m3Total += cant * vol;
            if (d.lote_declarado) lotesSet.add(d.lote_declarado);
          });

          await this.registrarOperacion({
            id_operacion: r.numero_recepcion,
            cliente_id: r.cliente_id,
            cliente_nombre: cli?.razon_social || 'Cliente General',
            unidad_negocio: cli?.unidad_negocio || 'General',
            fechahora_alta: r.fecha_hora_arribo || r.creado_en,
            fechahora_fin: r.estado === 'finalizada' ? r.actualizado_en : null,
            tipo_op: 'entrada',
            documento_movimiento: r.nro_contenedor_oc ? `Contenedor: ${r.nro_contenedor_oc}` : 'Recepción Muelle',
            documento_heredado: r.despacho_aduana ? `Despacho Aduana: ${r.despacho_aduana}` : 'Origen Proveedor',
            lotes_despacho: Array.from(lotesSet).join(', ') || 'Sin Lote',
            cantidad_total: cantTotal,
            m3_totales: Math.round(m3Total * 10000) / 10000,
            novedad_desvio: r.observaciones || null,
            usuario_creador: 'Operador Recepción',
            estado: r.estado === 'finalizada' ? 'completada' : 'en_proceso',
            referencia_id: r.id,
          });
          procesadas++;
        }
      }

      // C. Recolectar Pedidos de Clientes (Picking / Alocación)
      const { data: peds } = await supabase
        .from('pedidos')
        .select(`
          id,
          numero_pedido,
          cliente_id,
          creado_en,
          actualizado_en,
          fecha_solicitud,
          orden_compra_cliente,
          observaciones,
          estado,
          detalles:pedidos_detalle(
            cantidad_solicitada,
            lote_id,
            articulo:articulos(volumen_unitario_m3)
          )
        `);

      if (peds) {
        for (const p of peds) {
          const cli = clientesMap.get(p.cliente_id);
          const detalles = p.detalles || [];
          let cantTotal = 0;
          let m3Total = 0;

          detalles.forEach((d: any) => {
            const cant = Number(d.cantidad_solicitada || 0);
            const vol = Number(d.articulo?.volumen_unitario_m3 || 0);
            cantTotal += cant;
            m3Total += cant * vol;
          });

          await this.registrarOperacion({
            id_operacion: p.numero_pedido,
            cliente_id: p.cliente_id,
            cliente_nombre: cli?.razon_social || 'Cliente General',
            unidad_negocio: cli?.unidad_negocio || 'General',
            fechahora_alta: p.fecha_solicitud || p.creado_en,
            fechahora_fin: ['despachado', 'entregado'].includes(p.estado) ? p.actualizado_en : null,
            tipo_op: 'pedido',
            documento_movimiento: p.orden_compra_cliente ? `OC Cliente: ${p.orden_compra_cliente}` : p.numero_pedido,
            documento_heredado: p.orden_compra_cliente ? `OC: ${p.orden_compra_cliente}` : 'Orden Comercial',
            lotes_despacho: 'Asignación FEFO / Picking',
            cantidad_total: cantTotal,
            m3_totales: Math.round(m3Total * 10000) / 10000,
            novedad_desvio: p.observaciones || null,
            usuario_creador: 'Ventas 3PL',
            estado: ['despachado', 'entregado'].includes(p.estado) ? 'completada' : 'en_proceso',
            referencia_id: p.id,
          });
          procesadas++;
        }
      }

      // D. Recolectar Salidas (OUT)
      const { data: salidas } = await supabase
        .from('ordenes_salida')
        .select(`
          id,
          numero_orden_salida,
          creado_en,
          actualizado_en,
          estado,
          observaciones,
          remitos:remitos_transito(numero_remito_rx, total_bultos),
          pedidos_asoc:ordenes_salida_pedidos(
            pedido:pedidos(numero_pedido, cliente_id)
          )
        `);

      if (salidas) {
        for (const s of salidas) {
          const remitos = s.remitos || [];
          const remitosStr = remitos.map((r: any) => r.numero_remito_rx).filter(Boolean).join(', ') || 'Remito en Preparación';
          const pedidosStr = (s.pedidos_asoc || []).map((pa: any) => pa.pedido?.numero_pedido).filter(Boolean).join(', ') || 'Pedidos Asignados';
          const cantTotal = remitos.reduce((acc: number, r: any) => acc + Number(r.total_bultos || 0), 0);

          // Obtener cliente predominante
          const primerCliId = s.pedidos_asoc?.[0]?.pedido?.cliente_id;
          const cli = primerCliId ? clientesMap.get(primerCliId) : null;

          await this.registrarOperacion({
            id_operacion: s.numero_orden_salida,
            cliente_id: primerCliId || null,
            cliente_nombre: cli?.razon_social || 'Consolidado Salida',
            unidad_negocio: cli?.unidad_negocio || 'Logística & Distribución',
            fechahora_alta: s.creado_en,
            fechahora_fin: s.estado === 'cerrada' ? s.actualizado_en : null,
            tipo_op: 'salida',
            documento_movimiento: remitosStr,
            documento_heredado: `Pedidos: ${pedidosStr}`,
            lotes_despacho: 'Consolidado Outbound',
            cantidad_total: cantTotal,
            m3_totales: 0,
            novedad_desvio: s.observaciones || null,
            usuario_creador: 'Supervisor Expedición',
            estado: s.estado === 'cerrada' ? 'completada' : 'en_proceso',
            referencia_id: s.id,
          });
          procesadas++;
        }
      }

      // E. Recolectar Entregas (por Remito asignado a cada Cliente)
      const { data: remitos } = await supabase
        .from('remitos_transito')
        .select(`
          id,
          numero_remito_rx,
          cliente_id,
          pedido_id,
          total_bultos,
          volumen_total_m3,
          fecha_emision,
          creado_en,
          estado,
          cae_o_autorizacion_fiscal,
          cliente:clientes(id, razon_social, unidad_negocio),
          pedido:pedidos(id, numero_pedido, orden_compra_cliente),
          paradas:rutas_paradas_itinerario(
            id,
            estado_entrega,
            hora_real_arribo,
            observaciones,
            ruta:rutas_entrega(id, codigo_ruta, chofer_nombre, vehiculo_patente, transporte_empresa)
          )
        `);

      if (remitos) {
        for (const rt of remitos) {
          // Exclusivo seguimiento operativo de clientes: omitir remitos sin cliente asignado
          if (!rt.cliente_id) continue;

          const cli = (rt as any).cliente;
          const ped = (rt as any).pedido;
          const paradas = (rt as any).paradas || [];
          const parada = paradas[0];
          const ruta = parada?.ruta;

          const rutaCod = ruta?.codigo_ruta ? `Hoja de Ruta: ${ruta.codigo_ruta}` : null;
          const pedNum = ped?.numero_pedido ? `Pedido: ${ped.numero_pedido}` : null;
          const docHeredado = [rutaCod, pedNum].filter(Boolean).join(' / ') || 'Remito Conformado / Despacho';

          const entregado = rt.estado === 'entregado_conforme' || parada?.estado_entrega === 'entregado';
          const fechaFin = entregado ? (parada?.hora_real_arribo || rt.fecha_emision || rt.creado_en) : null;
          const estadoOp = entregado ? 'completada' : (rt.estado === 'rechazado_total' ? 'cancelada' : 'en_proceso');

          await this.registrarOperacion({
            id_operacion: rt.numero_remito_rx || `REM-${rt.id.slice(0, 8)}`,
            cliente_id: rt.cliente_id || null,
            cliente_nombre: cli?.razon_social || 'Cliente General',
            unidad_negocio: cli?.unidad_negocio || 'Distribución & Flete',
            fechahora_alta: rt.fecha_emision || rt.creado_en,
            fechahora_fin: fechaFin,
            tipo_op: 'entrega',
            documento_movimiento: rt.numero_remito_rx || 'Remito de Entrega',
            documento_heredado: docHeredado,
            lotes_despacho: 'Remito Distribuido',
            cantidad_total: Number(rt.total_bultos || 0),
            m3_totales: Number(rt.volumen_total_m3 || 0),
            novedad_desvio: parada?.observaciones || null,
            usuario_creador: ruta?.chofer_nombre ? `Chofer: ${ruta.chofer_nombre}` : 'Control Transporte',
            estado: estadoOp,
            referencia_id: rt.id,
          });
          procesadas++;
        }
      }

      notifyDataChanged();
      return {
        exito: true,
        procesadas,
        mensaje: `Se recolectaron y consolidaron ${procesadas} operaciones con éxito.`,
      };
    } catch (err: any) {
      console.error('Error en recolección local de operaciones:', err);
      return {
        exito: false,
        procesadas: 0,
        mensaje: `Error al recolectar operaciones: ${err.message}`,
      };
    }
  },

  // --- Obtener Detalle Completo de una Operación (Documentación, Ítems, Transporte) ---
  async obtenerDetalleCompletoOperacion(operacion: Operacion): Promise<OperacionDetalleCompleto> {
    const items: ItemOperacionDetalle[] = [];
    const documentos: DocumentoRespaldoOperacion[] = [];
    let transporte: TransporteOperacion | null = null;
    let entidad_relacionada: EntidadRelacionadaOperacion | null = null;
    let raw: any = null;

    try {
      // 1. ENTRADA (Inbound / Recepción)
      if (operacion.tipo_op === 'entrada') {
        let recQuery = supabase.from('ordenes_recepcion').select(`
          *,
          cliente:clientes(*),
          almacen:almacenes(*),
          detalles:ordenes_recepcion_detalle(
            *,
            articulo:articulos(*),
            tareas:tareas_putaway_control(*)
          )
        `);

        if (operacion.referencia_id) {
          recQuery = recQuery.eq('id', operacion.referencia_id);
        } else {
          recQuery = recQuery.eq('numero_recepcion', operacion.id_operacion);
        }

        const { data: rec } = await recQuery.maybeSingle();
        raw = rec;

        if (rec) {
          const cli = rec.cliente as any;
          entidad_relacionada = {
            tipo: 'proveedor',
            nombre: (rec as any).proveedor || cli?.razon_social || 'Proveedor Externo',
            identificacion_fiscal: cli?.identificacion_fiscal || null,
            direccion: cli?.direccion || null,
            contacto: cli?.telefono || cli?.email_contacto || null,
          };

          transporte = {
            empresa: (rec as any).transportista || (rec as any).transporte_empresa || null,
            chofer: (rec as any).chofer || (rec as any).chofer_nombre || null,
            patente: (rec as any).patente_camion || null,
            muelle: (rec as any).muelle || null,
            contenedor: (rec as any).contenedor || (rec as any).nro_contenedor_oc || null,
            precintos: (rec as any).precinto || null,
            hora_arribo: (rec as any).fecha_arribo || (rec as any).fecha_hora_arribo || null,
          };

          if (rec.numero_recepcion) {
            documentos.push({
              tipo: 'comprobante_ingreso',
              titulo: 'Orden de Recepción Inbound',
              numero: rec.numero_recepcion,
              fecha: (rec as any).fecha_esperada || (rec as any).fecha_hora_arribo || (rec as any).creado_en,
              estado: rec.estado,
              detalles: `Almacén: ${rec.almacen?.nombre || 'General'}`,
            });
          }

          if ((rec as any).guia_remito) {
            documentos.push({
              tipo: 'guia_transporte',
              titulo: 'Guía de Transporte / Remito Origen',
              numero: (rec as any).guia_remito,
              fecha: (rec as any).fecha_hora_arribo || (rec as any).creado_en,
              detalles: `Transportista: ${(rec as any).transportista || (rec as any).transporte_empresa || 'N/A'}`,
            });
          }

          if ((rec as any).despacho_aduana) {
            documentos.push({
              tipo: 'despacho_aduana',
              titulo: 'Despacho Aduanero Oficial',
              numero: (rec as any).despacho_aduana,
              detalles: `Contenedor: ${(rec as any).nro_contenedor_oc || (rec as any).contenedor || 'N/A'}`,
            });
          }

          // Ítems recibidos
          if (rec.detalles && Array.isArray(rec.detalles)) {
            rec.detalles.forEach((det: any) => {
              const art = det.articulo;
              const tareas = det.tareas || [];
              const ubicaciones = Array.from(
                new Set(tareas.map((t: any) => t.ubicacion_destino_codigo).filter(Boolean))
              ).join(', ');

              items.push({
                id: det.id,
                articulo_codigo: art?.codigo || 'SKU-DESC',
                articulo_descripcion: art?.descripcion || 'Artículo sin descripción',
                lote: det.lote_declarado || det.numero_lote || (operacion.lotes_despacho !== 'Sin Lote' ? operacion.lotes_despacho : null),
                ubicacion: ubicaciones || null,
                cantidad_solicitada: Number(det.cantidad_esperada || 0),
                cantidad_efectiva: Number(det.cantidad_esperada || 0),
                unidad_medida: art?.unidad_medida || 'UN',
                volumen_m3: (art?.volumen_unitario_m3 || 0) * Number(det.cantidad_esperada || 0),
                peso_kg: (art?.peso_unitario_kg || 0) * Number(det.cantidad_esperada || 0),
              });
            });
          }
        }
      }

      // 2. PEDIDO (Picking / Alocación)
      else if (operacion.tipo_op === 'pedido') {
        let pedQuery = supabase.from('pedidos').select(`
          *,
          cliente:clientes(*),
          destinatario:destinatarios(*),
          detalles:pedidos_detalle(
            *,
            articulo:articulos(*),
            tareas_picking:tareas_picking(*)
          )
        `);

        if (operacion.referencia_id) {
          pedQuery = pedQuery.eq('id', operacion.referencia_id);
        } else {
          pedQuery = pedQuery.eq('numero_pedido', operacion.id_operacion);
        }

        const { data: ped } = await pedQuery.maybeSingle();
        raw = ped;

        if (ped) {
          const dest = ped.destinatario as any;
          const cli = ped.cliente as any;
          entidad_relacionada = {
            tipo: 'destinatario',
            nombre: dest?.razon_social || cli?.razon_social || 'Destinatario Final',
            identificacion_fiscal: cli?.identificacion_fiscal || null,
            direccion: dest?.direccion_entrega || null,
            localidad: [dest?.localidad, dest?.ciudad].filter(Boolean).join(', ') || null,
            contacto: dest?.contacto_recepcion || dest?.telefono || null,
          };

          documentos.push({
            tipo: 'hoja_trabajo',
            titulo: 'Hoja de Trabajo Operativa / Picking',
            numero: `HT-${ped.numero_pedido}`,
            fecha: ped.fecha_solicitud || ped.creado_en,
            estado: ped.estado,
            detalles: `Picking Almacén: ${ped.estado} | Prioridad: ${ped.prioridad || 'Normal'}`,
            accion: 'ver_hoja_trabajo',
            data: ped,
          });

          if (ped.orden_compra_cliente) {
            documentos.push({
              tipo: 'orden_compra',
              titulo: 'Orden de Compra Cliente',
              numero: ped.orden_compra_cliente,
              fecha: ped.fecha_solicitud,
              detalles: `Cliente: ${cli?.razon_social || 'General'}`,
            });
          }

          // Verificar si tiene remito generado
          const { data: remitos } = await supabase
            .from('remitos_transito')
            .select('*')
            .eq('pedido_id', ped.id);

          if (remitos && remitos.length > 0) {
            remitos.forEach((r) => {
              documentos.push({
                tipo: 'remito',
                titulo: 'Remito Oficial de Tránsito',
                numero: r.numero_remito_rx || `REM-${r.id.slice(0, 8)}`,
                fecha: r.fecha_emision || r.creado_en,
                estado: r.estado,
                detalles: `CAE: ${r.cae_o_autorizacion_fiscal || 'Sin CAE'} | Bultos: ${r.total_bultos}`,
                accion: 'ver_remito',
                data: ped,
              });
            });
          }

          // Ítems de pedidos
          if (ped.detalles && Array.isArray(ped.detalles)) {
            ped.detalles.forEach((det: any) => {
              const art = det.articulo;
              const tareas = det.tareas_picking || [];
              const lotes = Array.from(new Set(tareas.map((t: any) => t.numero_lote).filter(Boolean))).join(', ');
              const ubicaciones = Array.from(new Set(tareas.map((t: any) => t.ubicacion_origen_codigo).filter(Boolean))).join(', ');

              items.push({
                id: det.id,
                articulo_codigo: art?.codigo || 'SKU-DESC',
                articulo_descripcion: art?.descripcion || 'Artículo sin descripción',
                lote: lotes || (det.lote_id ? `Lote Ref: ${String(det.lote_id).slice(0, 8)}` : null),
                ubicacion: ubicaciones || null,
                cantidad_solicitada: Number(det.cantidad_solicitada || 0),
                cantidad_efectiva: Number(det.cantidad_separada || det.cantidad_reservada || 0),
                unidad_medida: art?.unidad_medida || 'UN',
                volumen_m3: (art?.volumen_unitario_m3 || 0) * Number(det.cantidad_solicitada || 0),
                peso_kg: (art?.peso_unitario_kg || 0) * Number(det.cantidad_solicitada || 0),
              });
            });
          }
        }
      }

      // 3. SALIDA (Outbound / Expedición)
      else if (operacion.tipo_op === 'salida') {
        let osQuery = supabase.from('ordenes_salida').select(`
          *,
          almacen:almacenes(*),
          remitos:remitos_transito(*),
          pedidos_asoc:ordenes_salida_pedidos(
            pedido:pedidos(
              *,
              cliente:clientes(*),
              destinatario:destinatarios(*),
              detalles:pedidos_detalle(
                *,
                articulo:articulos(*)
              )
            )
          ),
          ruta:rutas_entrega(*)
        `);

        if (operacion.referencia_id) {
          osQuery = osQuery.eq('id', operacion.referencia_id);
        } else {
          osQuery = osQuery.eq('numero_orden_salida', operacion.id_operacion);
        }

        const { data: os } = await osQuery.maybeSingle();
        raw = os;

        if (os) {
          const rutaRaw: any = (os as any).ruta;
          const ruta: any = Array.isArray(rutaRaw) ? rutaRaw[0] : rutaRaw;
          if (ruta) {
            transporte = {
              empresa: ruta.transporte_empresa || null,
              chofer: ruta.chofer_nombre || null,
              patente: ruta.vehiculo_patente || null,
              hora_salida: ruta.fecha_hora_salida_real || ruta.fecha_hora_salida_estimada || null,
            };
          }

          documentos.push({
            tipo: 'orden_salida',
            titulo: 'Orden de Salida Expedición',
            numero: os.numero_orden_salida,
            fecha: os.creado_en,
            estado: os.estado,
            detalles: `Muelle de Expedición | Estado: ${os.estado}`,
          });

          const remitos = os.remitos || [];
          remitos.forEach((r: any) => {
            documentos.push({
              tipo: 'remito',
              titulo: 'Remito de Tránsito Asignado',
              numero: r.numero_remito_rx,
              fecha: r.fecha_emision || r.creado_en,
              estado: r.estado,
              detalles: `Bultos: ${r.total_bultos} | CAE: ${r.cae_o_autorizacion_fiscal || 'Sin CAE'}`,
              accion: 'ver_remito',
              data: { id: r.pedido_id },
            });
          });

          const pedidosAsoc = os.pedidos_asoc || [];
          pedidosAsoc.forEach((pa: any) => {
            const p = pa.pedido;
            if (p?.detalles) {
              p.detalles.forEach((det: any) => {
                const art = det.articulo;
                items.push({
                  id: det.id,
                  articulo_codigo: art?.codigo || 'SKU-DESC',
                  articulo_descripcion: art?.descripcion || 'Artículo',
                  lote: operacion.lotes_despacho !== 'Consolidado Outbound' ? operacion.lotes_despacho : null,
                  cantidad_solicitada: Number(det.cantidad_solicitada || 0),
                  cantidad_efectiva: Number(det.cantidad_separada || det.cantidad_solicitada || 0),
                  unidad_medida: art?.unidad_medida || 'UN',
                  volumen_m3: (art?.volumen_unitario_m3 || 0) * Number(det.cantidad_separada || 0),
                  peso_kg: (art?.peso_unitario_kg || 0) * Number(det.cantidad_separada || 0),
                });
              });
            }
          });
        }
      }

      // 4. ENTREGA (Remito de Distribución & Hoja de Ruta)
      else if (operacion.tipo_op === 'entrega') {
        let remQuery = supabase.from('remitos_transito').select(`
          *,
          cliente:clientes(*),
          pedido:pedidos(
            *,
            destinatario:destinatarios(*),
            detalles:pedidos_detalle(
              *,
              articulo:articulos(*)
            )
          ),
          paradas:rutas_paradas_itinerario(
            *,
            ruta:rutas_entrega(*)
          )
        `);

        if (operacion.referencia_id) {
          remQuery = remQuery.eq('id', operacion.referencia_id);
        } else {
          remQuery = remQuery.eq('numero_remito_rx', operacion.id_operacion);
        }

        const { data: rem } = await remQuery.maybeSingle();
        raw = rem;

        if (rem) {
          const ped = rem.pedido;
          const dest = ped?.destinatario as any;
          const cli = rem.cliente as any;
          entidad_relacionada = {
            tipo: 'destinatario',
            nombre: dest?.razon_social || cli?.razon_social || 'Destinatario Final',
            identificacion_fiscal: cli?.identificacion_fiscal || null,
            direccion: dest?.direccion_entrega || null,
            localidad: [dest?.localidad, dest?.ciudad].filter(Boolean).join(', ') || null,
            contacto: dest?.contacto_recepcion || dest?.telefono || null,
          };

          const paradas = (rem as any).paradas || [];
          const parada = paradas[0];
          const ruta = parada?.ruta;

          if (ruta) {
            transporte = {
              empresa: ruta.transporte_empresa || null,
              chofer: ruta.chofer_nombre || null,
              patente: ruta.vehiculo_patente || null,
              hora_salida: ruta.fecha_hora_salida_real || ruta.fecha_hora_salida_estimada || null,
              hora_arribo: parada?.hora_real_arribo || null,
            };

            documentos.push({
              tipo: 'hoja_ruta',
              titulo: 'Hoja de Ruta / Distribución',
              numero: ruta.codigo_ruta,
              fecha: ruta.creado_en,
              estado: ruta.estado,
              detalles: `Chofer: ${ruta.chofer_nombre || 'N/A'} | Patente: ${ruta.vehiculo_patente || 'N/A'} | Parada: ${parada?.orden_visita || 1}`,
            });
          }

          documentos.push({
            tipo: 'remito',
            titulo: 'Remito R-X Oficial de Entrega',
            numero: rem.numero_remito_rx,
            fecha: rem.fecha_emision || rem.creado_en,
            estado: rem.estado,
            detalles: `Bultos: ${rem.total_bultos} | CAE: ${rem.cae_o_autorizacion_fiscal || 'Sin CAE fiscal'}`,
            accion: 'ver_remito',
            data: ped || { id: rem.pedido_id },
          });

          if (ped?.numero_pedido) {
            documentos.push({
              tipo: 'hoja_trabajo',
              titulo: 'Pedido Origen',
              numero: ped.numero_pedido,
              fecha: ped.fecha_solicitud,
              detalles: `Cliente: ${cli?.razon_social || 'General'}`,
              accion: 'ver_hoja_trabajo',
              data: ped,
            });
          }

          // Ítems
          if (ped?.detalles && Array.isArray(ped.detalles)) {
            ped.detalles.forEach((det: any) => {
              const art = det.articulo;
              items.push({
                id: det.id,
                articulo_codigo: art?.codigo || 'SKU-DESC',
                articulo_descripcion: art?.descripcion || 'Artículo',
                lote: det.lote_id ? `Lote: ${String(det.lote_id).slice(0, 8)}` : null,
                cantidad_solicitada: Number(det.cantidad_solicitada || 0),
                cantidad_efectiva: Number(det.cantidad_separada || det.cantidad_solicitada || 0),
                unidad_medida: art?.unidad_medida || 'UN',
                volumen_m3: (art?.volumen_unitario_m3 || 0) * Number(det.cantidad_solicitada || 0),
                peso_kg: (art?.peso_unitario_kg || 0) * Number(det.cantidad_solicitada || 0),
              });
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('Error al obtener detalle completo de la operación:', err);
    }

    return {
      operacion,
      items,
      documentos,
      transporte,
      entidad_relacionada,
      raw,
    };
  },
};
