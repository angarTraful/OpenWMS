export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      almacenes: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          direccion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          direccion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      articulos: {
        Row: {
          activo: boolean
          actualizado_en: string
          bultos_por_pallet: number
          categoria_id: string | null
          cliente_id: string
          codigo_barras: string | null
          creado_en: string
          descripcion: string | null
          id: string
          moneda: string
          nombre: string
          peso_unitario_kg: number
          rotacion_abc: Database["public"]["Enums"]["rotacion_abc_enum"]
          sku: string
          subcategoria_id: string | null
          unidad_medida: string
          unidades_por_bulto: number
          valor_declarado: number
          volumen_unitario_m3: number
          id_producto: string | null
          color: string | null
          marca_bulto: string | null
          ean13: string | null
          tipo_empaque: string | null
          cantidad_por_pallet: number | null
          peso_gw: number | null
          medida_m3: number | null
          item_so: string | null
          imagen_url: string | null
          descripcion_full?: string | null
          factor_estiba?: number | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          bultos_por_pallet?: number
          categoria_id?: string | null
          cliente_id: string
          codigo_barras?: string | null
          creado_en?: string
          descripcion?: string | null
          id?: string
          moneda?: string
          nombre: string
          peso_unitario_kg?: number
          rotacion_abc?: Database["public"]["Enums"]["rotacion_abc_enum"]
          sku: string
          subcategoria_id?: string | null
          unidad_medida?: string
          unidades_por_bulto?: number
          valor_declarado?: number
          volumen_unitario_m3?: number
          id_producto?: string | null
          color?: string | null
          marca_bulto?: string | null
          ean13?: string | null
          tipo_empaque?: string | null
          cantidad_por_pallet?: number | null
          peso_gw?: number | null
          medida_m3?: number | null
          factor_estiba?: number | null
          item_so?: string | null
          imagen_url?: string | null
          descripcion_full?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          bultos_por_pallet?: number
          categoria_id?: string | null
          cliente_id?: string
          codigo_barras?: string | null
          creado_en?: string
          descripcion?: string | null
          id?: string
          moneda?: string
          nombre?: string
          peso_unitario_kg?: number
          rotacion_abc?: Database["public"]["Enums"]["rotacion_abc_enum"]
          sku?: string
          subcategoria_id?: string | null
          unidad_medida?: string
          unidades_por_bulto?: number
          valor_declarado?: number
          volumen_unitario_m3?: number
          id_producto?: string | null
          color?: string | null
          marca_bulto?: string | null
          ean13?: string | null
          tipo_empaque?: string | null
          cantidad_por_pallet?: number | null
          peso_gw?: number | null
          medida_m3?: number | null
          factor_estiba?: number | null
          item_so?: string | null
          imagen_url?: string | null
          descripcion_full?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articulos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articulos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articulos_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_articulos"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_articulos: {
        Row: {
          activo: boolean
          codigo: string
          creado_en: string
          descripcion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          activo: boolean
          actualizado_en: string
          codigo: string
          creado_en: string
          direccion: string | null
          email_contacto: string | null
          id: string
          identificacion_fiscal: string | null
          razon_social: string
          telefono: string | null
          unidad_negocio: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          codigo: string
          creado_en?: string
          direccion?: string | null
          email_contacto?: string | null
          id?: string
          identificacion_fiscal?: string | null
          razon_social: string
          telefono?: string | null
          unidad_negocio?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          codigo?: string
          creado_en?: string
          direccion?: string | null
          email_contacto?: string | null
          id?: string
          identificacion_fiscal?: string | null
          razon_social?: string
          telefono?: string | null
          unidad_negocio?: string | null
        }
        Relationships: []
      }
      clientes_destinatarios: {
        Row: {
          activo: boolean
          actualizado_en: string
          alias_cliente: string | null
          cliente_id: string
          creado_en: string
          destinatario_id: string
          es_sucursal_propia: boolean
          id: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          alias_cliente?: string | null
          cliente_id: string
          creado_en?: string
          destinatario_id: string
          es_sucursal_propia?: boolean
          id?: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          alias_cliente?: string | null
          cliente_id?: string
          creado_en?: string
          destinatario_id?: string
          es_sucursal_propia?: boolean
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_destinatarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_destinatarios_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "destinatarios"
            referencedColumns: ["id"]
          },
        ]
      }
      destinatarios: {
        Row: {
          activo: boolean
          actualizado_en: string
          localidad: string | null
          ciudad: string | null
          cliente_id: string | null
          codigo_sucursal: string | null
          contacto_recepcion: string | null
          creado_en: string
          direccion_entrega: string
          id: string
          razon_social: string
          telefono: string | null
          ventana_horaria_entrega: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          localidad?: string | null
          ciudad?: string | null
          cliente_id?: string | null
          codigo_sucursal?: string | null
          contacto_recepcion?: string | null
          creado_en?: string
          direccion_entrega: string
          id?: string
          razon_social: string
          telefono?: string | null
          ventana_horaria_entrega?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          localidad?: string | null
          ciudad?: string | null
          cliente_id?: string | null
          codigo_sucursal?: string | null
          contacto_recepcion?: string | null
          creado_en?: string
          direccion_entrega?: string
          id?: string
          razon_social?: string
          telefono?: string | null
          ventana_horaria_entrega?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "destinatarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario: {
        Row: {
          actualizado_en: string
          almacen_id: string
          articulo_id: string
          cantidad_disponible: number
          cantidad_reservada: number
          cliente_id: string
          creado_en: string
          id: string
          lote_id: string
          pallet_id: string | null
          ubicacion_id: string
          unidad_medida: string
          volumen_m3: number
        }
        Insert: {
          actualizado_en?: string
          almacen_id: string
          articulo_id: string
          cantidad_disponible?: number
          cantidad_reservada?: number
          cliente_id: string
          creado_en?: string
          id?: string
          lote_id: string
          pallet_id?: string | null
          ubicacion_id: string
          unidad_medida: string
          volumen_m3?: number
        }
        Update: {
          actualizado_en?: string
          almacen_id?: string
          articulo_id?: string
          cantidad_disponible?: number
          cantidad_reservada?: number
          cliente_id?: string
          creado_en?: string
          id?: string
          lote_id?: string
          pallet_id?: string | null
          ubicacion_id?: string
          unidad_medida?: string
          volumen_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets_lpn"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones_cliente: {
        Row: {
          actualizado_en: string
          aprobado_por: string | null
          auditoria_desvios_detectados: Json
          cliente_id: string
          creado_en: string
          estado: string
          fecha_aprobacion: string | null
          fecha_desde: string
          fecha_hasta: string
          id: string
          moneda: string
          monto_total: number
          numero_liquidacion: string
          observaciones: string | null
          subtotal_estadia: number
          subtotal_manuales: number
          subtotal_operativo: number
          total_bultos_stock: number
          total_dias_periodo: number
          total_m3_dias: number
        }
        Insert: {
          actualizado_en?: string
          aprobado_por?: string | null
          auditoria_desvios_detectados?: Json
          cliente_id: string
          creado_en?: string
          estado?: string
          fecha_aprobacion?: string | null
          fecha_desde: string
          fecha_hasta: string
          id?: string
          moneda?: string
          monto_total?: number
          numero_liquidacion: string
          observaciones?: string | null
          subtotal_estadia?: number
          subtotal_manuales?: number
          subtotal_operativo?: number
          total_bultos_stock?: number
          total_dias_periodo: number
          total_m3_dias?: number
        }
        Update: {
          actualizado_en?: string
          aprobado_por?: string | null
          auditoria_desvios_detectados?: Json
          cliente_id?: string
          creado_en?: string
          estado?: string
          fecha_aprobacion?: string | null
          fecha_desde?: string
          fecha_hasta?: string
          id?: string
          moneda?: string
          monto_total?: number
          numero_liquidacion?: string
          observaciones?: string | null
          subtotal_estadia?: number
          subtotal_manuales?: number
          subtotal_operativo?: number
          total_bultos_stock?: number
          total_dias_periodo?: number
          total_m3_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones_cliente_items: {
        Row: {
          cantidad: number
          concepto_codigo: string
          creado_en: string
          descripcion: string
          id: string
          liquidacion_id: string
          notas: string | null
          origen: string
          precio_unitario: number
          subtotal: number
          unidad_medida: string
        }
        Insert: {
          cantidad: number
          concepto_codigo: string
          creado_en?: string
          descripcion: string
          id?: string
          liquidacion_id: string
          notas?: string | null
          origen?: string
          precio_unitario: number
          subtotal: number
          unidad_medida: string
        }
        Update: {
          cantidad?: number
          concepto_codigo?: string
          creado_en?: string
          descripcion?: string
          id?: string
          liquidacion_id?: string
          notas?: string | null
          origen?: string
          precio_unitario?: number
          subtotal?: number
          unidad_medida?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_cliente_items_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones_cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones_cliente_tramos: {
        Row: {
          bultos_totales: number
          dias_en_tramo: number
          fecha_fin: string
          fecha_inicio: string
          id: string
          liquidacion_id: string
          m3_dias_acumulados: number
          orden_tramo: number
          subtotal_tramo: number
          tarifa_m3_aplicada: number
          volumen_m3: number
        }
        Insert: {
          bultos_totales?: number
          dias_en_tramo: number
          fecha_fin: string
          fecha_inicio: string
          id?: string
          liquidacion_id: string
          m3_dias_acumulados: number
          orden_tramo: number
          subtotal_tramo: number
          tarifa_m3_aplicada: number
          volumen_m3: number
        }
        Update: {
          bultos_totales?: number
          dias_en_tramo?: number
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          liquidacion_id?: string
          m3_dias_acumulados?: number
          orden_tramo?: number
          subtotal_tramo?: number
          tarifa_m3_aplicada?: number
          volumen_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_cliente_tramos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones_cliente"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_cliente: {
        Row: {
          bloqueado: boolean
          cliente_id: string
          creado_en: string
          fecha_fabricacion: string | null
          fecha_vencimiento: string | null
          id: string
          motivo_bloqueo: string | null
          numero_lote: string
        }
        Insert: {
          bloqueado?: boolean
          cliente_id: string
          creado_en?: string
          fecha_fabricacion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          motivo_bloqueo?: string | null
          numero_lote: string
        }
        Update: {
          bloqueado?: boolean
          cliente_id?: string
          creado_en?: string
          fecha_fabricacion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          motivo_bloqueo?: string | null
          numero_lote?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          articulo_id: string
          cantidad: number
          cliente_id: string
          documento_referencia: string | null
          fecha_hora: string
          id: string
          lote_id: string
          notas: string | null
          pallet_id: string | null
          tipo_movimiento: Database["public"]["Enums"]["tipo_movimiento_enum"]
          ubicacion_destino_id: string | null
          ubicacion_origen_id: string | null
          usuario_id: string | null
          volumen_m3: number
          pedido_id: string | null
          estado: string | null
        }
        Insert: {
          articulo_id: string
          cantidad: number
          cliente_id: string
          documento_referencia?: string | null
          fecha_hora?: string
          id?: string
          lote_id: string
          notas?: string | null
          pallet_id?: string | null
          tipo_movimiento: Database["public"]["Enums"]["tipo_movimiento_enum"]
          ubicacion_destino_id?: string | null
          ubicacion_origen_id?: string | null
          usuario_id?: string | null
          volumen_m3?: number
          pedido_id?: string | null
          estado?: string | null
        }
        Update: {
          articulo_id?: string
          cantidad?: number
          cliente_id?: string
          documento_referencia?: string | null
          fecha_hora?: string
          id?: string
          lote_id?: string
          notas?: string | null
          pallet_id?: string | null
          tipo_movimiento?: Database["public"]["Enums"]["tipo_movimiento_enum"]
          ubicacion_destino_id?: string | null
          ubicacion_origen_id?: string | null
          usuario_id?: string | null
          volumen_m3?: number
          pedido_id?: string | null
          estado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets_lpn"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      operaciones: {
        Row: {
          id: string
          id_operacion: string
          cliente_id: string | null
          cliente_nombre: string
          unidad_negocio: string | null
          fechahora_alta: string
          fechahora_fin: string | null
          tipo_op: 'entrada' | 'pedido' | 'salida' | 'entrega'
          documento_movimiento: string | null
          documento_heredado: string | null
          lotes_despacho: string | null
          cantidad_total: number
          m3_totales: number
          novedad_desvio: string | null
          usuario_creador: string
          usuario_creador_id: string | null
          estado: 'en_proceso' | 'completada' | 'cancelada'
          referencia_id: string | null
          creado_en: string
          actualizado_en: string
        }
        Insert: {
          id?: string
          id_operacion: string
          cliente_id?: string | null
          cliente_nombre?: string
          unidad_negocio?: string | null
          fechahora_alta?: string
          fechahora_fin?: string | null
          tipo_op: 'entrada' | 'pedido' | 'salida' | 'entrega'
          documento_movimiento?: string | null
          documento_heredado?: string | null
          lotes_despacho?: string | null
          cantidad_total?: number
          m3_totales?: number
          novedad_desvio?: string | null
          usuario_creador?: string
          usuario_creador_id?: string | null
          estado?: 'en_proceso' | 'completada' | 'cancelada'
          referencia_id?: string | null
          creado_en?: string
          actualizado_en?: string
        }
        Update: {
          id?: string
          id_operacion?: string
          cliente_id?: string | null
          cliente_nombre?: string
          unidad_negocio?: string | null
          fechahora_alta?: string
          fechahora_fin?: string | null
          tipo_op?: 'entrada' | 'pedido' | 'salida' | 'entrega'
          documento_movimiento?: string | null
          documento_heredado?: string | null
          lotes_despacho?: string | null
          cantidad_total?: number
          m3_totales?: number
          novedad_desvio?: string | null
          usuario_creador?: string
          usuario_creador_id?: string | null
          estado?: 'en_proceso' | 'completada' | 'cancelada'
          referencia_id?: string | null
          creado_en?: string
          actualizado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "operaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          }
        ]
      }
      ordenes_recepcion: {
        Row: {
          actualizado_en: string
          almacen_id: string
          chofer_documento: string | null
          chofer_nombre: string | null
          cliente_id: string
          creado_en: string
          despacho_aduana: string | null
          documentos_adjuntos: Json
          estado: Database["public"]["Enums"]["estado_recepcion_enum"]
          fecha_hora_arribo: string
          id: string
          lote_defecto: string | null
          nro_contenedor_oc: string | null
          numero_recepcion: string
          observaciones: string | null
          patente_camion: string | null
          tipo_contenedor: string | null
          total_articulos: number | null
          transporte_empresa: string | null
        }
        Insert: {
          actualizado_en?: string
          almacen_id: string
          chofer_documento?: string | null
          chofer_nombre?: string | null
          cliente_id: string
          creado_en?: string
          despacho_aduana?: string | null
          documentos_adjuntos?: Json
          estado?: Database["public"]["Enums"]["estado_recepcion_enum"]
          fecha_hora_arribo?: string
          id?: string
          lote_defecto?: string | null
          nro_contenedor_oc?: string | null
          numero_recepcion: string
          observaciones?: string | null
          patente_camion?: string | null
          tipo_contenedor?: string | null
          total_articulos?: number | null
          transporte_empresa?: string | null
        }
        Update: {
          actualizado_en?: string
          almacen_id?: string
          chofer_documento?: string | null
          chofer_nombre?: string | null
          cliente_id?: string
          creado_en?: string
          despacho_aduana?: string | null
          documentos_adjuntos?: Json
          estado?: Database["public"]["Enums"]["estado_recepcion_enum"]
          fecha_hora_arribo?: string
          id?: string
          lote_defecto?: string | null
          nro_contenedor_oc?: string | null
          numero_recepcion?: string
          observaciones?: string | null
          patente_camion?: string | null
          tipo_contenedor?: string | null
          total_articulos?: number | null
          transporte_empresa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_recepcion_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_recepcion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_recepcion_detalle: {
        Row: {
          articulo_id: string
          cantidad_esperada: number
          comentarios: string | null
          fecha_vencimiento: string | null
          id: string
          lote_declarado: string
          recepcion_id: string
          ubicacion_sugerida_id: string | null
        }
        Insert: {
          articulo_id: string
          cantidad_esperada: number
          comentarios?: string | null
          fecha_vencimiento?: string | null
          id?: string
          lote_declarado: string
          recepcion_id: string
          ubicacion_sugerida_id?: string | null
        }
        Update: {
          articulo_id?: string
          cantidad_esperada?: number
          comentarios?: string | null
          fecha_vencimiento?: string | null
          id?: string
          lote_declarado?: string
          recepcion_id?: string
          ubicacion_sugerida_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_recepcion_detalle_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_recepcion_detalle_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "ordenes_recepcion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_recepcion_detalle_ubicacion_sugerida_id_fkey"
            columns: ["ubicacion_sugerida_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_recepcion_recursos: {
        Row: {
          id: string
          recepcion_id: string
          tipo_recurso: string
          descripcion: string | null
          unidad_medida: string
          cantidad: number
          costo_unitario: number
          costo_total: number | null
          incluido_en_tarifario: boolean
          proveedor_servicio: string | null
          creado_en: string
          actualizado_en: string
        }
        Insert: {
          id?: string
          recepcion_id: string
          tipo_recurso: string
          descripcion?: string | null
          unidad_medida?: string
          cantidad?: number
          costo_unitario?: number
          costo_total?: number | null
          incluido_en_tarifario?: boolean
          proveedor_servicio?: string | null
          creado_en?: string
          actualizado_en?: string
        }
        Update: {
          id?: string
          recepcion_id?: string
          tipo_recurso?: string
          descripcion?: string | null
          unidad_medida?: string
          cantidad?: number
          costo_unitario?: number
          costo_total?: number | null
          incluido_en_tarifario?: boolean
          proveedor_servicio?: string | null
          creado_en?: string
          actualizado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_recepcion_recursos_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "ordenes_recepcion"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_recepcion_romaneo_excepciones: {
        Row: {
          id: string
          recepcion_id: string
          recepcion_detalle_id: string | null
          articulo_id: string
          nro_secuencia: number
          codigo_etiqueta_lpn: string | null
          medida_estandar: number
          medida_real: number
          unidad_medida: string
          diferencia: number | null
          observaciones: string | null
          creado_en: string
          actualizado_en: string
        }
        Insert: {
          id?: string
          recepcion_id: string
          recepcion_detalle_id?: string | null
          articulo_id: string
          nro_secuencia: number
          codigo_etiqueta_lpn?: string | null
          medida_estandar: number
          medida_real: number
          unidad_medida?: string
          diferencia?: number | null
          observaciones?: string | null
          creado_en?: string
          actualizado_en?: string
        }
        Update: {
          id?: string
          recepcion_id?: string
          recepcion_detalle_id?: string | null
          articulo_id?: string
          nro_secuencia?: number
          codigo_etiqueta_lpn?: string | null
          medida_estandar?: number
          medida_real?: number
          unidad_medida?: string
          diferencia?: number | null
          observaciones?: string | null
          creado_en?: string
          actualizado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_recepcion_romaneo_excepciones_recepcion_id_fkey"
            columns: ["recepcion_id"]
            isOneToOne: false
            referencedRelation: "ordenes_recepcion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_recepcion_romaneo_excepciones_recepcion_detalle_id_fkey"
            columns: ["recepcion_detalle_id"]
            isOneToOne: false
            referencedRelation: "ordenes_recepcion_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_recepcion_romaneo_excepciones_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_salida: {
        Row: {
          actualizado_en: string
          almacen_id: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_orden_salida_enum"]
          fecha_salida_programada: string | null
          id: string
          numero_orden_salida: string
          observaciones: string | null
        }
        Insert: {
          actualizado_en?: string
          almacen_id: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_orden_salida_enum"]
          fecha_salida_programada?: string | null
          id?: string
          numero_orden_salida: string
          observaciones?: string | null
        }
        Update: {
          actualizado_en?: string
          almacen_id?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_orden_salida_enum"]
          fecha_salida_programada?: string | null
          id?: string
          numero_orden_salida?: string
          observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_salida_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_salida_pedidos: {
        Row: {
          id: string
          orden_salida_id: string
          pedido_id: string
        }
        Insert: {
          id?: string
          orden_salida_id: string
          pedido_id: string
        }
        Update: {
          id?: string
          orden_salida_id?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_salida_pedidos_orden_salida_id_fkey"
            columns: ["orden_salida_id"]
            isOneToOne: false
            referencedRelation: "ordenes_salida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_salida_pedidos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      paletizado_despacho: {
        Row: {
          creado_en: string
          id: string
          orden_salida_id: string | null
          pallet_salida_lpn: string
          pedido_id: string | null
          peso_estimado_kg: number
          total_bultos: number
          volumen_estimado_m3: number
        }
        Insert: {
          creado_en?: string
          id?: string
          orden_salida_id?: string | null
          pallet_salida_lpn: string
          pedido_id?: string | null
          peso_estimado_kg?: number
          total_bultos: number
          volumen_estimado_m3?: number
        }
        Update: {
          creado_en?: string
          id?: string
          orden_salida_id?: string | null
          pallet_salida_lpn?: string
          pedido_id?: string | null
          peso_estimado_kg?: number
          total_bultos?: number
          volumen_estimado_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "paletizado_despacho_orden_salida_id_fkey"
            columns: ["orden_salida_id"]
            isOneToOne: false
            referencedRelation: "ordenes_salida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paletizado_despacho_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pallets_lpn: {
        Row: {
          cliente_id: string
          codigo_lpn: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_pallet_enum"]
          id: string
          peso_total_kg: number
          tipo_pallet: string | null
          volumen_total_m3: number
        }
        Insert: {
          cliente_id: string
          codigo_lpn: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_pallet_enum"]
          id?: string
          peso_total_kg?: number
          tipo_pallet?: string | null
          volumen_total_m3?: number
        }
        Update: {
          cliente_id?: string
          codigo_lpn?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_pallet_enum"]
          id?: string
          peso_total_kg?: number
          tipo_pallet?: string | null
          volumen_total_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "pallets_lpn_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          actualizado_en: string
          almacen_origen_id: string | null
          cliente_id: string
          creado_en: string
          destinatario_id: string | null
          estado: Database["public"]["Enums"]["estado_pedido_enum"]
          fecha_compromiso_entrega: string | null
          fecha_solicitud: string
          id: string
          modalidad_entrega: "envio_domicilio" | "retiro_deposito"
          numero_pedido: string
          observaciones: string | null
          orden_compra_cliente: string | null
          prioridad: Database["public"]["Enums"]["prioridad_pedido_enum"]
          control_muestreo_completado?: boolean | null
          control_muestreo_fecha?: string | null
          control_muestreo_usuario?: string | null
          control_muestreo_resultado?: string | null
          pedido_padre_id?: string | null
          es_parcializado?: boolean | null
          estrategia_alocacion?: string | null
          operador_picking_id?: string | null
          supervisor_picking_id?: string | null
          controller_picking_id?: string | null
        }
        Insert: {
          actualizado_en?: string
          almacen_origen_id?: string | null
          cliente_id: string
          creado_en?: string
          destinatario_id?: string | null
          estado?: Database["public"]["Enums"]["estado_pedido_enum"]
          fecha_compromiso_entrega?: string | null
          fecha_solicitud?: string
          id?: string
          modalidad_entrega?: "envio_domicilio" | "retiro_deposito"
          numero_pedido: string
          observaciones?: string | null
          orden_compra_cliente?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_pedido_enum"]
          control_muestreo_completado?: boolean | null
          control_muestreo_fecha?: string | null
          control_muestreo_usuario?: string | null
          control_muestreo_resultado?: string | null
          pedido_padre_id?: string | null
          es_parcializado?: boolean | null
          estrategia_alocacion?: string | null
          operador_picking_id?: string | null
          supervisor_picking_id?: string | null
          controller_picking_id?: string | null
        }
        Update: {
          actualizado_en?: string
          almacen_origen_id?: string | null
          cliente_id?: string
          creado_en?: string
          destinatario_id?: string | null
          estado?: Database["public"]["Enums"]["estado_pedido_enum"]
          fecha_compromiso_entrega?: string | null
          fecha_solicitud?: string
          id?: string
          modalidad_entrega?: "envio_domicilio" | "retiro_deposito"
          numero_pedido?: string
          observaciones?: string | null
          orden_compra_cliente?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad_pedido_enum"]
          control_muestreo_completado?: boolean | null
          control_muestreo_fecha?: string | null
          control_muestreo_usuario?: string | null
          control_muestreo_resultado?: string | null
          pedido_padre_id?: string | null
          es_parcializado?: boolean | null
          estrategia_alocacion?: string | null
          operador_picking_id?: string | null
          supervisor_picking_id?: string | null
          controller_picking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "destinatarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_detalle: {
        Row: {
          articulo_id: string
          cantidad_reservada: number
          cantidad_separada: number
          cantidad_solicitada: number
          id: string
          pedido_id: string
          lote_id: string | null
          ubicacion_id: string | null
        }
        Insert: {
          articulo_id: string
          cantidad_reservada?: number
          cantidad_separada?: number
          cantidad_solicitada: number
          id?: string
          pedido_id: string
          lote_id?: string | null
          ubicacion_id?: string | null
        }
        Update: {
          articulo_id?: string
          cantidad_reservada?: number
          cantidad_separada?: number
          cantidad_solicitada?: number
          id?: string
          pedido_id?: string
          lote_id?: string | null
          ubicacion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_detalle_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_detalle_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      remitos_transito: {
        Row: {
          cae_o_autorizacion_fiscal: string | null
          cliente_id: string
          creado_en: string
          destinatario_id: string | null
          estado: Database["public"]["Enums"]["estado_remito_enum"]
          fecha_emision: string
          id: string
          numero_remito_rx: string
          orden_salida_id: string | null
          pedido_id: string
          peso_total_kg: number
          total_bultos: number
          total_pallets: number
          valor_declarado_total: number
          volumen_total_m3: number
        }
        Insert: {
          cae_o_autorizacion_fiscal?: string | null
          cliente_id: string
          creado_en?: string
          destinatario_id?: string | null
          estado?: Database["public"]["Enums"]["estado_remito_enum"]
          fecha_emision?: string
          id?: string
          numero_remito_rx: string
          orden_salida_id?: string | null
          pedido_id: string
          peso_total_kg: number
          total_bultos: number
          total_pallets?: number
          valor_declarado_total: number
          volumen_total_m3: number
        }
        Update: {
          cae_o_autorizacion_fiscal?: string | null
          cliente_id?: string
          creado_en?: string
          destinatario_id?: string | null
          estado?: Database["public"]["Enums"]["estado_remito_enum"]
          fecha_emision?: string
          id?: string
          numero_remito_rx?: string
          orden_salida_id?: string | null
          pedido_id?: string
          peso_total_kg?: number
          total_bultos?: number
          total_pallets?: number
          valor_declarado_total?: number
          volumen_total_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "remitos_transito_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_transito_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "destinatarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_transito_orden_salida_id_fkey"
            columns: ["orden_salida_id"]
            isOneToOne: false
            referencedRelation: "ordenes_salida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_transito_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      remitos_romaneo_excepciones: {
        Row: {
          id: string
          pedido_id: string | null
          orden_salida_id: string | null
          articulo_id: string
          nro_secuencia: number
          codigo_etiqueta_lpn: string | null
          medida_estandar: number
          medida_real: number
          unidad_medida: string
          es_estandar: boolean
          imprimir_en_reverso: boolean
          creado_en: string
        }
        Insert: {
          id?: string
          pedido_id?: string | null
          orden_salida_id?: string | null
          articulo_id: string
          nro_secuencia: number
          codigo_etiqueta_lpn?: string | null
          medida_estandar: number
          medida_real: number
          unidad_medida?: string
          es_estandar?: boolean
          imprimir_en_reverso?: boolean
          creado_en?: string
        }
        Update: {
          id?: string
          pedido_id?: string | null
          orden_salida_id?: string | null
          articulo_id?: string
          nro_secuencia?: number
          codigo_etiqueta_lpn?: string | null
          medida_estandar?: number
          medida_real?: number
          unidad_medida?: string
          es_estandar?: boolean
          imprimir_en_reverso?: boolean
          creado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "remitos_romaneo_excepciones_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_romaneo_excepciones_orden_salida_id_fkey"
            columns: ["orden_salida_id"]
            isOneToOne: false
            referencedRelation: "ordenes_salida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_romaneo_excepciones_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas_entrega: {
        Row: {
          chofer_documento: string | null
          chofer_nombre: string
          chofer_telefono: string | null
          codigo_ruta: string
          creado_en: string
          estado: Database["public"]["Enums"]["estado_ruta_enum"]
          fecha_hora_salida_estimada: string | null
          fecha_hora_salida_real: string | null
          id: string
          orden_salida_id: string
          tipo_vehiculo: string | null
          transporte_empresa: string
          vehiculo_patente: string
          acompanante_nombre?: string | null
          acompanante_documento?: string | null
          control_carga_completado?: boolean | null
          control_carga_fecha?: string | null
          control_carga_usuario?: string | null
          control_carga_precinto?: string | null
          km_estimados?: number | null
          km_reales?: number | null
          notas_viaje?: string | null
        }
        Insert: {
          chofer_documento?: string | null
          chofer_nombre: string
          chofer_telefono?: string | null
          codigo_ruta: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_ruta_enum"]
          fecha_hora_salida_estimada?: string | null
          fecha_hora_salida_real?: string | null
          id?: string
          orden_salida_id: string
          tipo_vehiculo?: string | null
          transporte_empresa: string
          vehiculo_patente: string
          acompanante_nombre?: string | null
          acompanante_documento?: string | null
          control_carga_completado?: boolean | null
          control_carga_fecha?: string | null
          control_carga_usuario?: string | null
          control_carga_precinto?: string | null
          km_estimados?: number | null
          km_reales?: number | null
          notas_viaje?: string | null
        }
        Update: {
          chofer_documento?: string | null
          chofer_nombre?: string
          chofer_telefono?: string | null
          codigo_ruta?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_ruta_enum"]
          fecha_hora_salida_estimada?: string | null
          fecha_hora_salida_real?: string | null
          id?: string
          orden_salida_id?: string
          tipo_vehiculo?: string | null
          transporte_empresa?: string
          vehiculo_patente?: string
          acompanante_nombre?: string | null
          acompanante_documento?: string | null
          control_carga_completado?: boolean | null
          control_carga_fecha?: string | null
          control_carga_usuario?: string | null
          control_carga_precinto?: string | null
          km_estimados?: number | null
          km_reales?: number | null
          notas_viaje?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rutas_entrega_orden_salida_id_fkey"
            columns: ["orden_salida_id"]
            isOneToOne: false
            referencedRelation: "ordenes_salida"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas_paradas_itinerario: {
        Row: {
          destinatario_id: string
          estado_entrega: Database["public"]["Enums"]["estado_parada_enum"]
          hora_estimada_arribo: string | null
          hora_real_arribo: string | null
          id: string
          observaciones: string | null
          pedido_id: string
          remito_id: string | null
          ruta_id: string
          secuencia_parada: number
          receptor_nombre?: string | null
          receptor_documento?: string | null
          firma_digital?: string | null
          motivo_novedad?: string | null
          foto_remito_url?: string | null
          latitud_entrega?: number | null
          longitud_entrega?: number | null
        }
        Insert: {
          destinatario_id: string
          estado_entrega?: Database["public"]["Enums"]["estado_parada_enum"]
          hora_estimada_arribo?: string | null
          hora_real_arribo?: string | null
          id?: string
          observaciones?: string | null
          pedido_id: string
          remito_id?: string | null
          ruta_id: string
          secuencia_parada: number
          receptor_nombre?: string | null
          receptor_documento?: string | null
          firma_digital?: string | null
          motivo_novedad?: string | null
          foto_remito_url?: string | null
          latitud_entrega?: number | null
          longitud_entrega?: number | null
        }
        Update: {
          destinatario_id?: string
          estado_entrega?: Database["public"]["Enums"]["estado_parada_enum"]
          hora_estimada_arribo?: string | null
          hora_real_arribo?: string | null
          id?: string
          observaciones?: string | null
          pedido_id?: string
          remito_id?: string | null
          ruta_id?: string
          secuencia_parada?: number
          receptor_nombre?: string | null
          receptor_documento?: string | null
          firma_digital?: string | null
          motivo_novedad?: string | null
          foto_remito_url?: string | null
          latitud_entrega?: number | null
          longitud_entrega?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rutas_paradas_itinerario_destinatario_id_fkey"
            columns: ["destinatario_id"]
            isOneToOne: false
            referencedRelation: "destinatarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_paradas_itinerario_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_paradas_itinerario_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "remitos_transito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_paradas_itinerario_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas_entrega"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategorias_articulos: {
        Row: {
          activo: boolean
          categoria_id: string | null
          codigo: string
          creado_en: string
          descripcion: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          categoria_id?: string | null
          codigo: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          categoria_id?: string | null
          codigo?: string
          creado_en?: string
          descripcion?: string | null
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_articulos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_articulos"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_picking: {
        Row: {
          articulo_id: string
          cantidad_a_recolectar: number
          cantidad_recolectada: number
          creado_en: string
          estado: string
          id: string
          lote_id: string
          novedad_faltante: string | null
          observaciones_picking: string | null
          operador_id: string | null
          pallet_origen_id: string | null
          pedido_detalle_id: string
          pedido_id: string
          ubicacion_origen_id: string
        }
        Insert: {
          articulo_id: string
          cantidad_a_recolectar: number
          cantidad_recolectada?: number
          creado_en?: string
          estado?: string
          id?: string
          lote_id: string
          novedad_faltante?: string | null
          observaciones_picking?: string | null
          operador_id?: string | null
          pallet_origen_id?: string | null
          pedido_detalle_id: string
          pedido_id: string
          ubicacion_origen_id: string
        }
        Update: {
          articulo_id?: string
          cantidad_a_recolectar?: number
          cantidad_recolectada?: number
          creado_en?: string
          estado?: string
          id?: string
          lote_id?: string
          novedad_faltante?: string | null
          observaciones_picking?: string | null
          operador_id?: string | null
          pallet_origen_id?: string | null
          pedido_detalle_id?: string
          pedido_id?: string
          ubicacion_origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_picking_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_picking_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_picking_pallet_origen_id_fkey"
            columns: ["pallet_origen_id"]
            isOneToOne: false
            referencedRelation: "pallets_lpn"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_picking_pedido_detalle_id_fkey"
            columns: ["pedido_detalle_id"]
            isOneToOne: false
            referencedRelation: "pedidos_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_picking_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_picking_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_putaway_control: {
        Row: {
          actualizado_en: string
          articulo_id: string
          cantidad_recibida: number
          creado_en: string
          estado: Database["public"]["Enums"]["estado_putaway_enum"]
          id: string
          lote_id: string
          operador_control_id: string | null
          pallet_id: string | null
          recepcion_detalle_id: string
          ubicacion_destino_id: string
          ubicacion_origen_id: string
          volumen_calculado_m3: number
        }
        Insert: {
          actualizado_en?: string
          articulo_id: string
          cantidad_recibida?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_putaway_enum"]
          id?: string
          lote_id: string
          operador_control_id?: string | null
          pallet_id?: string | null
          recepcion_detalle_id: string
          ubicacion_destino_id: string
          ubicacion_origen_id: string
          volumen_calculado_m3?: number
        }
        Update: {
          actualizado_en?: string
          articulo_id?: string
          cantidad_recibida?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_putaway_enum"]
          id?: string
          lote_id?: string
          operador_control_id?: string | null
          pallet_id?: string | null
          recepcion_detalle_id?: string
          ubicacion_destino_id?: string
          ubicacion_origen_id?: string
          volumen_calculado_m3?: number
        }
        Relationships: [
          {
            foreignKeyName: "tareas_putaway_control_articulo_id_fkey"
            columns: ["articulo_id"]
            isOneToOne: false
            referencedRelation: "articulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_putaway_control_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_putaway_control_pallet_id_fkey"
            columns: ["pallet_id"]
            isOneToOne: false
            referencedRelation: "pallets_lpn"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_putaway_control_recepcion_detalle_id_fkey"
            columns: ["recepcion_detalle_id"]
            isOneToOne: false
            referencedRelation: "ordenes_recepcion_detalle"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_putaway_control_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tareas_putaway_control_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas_cliente_concepto: {
        Row: {
          activo: boolean
          actualizado_en: string
          cliente_id: string
          concepto_codigo: string
          creado_en: string
          descripcion: string
          id: string
          moneda: string
          precio_unitario: number
          tipo_unidad: string
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          cliente_id: string
          concepto_codigo: string
          creado_en?: string
          descripcion: string
          id?: string
          moneda?: string
          precio_unitario?: number
          tipo_unidad: string
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          cliente_id?: string
          concepto_codigo?: string
          creado_en?: string
          descripcion?: string
          id?: string
          moneda?: string
          precio_unitario?: number
          tipo_unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_cliente_concepto_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicaciones: {
        Row: {
          almacen_id: string
          capacidad_peso_kg: number | null
          capacidad_volumen_m3: number | null
          codigo_etiqueta: string
          estado: string
          estante: string | null
          id: string
          nivel: string | null
          pasillo: string | null
          permite_mezcla_clientes: boolean
          posicion: string | null
          zona_id: string
        }
        Insert: {
          almacen_id: string
          capacidad_peso_kg?: number | null
          capacidad_volumen_m3?: number | null
          codigo_etiqueta: string
          estado?: string
          estante?: string | null
          id?: string
          nivel?: string | null
          pasillo?: string | null
          permite_mezcla_clientes?: boolean
          posicion?: string | null
          zona_id: string
        }
        Update: {
          almacen_id?: string
          capacidad_peso_kg?: number | null
          capacidad_volumen_m3?: number | null
          codigo_etiqueta?: string
          estado?: string
          estante?: string | null
          id?: string
          nivel?: string | null
          pasillo?: string | null
          permite_mezcla_clientes?: boolean
          posicion?: string | null
          zona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ubicaciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ubicaciones_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      zonas: {
        Row: {
          activo: boolean
          almacen_id: string
          codigo: string
          es_autoestiba_piso?: boolean
          id: string
          nombre: string
          tipo_zona: string
        }
        Insert: {
          activo?: boolean
          almacen_id: string
          codigo: string
          es_autoestiba_piso?: boolean
          id?: string
          nombre: string
          tipo_zona?: string
        }
        Update: {
          activo?: boolean
          almacen_id?: string
          codigo?: string
          es_autoestiba_piso?: boolean
          id?: string
          nombre?: string
          tipo_zona?: string
        }
        Relationships: [
          {
            foreignKeyName: "zonas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          activo: boolean
          actualizado_en: string
          creado_en: string
          id: string
          rol_nombre: string
          tipo_rol: Database["public"]["Enums"]["tipo_rol_enum"]
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          id?: string
          rol_nombre: string
          tipo_rol?: Database["public"]["Enums"]["tipo_rol_enum"]
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          creado_en?: string
          id?: string
          rol_nombre?: string
          tipo_rol?: Database["public"]["Enums"]["tipo_rol_enum"]
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          activo: boolean
          actualizado_en: string
          clientes_ids: string[]
          creado_en: string
          email: string | null
          fecha_ultimo_acceso_bot: string | null
          FechaUltimoAccesoBot: string | null
          id: string
          nombre_usuario: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          clientes_ids?: string[]
          creado_en?: string
          email?: string | null
          fecha_ultimo_acceso_bot?: string | null
          FechaUltimoAccesoBot?: string | null
          id?: string
          nombre_usuario: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          clientes_ids?: string[]
          creado_en?: string
          email?: string | null
          fecha_ultimo_acceso_bot?: string | null
          FechaUltimoAccesoBot?: string | null
          id?: string
          nombre_usuario?: string
          telefono?: string | null
        }
        Relationships: []
      }
      usuarios_roles: {
        Row: {
          creado_en: string
          id: string
          rol_id: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          id?: string
          rol_id: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          id?: string
          rol_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_roles_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_roles_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actualizar_ultimo_acceso_bot: {
        Args: {
          p_identificador: string
          p_fecha?: string
        }
        Returns: Json
      }
      wms_actualizar_ultimo_acceso_bot: {
        Args: {
          p_identificador: string
          p_fecha?: string
        }
        Returns: Json
      }
      obtener_usuario_por_telefono: {
        Args: {
          p_telefono: string
        }
        Returns: Json
      }
      wms_obtener_usuario_por_telefono: {
        Args: {
          p_telefono: string
        }
        Returns: Json
      }
      obtener_usuarios_por_cliente: {
        Args: {
          p_codigo_cliente: string
        }
        Returns: Json
      }
      wms_obtener_usuarios_por_cliente: {
        Args: {
          p_codigo_cliente: string
        }
        Returns: Json
      }
      obtener_clientes_por_id: {
        Args: {
          p_clientes_ids?: Json
          p_solo_activos?: boolean
        }
        Returns: Json
      }
      wms_obtener_clientes_por_id: {
        Args: {
          p_clientes_ids?: Json
          p_solo_activos?: boolean
        }
        Returns: Json
      }
      obtener_cliente_por_telefono: {
        Args: {
          p_telefono: string
        }
        Returns: Json
      }
      obtener_stock_consolidado_por_cliente: {
        Args: {
          p_cliente_id: string
        }
        Returns: Json
      }
      wms_obtener_cliente_por_telefono: {
        Args: {
          p_telefono: string
        }
        Returns: Json
      }
      wms_obtener_stock_consolidado_por_cliente: {
        Args: {
          p_cliente_id: string
        }
        Returns: Json
      }
      wms_agregar_item_manual_liquidacion: {
        Args: {
          p_cantidad: number
          p_concepto_codigo: string
          p_descripcion: string
          p_liquidacion_id: string
          p_notas?: string
          p_precio_unitario: number
          p_unidad_medida: string
        }
        Returns: Json
      }
      wms_aprobar_liquidacion: {
        Args: { p_liquidacion_id: string; p_usuario_id?: string }
        Returns: Json
      }
      wms_asignar_picking_fefo: {
        Args: { p_pedido_id: string; p_estrategia?: string; p_asignaciones_manuales?: Json }
        Returns: Json
      }
      wms_confirmar_picking: {
        Args: { p_cantidad_recolectada: number; p_tarea_picking_id: string }
        Returns: Json
      }
      wms_confirmar_picking_con_novedad: {
        Args: {
          p_cantidad_recolectada: number
          p_novedad?: string
          p_tarea_picking_id: string
        }
        Returns: Json
      }
      wms_confirmar_putaway: {
        Args: {
          p_cantidad_recibida: number
          p_codigo_lpn?: string
          p_tarea_id: string
          p_ubicacion_destino_id?: string
        }
        Returns: Json
      }
      wms_consolidar_pallet_despacho: {
        Args: {
          p_orden_salida_id?: string
          p_pallet_salida_lpn: string
          p_pedido_id: string
          p_peso_estimado_kg: number
          p_total_bultos: number
          p_volumen_estimado_m3: number
        }
        Returns: Json
      }
      wms_crear_orden_recepcion: {
        Args: {
          p_almacen_id: string
          p_chofer_documento?: string
          p_chofer_nombre?: string
          p_cliente_id: string
          p_detalles?: Json
          p_nro_contenedor_oc?: string
          p_numero_recepcion: string
          p_observaciones?: string
          p_patente_camion?: string
          p_transporte_empresa?: string
        }
        Returns: Json
      }
      wms_eliminar_item_manual_liquidacion: {
        Args: { p_item_id: string }
        Returns: Json
      }
      wms_emitir_remito_rx: {
        Args: {
          p_pedido_id: string
          p_numero_remito_rx: string
          p_cae?: string | null
          p_orden_salida_id?: string | null
          p_valor_declarado_total?: number | null
        }
        Returns: Json
      }
      wms_liquidar_estadia_periodo: {
        Args: {
          p_cliente_id: string
          p_fecha_desde: string
          p_fecha_hasta: string
          p_recalcular?: boolean
        }
        Returns: Json
      }
      wms_buscar_pedidos_por_cliente: {
        Args: {
          p_cod_cliente: string
        }
        Returns: Json
      }
      buscar_pedidos_por_cliente: {
        Args: {
          p_cod_cliente: string
        }
        Returns: Json
      }
      wms_obtener_usuario_por_id: {
        Args: {
          p_usuario_id: string
          p_solo_activos?: boolean
        }
        Returns: Json
      }
      obtener_usuario_por_id: {
        Args: {
          p_usuario_id: string
          p_solo_activos?: boolean
        }
        Returns: Json
      }
      wms_procesar_movimiento_inventario: {
        Args: {
          p_movimiento: Json
        }
        Returns: Json
      }
      wms_importar_movimientos_inventario: {
        Args: {
          p_movimientos: Json
          p_ignorar_errores?: boolean
        }
        Returns: Json
      }
      wms_reasignar_tarea_picking: {
        Args: {
          p_tarea_picking_id: string
          p_nuevo_lote_id: string
          p_nueva_ubicacion_id: string
          p_nueva_cantidad?: number | null
        }
        Returns: Json
      }
      wms_crear_tarea_picking_manual: {
        Args: {
          p_pedido_id: string
          p_pedido_detalle_id: string
          p_articulo_id: string
          p_lote_id: string
          p_ubicacion_id: string
          p_cantidad: number
          p_pallet_id?: string | null
        }
        Returns: Json
      }
      wms_cancelar_tarea_picking: {
        Args: {
          p_tarea_picking_id: string
        }
        Returns: Json
      }
      wms_deshacer_asignacion_picking: {
        Args: {
          p_pedido_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      estado_orden_salida_enum:
        | "planificacion"
        | "consolidando_pallets"
        | "remitida"
        | "cargando"
        | "en_transito"
        | "cerrada"
      estado_pallet_enum:
        | "en_stock"
        | "en_transito"
        | "desarmado"
        | "despachado"
      estado_parada_enum: "pendiente" | "entregado" | "con_novedad"
      estado_pedido_enum:
        | "ingresado"
        | "asignado_picking"
        | "en_picking"
        | "preparado"
        | "agrupado_salida"
        | "despachado"
        | "cancelado"
      estado_putaway_enum:
        | "pendiente"
        | "en_traslado"
        | "almacenado"
        | "cancelado"
      estado_recepcion_enum:
        | "programada"
        | "en_playa"
        | "inbound"
        | "en_descarga"
        | "en_control"
        | "finalizada"
        | "cancelada"
      estado_remito_enum:
        | "emitido"
        | "en_transito"
        | "entregado_conforme"
        | "rechazado_parcial"
        | "rechazado_total"
      estado_ruta_enum:
        | "programada"
        | "en_carga"
        | "en_viaje"
        | "itinerario_cumplido"
        | "suspendida"
        | "cancelada"
      prioridad_pedido_enum: "baja" | "normal" | "urgente"
      rotacion_abc_enum: "A" | "B" | "C"
      tipo_movimiento_enum:
        | "recepcion"
        | "putaway"
        | "despaletizado"
        | "paletizado_despacho"
        | "picking"
        | "despacho"
        | "ajuste_positivo"
        | "ajuste_negativo"
        | "transferencia"
        | "merma"
      tipo_rol_enum:
        | "admin"
        | "operador"
        | "supervisor"
        | "cliente"
        | "chofer"
        | "bot"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_orden_salida_enum: [
        "planificacion",
        "consolidando_pallets",
        "remitida",
        "cargando",
        "en_transito",
        "cerrada",
      ],
      estado_pallet_enum: [
        "en_stock",
        "en_transito",
        "desarmado",
        "despachado",
      ],
      estado_parada_enum: ["pendiente", "entregado", "con_novedad"],
      estado_pedido_enum: [
        "ingresado",
        "asignado_picking",
        "en_picking",
        "preparado",
        "agrupado_salida",
        "despachado",
        "cancelado",
      ],
      estado_putaway_enum: [
        "pendiente",
        "en_traslado",
        "almacenado",
        "cancelado",
      ],
      estado_recepcion_enum: [
        "programada",
        "en_playa",
        "inbound",
        "en_descarga",
        "en_control",
        "finalizada",
        "cancelada",
      ],
      estado_remito_enum: [
        "emitido",
        "en_transito",
        "entregado_conforme",
        "rechazado_parcial",
        "rechazado_total",
      ],
      estado_ruta_enum: [
        "programada",
        "en_carga",
        "en_viaje",
        "itinerario_cumplido",
        "suspendida",
        "cancelada",
      ],
      prioridad_pedido_enum: ["baja", "normal", "urgente"],
      rotacion_abc_enum: ["A", "B", "C"],
      tipo_movimiento_enum: [
        "recepcion",
        "putaway",
        "despaletizado",
        "paletizado_despacho",
        "picking",
        "despacho",
        "entregado",
        "ajuste_positivo",
        "ajuste_negativo",
        "transferencia",
        "merma",
      ],
    },
  },
} as const
