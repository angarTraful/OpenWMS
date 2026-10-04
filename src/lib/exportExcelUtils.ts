/**
 * Utilidades para exportación de reportes a Excel (.xls Spreadsheet XML) y CSV con UTF-8 BOM
 * Compatible directamente con Microsoft Excel, Google Sheets y LibreOffice Calc.
 */

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number; // Ancho aproximado en caracteres
  type?: 'string' | 'number' | 'date';
  align?: 'left' | 'center' | 'right';
}

export interface ExcelExportOptions {
  filename: string;
  sheetName: string;
  title: string;
  subtitle?: string;
  columns: ExcelColumn[];
  rows: any[];
  summary?: { label: string; value: string | number }[];
}

export interface StockTemplateRow {
  sku: string;
  descripcion: string;
  familia: string;
  loteIc: string;
  despachoRmx: string;
  enReserva: number;
  m3: number;
  cantidad: number;
}

export interface StockTemplateOptions {
  filename: string;
  clienteNombre: string;
  fechaHora?: string;
  enPedidos: number;
  m3Total: number;
  stockTotal: number;
  rows: StockTemplateRow[];
}

/**
 * Exporta el reporte de stock con la plantilla visual requerida por el operador:
 * - Fila 3: "Cliente: [Nombre Cliente] ([Razón Social])"
 * - Fila 5: "Inventario al dia: [Fecha]" + bloque superior derecho con "En Pedidos | M3 TOTAL | STOCK EN TOTAL"
 * - Fila 6: Valores sumarios con borde negro continuo y número destacado
 * - Fila 7: Cabeceras grises (#D9D9D9) con borde continuo: SKU, Descripcion Articulo, Familia, Lote / IC, Despacho RMx, En Reserva, M3, Cantidad
 * - Filas 8+: Datos tabulares con alineación y formato exactos.
 */
export function exportStockTemplateExcel(options: StockTemplateOptions): void {
  const {
    filename,
    clienteNombre,
    fechaHora = new Date().toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    enPedidos,
    m3Total,
    stockTotal,
    rows,
  } = options;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <!-- Metadata Styles -->
  <Style ss:ID="ClientLabel">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="ClientValue">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Italic="1" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="DateLabel">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="DateValue">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <!-- Top Summary Box Styles -->
  <Style ss:ID="BoxTopHeader">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
  </Style>
  <Style ss:ID="BoxTopValueDec">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
  </Style>
  <Style ss:ID="BoxTopValueTotal">
   <Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
  </Style>
  <!-- Table Header Gray Style -->
  <Style ss:ID="GrayTableHeader">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#000000"/>
   <Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F7F7F"/>
   </Borders>
  </Style>
  <!-- Data Cell Styles -->
  <Style ss:ID="TCellSku">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="TCellDesc">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="TCellCenter">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="TCellReserva">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="TCellM3">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
  <Style ss:ID="TCellCantidad">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Stock">
  <Table ss:DefaultRowHeight="20">
   <Column ss:AutoFitWidth="0" ss:Width="130"/> <!-- SKU -->
   <Column ss:AutoFitWidth="0" ss:Width="290"/> <!-- Descripcion Articulo -->
   <Column ss:AutoFitWidth="0" ss:Width="105"/> <!-- Familia -->
   <Column ss:AutoFitWidth="0" ss:Width="95"/>  <!-- Lote / IC -->
   <Column ss:AutoFitWidth="0" ss:Width="190"/> <!-- Despacho RMx -->
   <Column ss:AutoFitWidth="0" ss:Width="85"/>  <!-- En Reserva -->
   <Column ss:AutoFitWidth="0" ss:Width="80"/>  <!-- M3 -->
   <Column ss:AutoFitWidth="0" ss:Width="95"/>  <!-- Cantidad -->

   <!-- Row 1: Blank Spacer -->
   <Row ss:Height="14"/>
   <!-- Row 2: Blank Spacer -->
   <Row ss:Height="14"/>

   <!-- Row 3: Cliente -->
   <Row ss:Height="22">
    <Cell ss:Index="2" ss:StyleID="ClientLabel"><Data ss:Type="String">Cliente:</Data></Cell>
    <Cell ss:Index="3" ss:MergeAcross="2" ss:StyleID="ClientValue"><Data ss:Type="String">${escapeXml(clienteNombre)}</Data></Cell>
   </Row>

   <!-- Row 4: Blank Spacer -->
   <Row ss:Height="12"/>

   <!-- Row 5: Inventario al dia + Box Top Headers -->
   <Row ss:Height="20">
    <Cell ss:Index="2" ss:StyleID="DateLabel"><Data ss:Type="String">Inventario al dia:</Data></Cell>
    <Cell ss:Index="3" ss:MergeAcross="1" ss:StyleID="DateValue"><Data ss:Type="String">${escapeXml(fechaHora)}</Data></Cell>
    <Cell ss:Index="6" ss:StyleID="BoxTopHeader"><Data ss:Type="String">En Pedidos</Data></Cell>
    <Cell ss:Index="7" ss:StyleID="BoxTopHeader"><Data ss:Type="String">M3 TOTAL</Data></Cell>
    <Cell ss:Index="8" ss:StyleID="BoxTopHeader"><Data ss:Type="String">STOCK EN TOTAL</Data></Cell>
   </Row>

   <!-- Row 6: Box Top Values -->
   <Row ss:Height="24">
    <Cell ss:Index="6" ss:StyleID="BoxTopValueDec"><Data ss:Type="Number">${Number(enPedidos.toFixed(2))}</Data></Cell>
    <Cell ss:Index="7" ss:StyleID="BoxTopValueDec"><Data ss:Type="Number">${Number(m3Total.toFixed(2))}</Data></Cell>
    <Cell ss:Index="8" ss:StyleID="BoxTopValueTotal"><Data ss:Type="Number">${Math.round(stockTotal)}</Data></Cell>
   </Row>

   <!-- Row 7: Gray Table Headers -->
   <Row ss:Height="24">
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">SKU</Data></Cell>
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">Descripcion Articulo</Data></Cell>
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">Familia</Data></Cell>
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">Lote / IC</Data></Cell>
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">Despacho RMx</Data></Cell>
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">En Reserva</Data></Cell>
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">M3</Data></Cell>
    <Cell ss:StyleID="GrayTableHeader"><Data ss:Type="String">Cantidad</Data></Cell>
   </Row>
`;

  // Rows 8+: Data rows
  rows.forEach((row) => {
    xml += `   <Row ss:Height="20">
    <Cell ss:StyleID="TCellSku"><Data ss:Type="String">${escapeXml(row.sku || '')}</Data></Cell>
    <Cell ss:StyleID="TCellDesc"><Data ss:Type="String">${escapeXml(row.descripcion || '')}</Data></Cell>
    <Cell ss:StyleID="TCellCenter"><Data ss:Type="String">${escapeXml(row.familia || '')}</Data></Cell>
    <Cell ss:StyleID="TCellCenter"><Data ss:Type="String">${escapeXml(row.loteIc || '')}</Data></Cell>
    <Cell ss:StyleID="TCellCenter"><Data ss:Type="String">${escapeXml(row.despachoRmx || '')}</Data></Cell>
    <Cell ss:StyleID="TCellReserva"><Data ss:Type="Number">${Number(row.enReserva || 0)}</Data></Cell>
    <Cell ss:StyleID="TCellM3"><Data ss:Type="Number">${Number((row.m3 || 0).toFixed(2))}</Data></Cell>
    <Cell ss:StyleID="TCellCantidad"><Data ss:Type="Number">${Number(row.cantidad || 0)}</Data></Cell>
   </Row>\n`;
  });

  xml += `  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <AutoFilter x:Range="R7C1:R${rows.length + 7}C8" xmlns="urn:schemas-microsoft-com:office:excel"/>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  const cleanFilename = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  triggerDownload(blob, cleanFilename);
}

/**
 * Genera un archivo Excel general en formato XML Spreadsheet 2003 (.xls).
 * Permite encabezados con estilo, negrita, anchos de columna, tipos de datos correctos
 * y bloques de resumen sin necesidad de librerías externas pesadas.
 */
export function exportToExcelXML(options: ExcelExportOptions): void {
  const { filename, sheetName, title, subtitle, columns, rows, summary } = options;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#1e293b"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="SubtitleStyle">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Italic="1" ss:Color="#64748b"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#ffffff"/>
   <Interior ss:Color="#4f46e5" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#312e81"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#6366f1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#6366f1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#312e81"/>
   </Borders>
  </Style>
  <Style ss:ID="CellLeft">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellRight">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
   </Borders>
  </Style>
  <Style ss:ID="SummaryHeader">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0f172a"/>
   <Interior ss:Color="#f1f5f9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
   </Borders>
  </Style>
  <Style ss:ID="SummaryValue">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#4f46e5"/>
   <Interior ss:Color="#f1f5f9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#cbd5e1"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table ss:DefaultRowHeight="20">
`;

  // Column specifications
  columns.forEach((col) => {
    const width = col.width ? col.width * 7.5 : 120;
    xml += `   <Column ss:AutoFitWidth="1" ss:Width="${width}"/>\n`;
  });

  // Title Row
  xml += `   <Row ss:Height="26">
    <Cell ss:MergeAcross="${columns.length - 1}" ss:StyleID="TitleStyle">
     <Data ss:Type="String">${escapeXml(title)}</Data>
    </Cell>
   </Row>\n`;

  // Subtitle / Date Row
  const nowStr = new Date().toLocaleString('es-AR');
  const fullSub = subtitle ? `${subtitle} | Generado el: ${nowStr}` : `Generado el: ${nowStr}`;
  xml += `   <Row ss:Height="18">
    <Cell ss:MergeAcross="${columns.length - 1}" ss:StyleID="SubtitleStyle">
     <Data ss:Type="String">${escapeXml(fullSub)}</Data>
    </Cell>
   </Row>\n`;

  // Summary Tiles (if provided)
  if (summary && summary.length > 0) {
    xml += `   <Row ss:Height="8"/>\n`; // Empty spacer
    summary.forEach((item) => {
      xml += `   <Row ss:Height="20">
    <Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">${escapeXml(item.label)}</Data></Cell>
    <Cell ss:StyleID="SummaryValue"><Data ss:Type="${typeof item.value === 'number' ? 'Number' : 'String'}">${escapeXml(String(item.value))}</Data></Cell>
   </Row>\n`;
    });
    xml += `   <Row ss:Height="12"/>\n`; // Empty spacer
  } else {
    xml += `   <Row ss:Height="10"/>\n`;
  }

  // Header Row
  xml += `   <Row ss:Height="24">\n`;
  columns.forEach((col) => {
    xml += `    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${escapeXml(col.header)}</Data></Cell>\n`;
  });
  xml += `   </Row>\n`;

  // Data Rows
  rows.forEach((row) => {
    xml += `   <Row ss:Height="20">\n`;
    columns.forEach((col) => {
      const rawVal = row[col.key];
      const align = col.align || (col.type === 'number' ? 'right' : col.type === 'date' ? 'center' : 'left');
      const styleId = align === 'right' ? 'CellRight' : align === 'center' ? 'CellCenter' : 'CellLeft';

      if (rawVal === undefined || rawVal === null || rawVal === '') {
        xml += `    <Cell ss:StyleID="${styleId}"><Data ss:Type="String">-</Data></Cell>\n`;
      } else if (col.type === 'number' && !isNaN(Number(rawVal))) {
        xml += `    <Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${Number(rawVal)}</Data></Cell>\n`;
      } else {
        xml += `    <Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(String(rawVal))}</Data></Cell>\n`;
      }
    });
    xml += `   </Row>\n`;
  });

  xml += `  </Table>
 </Worksheet>
</Workbook>`;

  const cleanFilename = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  triggerDownload(blob, cleanFilename);
}

/**
 * Genera un archivo CSV con delimitador ';' y cabecera BOM UTF-8 (\uFEFF)
 * para apertura automática en Excel sin problemas de tildes ni caracteres especiales.
 */
export function exportToCSV(options: {
  filename: string;
  columns: { header: string; key: string }[];
  rows: any[];
}): void {
  const { filename, columns, rows } = options;

  const headerLine = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(';');
  const rowLines = rows.map((r) =>
    columns
      .map((c) => {
        const val = r[c.key];
        if (val === undefined || val === null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(';')
  );

  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
  const cleanFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, cleanFilename);
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
