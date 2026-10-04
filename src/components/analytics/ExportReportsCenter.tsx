import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Calendar,
  Layers,
  Box,
  Package,
  Search,
  CheckCircle2,
  Filter,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  Sparkles,
  Building2,
  FileText,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { formatNumber, formatM3, formatDate, formatDateTime } from '@/lib/utils';
import { exportToExcelXML, exportToCSV, exportStockTemplateExcel } from '@/lib/exportExcelUtils';

interface ExportReportsCenterProps {
  inventario: any[];
  kardex: any[];
  clientes: any[];
  selectedClienteId?: string;
}

type ReportType = 'stock' | 'movimientos' | 'liquidacion';

const formatMonthLabel = (yearMonth: string) => {
  if (!yearMonth) return '';
  try {
    const [y, m] = yearMonth.split('-');
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    const monthName = date.toLocaleDateString('es-AR', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${y}`;
  } catch {
    return yearMonth;
  }
};

export const ExportReportsCenter: React.FC<ExportReportsCenterProps> = ({
  inventario,
  kardex,
  clientes,
  selectedClienteId,
}) => {
  const [activeReport, setActiveReport] = useState<ReportType>('stock');
  const [filtroCliente, setFiltroCliente] = useState<string>(selectedClienteId || 'todos');
  const [busqueda, setBusqueda] = useState<string>('');

  // Filtros específicos de Stock
  const [filtroSoloDisponibles, setFiltroSoloDisponibles] = useState<boolean>(false);
  const [vistaStock, setVistaStock] = useState<'drilldown' | 'plana'>('drilldown');

  // Filtros específicos de Movimientos
  const [filtroTipoMovimiento, setFiltroTipoMovimiento] = useState<string>('todos');
  const [filtroPeriodoMovimientos, setFiltroPeriodoMovimientos] = useState<
    'todos' | 'mes' | 'rango' | 'hoy' | '7d' | '30d'
  >('mes');

  // Mes específico seleccionado (YYYY-MM)
  const [filtroMes, setFiltroMes] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  // Rango personalizado de fechas (Desde / Hasta)
  const [filtroFechaDesde, setFiltroFechaDesde] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  });

  const [filtroFechaHasta, setFiltroFechaHasta] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  // Filtros de Liquidación
  const [tarifaM3Dia, setTarifaM3Dia] = useState<number>(2.5);
  const [diasPeriodo, setDiasPeriodo] = useState<number>(30);

  // --------------------------------------------------------------------------
  // 1. DATA REPORTE DE STOCK E INVENTARIO FÍSICO (SIN TOTAL VALOR)
  // --------------------------------------------------------------------------
  const dataStock = useMemo(() => {
    let list = inventario;

    // Filtro por cliente
    if (filtroCliente !== 'todos') {
      list = list.filter((i) => i.cliente_id === filtroCliente);
    }

    // Filtro solo con stock disponible
    if (filtroSoloDisponibles) {
      list = list.filter((i) => Number(i.cantidad_disponible || 0) > 0);
    }

    // Búsqueda por texto
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      list = list.filter((i) => {
        const sku = String(i.articulo?.sku || '').toLowerCase();
        const nom = String(i.articulo?.nombre || '').toLowerCase();
        const cli = String(i.cliente?.razon_social || '').toLowerCase();
        const lote = String(i.lote?.numero_lote || '').toLowerCase();
        const lpn = String(i.pallet?.codigo_lpn || '').toLowerCase();
        const ubi = String(i.ubicacion?.codigo_etiqueta || '').toLowerCase();
        return (
          sku.includes(q) ||
          nom.includes(q) ||
          cli.includes(q) ||
          lote.includes(q) ||
          lpn.includes(q) ||
          ubi.includes(q)
        );
      });
    }

    return list.map((item) => {
      const art = item.articulo;
      const cantDisp = Number(item.cantidad_disponible || 0);
      const cantRes = Number(item.cantidad_reservada || 0);
      const cantTotal = cantDisp + cantRes;
      const m3 = Number(item.volumen_m3 || 0);

      const familia = String(
        art?.categoria?.nombre ||
        art?.tipo_empaque ||
        art?.marca_bulto ||
        'GENERAL'
      ).toUpperCase();

      const loteIc = item.lote?.numero_lote || item.lote_id || '-';

      const despachoRmx =
        item.despacho_rmx ||
        item.despacho_aduana ||
        item.remito ||
        item.orden_recepcion?.despacho_aduana ||
        (item.pallet?.codigo_lpn ? item.pallet.codigo_lpn : '-');

      return {
        sku: art?.sku || 'SKU',
        nombre: art?.nombre || 'Artículo',
        familia,
        lote: loteIc,
        despachoRmx,
        cliente: item.cliente?.razon_social || 'Cliente',
        cuit: item.cliente?.identificacion_fiscal || '-',
        vencimiento: item.lote?.fecha_vencimiento
          ? formatDate(item.lote.fecha_vencimiento)
          : 'No vence',
        palletLpn: item.pallet?.codigo_lpn || 'Suelto',
        ubicacion: item.ubicacion?.codigo_etiqueta || 'S/U',
        cantidadDisponible: cantDisp,
        cantidadReservada: cantRes,
        cantidadTotal: cantTotal,
        volumenM3: Math.round(m3 * 100) / 100,
        unidadesPorBulto: Number(art?.unidades_por_bulto || 1),
        unidadesTotales: cantTotal * Number(art?.unidades_por_bulto || 1),
        tipoEmpaque: art?.tipo_empaque
          ? art.tipo_empaque.charAt(0).toUpperCase() + art.tipo_empaque.slice(1)
          : 'Cajas',
      };
    });
  }, [inventario, filtroCliente, filtroSoloDisponibles, busqueda]);

  // Resumen ejecutivo de Stock
  const resumenStock = useMemo(() => {
    const totalBultos = dataStock.reduce((acc, d) => acc + d.cantidadTotal, 0);
    const totalDisponibles = dataStock.reduce((acc, d) => acc + d.cantidadDisponible, 0);
    const totalReservadas = dataStock.reduce((acc, d) => acc + d.cantidadReservada, 0);
    const totalVolumenM3 = dataStock.reduce((acc, d) => acc + d.volumenM3, 0);

    const lpns = new Set<string>();
    const skus = new Set<string>();
    dataStock.forEach((d) => {
      if (d.palletLpn && d.palletLpn !== 'Suelto') lpns.add(d.palletLpn);
      if (d.sku) skus.add(d.sku);
    });

    return {
      totalBultos,
      totalDisponibles,
      totalReservadas,
      totalVolumenM3: Math.round(totalVolumenM3 * 1000) / 1000,
      totalPallets: lpns.size,
      totalSkus: skus.size,
    };
  }, [dataStock]);

  // --------------------------------------------------------------------------
  // Agrupamiento Jerárquico Drilldown: Familia -> Lote -> Artículos
  // --------------------------------------------------------------------------
  const drilldownFamilias = useMemo(() => {
    // 1. Group by Familia -> Lote -> SKU (agregado consolidado)
    const famMap = new Map<
      string,
      Map<
        string,
        Map<
          string,
          {
            sku: string;
            nombre: string;
            cantidadTotal: number;
            volumenM3: number;
            unidadesPorBulto: number;
            tipoEmpaque: string;
          }
        >
      >
    >();

    dataStock.forEach((d) => {
      const famKey = d.familia || 'GENERAL';
      const loteKey = d.lote || 'S/L';
      const skuKey = d.sku || 'SKU';

      if (!famMap.has(famKey)) {
        famMap.set(famKey, new Map());
      }
      const loteMap = famMap.get(famKey)!;
      if (!loteMap.has(loteKey)) {
        loteMap.set(loteKey, new Map());
      }
      const skuMap = loteMap.get(loteKey)!;

      if (!skuMap.has(skuKey)) {
        skuMap.set(skuKey, {
          sku: d.sku,
          nombre: d.nombre,
          cantidadTotal: 0,
          volumenM3: 0,
          unidadesPorBulto: d.unidadesPorBulto || 1,
          tipoEmpaque: d.tipoEmpaque || 'Cajas',
        });
      }

      const existing = skuMap.get(skuKey)!;
      existing.cantidadTotal += d.cantidadTotal;
      existing.volumenM3 += d.volumenM3;
    });

    // 2. Construir estructura de arrays ordenada
    const result: Array<{
      familia: string;
      subtotalBultos: number;
      subtotalM3: number;
      lotes: Array<{
        lote: string;
        articulos: Array<{
          sku: string;
          nombre: string;
          unidadesTotales: number;
          unidadesPorBulto: number;
          volumenM3: number;
          cantidadTotal: number;
          tipoEmpaque: string;
        }>;
      }>;
    }> = [];

    const sortedFamilias = Array.from(famMap.keys()).sort();

    sortedFamilias.forEach((fam) => {
      const loteMap = famMap.get(fam)!;
      const sortedLotes = Array.from(loteMap.keys()).sort();
      let subtotalBultos = 0;
      let subtotalM3 = 0;

      const lotesArr: Array<{
        lote: string;
        articulos: any[];
      }> = [];

      sortedLotes.forEach((lote) => {
        const skuMap = loteMap.get(lote)!;
        const articulos = Array.from(skuMap.values())
          .sort((a, b) => a.sku.localeCompare(b.sku))
          .map((a) => {
            const uxb = a.unidadesPorBulto || 1;
            const unidadesTotales = a.cantidadTotal * uxb;
            const m3 = Math.round(a.volumenM3 * 100) / 100;
            subtotalBultos += a.cantidadTotal;
            subtotalM3 += m3;
            return {
              ...a,
              unidadesPorBulto: uxb,
              unidadesTotales,
              volumenM3: m3,
            };
          });

        lotesArr.push({ lote, articulos });
      });

      result.push({
        familia: fam,
        subtotalBultos,
        subtotalM3: Math.round(subtotalM3 * 100) / 100,
        lotes: lotesArr,
      });
    });

    return result;
  }, [dataStock]);

  // Período formateado en texto para encabezados y exportaciones
  const periodoTextoMovimientos = useMemo(() => {
    if (filtroPeriodoMovimientos === 'mes') {
      return `Mes: ${formatMonthLabel(filtroMes)}`;
    }
    if (filtroPeriodoMovimientos === 'rango') {
      return `Desde ${formatDate(filtroFechaDesde)} hasta ${formatDate(filtroFechaHasta)}`;
    }
    if (filtroPeriodoMovimientos === 'hoy') {
      return `Hoy (${formatDate(new Date().toISOString())})`;
    }
    if (filtroPeriodoMovimientos === '7d') {
      return 'Últimos 7 días';
    }
    if (filtroPeriodoMovimientos === '30d') {
      return 'Últimos 30 días';
    }
    return 'Histórico Completo';
  }, [filtroPeriodoMovimientos, filtroMes, filtroFechaDesde, filtroFechaHasta]);

  // --------------------------------------------------------------------------
  // 2. DATA REPORTE DE MOVIMIENTOS & KARDEX
  // --------------------------------------------------------------------------
  const dataMovimientos = useMemo(() => {
    let list = kardex;

    // Filtro por cliente
    if (filtroCliente !== 'todos') {
      list = list.filter((k) => k.cliente_id === filtroCliente);
    }

    // Filtro por tipo de movimiento
    if (filtroTipoMovimiento !== 'todos') {
      if (filtroTipoMovimiento === 'ajustes') {
        list = list.filter(
          (k) => k.tipo_movimiento === 'ajuste_positivo' || k.tipo_movimiento === 'ajuste_negativo'
        );
      } else if (filtroTipoMovimiento === 'diferencias') {
        list = list.filter((k) => {
          const isAjuste =
            k.tipo_movimiento === 'ajuste_positivo' || k.tipo_movimiento === 'ajuste_negativo';
          const hasDiff =
            /diferencia|desv[ií]o|sobrante|faltante|merma|rotura|dañad|discrepancia|rot\b|ajuste|faltan|sobran/i.test(
              String(k.notas || '')
            );
          return isAjuste || hasDiff;
        });
      } else {
        list = list.filter((k) => k.tipo_movimiento === filtroTipoMovimiento);
      }
    }

    // Filtro por rango de fechas / mes seleccionado
    if (filtroPeriodoMovimientos !== 'todos') {
      if (filtroPeriodoMovimientos === 'mes') {
        if (filtroMes) {
          list = list.filter((k) => {
            if (!k.fecha_hora) return false;
            const fStr = String(k.fecha_hora);
            if (fStr.startsWith(filtroMes)) return true;
            const d = new Date(k.fecha_hora);
            if (isNaN(d.getTime())) return false;
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return ym === filtroMes;
          });
        }
      } else if (filtroPeriodoMovimientos === 'rango') {
        const dInicio = filtroFechaDesde ? new Date(`${filtroFechaDesde}T00:00:00`) : null;
        const dFin = filtroFechaHasta ? new Date(`${filtroFechaHasta}T23:59:59.999`) : null;

        list = list.filter((k) => {
          if (!k.fecha_hora) return false;
          const d = new Date(k.fecha_hora);
          if (isNaN(d.getTime())) return false;
          if (dInicio && d < dInicio) return false;
          if (dFin && d > dFin) return false;
          return true;
        });
      } else {
        const ahora = new Date();
        const inicio = new Date();

        if (filtroPeriodoMovimientos === 'hoy') {
          inicio.setHours(0, 0, 0, 0);
        } else if (filtroPeriodoMovimientos === '7d') {
          inicio.setDate(ahora.getDate() - 7);
        } else if (filtroPeriodoMovimientos === '30d') {
          inicio.setDate(ahora.getDate() - 30);
        }

        list = list.filter((k) => {
          if (!k.fecha_hora) return false;
          const f = new Date(k.fecha_hora);
          return f >= inicio && f <= ahora;
        });
      }
    }

    // Búsqueda por texto
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      list = list.filter((k) => {
        const sku = String(k.articulo?.sku || '').toLowerCase();
        const art = String(k.articulo?.nombre || '').toLowerCase();
        const cli = String(k.cliente?.razon_social || '').toLowerCase();
        const lote = String(k.lote?.numero_lote || '').toLowerCase();
        const doc = String(k.documento_referencia || '').toLowerCase();
        const notas = String(k.notas || '').toLowerCase();
        return (
          sku.includes(q) ||
          art.includes(q) ||
          cli.includes(q) ||
          lote.includes(q) ||
          doc.includes(q) ||
          notas.includes(q)
        );
      });
    }

    return list.map((k) => {
      const cant = Number(k.cantidad || 0);
      const isAjustePos = k.tipo_movimiento === 'ajuste_positivo';
      const isAjusteNeg = k.tipo_movimiento === 'ajuste_negativo';
      const rawNotas = (k.notas || '').trim();
      const rawNotasLower = rawNotas.toLowerCase();
      const hasDiffKeyword =
        /diferencia|desv[ií]o|sobrante|faltante|merma|rotura|dañad|discrepancia|rot\b|ajuste|faltan|sobran/i.test(
          rawNotasLower
        );

      const esDiferencia = isAjustePos || isAjusteNeg || hasDiffKeyword;
      let tipoDiferencia: 'sobrante' | 'faltante' | 'observacion' | 'ninguna' = 'ninguna';
      let diferenciaBadge = '';

      if (isAjustePos) {
        tipoDiferencia = 'sobrante';
        diferenciaBadge = `+${cant} un. (Sobrante / Ajuste +)`;
      } else if (isAjusteNeg) {
        tipoDiferencia = 'faltante';
        diferenciaBadge = `-${cant} un. (Faltante / Merma / Ajuste -)`;
      } else if (hasDiffKeyword) {
        if (/sobrant|sobran|\+\s*\d/i.test(rawNotasLower)) {
          tipoDiferencia = 'sobrante';
          diferenciaBadge = 'Diferencia de conteo (Sobrante)';
        } else if (/faltant|merma|rotur|rot[oa]s?\b|dañad|faltan|(^|\s)-\s*\d/i.test(rawNotasLower)) {
          tipoDiferencia = 'faltante';
          diferenciaBadge = 'Diferencia de conteo (Faltante / Dañado)';
        } else {
          tipoDiferencia = 'observacion';
          diferenciaBadge = 'Discrepancia en cantidades';
        }
      }

      // Notas formateadas para Excel, CSV y reporte consolidado
      let notasCompletas = rawNotas;
      if (diferenciaBadge) {
        if (rawNotas) {
          if (!rawNotas.toLowerCase().includes(diferenciaBadge.toLowerCase())) {
            notasCompletas = `[${diferenciaBadge}] ${rawNotas}`;
          }
        } else {
          notasCompletas = `[${diferenciaBadge}]`;
        }
      }

      return {
        fecha: formatDateTime(k.fecha_hora),
        fechaRaw: k.fecha_hora,
        tipo: k.tipo_movimiento,
        sku: k.articulo?.sku || 'SKU',
        articulo: k.articulo?.nombre || 'Artículo',
        cliente: k.cliente?.razon_social || 'Cliente',
        lote: k.lote?.numero_lote || 'S/L',
        origen: k.origen?.codigo_etiqueta || k.ubicacion_origen?.codigo_etiqueta || '-',
        destino: k.destino?.codigo_etiqueta || k.ubicacion_destino?.codigo_etiqueta || '-',
        cantidad: cant,
        volumenM3: Number(k.volumen_m3 || 0),
        documento: k.documento_referencia || '-',
        notas: notasCompletas || '-',
        notasOriginal: rawNotas,
        esDiferencia,
        tipoDiferencia,
        diferenciaBadge,
      };
    });
  }, [
    kardex,
    filtroCliente,
    filtroTipoMovimiento,
    filtroPeriodoMovimientos,
    filtroMes,
    filtroFechaDesde,
    filtroFechaHasta,
    busqueda,
  ]);

  // Resumen ejecutivo de Movimientos
  const resumenMovimientos = useMemo(() => {
    const totalMovimientos = dataMovimientos.length;
    let bultosIngresados = 0;
    let bultosSalidos = 0;
    let bultosReubicados = 0;
    let bultosAjustesPos = 0;
    let bultosAjustesNeg = 0;
    let totalDiferencias = 0;

    dataMovimientos.forEach((m) => {
      const c = Number(m.cantidad || 0);
      if (m.tipo === 'recepcion' || m.tipo === 'ingreso_inicial' || m.tipo === 'putaway') {
        bultosIngresados += c;
      } else if (m.tipo === 'despacho' || m.tipo === 'picking') {
        bultosSalidos += c;
      } else if (m.tipo === 'reubicacion') {
        bultosReubicados += c;
      } else if (m.tipo === 'ajuste_positivo') {
        bultosAjustesPos += c;
      } else if (m.tipo === 'ajuste_negativo') {
        bultosAjustesNeg += c;
      }

      if (m.esDiferencia) {
        totalDiferencias += 1;
      }
    });

    const bultosAjustados = bultosAjustesPos + bultosAjustesNeg;

    return {
      totalMovimientos,
      bultosIngresados,
      bultosSalidos,
      bultosReubicados,
      bultosAjustesPos,
      bultosAjustesNeg,
      bultosAjustados,
      totalDiferencias,
      totalBultosMovilizados: bultosIngresados + bultosSalidos + bultosReubicados + bultosAjustados,
    };
  }, [dataMovimientos]);

  // --------------------------------------------------------------------------
  // 3. DATA REPORTE DE LIQUIDACIÓN 3PL
  // --------------------------------------------------------------------------
  const dataLiquidacion = useMemo(() => {
    const map = new Map<
      string,
      {
        clienteId: string;
        razonSocial: string;
        identificacionFiscal: string;
        unidadNegocio: string;
        totalBultos: number;
        totalPallets: Set<string>;
        totalM3: number;
      }
    >();

    inventario.forEach((inv) => {
      const cId = inv.cliente_id;
      if (!cId) return;

      const existing = map.get(cId) || {
        clienteId: cId,
        razonSocial: inv.cliente?.razon_social || 'Cliente',
        identificacionFiscal: inv.cliente?.identificacion_fiscal || '-',
        unidadNegocio: inv.cliente?.unidad_negocio || 'General',
        totalBultos: 0,
        totalPallets: new Set<string>(),
        totalM3: 0,
      };

      existing.totalBultos += Number(inv.cantidad_disponible || 0);
      existing.totalM3 += Number(inv.volumen_m3 || 0);
      if (inv.pallet?.codigo_lpn) {
        existing.totalPallets.add(inv.pallet.codigo_lpn);
      }

      map.set(cId, existing);
    });

    const totalAlmacenM3 = Array.from(map.values()).reduce((acc, c) => acc + c.totalM3, 0);

    return Array.from(map.values()).map((c) => {
      const m3Rounded = Math.round(c.totalM3 * 1000) / 1000;
      const subtotalAlmacenaje =
        Math.round(m3Rounded * tarifaM3Dia * diasPeriodo * 100) / 100;
      const ocupacionPct =
        totalAlmacenM3 > 0 ? Math.round((c.totalM3 / totalAlmacenM3) * 1000) / 10 : 0;

      return {
        clienteId: c.clienteId,
        cliente: c.razonSocial,
        cuit: c.identificacionFiscal,
        unidadNegocio: c.unidadNegocio,
        totalBultos: c.totalBultos,
        totalPallets: c.totalPallets.size,
        totalM3: m3Rounded,
        porcentajeOcupacion: ocupacionPct,
        tarifaDiariaM3: tarifaM3Dia,
        dias: diasPeriodo,
        importeEstimado: subtotalAlmacenaje,
      };
    });
  }, [inventario, tarifaM3Dia, diasPeriodo]);

  // Nombre del cliente filtrado
  const clienteNombreSeleccionado = useMemo(() => {
    if (filtroCliente === 'todos') return 'Todos los Clientes';
    const c = clientes.find((cli) => cli.id === filtroCliente);
    return c ? c.razon_social : 'Cliente';
  }, [filtroCliente, clientes]);

  const clienteNombreConRazonSocial = useMemo(() => {
    if (filtroCliente === 'todos') return 'TODOS LOS CLIENTES (CONSOLIDADO WMS)';
    const c = clientes.find((cli) => cli.id === filtroCliente);
    if (!c) return 'CLIENTE GENERAL';
    if (c.unidad_negocio && c.unidad_negocio.trim()) {
      return `${c.unidad_negocio.trim()} (${c.razon_social.trim()})`;
    }
    return c.razon_social;
  }, [filtroCliente, clientes]);

  // --------------------------------------------------------------------------
  // EXPORTACIÓN A EXCEL (.xls XML)
  // --------------------------------------------------------------------------
  const handleExportExcel = () => {
    const dateStr = new Date().toISOString().slice(0, 10);

    if (activeReport === 'stock') {
      const nowStr = new Date().toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      exportStockTemplateExcel({
        filename: `Stock_${clienteNombreSeleccionado.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.xls`,
        clienteNombre: clienteNombreConRazonSocial,
        fechaHora: nowStr,
        enPedidos: resumenStock.totalReservadas,
        m3Total: resumenStock.totalVolumenM3,
        stockTotal: resumenStock.totalBultos,
        rows: dataStock.map((d) => ({
          sku: d.sku,
          descripcion: d.nombre,
          familia: d.familia,
          loteIc: d.lote,
          despachoRmx: d.despachoRmx,
          enReserva: d.cantidadReservada,
          m3: d.volumenM3,
          cantidad: d.cantidadTotal,
        })),
      });
    } else if (activeReport === 'movimientos') {
      exportToExcelXML({
        filename: `Reporte_Kardex_${clienteNombreSeleccionado.replace(/[^a-zA-Z0-9]/g, '_')}_${filtroPeriodoMovimientos}_${dateStr}.xls`,
        sheetName: 'Movimientos_Kardex',
        title: 'REPORTE DE MOVIMIENTOS & TRAZABILIDAD KARDEX',
        subtitle: `Cliente: ${clienteNombreSeleccionado} | Período: ${periodoTextoMovimientos} | Total Movimientos: ${resumenMovimientos.totalMovimientos} | Diferencias: ${resumenMovimientos.totalDiferencias}`,
        summary: [
          { label: 'Total Movimientos Registrados:', value: resumenMovimientos.totalMovimientos },
          { label: 'Período Auditado:', value: periodoTextoMovimientos },
          { label: 'Bultos en Ingresos / Putaway:', value: resumenMovimientos.bultosIngresados },
          { label: 'Bultos en Salidas / Despachos:', value: resumenMovimientos.bultosSalidos },
          { label: 'Bultos en Reubicaciones:', value: resumenMovimientos.bultosReubicados },
          { label: 'Ajustes Positivos (Sobrantes):', value: `+${resumenMovimientos.bultosAjustesPos} un.` },
          { label: 'Ajustes Negativos (Faltantes / Mermas):', value: `-${resumenMovimientos.bultosAjustesNeg} un.` },
          { label: 'Total Movimientos con Diferencias:', value: `${resumenMovimientos.totalDiferencias} reg.` },
          { label: 'Total Bultos Movilizados:', value: resumenMovimientos.totalBultosMovilizados },
        ],
        columns: [
          { header: 'Fecha y Hora', key: 'fecha', width: 18, type: 'string', align: 'center' },
          { header: 'Tipo Movimiento', key: 'tipo', width: 18, type: 'string', align: 'center' },
          { header: 'SKU', key: 'sku', width: 14, type: 'string' },
          { header: 'Artículo', key: 'articulo', width: 26, type: 'string' },
          { header: 'Cliente Depositante', key: 'cliente', width: 22, type: 'string' },
          { header: 'Lote', key: 'lote', width: 14, type: 'string' },
          { header: 'Ubicación Origen', key: 'origen', width: 16, type: 'string', align: 'center' },
          { header: 'Ubicación Destino', key: 'destino', width: 16, type: 'string', align: 'center' },
          { header: 'Cantidad (Bultos)', key: 'cantidad', width: 16, type: 'number', align: 'right' },
          { header: 'Volumen (m³)', key: 'volumenM3', width: 14, type: 'number', align: 'right' },
          { header: 'Doc. Referencia', key: 'documento', width: 18, type: 'string' },
          { header: 'Observaciones & Diferencias de Cantidad', key: 'notas', width: 36, type: 'string' },
        ],
        rows: dataMovimientos,
      });
    } else {
      exportToExcelXML({
        filename: `Liquidacion_Almacenaje_3PL_${dateStr}.xls`,
        sheetName: 'Liquidacion_3PL',
        title: 'PROFORMA DE LIQUIDACIÓN DE ALMACENAJE 3PL',
        subtitle: `Período: ${diasPeriodo} días corridos | Tarifa base: $${tarifaM3Dia}/m³/día`,
        columns: [
          { header: 'Cliente Depositante', key: 'cliente', width: 26, type: 'string' },
          { header: 'CUIT / RUT', key: 'cuit', width: 16, type: 'string' },
          { header: 'Unidad de Negocio', key: 'unidadNegocio', width: 18, type: 'string' },
          { header: 'Bultos en Stock', key: 'totalBultos', width: 16, type: 'number', align: 'right' },
          { header: 'Pallets LPN', key: 'totalPallets', width: 14, type: 'number', align: 'right' },
          { header: 'Volumen Ocupado (m³)', key: 'totalM3', width: 20, type: 'number', align: 'right' },
          { header: '% Depósito', key: 'porcentajeOcupacion', width: 14, type: 'number', align: 'right' },
          { header: 'Tarifa $/m³/Día', key: 'tarifaDiariaM3', width: 16, type: 'number', align: 'right' },
          { header: 'Días', key: 'dias', width: 10, type: 'number', align: 'center' },
          { header: 'Subtotal ($)', key: 'importeEstimado', width: 18, type: 'number', align: 'right' },
        ],
        rows: dataLiquidacion,
      });
    }
  };

  // --------------------------------------------------------------------------
  // EXPORTACIÓN A CSV (UTF-8 BOM CON ;)
  // --------------------------------------------------------------------------
  const handleExportCSV = () => {
    const dateStr = new Date().toISOString().slice(0, 10);

    if (activeReport === 'stock') {
      exportToCSV({
        filename: `Stock_${clienteNombreSeleccionado.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.csv`,
        columns: [
          { header: 'SKU', key: 'sku' },
          { header: 'Descripcion Articulo', key: 'nombre' },
          { header: 'Familia', key: 'familia' },
          { header: 'Lote / IC', key: 'lote' },
          { header: 'Despacho RMx', key: 'despachoRmx' },
          { header: 'En Reserva', key: 'cantidadReservada' },
          { header: 'M3', key: 'volumenM3' },
          { header: 'Cantidad', key: 'cantidadTotal' },
        ],
        rows: dataStock,
      });
    } else if (activeReport === 'movimientos') {
      exportToCSV({
        filename: `Reporte_Kardex_${clienteNombreSeleccionado.replace(/[^a-zA-Z0-9]/g, '_')}_${filtroPeriodoMovimientos}_${dateStr}.csv`,
        columns: [
          { header: 'Fecha y Hora', key: 'fecha' },
          { header: 'Tipo de Movimiento', key: 'tipo' },
          { header: 'SKU', key: 'sku' },
          { header: 'Artículo', key: 'articulo' },
          { header: 'Cliente Depositante', key: 'cliente' },
          { header: 'Lote', key: 'lote' },
          { header: 'Ubicación Origen', key: 'origen' },
          { header: 'Ubicación Destino', key: 'destino' },
          { header: 'Cantidad Bultos', key: 'cantidad' },
          { header: 'Volumen M3', key: 'volumenM3' },
          { header: 'Doc Referencia', key: 'documento' },
          { header: 'Observaciones y Diferencias de Cantidad', key: 'notas' },
        ],
        rows: dataMovimientos,
      });
    } else {
      exportToCSV({
        filename: `Liquidacion_Almacenaje_3PL_${dateStr}.csv`,
        columns: [
          { header: 'Cliente Depositante', key: 'cliente' },
          { header: 'CUIT/RUT', key: 'cuit' },
          { header: 'Unidad de Negocio', key: 'unidadNegocio' },
          { header: 'Bultos en Stock', key: 'totalBultos' },
          { header: 'Pallets LPN', key: 'totalPallets' },
          { header: 'M3 Totales Ocupados', key: 'totalM3' },
          { header: '% Ocupación Depósito', key: 'porcentajeOcupacion' },
          { header: 'Tarifa $/M3/Día', key: 'tarifaDiariaM3' },
          { header: 'Días', key: 'dias' },
          { header: 'Subtotal Liquidación ($)', key: 'importeEstimado' },
        ],
        rows: dataLiquidacion,
      });
    }
  };

  // --------------------------------------------------------------------------
  // IMPRESIÓN / GUARDAR COMO PDF
  // --------------------------------------------------------------------------
  const handlePrintPDF = () => {
    window.print();
  };

  const getTipoMovimientoBadge = (tipo: string) => {
    switch (tipo) {
      case 'recepcion':
      case 'ingreso_inicial':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Entrada</span>;
      case 'putaway':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-300">Putaway</span>;
      case 'picking':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">Picking</span>;
      case 'despacho':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-300">Despacho</span>;
      case 'ajuste_positivo':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-100 text-teal-800 border border-teal-300">Ajuste (+)</span>;
      case 'ajuste_negativo':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300">Ajuste (-)</span>;
      case 'reubicacion':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">Reubicación</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">{tipo}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Estilos dedicados para impresión según formato: A4 Portrait para Drilldown Stock, A4 Landscape para tabla plana / movimientos */}
      <style>{`
        @media print {
          @page {
            size: ${activeReport === 'stock' && vistaStock === 'drilldown' ? 'A4 portrait' : 'A4 landscape'};
            margin: 8mm 8mm;
          }
          body {
            background-color: white !important;
            color: black !important;
            font-size: 10px !important;
          }
          nav, aside, header, footer, .print\\:hidden {
            display: none !important;
          }
          #printable-report-area {
            display: block !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }
      `}</style>

      {/* PANEL SUPERIOR: SELECCIÓN DE REPORTE Y BOTONERA DE EXPORTACIÓN (Oculto al imprimir) */}
      <div className="bg-white dark:bg-[#1c1b1b] border border-slate-200 dark:border-[#333333] rounded-2xl p-5 space-y-4 shadow-sm print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#2b2b2b] pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-[#e5e2e1] flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-[#69f0ae]" />
              Centro de Reportes Ejecutivos & Auditoría Logística
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#978d9d] mt-0.5">
              Genera y exporta reportes oficiales de Stock Físico y Trazabilidad de Movimientos en Excel y PDF.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Botón Excel (.xls nativo estructurado) */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-[#69f0ae] dark:hover:bg-[#8bf4c1] dark:text-[#00391d] shadow-sm transition-all active:scale-95"
              title="Descargar libro de Excel formateado con estilos (.xls)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel (.xls)</span>
            </button>

            {/* Botón CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 dark:bg-[#201f1f] dark:hover:bg-[#2b2b2b] dark:text-[#cdc3d4] dark:border-[#3b3b3b] shadow-xs transition-all active:scale-95"
              title="Descargar archivo CSV con UTF-8 BOM"
            >
              <Download className="w-4 h-4" />
              <span>CSV (Excel)</span>
            </button>

            {/* Botón Imprimir / PDF */}
            <button
              type="button"
              onClick={handlePrintPDF}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl bg-violet-600 hover:bg-violet-700 text-white dark:bg-[#dab9ff] dark:hover:bg-[#eedbff] dark:text-[#460283] shadow-sm transition-all active:scale-95"
              title="Abrir vista previa de impresión o Guardar como PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / Guardar PDF</span>
            </button>
          </div>
        </div>

        {/* Pestañas de Reportes */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveReport('stock')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                activeReport === 'stock'
                  ? 'bg-emerald-600 text-white dark:bg-[#69f0ae] dark:text-[#00391d]'
                  : 'bg-slate-100 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>1. Stock e Inventario Físico</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 dark:bg-black/20 font-mono">
                {dataStock.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveReport('movimientos')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                activeReport === 'movimientos'
                  ? 'bg-violet-600 text-white dark:bg-[#dab9ff] dark:text-[#460283]'
                  : 'bg-slate-100 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>2. Movimientos & Kardex</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 dark:bg-black/20 font-mono">
                {dataMovimientos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveReport('liquidacion')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                activeReport === 'liquidacion'
                  ? 'bg-sky-600 text-white dark:bg-[#75d1ff] dark:text-[#00344d]'
                  : 'bg-slate-100 dark:bg-[#131313] border border-slate-200 dark:border-[#333333] text-slate-700 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-[#e5e2e1]'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>3. Liquidación Almacenaje 3PL</span>
            </button>
          </div>

          {/* Filtros dinámicos según el reporte activo */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Filtro Cliente 3PL */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 dark:text-[#cdc3d4] font-medium">Cliente:</span>
              <select
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-[#69f0ae]"
              >
                <option value="todos">Todos los Clientes 3PL</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razon_social}
                  </option>
                ))}
              </select>
            </div>

            {/* Búsqueda rápida */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-[#978d9d] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar SKU, lote, cliente..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] placeholder-slate-400 focus:outline-none focus:border-emerald-500 dark:focus:border-[#69f0ae] w-48"
              />
            </div>

            {/* Controles específicos de Movimientos */}
            {activeReport === 'movimientos' && (
              <>
                <select
                  value={filtroTipoMovimiento}
                  onChange={(e) => setFiltroTipoMovimiento(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-medium"
                >
                  <option value="todos">Todos los Tipos</option>
                  <option value="diferencias">⚠️ Solo con Diferencias</option>
                  <option value="ajustes">Ajustes (+ / -)</option>
                  <option value="recepcion">Entrada / Recepción</option>
                  <option value="putaway">Entrada / Putaway</option>
                  <option value="picking">Picking / Reserva</option>
                  <option value="despacho">Salida / Despacho</option>
                  <option value="reubicacion">Reubicación Interna</option>
                </select>

                <select
                  value={filtroPeriodoMovimientos}
                  onChange={(e) => setFiltroPeriodoMovimientos(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs text-slate-900 dark:text-[#e5e2e1] font-semibold"
                >
                  <option value="mes">📅 Por Mes Específico (Mes X)</option>
                  <option value="rango">📆 Entre Fechas (Rango)</option>
                  <option value="todos">Todo el Histórico</option>
                  <option value="hoy">Hoy</option>
                  <option value="7d">Últimos 7 días</option>
                  <option value="30d">Últimos 30 días</option>
                </select>

                {/* Si seleccionó 'mes', selector de Mes */}
                {filtroPeriodoMovimientos === 'mes' && (
                  <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-[#131313] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-[#333333]">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-[#978d9d]" />
                    <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-medium">Mes:</span>
                    <input
                      type="month"
                      value={filtroMes}
                      onChange={(e) => setFiltroMes(e.target.value)}
                      className="bg-transparent text-xs text-slate-900 dark:text-[#e5e2e1] font-bold focus:outline-none cursor-pointer"
                    />
                  </div>
                )}

                {/* Si seleccionó 'rango', selectores Desde / Hasta */}
                {filtroPeriodoMovimientos === 'rango' && (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#131313] px-2.5 py-1 rounded-lg border border-slate-300 dark:border-[#333333] flex-wrap">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-[#978d9d]" />
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-medium">Desde:</span>
                      <input
                        type="date"
                        value={filtroFechaDesde}
                        onChange={(e) => setFiltroFechaDesde(e.target.value)}
                        className="bg-transparent text-xs text-slate-900 dark:text-[#e5e2e1] font-bold focus:outline-none cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-1 border-l border-slate-300 dark:border-[#333333] pl-2">
                      <span className="text-[11px] text-slate-600 dark:text-[#cdc3d4] font-medium">Hasta:</span>
                      <input
                        type="date"
                        value={filtroFechaHasta}
                        onChange={(e) => setFiltroFechaHasta(e.target.value)}
                        className="bg-transparent text-xs text-slate-900 dark:text-[#e5e2e1] font-bold focus:outline-none cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Controles específicos de Stock */}
            {activeReport === 'stock' && (
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#201f1f] p-0.5 rounded-lg border border-slate-200 dark:border-[#333333]">
                  <button
                    type="button"
                    onClick={() => setVistaStock('drilldown')}
                    className={`px-2 py-1 text-xs rounded-md font-bold transition-all ${
                      vistaStock === 'drilldown'
                        ? 'bg-white dark:bg-[#2b2b2b] text-violet-700 dark:text-[#dab9ff] shadow-xs'
                        : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Formato drilldown por familias y lotes agrupados (Recomendado para PDF)"
                  >
                    Drilldown Familias (PDF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaStock('plana')}
                    className={`px-2 py-1 text-xs rounded-md font-bold transition-all ${
                      vistaStock === 'plana'
                        ? 'bg-white dark:bg-[#2b2b2b] text-emerald-700 dark:text-[#69f0ae] shadow-xs'
                        : 'text-slate-600 dark:text-[#cdc3d4] hover:text-slate-900 dark:hover:text-white'
                    }`}
                    title="Formato tabla plana con caja superior de totales (Recomendado para Excel)"
                  >
                    Tabla Plana (Excel)
                  </button>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-[#cdc3d4] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filtroSoloDisponibles}
                    onChange={(e) => setFiltroSoloDisponibles(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Solo con stock disponible</span>
                </label>
              </div>
            )}

            {/* Controles específicos de Liquidación */}
            {activeReport === 'liquidacion' && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 dark:text-[#cdc3d4]">Tarifa $/M³:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={tarifaM3Dia}
                    onChange={(e) => setTarifaM3Dia(parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1 rounded bg-slate-50 dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-center text-slate-900 dark:text-[#e5e2e1]"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 dark:text-[#cdc3d4]">Días:</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={diasPeriodo}
                    onChange={(e) => setDiasPeriodo(parseInt(e.target.value) || 30)}
                    className="w-14 px-2 py-1 rounded bg-slate-50 dark:bg-[#131313] border border-slate-300 dark:border-[#333333] text-xs font-mono font-bold text-center text-slate-900 dark:text-[#e5e2e1]"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HOJA OFICIAL IMPRIMIBLE / PDF (DOCUMENTO FORMAL CERTIFICADO)               */}
      {/* ========================================================================= */}
      <div
        id="printable-report-area"
        className="bg-white text-slate-900 p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 font-sans text-xs space-y-5"
      >
        {/* Encabezado Corporativo Oficial */}
        {activeReport === 'stock' && vistaStock === 'drilldown' ? (
          <div className="space-y-3 pb-3 border-b-2 border-black">
            {/* Logo / Corporate line matching screenshot */}
            <div className="flex items-center gap-3">
              <svg
                className="w-48 h-8 text-black"
                viewBox="0 0 280 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 32 H14 V18 H38 V26 H46 V18 H68 V32 H84 V24 H102 V32 H118 V14 H134 V32 H160"
                  stroke="black"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M170 30 L200 16 L230 10 L242 4 L238 15 L260 15 L255 20 L234 18 L212 28 Z"
                  fill="black"
                  stroke="black"
                  strokeWidth="0.5"
                />
                <path d="M182 23 L204 35 L216 33 L200 21 Z" fill="black" />
              </svg>
              <div className="font-sans font-black text-sm tracking-tight text-black">
                Open Cargo Logistic Services <span className="text-[11px] font-bold">SRL</span>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center pt-1">
              <h1 className="font-serif tracking-wider uppercase text-lg sm:text-xl text-black font-bold">
                INFORME DE STOCK AL DIA{' '}
                {new Date().toLocaleString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </h1>
            </div>

            {/* Client line and Summary Totals */}
            <div className="space-y-1 pt-1 font-serif">
              <div className="italic text-base text-black">
                Cliente: <span className="font-bold">{clienteNombreConRazonSocial}</span>
              </div>
              <div className="text-xs font-sans text-black space-y-0.5 pt-1">
                <div>
                  <span className="font-normal">Cantidad Total:</span>{' '}
                  <span className="font-mono font-bold">{formatNumber(resumenStock.totalBultos, 0)} ctns.</span>
                </div>
                <div>
                  <span className="font-normal">m3 Total:</span>{' '}
                  <span className="font-mono font-bold">{formatNumber(resumenStock.totalVolumenM3, 2)} m3.</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-slate-950 text-white font-black flex items-center justify-center text-base tracking-wider shadow-sm">
                  WMS
                </div>
                <div>
                  <h1 className="text-base font-black text-slate-950 uppercase tracking-tight">
                    OPENWMS LOGISTICS MANAGEMENT &bull; SSD
                  </h1>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Centro de Distribución & Almacenamiento 3PL &bull; Informe Oficial de Control
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <h2 className="text-sm font-black uppercase font-mono text-slate-950 tracking-wide">
                {activeReport === 'stock' && 'INFORME DE INVENTARIO Y STOCK FÍSICO'}
                {activeReport === 'movimientos' && 'AUDITORÍA DE MOVIMIENTOS & TRAZABILIDAD KARDEX'}
                {activeReport === 'liquidacion' && 'PROFORMA DE LIQUIDACIÓN DE ALMACENAJE 3PL'}
              </h2>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Emisión: {formatDateTime(new Date().toISOString())} &bull; Filtro:{' '}
                <b>{clienteNombreSeleccionado}</b>
                {activeReport === 'movimientos' && (
                  <> &bull; Período: <b className="text-slate-900">{periodoTextoMovimientos}</b></>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* CASO 1: REPORTE DE STOCK E INVENTARIO FÍSICO                             */}
        {/* ----------------------------------------------------------------------- */}
        {activeReport === 'stock' && (
          vistaStock === 'drilldown' ? (
            /* Vista Drilldown por Familias (Formato PDF Oficial) */
            <div className="space-y-6 pt-2">
              {drilldownFamilias.length === 0 ? (
                <div className="p-8 text-center text-slate-500 italic bg-slate-50 rounded-xl border border-slate-300">
                  No se encontraron registros de stock con los filtros aplicados.
                </div>
              ) : (
                drilldownFamilias.map((famGroup) => (
                  <div key={famGroup.familia} className="space-y-1 break-inside-avoid">
                    <h3 className="font-serif italic font-bold text-sm tracking-wider text-black uppercase">
                      -{famGroup.familia}
                    </h3>
                    <table className="w-full border-collapse border-2 border-black text-left text-[10px] font-sans">
                      <thead className="bg-white text-black font-bold border-b border-black">
                        <tr>
                          <th className="p-1 border border-black text-center w-[12%]">Lote</th>
                          <th className="p-1 border border-black text-center w-[20%]">Articulo SKU</th>
                          <th className="p-1 border border-black text-center w-[38%]">Descripcion Full</th>
                          <th className="p-1 border border-black text-center w-[12%]">Unts</th>
                          <th className="p-1 border border-black text-center w-[9%]">M3 CBM</th>
                          <th className="p-1 border border-black text-center w-[9%]">
                            Cantidad <span className="font-black">STOCK</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {famGroup.lotes.map((loteGroup) =>
                          loteGroup.articulos.map((art, artIdx) => (
                            <tr key={`${loteGroup.lote}-${art.sku}`} className="border-b border-black">
                              {artIdx === 0 && (
                                <td
                                  rowSpan={loteGroup.articulos.length}
                                  className="border border-black text-center font-black font-mono align-middle bg-white text-black p-2 text-xs"
                                >
                                  {loteGroup.lote}
                                </td>
                              )}
                              <td className="border border-black p-1 font-mono italic font-bold text-black whitespace-nowrap">
                                {art.sku}
                              </td>
                              <td className="border border-black p-1 text-[10px] uppercase font-medium text-black leading-snug">
                                {art.nombre}
                              </td>
                              <td className="border border-black p-0.5 text-center font-mono">
                                <div className="font-bold text-black leading-tight">
                                  {formatNumber(art.unidadesTotales, 1)} Unidades
                                </div>
                                <div className="text-[9px] text-slate-700 leading-tight">
                                  UxB: {formatNumber(art.unidadesPorBulto, 2)}
                                </div>
                              </td>
                              <td className="border border-black p-1 text-right font-mono font-medium text-black">
                                {formatNumber(art.volumenM3, 2)}
                              </td>
                              <td className="border border-black p-1 text-right font-mono font-bold text-black whitespace-nowrap">
                                {formatNumber(art.cantidadTotal, 0)} {art.tipoEmpaque}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Vista Tabla Plana con Caja de Totales (Excel Style) */
            <div className="space-y-4">
              {/* Header exacto según plantilla */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-1">
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-bold text-slate-800">Cliente: </span>
                    <span className="font-bold italic text-slate-950 text-base">{clienteNombreConRazonSocial}</span>
                  </div>
                  <div className="text-xs flex items-center gap-2">
                    <span className="font-bold text-slate-900">Inventario al dia:</span>
                    <span className="font-mono text-slate-800 font-semibold">
                      {new Date().toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Bloque Superior Derecho de Totales (2 filas x 3 columnas con borde continuo) */}
                <div className="self-end sm:self-auto">
                  <table className="border-collapse border-2 border-slate-900 text-center font-sans text-xs bg-white shadow-xs">
                    <thead>
                      <tr className="border-b border-slate-900 bg-slate-50">
                        <th className="px-5 py-1.5 border-r border-slate-900 font-bold text-[11px] text-slate-900 min-w-[95px]">
                          En Pedidos
                        </th>
                        <th className="px-5 py-1.5 border-r border-slate-900 font-bold text-[11px] text-slate-900 min-w-[95px]">
                          M3 TOTAL
                        </th>
                        <th className="px-5 py-1.5 font-black text-[11px] text-slate-900 min-w-[120px]">
                          STOCK EN TOTAL
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-5 py-1.5 border-r border-slate-900 font-mono text-slate-900 font-medium">
                          {formatNumber(resumenStock.totalReservadas, 2)}
                        </td>
                        <td className="px-5 py-1.5 border-r border-slate-900 font-mono text-slate-900 font-medium">
                          {formatNumber(resumenStock.totalVolumenM3, 2)}
                        </td>
                        <td className="px-5 py-1.5 font-mono text-base font-black text-slate-950">
                          {formatNumber(resumenStock.totalBultos, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tabla Detallada con Cabeceras Grises (#D9D9D9) y Filtros */}
              <div className="overflow-x-auto border border-slate-400 rounded-lg">
                <table className="w-full border-collapse border border-slate-400 text-left text-[11px]">
                  <thead className="bg-[#D9D9D9] text-slate-900 font-bold border-b border-slate-400">
                    <tr>
                      <th className="p-2 border-r border-slate-400 font-bold text-slate-900">SKU</th>
                      <th className="p-2 border-r border-slate-400 font-bold text-slate-900">Descripcion Articulo</th>
                      <th className="p-2 border-r border-slate-400 font-bold text-slate-900 text-center">Familia</th>
                      <th className="p-2 border-r border-slate-400 font-bold text-slate-900 text-center">Lote / IC</th>
                      <th className="p-2 border-r border-slate-400 font-bold text-slate-900 text-center">Despacho RMx</th>
                      <th className="p-2 border-r border-slate-400 font-bold text-slate-900 text-center">En Reserva</th>
                      <th className="p-2 border-r border-slate-400 font-bold text-slate-900 text-right">M3</th>
                      <th className="p-2 font-bold text-slate-900 text-right">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300 bg-white">
                    {dataStock.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                          No se encontraron registros de stock con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      dataStock.map((d, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-1.5 font-mono border-r border-slate-300 font-bold text-slate-900 whitespace-nowrap">
                            {d.sku}
                          </td>
                          <td className="p-1.5 border-r border-slate-300 font-medium text-slate-900">
                            {d.nombre}
                          </td>
                          <td className="p-1.5 border-r border-slate-300 text-center font-mono text-[10px] text-slate-800 whitespace-nowrap font-medium">
                            {d.familia}
                          </td>
                          <td className="p-1.5 border-r border-slate-300 text-center font-mono text-[10px] text-slate-800 whitespace-nowrap">
                            {d.lote}
                          </td>
                          <td className="p-1.5 border-r border-slate-300 text-center font-mono text-[10px] text-slate-800 whitespace-nowrap">
                            {d.despachoRmx}
                          </td>
                          <td className="p-1.5 text-center font-mono border-r border-slate-300 text-slate-800">
                            {d.cantidadReservada}
                          </td>
                          <td className="p-1.5 text-right font-mono border-r border-slate-300 text-slate-800">
                            {formatNumber(d.volumenM3, 2)}
                          </td>
                          <td className="p-1.5 text-right font-mono font-bold text-slate-950">
                            {formatNumber(d.cantidadTotal, 0)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {dataStock.length > 0 && (
                    <tfoot className="bg-[#EFEFEF] font-mono font-bold border-t-2 border-slate-900">
                      <tr>
                        <td colSpan={5} className="p-2 text-right border-r border-slate-300 uppercase font-sans text-[10px] text-slate-700">
                          Totales:
                        </td>
                        <td className="p-2 text-center border-r border-slate-300 text-slate-900 font-mono">
                          {formatNumber(resumenStock.totalReservadas, 0)}
                        </td>
                        <td className="p-2 text-right border-r border-slate-300 text-slate-900 font-mono">
                          {formatNumber(resumenStock.totalVolumenM3, 2)}
                        </td>
                        <td className="p-2 text-right font-black text-slate-950 font-mono">
                          {formatNumber(resumenStock.totalBultos, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* CASO 2: REPORTE DE MOVIMIENTOS & KARDEX                                  */}
        {/* ----------------------------------------------------------------------- */}
        {activeReport === 'movimientos' && (
          <div className="space-y-4">
            {/* Métricas Ejecutivas de Movimientos */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-300 font-mono text-center">
              <div className="border-r border-slate-200 last:border-none pr-2">
                <span className="text-[10px] uppercase text-slate-500 font-bold block">
                  Total Movimientos
                </span>
                <span className="text-base font-black text-slate-950">
                  {formatNumber(resumenMovimientos.totalMovimientos, 0)}
                </span>
                <span className="text-[9px] text-slate-500 font-sans block truncate" title={periodoTextoMovimientos}>
                  {periodoTextoMovimientos}
                </span>
              </div>
              <div className="border-r border-slate-200 last:border-none pr-2">
                <span className="text-[10px] uppercase text-slate-500 font-bold block">
                  Entradas / Putaway
                </span>
                <span className="text-base font-black text-emerald-700">
                  {formatNumber(resumenMovimientos.bultosIngresados, 0)} un.
                </span>
              </div>
              <div className="border-r border-slate-200 last:border-none pr-2">
                <span className="text-[10px] uppercase text-slate-500 font-bold block">
                  Salidas / Despachos
                </span>
                <span className="text-base font-black text-purple-700">
                  {formatNumber(resumenMovimientos.bultosSalidos, 0)} un.
                </span>
              </div>
              <div className="border-r border-slate-200 last:border-none pr-2">
                <span className="text-[10px] uppercase text-slate-500 font-bold block">
                  Reubicaciones
                </span>
                <span className="text-base font-black text-indigo-700">
                  {formatNumber(resumenMovimientos.bultosReubicados, 0)} un.
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold block flex items-center justify-center gap-1">
                  {resumenMovimientos.totalDiferencias > 0 && (
                    <AlertTriangle className="w-3 h-3 text-amber-600 inline" />
                  )}
                  Diferencias & Ajustes
                </span>
                <span className="text-base font-black text-amber-700">
                  {resumenMovimientos.totalDiferencias} reg.
                </span>
                <span className="text-[9px] text-slate-600 font-bold block">
                  +{resumenMovimientos.bultosAjustesPos} / -{resumenMovimientos.bultosAjustesNeg} un.
                </span>
              </div>
            </div>

            {/* Tabla Detallada de Movimientos */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-r border-slate-300 w-32">Fecha y Hora</th>
                    <th className="p-2 border-r border-slate-300 w-24 text-center">Tipo</th>
                    <th className="p-2 border-r border-slate-300 w-24">SKU</th>
                    <th className="p-2 border-r border-slate-300">Artículo</th>
                    <th className="p-2 border-r border-slate-300">Cliente</th>
                    <th className="p-2 border-r border-slate-300 w-20">Lote</th>
                    <th className="p-2 border-r border-slate-300 text-center w-28">Origen &rarr; Destino</th>
                    <th className="p-2 border-r border-slate-300 text-right w-20">Cant.</th>
                    <th className="p-2 border-r border-slate-300 text-right w-20">M³</th>
                    <th className="p-2 border-r border-slate-300 w-24">Documento</th>
                    <th className="p-2 min-w-[220px]">Observaciones / Diferencias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dataMovimientos.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500 italic">
                        No se encontraron movimientos registrados con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    dataMovimientos.map((k, idx) => (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          k.esDiferencia
                            ? k.tipoDiferencia === 'sobrante'
                              ? 'bg-teal-50/60 hover:bg-teal-100/60 border-l-4 border-l-teal-600'
                              : k.tipoDiferencia === 'faltante'
                              ? 'bg-rose-50/60 hover:bg-rose-100/60 border-l-4 border-l-rose-600'
                              : 'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-500'
                            : idx % 2 === 1
                            ? 'bg-slate-50/70 hover:bg-slate-100/60'
                            : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-1.5 font-mono border-r border-slate-300 text-[10px] text-slate-600 whitespace-nowrap">
                          {k.fecha}
                        </td>
                        <td className="p-1.5 text-center border-r border-slate-300 whitespace-nowrap">
                          {getTipoMovimientoBadge(k.tipo)}
                        </td>
                        <td className="p-1.5 font-mono font-bold border-r border-slate-300 text-slate-900">
                          {k.sku}
                        </td>
                        <td className="p-1.5 border-r border-slate-300 font-medium">
                          {k.articulo}
                        </td>
                        <td className="p-1.5 border-r border-slate-300 text-slate-700">
                          {k.cliente}
                        </td>
                        <td className="p-1.5 border-r border-slate-300 font-mono text-[10px]">
                          {k.lote}
                        </td>
                        <td className="p-1.5 border-r border-slate-300 text-center font-mono text-[10px]">
                          <span className="text-slate-600">{k.origen}</span> &rarr;{' '}
                          <span className="font-bold text-slate-900">{k.destino}</span>
                        </td>
                        <td className="p-1.5 text-right font-mono border-r border-slate-300 font-bold text-slate-900">
                          {formatNumber(k.cantidad, 0)}
                        </td>
                        <td className="p-1.5 text-right font-mono border-r border-slate-300 text-sky-800">
                          {formatM3(k.volumenM3)}
                        </td>
                        <td className="p-1.5 font-mono text-[10px] border-r border-slate-300 text-slate-600">
                          {k.documento}
                        </td>
                        <td className="p-1.5 text-slate-700 text-[11px]">
                          {k.esDiferencia ? (
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                  k.tipoDiferencia === 'sobrante'
                                    ? 'bg-teal-100 text-teal-900 border border-teal-300'
                                    : k.tipoDiferencia === 'faltante'
                                    ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {k.tipoDiferencia === 'sobrante' && '▲ '}
                                {k.tipoDiferencia === 'faltante' && '▼ '}
                                {k.tipoDiferencia === 'observacion' && '⚠️ '}
                                {k.diferenciaBadge}
                              </span>
                              {k.notasOriginal && (
                                <p className="text-[10px] text-slate-600 italic leading-snug">
                                  {k.notasOriginal}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[10px]">{k.notasOriginal || '-'}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {dataMovimientos.length > 0 && (
                  <tfoot className="bg-slate-100 font-mono font-bold border-t-2 border-slate-900">
                    <tr>
                      <td colSpan={7} className="p-2 text-right border-r border-slate-300 uppercase">
                        Total Movimientos Listados: {dataMovimientos.length}
                      </td>
                      <td className="p-2 text-right border-r border-slate-300 font-black text-slate-950">
                        {formatNumber(dataMovimientos.reduce((acc, d) => acc + d.cantidad, 0), 0)}
                      </td>
                      <td className="p-2 text-right border-r border-slate-300 text-sky-900 font-black">
                        {formatM3(dataMovimientos.reduce((acc, d) => acc + d.volumenM3, 0))}
                      </td>
                      <td colSpan={2} className="p-2"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------------- */}
        {/* CASO 3: REPORTE DE LIQUIDACIÓN 3PL                                      */}
        {/* ----------------------------------------------------------------------- */}
        {activeReport === 'liquidacion' && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-r border-slate-300">Cliente Depositante</th>
                    <th className="p-2 border-r border-slate-300">RUT / CUIT</th>
                    <th className="p-2 border-r border-slate-300">Unidad Negocio</th>
                    <th className="p-2 border-r border-slate-300 text-center">Bultos</th>
                    <th className="p-2 border-r border-slate-300 text-center">Pallets LPN</th>
                    <th className="p-2 border-r border-slate-300 text-right">Volumen M³</th>
                    <th className="p-2 border-r border-slate-300 text-right">% Depósito</th>
                    <th className="p-2 border-r border-slate-300 text-right">Tarifa ($/M³/Día)</th>
                    <th className="p-2 text-right">Subtotal Liquidación ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {dataLiquidacion.map((c, idx) => (
                    <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                      <td className="p-2 font-bold border-r border-slate-300">{c.cliente}</td>
                      <td className="p-2 font-mono border-r border-slate-300">{c.cuit}</td>
                      <td className="p-2 border-r border-slate-300">{c.unidadNegocio}</td>
                      <td className="p-2 text-center font-mono border-r border-slate-300 font-semibold">{c.totalBultos}</td>
                      <td className="p-2 text-center font-mono border-r border-slate-300">{c.totalPallets}</td>
                      <td className="p-2 text-right font-mono border-r border-slate-300 font-bold text-sky-800">{formatM3(c.totalM3)}</td>
                      <td className="p-2 text-right font-mono border-r border-slate-300">{c.porcentajeOcupacion}%</td>
                      <td className="p-2 text-right font-mono border-r border-slate-300">${c.tarifaDiariaM3}</td>
                      <td className="p-2 text-right font-mono font-extrabold text-emerald-800">
                        ${formatNumber(c.importeEstimado, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Billing Summary Box */}
            <div className="grid grid-cols-3 gap-4 border border-slate-900 rounded-xl p-3.5 bg-slate-50 font-mono text-center">
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold">Total M³ Facturables</span>
                <div className="text-base font-extrabold text-sky-800">
                  {formatM3(dataLiquidacion.reduce((acc, d) => acc + d.totalM3, 0))}
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold">Período de Liquidación</span>
                <div className="text-base font-extrabold text-slate-900">
                  {diasPeriodo} días corridos
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 font-bold">Total Facturación Sugerida</span>
                <div className="text-base font-extrabold text-emerald-800">
                  ${formatNumber(dataLiquidacion.reduce((acc, d) => acc + d.importeEstimado, 0), 2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bloque Oficial de Firmas y Validación de Auditoría */}
        <div className="mt-8 pt-4 border-t-2 border-slate-300 grid grid-cols-3 gap-6 text-[10px] text-slate-600 font-mono text-center">
          <div className="border-t border-dashed border-slate-400 pt-2">
            <span className="block font-bold text-slate-900">Responsable de Inventario</span>
            <span>Control Físico y Auditoría</span>
          </div>
          <div className="border-t border-dashed border-slate-400 pt-2">
            <span className="block font-bold text-slate-900">Supervisión Operativa WMS</span>
            <span>Validación de Movimientos</span>
          </div>
          <div className="border-t border-dashed border-slate-400 pt-2">
            <span className="block font-bold text-slate-900">Administración & Logística 3PL</span>
            <span>Conformidad Operativa</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 flex justify-between text-[9px] text-slate-400 font-mono">
          <span>Documento emitido electrónicamente por OpenWMS 3PL Logistics System &copy; 2026</span>
          <span>Página 1 de 1</span>
        </div>
      </div>
    </div>
  );
};
