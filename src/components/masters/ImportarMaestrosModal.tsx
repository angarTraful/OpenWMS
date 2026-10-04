import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Download,
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import { clientesApi, Cliente } from '@/api/clientesApi';
import { articulosApi } from '@/api/articulosApi';
import { lotesApi } from '@/api/lotesApi';

export type TipoImportacionMaestro = 'clientes' | 'articulos' | 'destinatarios' | 'lotes';

interface ImportarMaestrosModalProps {
  isOpen: boolean;
  onClose: () => void;
  tipo?: TipoImportacionMaestro;
  tipoEntidad?: TipoImportacionMaestro;
  clientes?: Cliente[];
  onSuccess: () => void;
}

export const ImportarMaestrosModal: React.FC<ImportarMaestrosModalProps> = ({
  isOpen,
  onClose,
  tipo,
  tipoEntidad,
  clientes: clientesProp = [],
  onSuccess,
}) => {
  const tipoFinal = tipo || tipoEntidad || 'clientes';
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dbClientes, setDbClientes] = useState<Cliente[]>(clientesProp);
  const [dbCategorias, setDbCategorias] = useState<any[]>([]);

  // Asegurar que tengamos la lista actualizada de clientes y categorías para vincular por código/nombre
  useEffect(() => {
    if (isOpen) {
      if (clientesProp.length > 0) {
        setDbClientes(clientesProp);
      } else {
        clientesApi.listarClientes(true).then((list) => {
          setDbClientes(list || []);
        }).catch((err) => {
          console.warn('No se pudieron obtener clientes para vincular:', err);
        });
      }

      articulosApi.listarCategorias(false).then((cats) => {
        setDbCategorias(cats || []);
      }).catch((err) => {
        console.warn('No se pudieron obtener categorías para vincular:', err);
      });
    }
  }, [isOpen, clientesProp]);

  if (!isOpen) return null;

  const titulosMap: Record<TipoImportacionMaestro, { titulo: string; desc: string; templateName: string }> = {
    clientes: {
      titulo: 'Importar Clientes 3PL (CSV)',
      desc: 'Subida masiva de cuentas corrientes, CUITs y datos de contacto de clientes depositantes.',
      templateName: 'plantilla_clientes_3pl.csv',
    },
    articulos: {
      titulo: 'Importar Catálogo de Artículos & SKUs (CSV)',
      desc: 'Subida masiva de SKUs, marcas, unidades por bulto, pesos GW, medida M³ y factor de estiba.',
      templateName: 'plantilla_articulos_skus.csv',
    },
    destinatarios: {
      titulo: 'Importar Destinatarios / Sucursales (CSV)',
      desc: 'Subida masiva de puntos de entrega, direcciones y localidades vinculadas a clientes.',
      templateName: 'plantilla_destinatarios_sucursales.csv',
    },
    lotes: {
      titulo: 'Importar Lotes & Vencimientos (CSV)',
      desc: 'Subida masiva de lotes de fabricación, vencimientos y estado de cuarentena por cliente.',
      templateName: 'plantilla_lotes_vencimientos.csv',
    },
  };

  const currentInfo = titulosMap[tipoFinal] || titulosMap.clientes;

  // Descargar plantilla CSV de ejemplo ajustada a la base de datos real
  const handleDescargarPlantilla = () => {
    let headers = '';
    let exampleRow = '';

    if (tipoFinal === 'clientes') {
      headers = 'codigo,razon_social,identificacion_fiscal,email_contacto,telefono,direccion,unidad_negocio';
      exampleRow = '100,LBH HOME & HOTEL S.A.,30-71149359-6,info@lbh.com,5491160000000,Tucuman 2025 CIUDAD AUTONOMA BUENOS AIRES,Art. Blanqueria';
    } else if (tipoFinal === 'articulos') {
      headers = 'id_producto,codigo_cliente,sku,nombre,descripcion,categoria,subcategoria,marca_bulto,ean13,tipo_empaque,unidad_medida,unidades_por_bulto,cantidad_por_pallet,peso_gw,medida_m3,factor_estiba,item_so,color,rotacion_abc';
      exampleRow = 'PROD-1001,100,ART-1001,Acolchado Gris 2 Plazas,Acolchado microfibra termico,Textil,Dormitorio,POSTO BLANCO,7791234567890,caja,mts,50.0,40,12.5,0.045,0,SO-99281,Gris,B';
    } else if (tipoFinal === 'destinatarios') {
      headers = 'codigo_cliente,codigo_sucursal,razon_social,direccion_entrega,ciudad,telefono,contacto_recepcion';
      exampleRow = '100,SUC-01,Sucursal Central Palermo,Av. Santa Fe 3200,Buenos Aires,+541148889900,Juan Perez';
    } else if (tipoFinal === 'lotes') {
      headers = 'codigo_cliente,numero_lote,fecha_fabricacion,fecha_vencimiento,motivo_bloqueo';
      exampleRow = '100,LOT-2026-X89,2026-01-15,2028-01-15,Lote textil hilado importado primera calidad';
    }

    const blob = new Blob([`${headers}\n${exampleRow}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', currentInfo.templateName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Procesar archivo CSV (Soporta archivos CON encabezados y SIN encabezados)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileSelected = e.target.files?.[0];
    if (!fileSelected) return;

    setFile(fileSelected);
    setFeedback(null);
    setLoadingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);

        if (lines.length === 0) {
          setFeedback({ type: 'error', text: 'El archivo CSV está vacío.' });
          setParsedRows([]);
          setLoadingFile(false);
          return;
        }

        // Detectar delimitador (punto y coma ';', coma ',', o tabulación '\t')
        const firstLine = lines[0];
        const countSemicolons = (firstLine.match(/;/g) || []).length;
        const countCommas = (firstLine.match(/,/g) || []).length;
        const countTabs = (firstLine.match(/\t/g) || []).length;

        let delimiter = ',';
        if (countSemicolons >= countCommas && countSemicolons >= countTabs && countSemicolons > 0) {
          delimiter = ';';
        } else if (countTabs > countCommas && countTabs > 0) {
          delimiter = '\t';
        }

        const splitLine = (line: string) =>
          line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));

        const firstLineCols = splitLine(lines[0]);

        // Detectar si la primera fila es encabezado o fila de datos
        const firstCol = (firstLineCols[0] || '').toLowerCase();
        const hasHeader =
          !/^\d+$/.test(firstCol) &&
          (firstCol.includes('codigo') ||
            firstCol.includes('sku') ||
            firstCol.includes('razon') ||
            firstCol.includes('nombre') ||
            firstCol.includes('id_producto') ||
            firstCol.includes('id') ||
            firstCol.includes('cuit'));

        let headers: string[] = [];
        let startIndex = 0;

        if (hasHeader) {
          headers = firstLineCols.map((h) => h.toLowerCase());
          startIndex = 1;
        }

        const dataRows: any[] = [];

        for (let i = startIndex; i < lines.length; i++) {
          const cols = splitLine(lines[i]);
          if (cols.length >= 1 && cols.some((c) => c !== '')) {
            const rowObj: Record<string, any> = { _rawCols: cols };

            if (hasHeader) {
              headers.forEach((h, idx) => {
                rowObj[h] = cols[idx] || '';
              });
            } else {
              // Si no tiene encabezados, asignar nombres posicionales
              cols.forEach((colVal, idx) => {
                rowObj[`col${idx}`] = colVal;
              });
            }
            dataRows.push(rowObj);
          }
        }

        if (dataRows.length === 0) {
          setFeedback({ type: 'error', text: 'No se encontraron filas con datos válidos en el archivo CSV.' });
        }

        setParsedRows(dataRows);
      } catch (err: any) {
        console.error('Error parseando CSV:', err);
        setFeedback({ type: 'error', text: 'Error al interpretar el formato del archivo CSV.' });
      } finally {
        setLoadingFile(false);
      }
    };

    reader.readAsText(fileSelected);
  };

  // Inserción masiva en Supabase mapeando columnas exacta y posicionalmente
  const handleImportar = async () => {
    if (parsedRows.length === 0) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      let creadosCount = 0;

      if (tipoFinal === 'clientes') {
        for (const row of parsedRows) {
          const raw = row._rawCols || [];
          
          const codigoVal = (row.codigo || row.codigo_cliente || raw[0] || `CLI-${Math.floor(1000 + Math.random() * 9000)}`).toString().trim();
          const razonSocialVal = (row.razon_social || row.nombre || raw[1] || 'Cliente Importado').toString().trim();
          const cuitVal = (row.identificacion_fiscal || row.cuit || row.rut || raw[2] || '').toString().trim() || undefined;
          const emailVal = (row.email_contacto || row.email || row.mail || raw[3] || '').toString().trim() || undefined;
          const telVal = (row.telefono || row.tel || raw[4] || '').toString().trim() || undefined;
          
          // Dirección & Ciudad
          let dirVal = (row.direccion || raw[5] || '').toString().trim();
          const ciudadVal = (row.ciudad || raw[6] || '').toString().trim();
          if (ciudadVal && !dirVal.toLowerCase().includes(ciudadVal.toLowerCase())) {
            dirVal = dirVal ? `${dirVal}, ${ciudadVal}` : ciudadVal;
          }

          const rubroVal = (row.unidad_negocio || row.rubro || raw[7] || (raw.length > 6 ? raw[6] : 'General')).toString().trim() || 'General';

          await clientesApi.crearCliente({
            codigo: codigoVal,
            razon_social: razonSocialVal,
            identificacion_fiscal: cuitVal,
            email_contacto: emailVal,
            telefono: telVal,
            direccion: dirVal || undefined,
            unidad_negocio: rubroVal,
            activo: true,
          });
          creadosCount++;
        }
      } else if (tipoFinal === 'articulos') {
        let rowIdx = 0;
        const erroresRows: string[] = [];

        for (const row of parsedRows) {
          rowIdx++;
          const raw = row._rawCols || [];

          // Resolver cliente_id buscando por código depositante o usando el primero disponible
          const codClienteTarget = (row.codigo_cliente || row.cliente || raw[0] || '').toString().trim().toLowerCase();
          const cliFound = dbClientes.find((c) => c.codigo.toLowerCase() === codClienteTarget || c.razon_social.toLowerCase().includes(codClienteTarget));
          const targetClienteId = cliFound ? cliFound.id : (dbClientes[0]?.id || '');

          if (!targetClienteId) {
            throw new Error('No hay clientes registrados en el sistema para asociar los artículos.');
          }

          const parseNum = (val: any, defaultVal = 0) => {
            if (val === undefined || val === null || val === '') return defaultVal;
            const str = val.toString().replace('%', '').replace(',', '.').trim();
            const num = Number(str);
            return isNaN(num) ? defaultVal : num;
          };

          const idProdVal = (row.id_producto || row.id_art || row.id_prod || raw[0] || '').toString().trim() || undefined;
          const rawSku = (row.sku || row.codigo || raw[1] || '').toString().trim();
          const skuBase = rawSku || idProdVal || `ART-${rowIdx}`;
          const nombreVal = (row.nombre || row.nombre_producto || row.descripcion || raw[2] || 'Artículo Sin Nombre').toString().trim();
          const descVal = (row.descripcion || '').toString().trim() || undefined;
          const colorVal = (row.color || '').toString().trim() || undefined;
          const marcaVal = (row.marca_bulto || row.marca || '').toString().trim() || undefined;
          const ean13Val = (row.ean13 || row.codigo_barras || row.ean || raw[8] || '').toString().trim() || undefined;
          const empaqueVal = (row.tipo_empaque || row.tipoempaque || '').toString().trim() || undefined;
          const unxBulto = parseNum(row.unidades_por_bulto || row.unidadesxbulto || raw[3], 1);
          const umVal = (row.unidad_medida || row.unidadmedida || row.um || raw[4] || 'bulto').toString().trim();
          const cantXPallet = parseNum(row.cantidad_por_pallet || row.cantidadxpallet, 0) || undefined;
          const pesoGwVal = parseNum(row.peso_gw || row.pesogw || row.peso_unitario_kg || raw[5], 0);
          const volM3Val = parseNum(row.medida_m3 || row.medidam3 || row.volumen_unitario_m3 || raw[6], 0);
          const factorEstibaVal = parseNum(row.factor_estiba || row.factorestiba, 0);
          const itemSoVal = (row.item_so || row.itemso || '').toString().trim() || undefined;
          const imgUrlVal = (row.imagen_url || row.imagen || '').toString().trim() || undefined;

          // Resolver Categoria y Subcategoria (Auto-creando dinámicamente si no existen)
          let catIdFound: string | undefined = undefined;
          let subcatIdFound: string | undefined = undefined;

          const catInputRaw = (row.categoria || row.categoria_codigo || '').toString().trim();
          if (catInputRaw) {
            const catLower = catInputRaw.toLowerCase();
            let catMatched = dbCategorias.find(
              (c) => c.codigo?.toLowerCase() === catLower || c.nombre?.toLowerCase().includes(catLower)
            );

            if (!catMatched) {
              try {
                const newCatCode = catInputRaw.substring(0, 10).toUpperCase().replace(/\s+/g, '-');
                const createdCat = await articulosApi.crearCategoria({
                  codigo: newCatCode,
                  nombre: catInputRaw,
                  activo: true,
                });
                catMatched = { ...createdCat, subcategorias: [] };
                dbCategorias.push(catMatched);
              } catch (catErr) {
                console.warn(`No se pudo auto-crear categoría '${catInputRaw}':`, catErr);
              }
            }

            if (catMatched) {
              catIdFound = catMatched.id;
              const subcatInputRaw = (row.subcategoria || row.subcategoria_codigo || '').toString().trim();
              if (subcatInputRaw) {
                const subLower = subcatInputRaw.toLowerCase();
                let subMatched = (catMatched.subcategorias || []).find(
                  (s: any) => s.codigo?.toLowerCase() === subLower || s.nombre?.toLowerCase().includes(subLower)
                );

                if (!subMatched) {
                  try {
                    const newSubCode = subcatInputRaw.substring(0, 10).toUpperCase().replace(/\s+/g, '-');
                    const createdSub = await articulosApi.crearSubcategoria({
                      categoria_id: catMatched.id,
                      codigo: newSubCode,
                      nombre: subcatInputRaw,
                      activo: true,
                    });
                    subMatched = createdSub;
                    if (!catMatched.subcategorias) catMatched.subcategorias = [];
                    catMatched.subcategorias.push(subMatched);
                  } catch (subErr) {
                    console.warn(`No se pudo auto-crear subcategoría '${subcatInputRaw}':`, subErr);
                  }
                }

                if (subMatched) {
                  subcatIdFound = subMatched.id;
                }
              }
            }
          }

          let rotacionVal: 'A' | 'B' | 'C' = 'B';
          const rotCandidate = (row.rotacion_abc || row.rotacion || raw[7] || 'B').toString().toUpperCase();
          if (rotCandidate === 'A' || rotCandidate === 'B' || rotCandidate === 'C') {
            rotacionVal = rotCandidate as 'A' | 'B' | 'C';
          }

          const articlePayload = {
            cliente_id: targetClienteId,
            id_producto: idProdVal,
            sku: skuBase,
            nombre: nombreVal,
            descripcion: descVal,
            color: colorVal,
            marca_bulto: marcaVal,
            ean13: ean13Val,
            categoria_id: catIdFound,
            subcategoria_id: subcatIdFound,
            tipo_empaque: empaqueVal,
            unidad_medida: umVal,
            unidades_por_bulto: unxBulto,
            cantidad_por_pallet: cantXPallet,
            peso_gw: pesoGwVal,
            medida_m3: volM3Val,
            factor_estiba: factorEstibaVal,
            rotacion_abc: rotacionVal,
            item_so: itemSoVal,
            imagen_url: imgUrlVal,
            activo: true,
          };

          try {
            await articulosApi.crearArticulo(articlePayload);
            creadosCount++;
          } catch (rowErr: any) {
            // Si viola clave única por SKU duplicado en el mismo cliente, reintentar con SKU derivado único
            if (rowErr.message?.includes('duplicate key') || rowErr.message?.includes('articulos_cliente_sku_uk')) {
              try {
                const fallbackSku = `${skuBase}-${idProdVal || rowIdx}`;
                await articulosApi.crearArticulo({
                  ...articlePayload,
                  sku: fallbackSku,
                });
                creadosCount++;
              } catch (retryErr: any) {
                console.warn(`Fila ${rowIdx} omitida por duplicado:`, retryErr);
                erroresRows.push(`Fila ${rowIdx} (${nombreVal}): SKU o ID de producto duplicado.`);
              }
            } else {
              console.warn(`Fila ${rowIdx} falló:`, rowErr);
              erroresRows.push(`Fila ${rowIdx} (${nombreVal}): ${rowErr.message}`);
            }
          }
        }

        if (erroresRows.length > 0 && creadosCount === 0) {
          throw new Error(`Error en la importación: ${erroresRows[0]}`);
        }
      } else if (tipoFinal === 'destinatarios') {
        for (const row of parsedRows) {
          const raw = row._rawCols || [];

          const codClienteTarget = (row.codigo_cliente || row.cliente || raw[0] || '').toString().trim().toLowerCase();
          const cliFound = dbClientes.find((c) => c.codigo.toLowerCase() === codClienteTarget || c.razon_social.toLowerCase().includes(codClienteTarget));
          const targetClienteId = cliFound ? cliFound.id : (dbClientes[0]?.id || '');

          if (!targetClienteId) {
            throw new Error('No hay clientes registrados en el sistema para asociar destinatarios.');
          }

          const codSucursal = (row.codigo_sucursal || row.codigo || raw[1] || '').toString().trim() || undefined;
          const razonSoc = (row.razon_social || row.nombre || raw[2] || 'Sucursal Destino').toString().trim();
          const dirEntrega = (row.direccion_entrega || row.direccion || raw[3] || 'Dirección General').toString().trim();
          const ciudadVal = (row.ciudad || raw[4] || '').toString().trim() || undefined;
          const telVal = (row.telefono || raw[5] || '').toString().trim() || undefined;
          const contactoVal = (row.contacto_recepcion || row.contacto || raw[6] || '').toString().trim() || undefined;

          await clientesApi.crearDestinatario({
            cliente_id: targetClienteId,
            codigo_sucursal: codSucursal,
            razon_social: razonSoc,
            direccion_entrega: dirEntrega,
            ciudad: ciudadVal,
            telefono: telVal,
            contacto_recepcion: contactoVal,
            activo: true,
          });
          creadosCount++;
        }
      } else if (tipoFinal === 'lotes') {
        for (const row of parsedRows) {
          const raw = row._rawCols || [];

          const codClienteTarget = (row.codigo_cliente || row.cliente || raw[0] || '').toString().trim().toLowerCase();
          const cliFound = dbClientes.find((c) => c.codigo.toLowerCase() === codClienteTarget || c.razon_social.toLowerCase().includes(codClienteTarget));
          const targetClienteId = cliFound ? cliFound.id : (dbClientes[0]?.id || '');

          const nroLote = (row.numero_lote || row.lote || raw[1] || '').toString().trim();

          if (targetClienteId && nroLote) {
            await lotesApi.crearLote({
              cliente_id: targetClienteId,
              numero_lote: nroLote,
              fecha_fabricacion: (row.fecha_fabricacion || raw[2] || '').toString().trim() || undefined,
              fecha_vencimiento: (row.fecha_vencimiento || raw[3] || '').toString().trim() || undefined,
              motivo_bloqueo: (row.motivo_bloqueo || row.observaciones || raw[4] || '').toString().trim() || undefined,
              bloqueado: false,
            });
            creadosCount++;
          }
        }
      }

      setFeedback({
        type: 'success',
        text: `¡Importación masiva exitosa! Se procesaron ${creadosCount} registros correctamente en la base de datos.`,
      });

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error durante la importación masiva:', err);
      setFeedback({
        type: 'error',
        text: err.message || 'Error al importar datos en la base de datos.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalPortal
      onClose={onClose}
      isDirty={!!file || parsedRows.length > 0}
      confirmMessage="¿Está seguro de salir? Se perderán los registros leídos del archivo CSV sin importar."
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-[#e5e2e1]">
          
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#333333] flex items-center justify-between bg-slate-50 dark:bg-[#201f1f]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#0f241a] dark:text-[#69f0ae] dark:border-[#1b4332] rounded-xl">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1]">{currentInfo.titulo}</h3>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4]">{currentInfo.desc}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:text-[#cdc3d4] dark:hover:text-[#e5e2e1] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Step 1: Download Template */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] flex items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#e5e2e1]">
                  1. Descargar Plantilla Oficial CSV
                </h4>
                <p className="text-xs text-slate-500 dark:text-[#cdc3d4] mt-0.5">
                  Utilice el formato estandarizado con la estructura exacta de columnas del WMS.
                </p>
              </div>
              <button
                onClick={handleDescargarPlantilla}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white dark:bg-[#201f1f] text-slate-700 dark:text-[#dab9ff] border border-slate-300 dark:border-[#522b7c] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] rounded-lg transition-colors shrink-0 shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Descargar .CSV</span>
              </button>
            </div>

            {/* Step 2: Upload CSV File */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#e5e2e1] mb-2">
                2. Seleccionar o Arrastrar Archivo CSV
              </label>
              <label className="border-2 border-dashed border-slate-300 dark:border-[#44424a] hover:border-emerald-500 dark:hover:border-[#69f0ae] bg-slate-50/50 dark:bg-[#131313]/50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors group">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Upload className="w-8 h-8 text-slate-400 dark:text-[#cdc3d4] group-hover:text-emerald-600 dark:group-hover:text-[#69f0ae] mb-2 transition-colors" />
                <span className="text-xs font-semibold text-slate-700 dark:text-[#e5e2e1]">
                  {file ? file.name : 'Haga clic aquí para seleccionar su archivo CSV'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#cdc3d4] mt-1">
                  Formatos soportados: .csv (separado por comas, con o sin encabezados)
                </span>
              </label>
            </div>

            {/* Feedback Message */}
            {feedback && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-[#0f241a] text-emerald-700 dark:text-[#69f0ae] border border-emerald-200 dark:border-[#1b4332]'
                    : 'bg-rose-50 dark:bg-[#381015] text-rose-700 dark:text-[#ffb4ab] border border-rose-200 dark:border-[#690005]'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-[#69f0ae]" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-[#ffb4ab]" />
                )}
                <span className="font-medium">{feedback.text}</span>
              </div>
            )}

            {/* Preview Grid */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-[#e5e2e1]">
                    3. Previsualización de Registros ({parsedRows.length})
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-[#69f0ae] font-semibold">
                    ✓ Listos para importar
                  </span>
                </div>
                <div className="border border-slate-200 dark:border-[#333333] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-[#201f1f] text-slate-700 dark:text-[#cdc3d4] sticky top-0 uppercase font-semibold text-[10px]">
                      <tr>
                        <th className="p-2">#</th>
                        {Object.keys(parsedRows[0])
                          .filter((k) => k !== '_rawCols')
                          .slice(0, 5)
                          .map((key) => (
                            <th key={key} className="p-2">
                              {key}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#333333]">
                      {parsedRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-[#252424]">
                          <td className="p-2 font-mono text-slate-400">{i + 1}</td>
                          {Object.keys(parsedRows[0])
                            .filter((k) => k !== '_rawCols')
                            .slice(0, 5)
                            .map((key) => (
                              <td key={key} className="p-2 font-mono text-slate-700 dark:text-[#e5e2e1] truncate max-w-[120px]">
                                {String(row[key] ?? '')}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-[#333333] flex items-center justify-end gap-3 bg-slate-50 dark:bg-[#201f1f]">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:bg-slate-100 dark:hover:bg-[#2a2a2a] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleImportar}
              disabled={parsedRows.length === 0 || isSubmitting || loadingFile}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-[#69f0ae] dark:hover:bg-[#8bf7c2] text-white dark:text-[#00391c] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar e Importar {parsedRows.length > 0 ? `(${parsedRows.length})` : ''}</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </ModalPortal>
  );
};
