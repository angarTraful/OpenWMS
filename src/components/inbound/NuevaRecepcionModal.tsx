import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Truck,
  Plus,
  Trash2,
  RefreshCw,
  Box,
  Scale,
  Layers,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Zap,
  Upload,
  Image as ImageIcon,
  FileText,
  Eye,
  Paperclip,
  Check,
  Clock,
  ExternalLink,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatM3, formatNumber } from '@/lib/utils';
import { articulosApi, Articulo, getDescripcionFull } from '@/api/articulosApi';
import { recepcionesApi } from '@/api/recepcionesApi';
import { supabase } from '@/api/supabaseClient';
import { QuickSelect } from '@/components/ui/QuickSelect';
import { ClienteModal } from '@/components/masters/ClienteModal';
import { ArticuloModal } from '@/components/masters/ArticuloModal';
import { LoteModal } from '@/components/masters/LoteModal';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { subirDocumentoAGoogleDrive, normalizarUrlGoogleDrive } from '@/lib/googleDriveService';
import { ReconocimientoIADocumentoPanel } from '@/components/common/ReconocimientoIADocumentoPanel';

interface RenglonItem {
  id: string;
  articulo_id: string;
  lote_declarado?: string;
  fecha_vencimiento?: string;
  cantidad_esperada: number;
  ubicacion_sugerida_id?: string;
  comentarios?: string;
}

interface ArticuloSearchPickerProps {
  articulos: Articulo[];
  selectedArticuloId: string;
  onSelect: (articuloId: string) => void;
  onAddNew: () => void;
  disabled?: boolean;
  otherLoadedRenglones?: Record<string, number>;
}

// Normalizador de texto para búsqueda flexible sin distinción de mayúsculas ni acentos
const normalizeSearchText = (str?: string | number | null): string => {
  return (str != null ? String(str) : '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const getArticuloSearchableText = (art: Articulo): string => {
  const fullDesc = (art as any).descripcion_full || getDescripcionFull(art) || '';
  const parts = [
    art.nombre,
    art.sku,
    art.codigo_barras,
    art.descripcion,
    fullDesc,
    (art as any).color,
    (art as any).marca_bulto,
    art.unidad_medida,
    (art as any).tipo_empaque,
    (art as any).categoria?.nombre,
    (art as any).subcategoria?.nombre,
    art.peso_unitario_kg ? `${art.peso_unitario_kg}kg` : '',
    art.volumen_unitario_m3 ? `${art.volumen_unitario_m3}m3` : '',
  ];
  return normalizeSearchText(parts.filter(Boolean).join(' '));
};

const ArticuloSearchPicker: React.FC<ArticuloSearchPickerProps> = ({
  articulos,
  selectedArticuloId,
  onSelect,
  onAddNew,
  disabled = false,
  otherLoadedRenglones,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hoveredArt, setHoveredArt] = useState<Articulo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedArt = useMemo(
    () => articulos.find((a) => a.id === selectedArticuloId),
    [articulos, selectedArticuloId]
  );

  const getArticuloFullLabel = (art?: Articulo | null): string => {
    if (!art) return '';
    const desc = (art as any).descripcion_full || getDescripcionFull(art) || art.descripcion || art.nombre || '';
    const parts: string[] = [];
    if (art.nombre) parts.push(`[${art.nombre}]`);
    if (desc && desc !== art.nombre) parts.push(desc);
    if (art.sku && art.sku !== art.nombre) parts.push(`(SKU: ${art.sku})`);
    if (art.unidad_medida) parts.push(`· ${art.unidad_medida}`);
    if (art.peso_unitario_kg) parts.push(`· ${art.peso_unitario_kg} kg`);
    if (art.volumen_unitario_m3) parts.push(`· ${art.volumen_unitario_m3} m³`);
    return parts.join(' ');
  };

  // Filtrado integral por descripción, ítem, sku, código de barras, marca, color y categorías ("todo lo que se lea")
  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    if (!q) return articulos;
    const terms = q.split(/\s+/).filter(Boolean);
    return articulos.filter((a) => {
      const text = getArticuloSearchableText(a);
      return terms.every((term) => text.includes(term));
    });
  }, [articulos, query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHoveredArt(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renglonDuplicadoSeleccionado = selectedArticuloId && otherLoadedRenglones ? otherLoadedRenglones[selectedArticuloId] : null;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative w-full">
        <input
          type="text"
          disabled={disabled}
          value={isOpen ? query : (selectedArt ? selectedArt.nombre : query)}
          title={selectedArt ? getArticuloFullLabel(selectedArt) : 'Buscar código de artículo, descripción, color o marca...'}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          placeholder="Buscar ítem, descripción, color..."
          className={`w-full pl-7 pr-6 py-1.5 text-xs rounded border bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] outline-none truncate font-medium placeholder:text-slate-400 dark:placeholder:text-[#6b6471] ${
            renglonDuplicadoSeleccionado
              ? 'border-amber-400 dark:border-amber-600 focus:border-amber-500'
              : 'border-slate-300 dark:border-[#333333] focus:border-violet-500 dark:focus:border-[#dab9ff]'
          }`}
        />
        <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#978d9d] absolute left-2 top-2 pointer-events-none" />
        {selectedArticuloId && !isOpen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect('');
              setQuery('');
              setHoveredArt(null);
            }}
            className="absolute right-1.5 top-1.5 p-0.5 text-slate-400 dark:text-[#978d9d] hover:text-rose-500 dark:hover:text-[#ffb4ab] rounded"
            title="Limpiar selección"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Advertencia si el ítem ya fue cargado en otro renglón */}
      {renglonDuplicadoSeleccionado && !isOpen && (
        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-[#2b1f09] border border-amber-300 dark:border-amber-700/60 rounded px-1.5 py-0.5 animate-fadeIn">
          <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>⚠️ Ya cargado en Renglón #{renglonDuplicadoSeleccionado}</span>
        </div>
      )}

      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1 w-max min-w-[340px] sm:min-w-[480px] max-w-xl bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#4b4452] rounded-lg shadow-2xl z-50 overflow-hidden text-xs animate-fadeIn"
          onMouseLeave={() => setHoveredArt(null)}
        >
          {/* Primer renglón: Crear nuevo artículo en catálogo */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setHoveredArt(null);
              onAddNew();
            }}
            className="w-full px-3 py-2 text-left text-xs font-bold text-violet-700 dark:text-[#dab9ff] bg-violet-50 hover:bg-violet-100 dark:bg-[#2a173d] dark:hover:bg-[#391e53] border-b border-slate-200 dark:border-[#4b4452] flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff]" />
            <span>✨ + Agregar nuevo artículo al catálogo...</span>
          </button>

          {/* Lista de artículos disponibles */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2a2a2a]">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-slate-400 dark:text-[#978d9d] text-xs">
                No se encontraron artículos con "{query}"
              </div>
            ) : (
              filtered.map((art) => {
                const fullLabel = getArticuloFullLabel(art);
                const desc = (art as any).descripcion_full || getDescripcionFull(art) || art.descripcion || art.nombre;
                const renglonOcupado = otherLoadedRenglones ? otherLoadedRenglones[art.id] : null;

                return (
                  <button
                    key={art.id}
                    type="button"
                    title={fullLabel}
                    onMouseEnter={() => setHoveredArt(art)}
                    onClick={() => {
                      onSelect(art.id);
                      setIsOpen(false);
                      setQuery('');
                      setHoveredArt(null);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-violet-50/70 dark:hover:bg-[#26242a] transition-colors group ${art.id === selectedArticuloId
                      ? 'bg-violet-50 text-violet-700 dark:bg-[#2a173d]/60 dark:text-[#dab9ff]'
                      : 'text-slate-800 dark:text-[#e5e2e1]'
                      }`}
                  >
                    <span className="font-mono font-bold text-violet-700 dark:text-[#dab9ff] bg-slate-100 dark:bg-[#131313] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#333333] text-[10px] shrink-0 mt-0.5">
                      {art.nombre}
                    </span>
                    <div className="flex-1 min-w-0" title={fullLabel}>
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-medium text-xs truncate group-hover:text-violet-700 dark:group-hover:text-[#dab9ff]">
                          {desc}
                        </span>
                        {renglonOcupado && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700/60 rounded shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                            Ya en Renglón #{renglonOcupado}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-[#978d9d] flex items-center gap-1.5 flex-wrap mt-0.5">
                        {art.sku && art.sku !== art.nombre && <span>SKU: {art.sku} ·</span>}
                        <span>{art.unidad_medida || 'UN'}</span>
                        {art.peso_unitario_kg ? <span>· {art.peso_unitario_kg} kg</span> : null}
                        {art.volumen_unitario_m3 ? <span>· {art.volumen_unitario_m3} m³</span> : null}
                        {(art as any).color && <span>· Color: {(art as any).color}</span>}
                        {(art as any).marca_bulto && <span>· Marca: {(art as any).marca_bulto}</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Banner con etiqueta completa al pasar el cursor (Hover Control) */}
          {hoveredArt && (
            <div className="p-2.5 bg-slate-50 dark:bg-[#151416] border-t border-slate-200 dark:border-[#333333] text-xs animate-fadeIn">
              {otherLoadedRenglones && otherLoadedRenglones[hoveredArt.id] && (
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-[#2b1f09] border border-amber-300 dark:border-amber-700/60 rounded px-2 py-0.5">
                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>⚠️ Advertencia: Este artículo ya fue cargado en el Renglón #{otherLoadedRenglones[hoveredArt.id]}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-violet-700 dark:text-[#dab9ff]">
                <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#6b21a8]/60">
                  {hoveredArt.nombre}
                </span>
                {hoveredArt.sku && hoveredArt.sku !== hoveredArt.nombre && (
                  <span className="text-slate-500 font-normal">SKU: {hoveredArt.sku}</span>
                )}
                <span className="text-[10px] text-slate-400 font-normal ml-auto">
                  Etiqueta Completa
                </span>
              </div>
              <p className="font-semibold text-xs mt-1 text-slate-900 dark:text-[#e5e2e1] whitespace-normal leading-relaxed break-words">
                {(hoveredArt as any).descripcion_full || getDescripcionFull(hoveredArt) || hoveredArt.descripcion || hoveredArt.nombre}
              </p>
              <div className="text-[10px] text-slate-500 dark:text-[#978d9d] mt-1 flex items-center gap-2 font-mono flex-wrap">
                <span>Unidad: {hoveredArt.unidad_medida || 'UN'}</span>
                <span>·</span>
                <span>Peso: {hoveredArt.peso_unitario_kg || 0} kg</span>
                <span>·</span>
                <span>Volumen: {hoveredArt.volumen_unitario_m3 || 0} m³</span>
                {(hoveredArt as any).color && (
                  <>
                    <span>·</span>
                    <span>Color: {(hoveredArt as any).color}</span>
                  </>
                )}
                {(hoveredArt as any).marca_bulto && (
                  <>
                    <span>·</span>
                    <span>Marca: {(hoveredArt as any).marca_bulto}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface DocumentoAdjunto {
  id: string;
  nombre: string;
  tipo: string;
  size: string;
  url: string;
  fecha: string;
}

interface NuevaRecepcionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  almacenes: any[];
  clientes: any[];
  defaultAlmacenId?: string;
  defaultClienteId?: string;
}

const DEFAULT_TIPOS_CNTR = [
  "cont. 20'",
  "Cont. 40' STD",
  "Cont. 40' HC",
  "Chasis / Camión Abierto",
  "Furgón Paquetero",
  "Sider / Semirremolque",
];

export const NuevaRecepcionModal: React.FC<NuevaRecepcionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  almacenes,
  clientes,
  defaultAlmacenId,
  defaultClienteId,
}) => {
  // Form Header State
  const [clientesList, setClientesList] = useState<any[]>(clientes);
  const [almacenId, setAlmacenId] = useState<string>('');
  const [clienteId, setClienteId] = useState<string>('');
  const [numeroRecepcion, setNumeroRecepcion] = useState<string>('');
  const [loteOperacion, setLoteOperacion] = useState<string>('');

  // Fecha y hora del ingreso (editable)
  const getLocalISOString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  };
  const [fechaHoraArribo, setFechaHoraArribo] = useState<string>(getLocalISOString());

  // Tipos de Contenedor disponibles
  const [tiposContenedor, setTiposContenedor] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('wms_tipos_contenedor');
      if (saved) return JSON.parse(saved);
    } catch { }
    return DEFAULT_TIPOS_CNTR;
  });
  const [tipoContenedor, setTipoContenedor] = useState<string>("Cont. 40' HC");
  const [nuevoTipoModal, setNuevoTipoModal] = useState<boolean>(false);
  const [nuevoTipoTexto, setNuevoTipoTexto] = useState<string>('');

  // Transporte & Datos Operativos
  const [nroContenedorOc, setNroContenedorOc] = useState<string>('');
  const [transporteEmpresa, setTransporteEmpresa] = useState<string>('');
  const [patenteCamion, setPatenteCamion] = useState<string>('');
  const [choferNombre, setChoferNombre] = useState<string>('');
  const [choferDocumento, setChoferDocumento] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  // Despacho de Aduana y Documentación Adjunta
  const [despachoAduana, setDespachoAduana] = useState<string>('');
  const [documentosAdjuntos, setDocumentosAdjuntos] = useState<DocumentoAdjunto[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [previewModalImg, setPreviewModalImg] = useState<{ url: string; nombre: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submodales para maestros
  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [modalArticuloOpen, setModalArticuloOpen] = useState(false);
  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [targetRenglonId, setTargetRenglonId] = useState<string | null>(null);

  // Artículos disponibles para el cliente seleccionado
  const [articulosCliente, setArticulosCliente] = useState<Articulo[]>([]);
  const [loadingArticulos, setLoadingArticulos] = useState<boolean>(false);

  // Renglones / Detalle
  const [renglones, setRenglones] = useState<RenglonItem[]>([]);

  // Estado de envío
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [recibirDirecto, setRecibirDirecto] = useState<boolean>(false);

  // Generador de número sugerido de recepción
  const generarNumeroRecepcionSugerido = () => {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `REC-${year}-${rand}`;
  };

  // Inicialización al abrir modal
  useEffect(() => {
    if (isOpen) {
      const sugerido = generarNumeroRecepcionSugerido();
      setNumeroRecepcion(sugerido);
      setLoteOperacion(sugerido);
      setFechaHoraArribo(getLocalISOString());
      setAlmacenId(defaultAlmacenId || (almacenes[0]?.id ?? ''));
      setClienteId(defaultClienteId || (clientes[0]?.id ?? ''));
      setNroContenedorOc('');
      setTipoContenedor("Cont. 40' HC");
      setTransporteEmpresa('');
      setPatenteCamion('');
      setChoferNombre('');
      setChoferDocumento('');
      setObservaciones('');
      setDespachoAduana('');
      setDocumentosAdjuntos([]);
      setRecibirDirecto(false);
      setFeedback(null);
    }
  }, [isOpen, defaultAlmacenId, defaultClienteId, almacenes, clientes]);

  // Actualizar clientesList si la prop cambia
  useEffect(() => {
    setClientesList(clientes);
  }, [clientes]);

  // Cargar artículos del cliente cuando cambia clienteId
  useEffect(() => {
    if (!clienteId) {
      setArticulosCliente([]);
      setRenglones([]);
      return;
    }

    setLoadingArticulos(true);
    articulosApi
      .listarPorCliente(clienteId)
      .then((data) => {
        setArticulosCliente(data || []);
        // Si hay artículos y no hay renglones, inicializar 1 renglón por defecto
        if (data && data.length > 0) {
          setRenglones([
            {
              id: 'row-' + Date.now(),
              articulo_id: '',
              lote_declarado: loteOperacion || numeroRecepcion,
              fecha_vencimiento: '',
              cantidad_esperada: 0,
              comentarios: '',
            },
          ]);
        } else {
          setRenglones([]);
        }
      })
      .catch((err) => {
        console.error('Error cargando artículos de cliente:', err);
      })
      .finally(() => {
        setLoadingArticulos(false);
      });
  }, [clienteId]);

  // Actualizar lote de la operación en cabecera y propagar a los renglones que compartían el lote
  const handleLoteOperacionChange = (nuevoLote: string) => {
    const loteAnterior = loteOperacion;
    setLoteOperacion(nuevoLote);
    setRenglones((prev) =>
      prev.map((r) => {
        if (!r.lote_declarado || r.lote_declarado === loteAnterior) {
          return { ...r, lote_declarado: nuevoLote };
        }
        return r;
      })
    );
  };

  // Manejo de renglones
  const agregarRenglon = () => {
    const newRow: RenglonItem = {
      id: 'row-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
      articulo_id: '',
      lote_declarado: loteOperacion || numeroRecepcion,
      fecha_vencimiento: '',
      cantidad_esperada: 0,
      comentarios: '',
    };
    setRenglones([...renglones, newRow]);
  };

  const eliminarRenglon = (id: string) => {
    setRenglones(renglones.filter((r) => r.id !== id));
  };

  const actualizarRenglon = (id: string, campo: keyof RenglonItem, valor: any) => {
    setRenglones(
      renglones.map((r) => {
        if (r.id === id) {
          return { ...r, [campo]: valor };
        }
        return r;
      })
    );
  };

  // Sugerir nuevo correlativo y sincronizar lote si correspondía
  const handleSugerirNumero = () => {
    const nuevo = generarNumeroRecepcionSugerido();
    if (!loteOperacion || loteOperacion === numeroRecepcion) {
      handleLoteOperacionChange(nuevo);
    }
    setNumeroRecepcion(nuevo);
  };

  // Guardar nuevo tipo de contenedor
  const handleGuardarNuevoTipoCntr = () => {
    const limpio = nuevoTipoTexto.trim();
    if (!limpio) return;
    if (!tiposContenedor.includes(limpio)) {
      const actualizados = [...tiposContenedor, limpio];
      setTiposContenedor(actualizados);
      try {
        localStorage.setItem('wms_tipos_contenedor', JSON.stringify(actualizados));
      } catch { }
    }
    setTipoContenedor(limpio);
    setNuevoTipoTexto('');
    setNuevoTipoModal(false);
  };

  // Manejador para adjuntar imágenes / documentos
  const handleFilesAdded = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingDoc(true);
    const newDocs: DocumentoAdjunto[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

      let fileUrl = '';

      try {
        // Subir a Google Drive (OpenWMS_Documentos/Recepciones/) o Supabase Storage
        const uploadRes = await subirDocumentoAGoogleDrive({
          file,
          fileName: `Recep_${cleanName}`,
          folder: 'Recepciones',
        });
        fileUrl = uploadRes.url;
      } catch (uploadErr) {
        console.warn('Error subiendo a Google Drive/Storage:', uploadErr);
        // Fallback local
        fileUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (re) => resolve(re.target?.result as string);
          reader.readAsDataURL(file);
        });
      }

      // Clasificación inicial sugerida según nombre
      let tipoInicial = 'Remito / Guía';
      const lowerName = file.name.toLowerCase();
      if (lowerName.includes('despacho') || lowerName.includes('aduana') || lowerName.includes('sim')) {
        tipoInicial = 'Despacho Aduana';
      } else if (lowerName.includes('precinto') || lowerName.includes('cntr') || lowerName.includes('contenedor')) {
        tipoInicial = 'Foto Precinto / Contenedor';
      } else if (lowerName.includes('factura')) {
        tipoInicial = 'Factura Comercial';
      } else if (lowerName.includes('pack')) {
        tipoInicial = 'Packing List';
      }

      newDocs.push({
        id: 'doc-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substring(2, 5),
        nombre: file.name,
        tipo: tipoInicial,
        size:
          file.size > 1024 * 1024
            ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
            : (file.size / 1024).toFixed(1) + ' KB',
        url: fileUrl,
        fecha: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }

    setDocumentosAdjuntos((prev) => [...prev, ...newDocs]);
    setUploadingDoc(false);
    if (e.target) e.target.value = '';
  };

  // Cálculo de totales estimados (Bultos, M3, Peso KG)
  const totales = useMemo(() => {
    let bultos = 0;
    let volumenM3 = 0;
    let pesoKg = 0;

    const articulosMap = new Map(articulosCliente.map((a) => [a.id, a]));

    renglones.forEach((r) => {
      const art = articulosMap.get(r.articulo_id);
      const cant = Number(r.cantidad_esperada) || 0;
      bultos += cant;

      if (art) {
        volumenM3 += cant * Number(art.volumen_unitario_m3 || 0);
        pesoKg += cant * Number(art.peso_unitario_kg || 0);
      }
    });

    return {
      bultos,
      volumenM3: Number(volumenM3.toFixed(3)),
      pesoKg: Number(pesoKg.toFixed(1)),
    };
  }, [renglones, articulosCliente]);

  // Enviar formulario a la base de datos
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!almacenId || !clienteId || !numeroRecepcion.trim()) {
      setFeedback({ type: 'error', message: 'Complete los campos obligatorios del transporte y cliente.' });
      return;
    }

    if (!loteOperacion.trim()) {
      setFeedback({ type: 'error', message: 'Debe especificar el Lote de la operación en el encabezado.' });
      return;
    }

    if (renglones.length === 0) {
      setFeedback({ type: 'error', message: 'Debe agregar al menos un renglón de mercadería esperada.' });
      return;
    }

    // Validar renglones
    for (const r of renglones) {
      if (!r.articulo_id) {
        setFeedback({
          type: 'error',
          message: 'Debe buscar y seleccionar un artículo en todos los renglones.',
        });
        return;
      }
      if (Number(r.cantidad_esperada) <= 0) {
        setFeedback({
          type: 'error',
          message: 'La cantidad a ingresar debe ser mayor a cero (0) en todos los renglones.',
        });
        return;
      }
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await recepcionesApi.crearOrdenRecepcion({
        almacenId,
        clienteId,
        numeroRecepcion: numeroRecepcion.trim(),
        nroContenedorOc: nroContenedorOc.trim() || undefined,
        transporteEmpresa: transporteEmpresa.trim() || undefined,
        patenteCamion: patenteCamion.trim() || undefined,
        choferNombre: choferNombre.trim() || undefined,
        choferDocumento: choferDocumento.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        recibirDirecto,
        loteDefecto: loteOperacion.trim(),
        tipoContenedor: tipoContenedor.trim() || undefined,
        despachoAduana: despachoAduana.trim() || undefined,
        documentosAdjuntos: documentosAdjuntos,
        fechaHoraArribo: fechaHoraArribo ? new Date(fechaHoraArribo).toISOString() : undefined,
        detalles: renglones.map((r) => ({
          articulo_id: r.articulo_id,
          lote_declarado: (r.lote_declarado || loteOperacion).trim(),
          fecha_vencimiento: null,
          cantidad_esperada: Number(r.cantidad_esperada),
          ubicacion_sugerida_id: r.ubicacion_sugerida_id || null,
          comentarios: r.comentarios?.trim() || null,
        })),
      });

      setFeedback({
        type: 'success',
        message: recibirDirecto
          ? `¡Orden ${numeroRecepcion} creada e ingresada directamente al stock en estado Finalizada!`
          : `¡Orden ${numeroRecepcion} registrada en estado Programada! Lista para asignar muelle y registrar el IN.`,
      });

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error al registrar recepción:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Error al persistir la orden de recepción en Supabase',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isFormDirty = Boolean(renglones.length > 0 || nroContenedorOc || observaciones);

  return (
    <ModalPortal
      onClose={onClose}
      isDirty={isFormDirty}
      confirmMessage="¿Está seguro de cerrar la ventana de recepción? Se perderán las líneas declaradas en el borrador."
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-md max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
          {/* Modal Header */}
          <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-[#201f1f] border-b border-slate-200 dark:border-[#333333] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-violet-100 dark:bg-[#201330] border border-violet-200 dark:border-[#4b4452] text-violet-700 dark:text-[#dab9ff] flex items-center justify-center font-bold">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                  Registrar Arribo de Inbound & Descarga
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">
                  Recepción de contenedor / camión y generación de tareas de control en muelle
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Content Scrollable */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* Reconocimiento con IA (Packing List / Remitos / PDFs / Imágenes / Mails) + Drive + Conciliación */}
            <ReconocimientoIADocumentoPanel
              tipoOperacion="inbound"
              clienteId={clienteId}
              clienteCodigoOrCuit={
                clientesList.find((c) => c.id === clienteId)?.codigo ||
                clientesList.find((c) => c.id === clienteId)?.cuit ||
                ''
              }
              almacenId={almacenId}
              articulosCatalogo={articulosCliente}
              onAplicarExtraccion={(res) => {
                if (res.orden_compra || res.transporte_datos?.nro_contenedor_oc) {
                  setNroContenedorOc(res.transporte_datos?.nro_contenedor_oc || res.orden_compra);
                }
                if (res.transporte_datos?.transporte_empresa) {
                  setTransporteEmpresa(res.transporte_datos.transporte_empresa);
                }
                if (res.transporte_datos?.patente_camion) {
                  setPatenteCamion(res.transporte_datos.patente_camion);
                }
                if (res.transporte_datos?.chofer_nombre) {
                  setChoferNombre(res.transporte_datos.chofer_nombre);
                }
                if (res.transporte_datos?.chofer_documento) {
                  setChoferDocumento(res.transporte_datos.chofer_documento);
                }
                if (res.transporte_datos?.despacho_aduana) {
                  setDespachoAduana(res.transporte_datos.despacho_aduana);
                }
                if (res.notas_generales) {
                  setObservaciones((prev) =>
                    prev ? `${prev} | ${res.notas_generales}` : res.notas_generales
                  );
                }

                // Adjuntar enlaces de Google Drive (archivo original + CSV generado)
                const nuevosDocs: DocumentoAdjunto[] = [];
                const horaStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                if (res.documento_origen_url) {
                  nuevosDocs.push({
                    id: 'doc-ia-orig-' + Date.now(),
                    nombre: res.documento_origen_nombre || 'Packing_List_Original',
                    tipo: 'Packing List',
                    size: 'Drive',
                    url: res.documento_origen_url,
                    fecha: horaStr,
                  });
                }
                if (res.csv_generado_url) {
                  nuevosDocs.push({
                    id: 'doc-ia-csv-' + Date.now(),
                    nombre: `${res.numero_referencia}_IA.csv`,
                    tipo: 'CSV Exportado IA',
                    size: 'Drive CSV',
                    url: res.csv_generado_url,
                    fecha: horaStr,
                  });
                }
                if (nuevosDocs.length > 0) {
                  setDocumentosAdjuntos((prev) => [...prev, ...nuevosDocs]);
                }

                // Volcar renglones extraídos y conciliados
                if (res.renglones.length > 0) {
                  const mapeados: RenglonItem[] = res.renglones.map((r, idx) => {
                    const matchedArt =
                      articulosCliente.find((a) => a.id === r.articulo_id) ||
                      articulosCliente.find(
                        (a) =>
                          a.sku?.toLowerCase() === r.sku?.toLowerCase() ||
                          a.nombre?.toLowerCase() === r.sku?.toLowerCase()
                      );
                    return {
                      id: `row-ia-${Date.now()}-${idx}`,
                      articulo_id: matchedArt?.id || r.articulo_id || '',
                      lote_declarado: r.lote || loteOperacion || numeroRecepcion,
                      fecha_vencimiento: r.fecha_vencimiento || '',
                      cantidad_esperada: Number(r.cantidad_conciliada || r.cantidad_original_ia || 1),
                      comentarios: r.observaciones || r.articulo_nombre || '',
                    };
                  });
                  setRenglones(mapeados);
                }
              }}
              onPreOrdenAprobada={() => {
                onSuccess();
                onClose();
              }}
            />

            {/* Bloque 1: Datos de Cabecera (Transporte, Lote de Operación, Fecha/Hora y Tipo CNTR) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                  <span>1. Cabecera de la Operación & Transporte</span>
                </h4>
                <span className="text-[10px] text-slate-500 dark:text-[#978d9d]">
                  Lote unificado para todos los renglones
                </span>
              </div>

              {/* Fila 1 Cabecera: Cliente, Almacén, Nro Recepción y Lote Operación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Cliente 3PL con QuickSelect */}
                <div>
                  <QuickSelect
                    label="Cliente 3PL"
                    required
                    value={clienteId}
                    onChange={setClienteId}
                    placeholder="Seleccionar cliente..."
                    addNewLabel="+ Agregar nuevo cliente depositante"
                    onAddNew={() => setModalClienteOpen(true)}
                    options={clientesList.map((c) => ({
                      value: c.id,
                      label: c.razon_social,
                      sublabel: c.codigo,
                    }))}
                  />
                </div>

                {/* Almacén Destino */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Almacén Destino <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <select
                    required
                    value={almacenId}
                    onChange={(e) => setAlmacenId(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none cursor-pointer"
                  >
                    {almacenes.map((a) => (
                      <option key={a.id} value={a.id} className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Número de Recepción */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block">
                      Nro. Recepción <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleSugerirNumero}
                      className="text-[10px] text-violet-600 dark:text-[#dab9ff] hover:underline flex items-center gap-0.5"
                      title="Auto-generar correlativo"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Sugerir</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={numeroRecepcion}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!loteOperacion || loteOperacion === numeroRecepcion) {
                        handleLoteOperacionChange(val);
                      }
                      setNumeroRecepcion(val);
                    }}
                    placeholder="REC-2026-0001"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>

                {/* Lote de la Operación (Cabecera unificada) */}
                <div className="bg-violet-50/70 dark:bg-[#201330]/50 p-1.5 rounded border border-violet-300 dark:border-[#6b21a8]/40">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-violet-800 dark:text-[#dab9ff] block">
                      Lote de Operación <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setRenglones((prev) =>
                            prev.map((r) => ({ ...r, lote_declarado: loteOperacion }))
                          );
                        }}
                        className="text-[10px] text-violet-700 dark:text-[#dab9ff] hover:underline font-medium"
                        title="Aplicar este lote a todos los renglones"
                      >
                        Copiar a todos
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLoteOperacionChange(numeroRecepcion)}
                        className="text-[10px] text-violet-700 dark:text-[#dab9ff] hover:underline font-mono font-medium"
                        title="Restablecer como el Nro de Recepción"
                      >
                        = Nro. Rec
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalLoteOpen(true)}
                        className="text-[10px] text-violet-700 dark:text-[#dab9ff] hover:underline font-medium"
                        title="Abrir catálogo formal de lotes"
                      >
                        + Maestro
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    value={loteOperacion}
                    onChange={(e) => handleLoteOperacionChange(e.target.value)}
                    placeholder={numeroRecepcion || 'REC-2026-XXXX'}
                    className="w-full px-2 py-1 text-xs rounded border border-violet-400 dark:border-[#6b21a8] bg-white dark:bg-[#150d22] text-violet-800 dark:text-[#dab9ff] font-mono font-bold focus:border-violet-600 dark:focus:border-[#eedbff] outline-none"
                  />
                  <span className="text-[9px] text-slate-500 dark:text-[#cdc3d4] block mt-0.5 truncate">
                    Modificable · Aplica a renglones (editable por fila)
                  </span>
                </div>
              </div>

              {/* Fila 2 Cabecera: Tipo de Contenedor, Nro Contenedor/OC, Fecha/Hora de Ingreso y Empresa de Transporte */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-0.5">
                {/* Tipo de Contenedor (con opción de agregar) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block">
                      Tipo de Contenedor / Chasis
                    </label>
                    <button
                      type="button"
                      onClick={() => setNuevoTipoModal(true)}
                      className="text-[10px] text-violet-600 dark:text-[#dab9ff] hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                  <select
                    value={tipoContenedor}
                    onChange={(e) => {
                      if (e.target.value === '__ADD_NEW__') {
                        setNuevoTipoModal(true);
                      } else {
                        setTipoContenedor(e.target.value);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none cursor-pointer"
                  >
                    {tiposContenedor.map((tc) => (
                      <option key={tc} value={tc} className="bg-white dark:bg-[#1c1b1b] text-slate-900 dark:text-[#e5e2e1]">
                        {tc}
                      </option>
                    ))}
                    <option value="__ADD_NEW__" className="text-violet-700 dark:text-[#dab9ff] font-bold bg-violet-50 dark:bg-[#26133b]">
                      ✨ + Agregar otro tipo de contenedor...
                    </option>
                  </select>
                </div>

                {/* Contenedor / Factura / OC */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Nro. Contenedor / Factura / OC <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nroContenedorOc}
                    onChange={(e) => setNroContenedorOc(e.target.value)}
                    placeholder="MSKU-948201-4 / OC-9021"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>

                {/* Fecha y Hora del Ingreso (editable) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block">
                      Fecha y Hora de Arribo <span className="text-rose-500 dark:text-[#ffb4ab]">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setFechaHoraArribo(getLocalISOString())}
                      className="text-[10px] text-violet-600 dark:text-[#dab9ff] hover:underline flex items-center gap-0.5"
                    >
                      <Clock className="w-2.5 h-2.5" />
                      <span>Ahora</span>
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    required
                    value={fechaHoraArribo}
                    onChange={(e) => setFechaHoraArribo(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>

                {/* Empresa de Transporte */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Empresa de Transporte
                  </label>
                  <input
                    type="text"
                    value={transporteEmpresa}
                    onChange={(e) => setTransporteEmpresa(e.target.value)}
                    placeholder="Logística Sur Andina"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>
              </div>

              {/* Fila 3 Cabecera: Patente, Chofer y Observaciones */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Patente / Placa Camión
                  </label>
                  <input
                    type="text"
                    value={patenteCamion}
                    onChange={(e) => setPatenteCamion(e.target.value.toUpperCase())}
                    placeholder="AF-204-ZK"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono uppercase focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Chofer / Documento
                  </label>
                  <input
                    type="text"
                    value={choferNombre}
                    onChange={(e) => setChoferNombre(e.target.value)}
                    placeholder="Juan Pérez (DNI 32.401.890)"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                    Observaciones Generales
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Descarga por muelle 3, precinto intacto..."
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-medium focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Bloque 2: Renglones de Carga Declarada (SKUs) - Compactos y más juntos */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#333333]">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                    <span>2. Renglones de Mercadería Declarada</span>
                    <Badge variant="info" size="sm">
                      {renglones.length} renglones
                    </Badge>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                    Lote unificado del ingreso: <strong className="font-mono text-violet-700 dark:text-[#dab9ff]">{loteOperacion || numeroRecepcion}</strong>
                  </p>
                </div>
              </div>

              {loadingArticulos ? (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-[#cdc3d4]">
                  Cargando catálogo de artículos del cliente...
                </div>
              ) : articulosCliente.length === 0 ? (
                <div className="p-3.5 rounded border border-dashed border-slate-300 dark:border-[#333333] text-center text-xs text-slate-500 dark:text-[#cdc3d4] space-y-2">
                  <p>No hay artículos registrados para este cliente todavía.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetRenglonId(null);
                      setModalArticuloOpen(true);
                    }}
                    className="px-3 py-1 text-xs font-semibold rounded bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] hover:bg-violet-700 dark:hover:bg-[#eedbff] transition-colors inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear primer artículo</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Encabezado compacto de tabla para desktop */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-semibold text-slate-600 dark:text-[#cdc3d4] uppercase tracking-wider bg-slate-100 dark:bg-[#171616] rounded border border-slate-200 dark:border-[#2a2a2a]">
                    <div className="col-span-3">Buscador de Artículo</div>
                    <div className="col-span-5">Artículo (Descripción & Ficha)</div>
                    <div className="col-span-2 text-center">Cant. a Ingresar</div>
                    <div className="col-span-1 text-right">Subtotal</div>
                    <div className="col-span-1 text-center">Acción</div>
                  </div>

                  {/* Renglones compactos */}
                  {renglones.map((renglon, index) => {
                    const artSel = articulosCliente.find((a) => a.id === renglon.articulo_id);
                    const cant = Number(renglon.cantidad_esperada) || 0;
                    const volSubtotal = cant * Number(artSel?.volumen_unitario_m3 || 0);
                    const pesoSubtotal = cant * Number(artSel?.peso_unitario_kg || 0);

                    // Detectar si el artículo de este renglón ya fue cargado en otro renglón
                    const otherRenglonIndex = renglon.articulo_id
                      ? renglones.findIndex((r, idx) => idx !== index && r.articulo_id === renglon.articulo_id)
                      : -1;
                    const yaExisteEnRenglon = otherRenglonIndex !== -1 ? otherRenglonIndex + 1 : null;

                    // Mapeo de artículos cargados en otros renglones para avisar en el buscador
                    const otherLoadedRenglones: Record<string, number> = {};
                    renglones.forEach((r, idx) => {
                      if (idx !== index && r.articulo_id && !otherLoadedRenglones[r.articulo_id]) {
                        otherLoadedRenglones[r.articulo_id] = idx + 1;
                      }
                    });

                    return (
                      <div
                        key={renglon.id}
                        className={`p-1.5 sm:px-3 sm:py-2 rounded border grid grid-cols-1 sm:grid-cols-12 gap-2 items-center transition-colors ${
                          yaExisteEnRenglon
                            ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/40 dark:bg-amber-950/20'
                            : 'border-slate-200 dark:border-[#333333] bg-slate-50/80 dark:bg-[#201f1f] hover:border-slate-300 dark:hover:border-[#4b4452]'
                        }`}
                      >
                        {/* 1. Buscador de Artículos o Agregar Nuevo */}
                        <div className="sm:col-span-3">
                          <ArticuloSearchPicker
                            articulos={articulosCliente}
                            selectedArticuloId={renglon.articulo_id}
                            onSelect={(artId) => actualizarRenglon(renglon.id, 'articulo_id', artId)}
                            onAddNew={() => {
                              setTargetRenglonId(renglon.id);
                              setModalArticuloOpen(true);
                            }}
                            otherLoadedRenglones={otherLoadedRenglones}
                          />
                        </div>

                        {/* 2. Columna Principal: Ficha / Detalle del Artículo */}
                        <div className="sm:col-span-5 min-w-0">
                          {artSel ? (
                            <div
                              className={`p-1 px-2.5 rounded bg-white dark:bg-[#131313] border flex flex-col justify-center shadow-sm cursor-help ${
                                yaExisteEnRenglon
                                  ? 'border-amber-300 dark:border-amber-700/80 ring-1 ring-amber-300/40 dark:ring-amber-500/20'
                                  : 'border-slate-200 dark:border-[#333333]'
                              }`}
                              title={`[${artSel.nombre}] ${(artSel as any).descripcion_full || getDescripcionFull(artSel) || artSel.descripcion || artSel.nombre}${artSel.unidad_medida ? ` · ${artSel.unidad_medida}` : ''}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-violet-100 dark:bg-[#201330] text-violet-700 dark:text-[#dab9ff] border border-violet-200 dark:border-[#6b21a8]/60 shrink-0">
                                  {artSel.nombre}
                                </span>
                                <span
                                  className="font-semibold text-xs text-slate-900 dark:text-[#e5e2e1] truncate"
                                  title={`[${artSel.nombre}] ${(artSel as any).descripcion_full || getDescripcionFull(artSel) || artSel.descripcion || artSel.nombre}`}
                                >
                                  {(artSel as any).descripcion_full || getDescripcionFull(artSel) || artSel.descripcion || artSel.nombre}
                                </span>
                                {(artSel as any).color && (
                                  <span className="px-1 rounded bg-violet-50 dark:bg-[#26133b] text-violet-700 dark:text-[#dab9ff] border border-violet-200 dark:border-[#6b21a8]/40 text-[9px] shrink-0">
                                    {(artSel as any).color}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#978d9d] font-mono mt-0.5 flex-wrap">
                                <span className="text-slate-700 dark:text-[#cdc3d4]">
                                  {artSel.unidades_por_bulto || 1} {artSel.unidad_medida || 'u'} / {(artSel as any).tipo_empaque || 'bulto'}
                                </span>
                                <span>·</span>
                                <span>{artSel.volumen_unitario_m3 ? `${artSel.volumen_unitario_m3} m³` : '0 m³'}</span>
                                <span>·</span>
                                <span>{artSel.peso_unitario_kg ? `${artSel.peso_unitario_kg} kg` : '0 kg'}</span>
                                {(artSel as any).marca_bulto && (
                                  <>
                                    <span>·</span>
                                    <span className="text-amber-600 dark:text-[#ffd27a]">Marca: {(artSel as any).marca_bulto}</span>
                                  </>
                                )}
                              </div>
                              {/* Advertencia si este ítem ya se cargó en otro renglón */}
                              {yaExisteEnRenglon && (
                                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700/60 rounded px-2 py-0.5 animate-fadeIn">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span>⚠️ Advertencia: Este artículo ya fue cargado en el Renglón #{yaExisteEnRenglon}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-2 rounded border border-dashed border-slate-300 dark:border-[#44424a] text-center text-xs text-slate-500 dark:text-[#978d9d] italic flex items-center justify-center gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 dark:text-[#ffd27a]" />
                              <span>Busque y elija un artículo en la columna 1</span>
                            </div>
                          )}
                        </div>

                        {/* 3. Cantidad a Ingresar (Inicializada en 0) */}
                        <div className="sm:col-span-2">
                          <div className="flex items-center justify-between sm:justify-center">
                            <span className="sm:hidden text-[10px] text-slate-500 dark:text-[#cdc3d4]">Cant. Ingresar:</span>
                            <input
                              type="number"
                              min="0"
                              required
                              value={renglon.cantidad_esperada}
                              onChange={(e) =>
                                actualizarRenglon(renglon.id, 'cantidad_esperada', Math.max(0, Number(e.target.value)))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  agregarRenglon();
                                }
                              }}
                              className="w-full sm:w-28 px-2 py-1.5 text-xs text-center rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono font-bold focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* 4. Cubicaje Subtotal */}
                        <div className="sm:col-span-1 text-right">
                          <div className="text-[10px] font-mono text-violet-700 dark:text-[#dab9ff] font-medium truncate" title="Volumen total renglón">
                            {formatM3(volSubtotal)}
                          </div>
                          <div className="text-[9px] font-mono text-slate-500 dark:text-[#cdc3d4] truncate" title="Peso total renglón">
                            {pesoSubtotal.toFixed(1)} kg
                          </div>
                        </div>

                        {/* 5. Acción Eliminar */}
                        <div className="sm:col-span-1 flex items-center justify-end sm:justify-center">
                          <button
                            type="button"
                            onClick={() => eliminarRenglon(renglon.id)}
                            disabled={renglones.length === 1}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] dark:hover:bg-[#2a0e12] transition-colors disabled:opacity-30"
                            title="Eliminar renglón"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Botón "+ Agregar Renglón" posicionado abajo del item agregado y alineado a la columna de Cantidad */}
                  <div className="pt-2 pb-1 flex flex-col sm:grid sm:grid-cols-12 sm:gap-2 items-center">
                    <div className="hidden sm:block sm:col-span-8" />
                    <div className="w-full sm:col-span-4 flex justify-center">
                      <button
                        type="button"
                        onClick={agregarRenglon}
                        disabled={!clienteId}
                        className="w-full sm:w-38 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-all shadow-sm active:scale-95 disabled:opacity-40"
                        title="Agregar nuevo item (o presione Enter en Cantidad)"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span> Agregar Renglón Items</span>
                      </button>
                    </div>
                    <div className="hidden sm:block sm:col-span-2" />
                  </div>
                </div>
              )}


              {/* Totalizador de Mercaderías */}
              <div className="p-3 rounded-md bg-slate-100 dark:bg-[#171616] border border-slate-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-[#cdc3d4]">
                  <Box className="w-4 h-4 text-violet-600 dark:text-[#dab9ff]" />
                  <span>
                    Total Bultos:{' '}
                    <strong className="font-mono text-slate-900 dark:text-[#e5e2e1] text-sm">{formatNumber(totales.bultos)}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-slate-600 dark:text-[#cdc3d4]">
                  <Layers className="w-4 h-4 text-sky-600 dark:text-[#75d1ff]" />
                  <span>
                    Volumen Total:{' '}
                    <strong className="font-mono text-violet-700 dark:text-[#dab9ff] text-sm">{formatM3(totales.volumenM3)}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-slate-600 dark:text-[#cdc3d4]">
                  <Scale className="w-4 h-4 text-pink-600 dark:text-[#ffb1c5]" />
                  <span>
                    Peso Estimado:{' '}
                    <strong className="font-mono text-slate-900 dark:text-[#e5e2e1] text-sm">{formatNumber(totales.pesoKg)} kg</strong>
                  </span>
                </div>
              </div>

              {/* Opción Recibir Directo sin contar (Fast Inbound) más chico */}
              <div className="py-2 px-3 rounded bg-violet-50/80 dark:bg-[#201330]/80 border border-violet-200 dark:border-[#6b21a8]/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-violet-600 dark:text-[#dab9ff] shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-1.5">
                      <span>⚡ Fast Inbound (Ingreso directo a stock sin confronta)</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-600 text-white dark:bg-[#460283] dark:text-[#dab9ff] font-mono">
                        Directo
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-[#cdc3d4]">
                      Ingresa automáticamente al stock en estado Finalizada sin requerir paso de control en muelle.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer ml-3 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={recibirDirecto}
                    onChange={(e) => setRecibirDirecto(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-slate-300 dark:bg-[#333333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-violet-600 dark:peer-checked:bg-[#a855f7]"></div>
                </label>
              </div>
            </div>

            {/* Bloque 3: Despacho de Aduana y Tabla de Documentación Adjunta */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#333333]">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                <span>3. Despacho Aduanero y Documentación Adjunta</span>
              </h4>

              {/* Campo Despacho de Aduana */}
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] block mb-1">
                  Despacho de Aduana (Nro. SIM / Declaración de Ingreso)
                </label>
                <div className="relative">
                  <FileText className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-[#cdc3d4]" />
                  <input
                    type="text"
                    value={despachoAduana}
                    onChange={(e) => setDespachoAduana(e.target.value.toUpperCase())}
                    placeholder="Ej: 26001IC04001234K / Origen Fecha.de.Oficializacion"
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] font-mono focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                  />
                </div>
              </div>

              {/* Tabla Relativa para Agregar Imágenes de la Documentación Adjunta */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-[#cdc3d4] flex items-center gap-1.5">
                    <Paperclip className="w-3 h-3 text-violet-600 dark:text-[#dab9ff]" />
                    <span>Imágenes de Documentación Adjunta (Remito, Manifiesto, Precinto, Factura)</span>
                    {documentosAdjuntos.length > 0 && (
                      <Badge variant="info" size="sm">
                        {documentosAdjuntos.length} {documentosAdjuntos.length === 1 ? 'archivo' : 'archivos'}
                      </Badge>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDoc}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-violet-200 dark:border-[#dab9ff]/40 bg-violet-50 hover:bg-violet-100 dark:bg-[#26133b] dark:hover:bg-[#3b1c5c] text-violet-700 dark:text-[#dab9ff] transition-colors"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{uploadingDoc ? 'Procesando...' : '+ Adjuntar Imágenes'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFilesAdded}
                    className="hidden"
                  />
                </div>

                {documentosAdjuntos.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3.5 rounded border border-dashed border-slate-300 dark:border-[#333333] hover:border-violet-400 dark:hover:border-[#dab9ff]/50 bg-slate-50 dark:bg-[#161515] text-center cursor-pointer transition-colors group"
                  >
                    <ImageIcon className="w-6 h-6 mx-auto mb-1 text-slate-400 dark:text-[#cdc3d4] group-hover:text-violet-600 dark:group-hover:text-[#dab9ff] transition-colors" />
                    <p className="text-xs text-slate-800 dark:text-[#e5e2e1] font-medium">
                      Haga clic aquí para adjuntar fotos o imágenes de la documentación
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-[#cdc3d4]">
                      Compatible con fotos de precinto, remito firmado, BL o despacho (JPG, PNG, WEBP, PDF)
                    </p>
                  </div>
                ) : (
                  <div className="rounded border border-slate-200 dark:border-[#333333] overflow-hidden bg-white dark:bg-[#181717]">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-[#201f1f] text-[10px] uppercase font-semibold text-slate-600 dark:text-[#cdc3d4] border-b border-slate-200 dark:border-[#333333]">
                          <tr>
                            <th className="py-1.5 px-3 w-16">Vista</th>
                            <th className="py-1.5 px-3">Archivo</th>
                            <th className="py-1.5 px-3">Tipo de Documento</th>
                            <th className="py-1.5 px-3 w-24">Tamaño</th>
                            <th className="py-1.5 px-3 w-20 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2a]">
                          {documentosAdjuntos.map((doc) => (
                            <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-[#201f1f]/60 transition-colors">
                              <td className="py-1.5 px-3">
                                {doc.url.startsWith('data:image') || doc.url.includes('drive.google.com') || doc.url.match(/\.(jpeg|jpg|png|webp|gif)/i) ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewModalImg({ url: doc.url, nombre: doc.nombre })}
                                    className="relative group block"
                                    title="Ver imagen completa"
                                  >
                                    <img
                                      src={normalizarUrlGoogleDrive(doc.url)}
                                      alt={doc.nombre}
                                      className="w-8 h-8 object-cover rounded border border-slate-200 dark:border-[#44424a] group-hover:border-violet-500 dark:group-hover:border-[#dab9ff] transition-colors"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded transition-opacity">
                                      <Eye className="w-3 h-3 text-white" />
                                    </div>
                                  </button>
                                ) : (
                                  <div className="w-8 h-8 rounded bg-slate-100 dark:bg-[#252424] border border-slate-200 dark:border-[#44424a] flex items-center justify-center text-slate-500 dark:text-[#cdc3d4]">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                )}
                              </td>
                              <td className="py-1.5 px-3 font-medium text-slate-800 dark:text-[#e5e2e1]">
                                <div className="truncate max-w-[200px]" title={doc.nombre}>
                                  {doc.nombre}
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-[#cdc3d4]">{doc.fecha}</div>
                              </td>
                              <td className="py-1.5 px-3">
                                <select
                                  value={doc.tipo}
                                  onChange={(e) =>
                                    setDocumentosAdjuntos((prev) =>
                                      prev.map((d) => (d.id === doc.id ? { ...d, tipo: e.target.value } : d))
                                    )
                                  }
                                  className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                                >
                                  <option value="Remito / Guía">Remito / Guía</option>
                                  <option value="Despacho Aduana">Despacho Aduana</option>
                                  <option value="Foto Precinto / Contenedor">Foto Precinto / Contenedor</option>
                                  <option value="Foto Mercadería / Pallet">Foto Mercadería / Pallet</option>
                                  <option value="Factura Comercial">Factura Comercial</option>
                                  <option value="Packing List">Packing List</option>
                                  <option value="Carta de Porte / BL">Carta de Porte / BL</option>
                                  <option value="Otro">Otro</option>
                                </select>
                              </td>
                              <td className="py-1.5 px-3 font-mono text-[11px] text-slate-500 dark:text-[#cdc3d4]">
                                {doc.size}
                              </td>
                              <td className="py-1.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewModalImg({ url: doc.url, nombre: doc.nombre })}
                                    className="p-1 rounded text-slate-400 hover:text-violet-700 hover:bg-slate-100 dark:text-[#cdc3d4] dark:hover:text-[#dab9ff] dark:hover:bg-[#2a2a2a] transition-colors"
                                    title="Ver archivo"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDocumentosAdjuntos((prev) => prev.filter((d) => d.id !== doc.id))
                                    }
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-[#cdc3d4] dark:hover:text-[#ffb4ab] dark:hover:bg-[#2a0e12] transition-colors"
                                    title="Eliminar adjunto"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Modal Footer - Con validador de feedback posicionado junto a los botones de acción */}
          <div className="p-3.5 bg-slate-50 dark:bg-[#201f1f] border-t border-slate-200 dark:border-[#333333] flex flex-col gap-2.5">
            {/* Validador de éxito o error al pie de la ventana */}
            {feedback && (
              <div
                className={`p-2.5 rounded text-xs font-medium flex items-center justify-between gap-2.5 animate-fadeIn shadow-sm ${feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-[#0f241a] dark:text-[#75d1ff] dark:border-[#1d4d38]'
                  : 'bg-rose-50 text-rose-800 border border-rose-300 dark:bg-[#2a0e12] dark:text-[#ffb4ab] dark:border-[#690005]'
                  }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#75d1ff]" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-[#ffb4ab]" />
                  )}
                  <span className="break-words">{feedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
                  title="Cerrar mensaje"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-[#cdc3d4] flex items-center gap-2">
                <span>Lote: <strong className="font-mono text-violet-700 dark:text-[#dab9ff]">{loteOperacion || numeroRecepcion}</strong></span>
                <span>•</span>
                <span>CNTR: <strong className="text-slate-900 dark:text-[#e5e2e1]">{tipoContenedor}</strong></span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold rounded border border-slate-300 dark:border-[#333333] bg-white hover:bg-slate-100 dark:bg-[#1c1b1b] dark:hover:bg-[#2a2a2a] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1] transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || renglones.length === 0}
                  className="px-5 py-1.5 text-xs font-semibold rounded bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{recibirDirecto ? 'Ingresando a Stock...' : 'Programando Orden...'}</span>
                    </>
                  ) : recibirDirecto ? (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Crear y Recibir Directo a Stock</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Crear Orden Programada</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal para Agregar Nuevo Tipo de Contenedor */}
        {nuevoTipoModal && (
          <ModalPortal>
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-lg max-w-sm w-full p-4 space-y-3 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-[#e5e2e1] uppercase tracking-wider">
                    Nuevo Tipo de Contenedor
                  </h4>
                  <button
                    onClick={() => setNuevoTipoModal(false)}
                    className="text-slate-400 hover:text-slate-600 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="text-[11px] text-slate-600 dark:text-[#cdc3d4] block mb-1">
                    Descripción del tipo (ej: 40' High Cube, 20' Open Top, Reefer 40')
                  </label>
                  <input
                    type="text"
                    value={nuevoTipoTexto}
                    onChange={(e) => setNuevoTipoTexto(e.target.value)}
                    placeholder="Ej: 40' High Cube Carga Paletizada"
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-[#333333] bg-white dark:bg-[#131313] text-slate-900 dark:text-[#e5e2e1] focus:border-violet-500 dark:focus:border-[#dab9ff] outline-none"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleGuardarNuevoTipoCntr();
                      }
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setNuevoTipoModal(false)}
                    className="px-3 py-1 text-xs rounded border border-slate-300 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:bg-slate-100 dark:hover:bg-[#2a2a2a]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleGuardarNuevoTipoCntr}
                    disabled={!nuevoTipoTexto.trim()}
                    className="px-3 py-1 text-xs rounded font-semibold bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283] hover:bg-violet-700 dark:hover:bg-[#eedbff] disabled:opacity-40"
                  >
                    Guardar Tipo
                  </button>
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Modal de Vista Previa de Imagen Adjunta */}
        {previewModalImg && (
          <ModalPortal>
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 dark:bg-black/90 backdrop-blur-md animate-fadeIn"
              onClick={() => setPreviewModalImg(null)}
            >
              <div
                className="relative max-w-3xl max-h-[85vh] bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-lg overflow-hidden flex flex-col p-2 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-2 border-b border-slate-200 dark:border-[#333333] text-xs font-semibold text-slate-900 dark:text-[#e5e2e1]">
                  <span className="truncate max-w-[80%]">{previewModalImg.nombre}</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={previewModalImg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-violet-600 dark:text-[#dab9ff]"
                      title="Abrir en pestaña nueva"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setPreviewModalImg(null)}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2a2a2a] text-slate-400 dark:text-[#cdc3d4]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-2 flex items-center justify-center overflow-auto max-h-[75vh]">
                  {previewModalImg.url.startsWith('data:image') ||
                    previewModalImg.url.match(/\.(jpeg|jpg|png|webp|gif)/i) ? (
                    <img
                      src={previewModalImg.url}
                      alt={previewModalImg.nombre}
                      className="max-h-[70vh] w-auto object-contain rounded"
                    />
                  ) : (
                    <iframe
                      src={previewModalImg.url}
                      title={previewModalImg.nombre}
                      className="w-[80vw] max-w-2xl h-[70vh] rounded border-0"
                    />
                  )}
                </div>
              </div>
            </div>
          </ModalPortal>
        )}

        {/* Submodal para Crear Cliente Rápido */}
        <ClienteModal
          isOpen={modalClienteOpen}
          onClose={() => setModalClienteOpen(false)}
          cliente={null}
          onSuccess={() => { }}
          onCreated={(nuevoCli) => {
            setClientesList((prev) => [...prev, nuevoCli]);
            setClienteId(nuevoCli.id);
          }}
        />

        {/* Submodal para Crear Artículo Rápido */}
        <ArticuloModal
          isOpen={modalArticuloOpen}
          onClose={() => setModalArticuloOpen(false)}
          articulo={null}
          clientes={clientesList}
          defaultClienteId={clienteId}
          onSuccess={() => { }}
          onCreated={(nuevoArt) => {
            articulosApi.listarPorCliente(clienteId).then((data) => setArticulosCliente(data || []));
            if (targetRenglonId) {
              actualizarRenglon(targetRenglonId, 'articulo_id', nuevoArt.id);
            }
          }}
        />

        {/* Submodal para Registrar Lote Rápido en Maestro */}
        <LoteModal
          isOpen={modalLoteOpen}
          onClose={() => setModalLoteOpen(false)}
          lote={null}
          clientes={clientesList}
          defaultClienteId={clienteId}
          onCreated={(nuevoLote) => {
            setLoteOperacion(nuevoLote.numero_lote);
          }}
        />
      </div>
    </ModalPortal>
  );
};
