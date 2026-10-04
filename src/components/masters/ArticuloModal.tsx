import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Package,
  Save,
  AlertCircle,
  Sparkles,
  Plus,
  Layers,
  Box,
  Scale,
  Barcode,
  Palette,
  FileText,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import type { Articulo, ArticuloInsert, ArticuloUpdate } from '../../api/articulosApi';
import { articulosApi } from '../../api/articulosApi';
import type { Cliente } from '../../api/clientesApi';
import { QuickSelect } from '../ui/QuickSelect';
import { CategoriaModal } from './CategoriaModal';
import { ClienteModal } from './ClienteModal';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface ArticuloModalProps {
  isOpen: boolean;
  onClose: () => void;
  articulo: Articulo | null;
  clientes: Cliente[];
  defaultClienteId?: string;
  onSuccess: () => void;
  onCreated?: (nuevo: Articulo) => void;
}

const TIPOS_EMPAQUE_DEFAULT = [
  'caja',
  'bulto',
  'rollo',
  'fardo',
  'paquete',
  'tambor',
  'pallet',
  'bidón',
  'bolsa',
  'otro',
];

const UNIDADES_MEDIDA_DEFAULT = [
  'unidades',
  'metro',
  'packs',
  'minibulto',
  'pares',
  'bulto',
  'caja',
  'kg',
  'litros',
  'pallet',
];

export const ArticuloModal: React.FC<ArticuloModalProps> = ({
  isOpen,
  onClose,
  articulo,
  clientes: clientesProp,
  defaultClienteId,
  onSuccess,
  onCreated,
}) => {
  const isEditing = Boolean(articulo);

  const [clientesList, setClientesList] = useState<Cliente[]>(clientesProp);
  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [modalCategoriaOpen, setModalCategoriaOpen] = useState(false);
  const [modalSubcategoriaOpen, setModalSubcategoriaOpen] = useState(false);

  // Subcategoría creación rápida
  const [nuevaSubcatNombre, setNuevaSubcatNombre] = useState('');
  const [nuevaSubcatCodigo, setNuevaSubcatCodigo] = useState('');
  const [guardandoSubcat, setGuardandoSubcat] = useState(false);

  useEffect(() => {
    setClientesList(clientesProp);
  }, [clientesProp]);

  // 1. Identificación básica y cliente
  const [idProducto, setIdProducto] = useState(''); // ID_Producto / SKU
  const [clienteId, setClienteId] = useState('');
  const [nombre, setNombre] = useState(''); // Nombre_producto
  const [descripcion, setDescripcion] = useState('');
  const [color, setColor] = useState('');
  const [ean13, setEan13] = useState(''); // EAN13

  // 2. Clasificación Maestros (Tablas)
  const [categoriaId, setCategoriaId] = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [categorias, setCategorias] = useState<any[]>([]);
  const [marcaBulto, setMarcaBulto] = useState(''); // Marca de Bulto

  // 3. Empaque y Presentación
  const [tipoEmpaque, setTipoEmpaque] = useState('caja');
  const [unidadMedida, setUnidadMedida] = useState('unidades');
  const [unidadesPorBulto, setUnidadesPorBulto] = useState<number>(1);
  const [cantidadPorPallet, setCantidadPorPallet] = useState<number>(40);

  // 4. Métricas Físicas y Logísticas
  const [pesoGw, setPesoGw] = useState<number>(1.0); // PesoGW (Kg)
  const [medidaM3, setMedidaM3] = useState<number>(0.045); // MedidaM3 (M3)
  const [factorEstiba, setFactorEstiba] = useState<number>(100); // Factor Estiba %

  // Parámetros auxiliares existentes
  const [rotacionAbc, setRotacionAbc] = useState<'A' | 'B' | 'C'>('B');
  const [valorDeclarado, setValorDeclarado] = useState<number>(0);
  const [moneda, setMoneda] = useState('$');
  const [activo, setActivo] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar categorías disponibles con sus subcategorías
  useEffect(() => {
    if (isOpen) {
      articulosApi
        .listarCategorias(false)
        .then((cats) => setCategorias(cats || []))
        .catch((err) => console.error('Error cargando categorías:', err));
    }
  }, [isOpen]);

  // Subcategorías disponibles para la categoría seleccionada
  const subcategoriasDisponibles = useMemo(() => {
    if (!categoriaId) return [];
    const cat = categorias.find((c) => c.id === categoriaId);
    return cat?.subcategorias || [];
  }, [categorias, categoriaId]);

  // Cargar datos al abrir o editar
  useEffect(() => {
    if (isOpen) {
      if (articulo) {
        setClienteId(articulo.cliente_id || '');
        setIdProducto((articulo as any).id_producto || articulo.sku || '');
        setNombre(articulo.nombre || '');
        setDescripcion(articulo.descripcion || '');
        setColor((articulo as any).color || '');
        setEan13((articulo as any).ean13 || articulo.codigo_barras || '');

        setCategoriaId(articulo.categoria_id || '');
        setSubcategoriaId(articulo.subcategoria_id || '');
        setMarcaBulto((articulo as any).marca_bulto || '');

        setTipoEmpaque((articulo as any).tipo_empaque || 'caja');
        setUnidadMedida(articulo.unidad_medida || 'unidades');
        setUnidadesPorBulto(Number(articulo.unidades_por_bulto) || 1);
        setCantidadPorPallet(
          Number((articulo as any).cantidad_por_pallet) || Number(articulo.bultos_por_pallet) || 40
        );

        setPesoGw(
          Number((articulo as any).peso_gw) || Number(articulo.peso_unitario_kg) || 0
        );
        setMedidaM3(
          Number((articulo as any).medida_m3) || Number(articulo.volumen_unitario_m3) || 0
        );
        setFactorEstiba(Number((articulo as any).factor_estiba) ?? 100);

        setRotacionAbc((articulo.rotacion_abc as any) || 'B');
        setValorDeclarado(Number(articulo.valor_declarado) || 0);
        setMoneda(articulo.moneda || '$');
        setActivo(articulo.activo ?? true);
      } else {
        setClienteId(defaultClienteId || (clientesProp[0]?.id ?? ''));
        setIdProducto('');
        setNombre('');
        setDescripcion('');
        setColor('');
        setEan13('');

        setCategoriaId(categorias[0]?.id || '');
        setSubcategoriaId('');
        setMarcaBulto('');

        setTipoEmpaque('caja');
        setUnidadMedida('unidades');
        setUnidadesPorBulto(1);
        setCantidadPorPallet(40);

        setPesoGw(1.0);
        setMedidaM3(0.045);
        setFactorEstiba(100);

        setRotacionAbc('B');
        setValorDeclarado(0);
        setMoneda('$');
        setActivo(true);
      }
      setErrorMsg(null);
    }
  }, [isOpen, articulo, defaultClienteId, clientesProp, categorias]);

  // Manejo de creación rápida de subcategoría
  const handleGuardarSubcategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoriaId) {
      setErrorMsg('Debe seleccionar primero una categoría para asignarle la subcategoría.');
      return;
    }
    if (!nuevaSubcatNombre.trim()) return;

    setGuardandoSubcat(true);
    try {
      const codigoGenerado =
        nuevaSubcatCodigo.trim().toUpperCase() ||
        nuevaSubcatNombre.trim().substring(0, 4).toUpperCase();

      const created = await articulosApi.crearSubcategoria({
        categoria_id: categoriaId,
        codigo: codigoGenerado,
        nombre: nuevaSubcatNombre.trim(),
        activo: true,
      });

      // Refrescar lista de categorías
      const catsActualizadas = await articulosApi.listarCategorias(false);
      setCategorias(catsActualizadas);
      setSubcategoriaId(created.id);
      setModalSubcategoriaOpen(false);
      setNuevaSubcatNombre('');
      setNuevaSubcatCodigo('');
    } catch (err: any) {
      console.error('Error creando subcategoría:', err);
      setErrorMsg(err.message || 'Error al guardar la nueva subcategoría.');
    } finally {
      setGuardandoSubcat(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!clienteId) {
      setErrorMsg('Debe seleccionar el cliente depositante dueño del artículo.');
      return;
    }
    if (!idProducto.trim()) {
      setErrorMsg('El campo ID_Producto / SKU es obligatorio.');
      return;
    }
    if (!nombre.trim()) {
      setErrorMsg('El Nombre del Producto es obligatorio.');
      return;
    }
    if (medidaM3 < 0) {
      setErrorMsg('La Medida M³ no puede ser negativa.');
      return;
    }
    if (pesoGw < 0) {
      setErrorMsg('El Peso GW no puede ser negativo.');
      return;
    }

    setLoading(true);
    try {
      const skuLimpio = idProducto.trim().toUpperCase();

      const baseData: any = {
        cliente_id: clienteId,
        id_producto: skuLimpio,
        sku: skuLimpio,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        color: color.trim() || null,
        categoria_id: categoriaId || null,
        subcategoria_id: subcategoriaId || null,
        marca_bulto: marcaBulto.trim() || null,
        ean13: ean13.trim() || null,
        codigo_barras: ean13.trim() || null,
        tipo_empaque: tipoEmpaque,
        unidad_medida: unidadMedida,
        unidades_por_bulto: Number(unidadesPorBulto) || 1,
        cantidad_por_pallet: Number(cantidadPorPallet) || 1,
        bultos_por_pallet: Math.max(1, Math.round(Number(cantidadPorPallet) || 1)),
        peso_gw: Number(pesoGw) || 0,
        peso_unitario_kg: Number(pesoGw) || 0,
        medida_m3: Number(medidaM3) || 0,
        volumen_unitario_m3: Number(medidaM3) || 0,
        factor_estiba: Number(factorEstiba) || 0,
        rotacion_abc: rotacionAbc,
        valor_declarado: Number(valorDeclarado) || 0,
        moneda,
        activo,
      };

      if (isEditing && articulo) {
        baseData.actualizado_en = new Date().toISOString();
        const updated = await articulosApi.actualizarArticulo(articulo.id, baseData);
        if (onCreated) onCreated(updated);
      } else {
        const created = await articulosApi.crearArticulo(baseData);
        if (onCreated) onCreated(created);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error guardando artículo:', err);
      setErrorMsg(err.message || 'Error al persistir el artículo en la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div className="relative w-full max-w-3xl rounded-md bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] shadow-2xl overflow-hidden text-slate-800 dark:text-[#e5e2e1] flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-[#333333] bg-slate-50 dark:bg-[#201f1f]">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] text-violet-700 dark:text-[#dab9ff]">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1] uppercase">
                  {isEditing ? 'Editar Ficha Logística de Artículo' : 'Nuevo Artículo en Catálogo Maestro'}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                  Gestión integral de identificación, empaque, peso GW, cubicaje M³ y estiba
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body con Scroll */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto">
            {errorMsg && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 dark:bg-[#381015] dark:border-[#690005] dark:text-[#ffb4ab] text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Bloque 1: Cliente & Identificación Principal (ID_Producto, EAN13, Nombre, Color) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2e2e2e] pb-1">
                <span className="text-[11px] font-bold text-violet-700 dark:text-[#dab9ff] uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                  <span>1. Identificación del Producto & Cliente</span>
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d] font-mono">Campos Obligatorios *</span>
              </div>

              {/* Cliente Titular */}
              <QuickSelect
                label="Cliente Depositante Titular"
                required
                disabled={isEditing}
                value={clienteId}
                onChange={setClienteId}
                placeholder="Seleccione cliente dueño de la mercadería..."
                addNewLabel="+ Agregar nuevo cliente depositante"
                onAddNew={() => setModalClienteOpen(true)}
                options={clientesList.map((c) => ({
                  value: c.id,
                  label: c.razon_social,
                  sublabel: c.codigo,
                }))}
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* ID_Producto */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    ID_Producto / SKU <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={idProducto}
                    onChange={(e) => setIdProducto(e.target.value.toUpperCase())}
                    placeholder="ART-2026-001"
                    className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-violet-700 dark:text-[#dab9ff] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                </div>

                {/* EAN13 */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    EAN13 / Código de Barras
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={ean13}
                      onChange={(e) => setEan13(e.target.value)}
                      placeholder="7791234567890"
                      className="w-full pl-8 pr-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                    <Barcode className="w-4 h-4 text-slate-400 dark:text-[#978d9d] absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* Color */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Color
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="Azul, Negro, Blanco..."
                      className="w-full pl-8 pr-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                    <Palette className="w-3.5 h-3.5 text-slate-400 dark:text-[#978d9d] absolute left-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Nombre_producto */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                  Nombre del Producto (Nombre_producto) <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Denominación comercial o técnica completa..."
                  className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-semibold text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>

              {/* Descripcion */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                  Descripción Detallada
                </label>
                <textarea
                  rows={2}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Especificaciones adicionales, requerimientos especiales de manipulación..."
                  className="w-full px-3 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                />
              </div>
            </div>

            {/* Bloque 2: Clasificación en Maestros (Categoria tbl, SubCategoria tbl, Marca de Bulto) */}
            <div className="p-3.5 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-3">
              <span className="text-[11px] font-bold text-violet-700 dark:text-[#dab9ff] uppercase tracking-wider block flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                <span>2. Clasificación Maestro & Marca de Bulto</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Categoria(tbl) */}
                <div>
                  <QuickSelect
                    label="Categoría (Tabla)"
                    required
                    value={categoriaId}
                    onChange={(catId) => {
                      setCategoriaId(catId);
                      setSubcategoriaId(''); // Reset subcategoria al cambiar categoria
                    }}
                    placeholder="Seleccione categoría..."
                    addNewLabel="+ Agregar nueva categoría"
                    onAddNew={() => setModalCategoriaOpen(true)}
                    options={categorias.map((cat) => ({
                      value: cat.id,
                      label: cat.nombre,
                      sublabel: cat.codigo,
                    }))}
                  />
                </div>

                {/* SubCategoria(tbl) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase">
                      SubCategoría (Tabla)
                    </label>
                    {categoriaId && (
                      <button
                        type="button"
                        onClick={() => setModalSubcategoriaOpen(true)}
                        className="text-[10px] text-violet-600 dark:text-[#dab9ff] hover:underline"
                        title="Crear nueva subcategoría dentro de la categoría actual"
                      >
                        + Crear SubCat
                      </button>
                    )}
                  </div>
                  <select
                    value={subcategoriaId}
                    onChange={(e) => setSubcategoriaId(e.target.value)}
                    disabled={!categoriaId}
                    className="w-full px-2.5 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {!categoriaId
                        ? 'Primero elija categoría'
                        : subcategoriasDisponibles.length === 0
                        ? 'Sin subcategorías registradas'
                        : 'Seleccione subcategoría...'}
                    </option>
                    {subcategoriasDisponibles.map((sub: any) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.nombre} ({sub.codigo})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Marca de Bulto */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Marca de Bulto (Shipping Mark)
                  </label>
                  <input
                    type="text"
                    value={marcaBulto}
                    onChange={(e) => setMarcaBulto(e.target.value)}
                    placeholder="ej: CARTON-A / FRAGIL"
                    className="w-full px-3 py-2 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                </div>
              </div>
            </div>

            {/* Bloque 3: Presentación, Tipo de Empaque y Unidades */}
            <div className="p-3.5 rounded bg-slate-50 dark:bg-[#201f1f] border border-slate-200 dark:border-[#333333] space-y-3">
              <span className="text-[11px] font-bold text-violet-700 dark:text-[#dab9ff] uppercase tracking-wider block flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                <span>3. Tipo de Empaque, Unidades y Paletizado</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {/* TipoEmpaque */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Tipo de Empaque
                  </label>
                  <select
                    value={tipoEmpaque}
                    onChange={(e) => setTipoEmpaque(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] capitalize"
                  >
                    {TIPOS_EMPAQUE_DEFAULT.map((t) => (
                      <option key={t} value={t} className="capitalize">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* UnidadMedida */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Unidad de Medida <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <select
                    value={unidadMedida}
                    onChange={(e) => setUnidadMedida(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff] capitalize"
                  >
                    {UNIDADES_MEDIDA_DEFAULT.map((u) => (
                      <option key={u} value={u} className="capitalize">
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                {/* UnidadesXbulto */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    UnidadesXbulto <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={unidadesPorBulto}
                    onChange={(e) => setUnidadesPorBulto(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                </div>

                {/* CantidadXpallet */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    CantidadXpallet <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={cantidadPorPallet}
                    onChange={(e) => setCantidadPorPallet(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                </div>
              </div>
            </div>

            {/* Bloque 4: Métricas Volumétricas (PesoGW, MedidaM3, Factor Estiba %) */}
            <div className="p-3.5 rounded bg-violet-50/50 dark:bg-[#201330] border border-violet-200 dark:border-[#522b7c] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-violet-800 dark:text-[#dab9ff] uppercase tracking-wider flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
                  <span>4. Peso GW, Medida M³ y Factor Estiba %</span>
                </span>
                <span className="text-[10px] text-violet-600 dark:text-[#dab9ff] font-mono">Parámetros de Cobro & Almacenaje</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* PesoGW */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    PesoGW (Kg Bruto) <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={pesoGw}
                    onChange={(e) => setPesoGw(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                  <span className="text-[9px] text-slate-500 dark:text-[#cdc3d4] mt-0.5 block">
                    Pallet completo ({cantidadPorPallet} bultos) ≈ {(pesoGw * cantidadPorPallet).toFixed(1)} Kg
                  </span>
                </div>

                {/* MedidaM3 */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    MedidaM3 (Volumen M³) <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={medidaM3}
                    onChange={(e) => setMedidaM3(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-violet-700 dark:text-[#dab9ff] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  />
                  <span className="text-[9px] text-slate-500 dark:text-[#cdc3d4] mt-0.5 block">
                    Pallet completo ({cantidadPorPallet} bultos) ≈ {(medidaM3 * cantidadPorPallet).toFixed(3)} M³
                  </span>
                </div>

                {/* Factor Estiba % */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Factor Estiba %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={factorEstiba}
                      onChange={(e) => setFactorEstiba(parseFloat(e.target.value) || 0)}
                      placeholder="100"
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-amber-700 dark:text-[#ffd27a] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                    <span className="absolute right-3 top-1.5 text-xs text-slate-400 dark:text-[#978d9d] font-bold">%</span>
                  </div>
                  <span className="text-[9px] text-slate-500 dark:text-[#cdc3d4] mt-0.5 block">
                    Coeficiente de apilamiento / tolerancia de estiba
                  </span>
                </div>
              </div>

              {/* Rotación ABC y Valoración */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-[#442366]">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Rotación ABC
                  </label>
                  <select
                    value={rotacionAbc}
                    onChange={(e) => setRotacionAbc(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-mono focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                  >
                    <option value="A">Clase A (Alta rotación / Muelle)</option>
                    <option value="B">Clase B (Rotación media)</option>
                    <option value="C">Clase C (Baja rotación / Rack alto)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 dark:text-[#cdc3d4] uppercase mb-1">
                    Valor Declarado
                  </label>
                  <div className="flex items-center gap-1">
                    <select
                      value={moneda}
                      onChange={(e) => setMoneda(e.target.value)}
                      className="px-2 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-violet-700 dark:text-[#dab9ff] focus:outline-none"
                    >
                      <option value="$">ARS ($)</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorDeclarado}
                      onChange={(e) => setValorDeclarado(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:outline-none focus:border-violet-500 dark:focus:border-[#dab9ff]"
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-800 dark:text-[#e5e2e1] pb-1">
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={(e) => setActivo(e.target.checked)}
                      className="w-4 h-4 rounded text-violet-600 dark:text-[#dab9ff] border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] focus:ring-0"
                    />
                    <span className="font-semibold">Artículo Habilitado / Activo</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#333333]">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 font-bold"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Guardar Artículo'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Submodal para Crear Categoría Rápida */}
        <CategoriaModal
          isOpen={modalCategoriaOpen}
          onClose={() => setModalCategoriaOpen(false)}
          categoria={null}
          onCreated={(nuevaCat) => {
            articulosApi.listarCategorias(false).then((cats) => setCategorias(cats || []));
            setCategoriaId(nuevaCat.id);
          }}
        />

        {/* Submodal para Crear SubCategoría Rápida */}
        {modalSubcategoriaOpen && (
          <ModalPortal>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#4b4452] rounded-md max-w-sm w-full p-5 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#333333] pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                    <span>Nueva SubCategoría</span>
                  </h3>
                  <button
                    onClick={() => setModalSubcategoriaOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleGuardarSubcategoria} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[10px] text-slate-700 dark:text-[#cdc3d4] uppercase font-semibold mb-1">
                      Categoría Padre
                    </label>
                    <div className="px-2.5 py-1.5 rounded bg-slate-100 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-xs font-semibold text-violet-700 dark:text-[#dab9ff]">
                      {categorias.find((c) => c.id === categoriaId)?.nombre || 'Categoría'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-700 dark:text-[#cdc3d4] uppercase font-semibold mb-1">
                      Nombre SubCategoría <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={nuevaSubcatNombre}
                      onChange={(e) => setNuevaSubcatNombre(e.target.value)}
                      placeholder="ej: Conservas de Pescado, Cables HDMI..."
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-700 dark:text-[#cdc3d4] uppercase font-semibold mb-1">
                      Código Sugerido
                    </label>
                    <input
                      type="text"
                      value={nuevaSubcatCodigo}
                      onChange={(e) => setNuevaSubcatCodigo(e.target.value.toUpperCase())}
                      placeholder="SUBCAT-01"
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#333333]">
                    <button
                      type="button"
                      onClick={() => setModalSubcategoriaOpen(false)}
                      className="px-3 py-1.5 rounded border border-slate-300 dark:border-[#333333] text-xs text-slate-600 dark:text-[#cdc3d4] hover:bg-slate-100 dark:hover:bg-[#201f1f]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={guardandoSubcat || !nuevaSubcatNombre.trim()}
                      className="px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:text-[#460283] font-bold text-xs transition-colors disabled:opacity-50"
                    >
                      {guardandoSubcat ? 'Guardando...' : 'Crear SubCategoría'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Submodal para Crear Cliente Rápido */}
        <ClienteModal
          isOpen={modalClienteOpen}
          onClose={() => setModalClienteOpen(false)}
          cliente={null}
          onSuccess={() => {}}
          onCreated={(nuevoCli) => {
            setClientesList((prev) => [...prev, nuevoCli]);
            setClienteId(nuevoCli.id);
          }}
        />
      </div>
    </ModalPortal>
  );
};
