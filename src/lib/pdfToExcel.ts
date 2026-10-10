import * as XLSX from 'xlsx';
import { pdfjsLib } from './pdfWorker';
import { PdfToExcelMode, PdfToExcelResult } from '../types';

interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface RowItem {
  y: number;
  cells: { x: number; text: string; width: number }[];
}

/**
 * Parses numeric strings including currency/thousands formatted like "1,234.50" or "1.500.000"
 */
function parseSmartValue(raw: string): string | number {
  const str = raw.trim();
  if (!str) return '';

  // If starts with leading zero and has multiple digits without dot, keep as string (e.g. phone number or code '012345')
  if (/^0\d+$/.test(str)) {
    return str;
  }

  // Standard integer
  if (/^-?\d+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num) && Number.isSafeInteger(num)) return num;
  }

  // Standard decimal: e.g. 1234.56 or -12.5
  if (/^-?\d+\.\d+$/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) return num;
  }

  // US formatted number: 1,234,567.89
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    const clean = str.replace(/,/g, '');
    const num = Number(clean);
    if (!isNaN(num)) return num;
  }

  // VN/EU formatted number: 1.234.567,89
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    const clean = str.replace(/\./g, '').replace(',', '.');
    const num = Number(clean);
    if (!isNaN(num)) return num;
  }

  // Percentage e.g. "15%" or "12.5%"
  if (/^-?\d+(\.\d+)?%$/.test(str)) {
    const num = Number(str.replace('%', ''));
    if (!isNaN(num)) return num / 100;
  }

  return str;
}

/**
 * Extracts rows and intelligent columns from a PDF page
 */
function extractPageGrid(items: RawItem[]): (string | number)[][] {
  if (items.length === 0) return [];

  // 1. Group items into rows by Y coordinate (within vertical tolerance)
  const rowBuckets: { y: number; items: RawItem[] }[] = [];
  const sortedByY = [...items].sort((a, b) => b.y - a.y);

  for (const item of sortedByY) {
    if (!item.str || item.str.trim() === '') continue;

    const tolerance = Math.max(3.5, item.fontSize * 0.4);
    const bucket = rowBuckets.find((b) => Math.abs(b.y - item.y) <= tolerance);
    if (bucket) {
      bucket.items.push(item);
    } else {
      rowBuckets.push({ y: item.y, items: [item] });
    }
  }

  // Sort rows from top to bottom
  rowBuckets.sort((a, b) => b.y - a.y);

  // 2. In each row, merge items that are immediately adjacent into single cells
  const preliminaryRows: RowItem[] = [];
  const allCellXPositions: number[] = [];

  for (const row of rowBuckets) {
    row.items.sort((a, b) => a.x - b.x);

    const cells: { x: number; text: string; width: number }[] = [];
    let currentCell: { x: number; text: string; endX: number; fontSize: number } | null = null;

    for (const item of row.items) {
      const text = item.str;
      const endX = item.x + (item.width || text.length * (item.fontSize * 0.5));

      if (!currentCell) {
        currentCell = { x: item.x, text, endX, fontSize: item.fontSize };
      } else {
        const gap = item.x - currentCell.endX;
        // If items are very close (gap < fontSize * 0.55), they belong to the same word or cell
        if (gap <= Math.max(4, currentCell.fontSize * 0.55)) {
          // Check if space needed
          const needSpace = gap > 1.5 && !currentCell.text.endsWith(' ') && !text.startsWith(' ');
          currentCell.text += (needSpace ? ' ' : '') + text;
          currentCell.endX = endX;
        } else {
          // Push previous cell and start a new cell
          cells.push({
            x: currentCell.x,
            text: currentCell.text.trim(),
            width: currentCell.endX - currentCell.x,
          });
          currentCell = { x: item.x, text, endX, fontSize: item.fontSize };
        }
      }
    }

    if (currentCell && currentCell.text.trim().length > 0) {
      cells.push({
        x: currentCell.x,
        text: currentCell.text.trim(),
        width: currentCell.endX - currentCell.x,
      });
    }

    if (cells.length > 0) {
      preliminaryRows.push({ y: row.y, cells });
      for (const c of cells) {
        allCellXPositions.push(c.x);
      }
    }
  }

  if (preliminaryRows.length === 0) return [];

  // 3. Cluster X positions to detect column boundaries across the table
  allCellXPositions.sort((a, b) => a - b);
  const columnClusters: { x: number; count: number }[] = [];

  for (const x of allCellXPositions) {
    const cluster = columnClusters.find((c) => Math.abs(c.x - x) <= 18);
    if (cluster) {
      cluster.x = (cluster.x * cluster.count + x) / (cluster.count + 1);
      cluster.count++;
    } else {
      columnClusters.push({ x, count: 1 });
    }
  }

  // Filter significant columns (cluster appears at least twice, or if few rows)
  const minOccurrences = Math.min(2, Math.max(1, Math.floor(preliminaryRows.length * 0.08)));
  const distinctColumns = columnClusters
    .filter((c) => c.count >= minOccurrences)
    .map((c) => c.x)
    .sort((a, b) => a - b);

  // If column clustering resulted in too few columns compared to row cells, fallback to row positions
  const maxRowCellCount = Math.max(...preliminaryRows.map((r) => r.cells.length));

  if (distinctColumns.length === 0 || distinctColumns.length < Math.floor(maxRowCellCount * 0.7)) {
    // Direct sequential mapping fallback
    return preliminaryRows.map((row) => row.cells.map((c) => parseSmartValue(c.text)));
  }

  // 4. Map each cell in each row into the corresponding column index
  const grid: (string | number)[][] = [];

  for (const row of preliminaryRows) {
    const rowValues: (string | number)[] = new Array(distinctColumns.length).fill('');

    for (const cell of row.cells) {
      // Find closest column index
      let bestColIdx = 0;
      let minDiff = Infinity;

      for (let i = 0; i < distinctColumns.length; i++) {
        const diff = Math.abs(distinctColumns[i] - cell.x);
        if (diff < minDiff) {
          minDiff = diff;
          bestColIdx = i;
        }
      }

      const parsed = parseSmartValue(cell.text);

      if (rowValues[bestColIdx] === '') {
        rowValues[bestColIdx] = parsed;
      } else {
        // If column already occupied, append or place in adjacent empty column
        if (bestColIdx + 1 < distinctColumns.length && rowValues[bestColIdx + 1] === '') {
          rowValues[bestColIdx + 1] = parsed;
        } else {
          rowValues[bestColIdx] = `${rowValues[bestColIdx]} ${parsed}`;
        }
      }
    }

    // Trim trailing empty cells
    while (rowValues.length > 0 && (rowValues[rowValues.length - 1] === '' || rowValues[rowValues.length - 1] === null)) {
      rowValues.pop();
    }

    if (rowValues.length > 0) {
      grid.push(rowValues);
    }
  }

  return grid;
}

/**
 * Converts a PDF ArrayBuffer into an Excel (.xlsx) workbook.
 */
export async function convertPdfToExcel(
  arrayBuffer: ArrayBuffer,
  options: {
    mode?: PdfToExcelMode;
    pageNumbers?: number[];
    fileName?: string;
    onProgress?: (percent: number, statusText: string) => void;
  } = {}
): Promise<PdfToExcelResult> {
  const { mode = 'smart-table', pageNumbers, fileName = 'bang-tinh-chuyen-doi.xlsx', onProgress } = options;

  onProgress?.(5, 'Đang phân tích cấu trúc bảng biểu trong PDF...');

  const bufferCopy = arrayBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;
  const totalDocPages = pdfDoc.numPages;

  const targetPages = pageNumbers && pageNumbers.length > 0
    ? pageNumbers.filter((p) => p >= 1 && p <= totalDocPages)
    : Array.from({ length: totalDocPages }, (_, i) => i + 1);

  if (targetPages.length === 0) {
    throw new Error('Không có trang nào hợp lệ để trích xuất bảng tính Excel.');
  }

  const workbook = XLSX.utils.book_new();
  const pageGrids: { pageNum: number; grid: (string | number)[][] }[] = [];

  let totalExtractedRows = 0;
  let maxColsAcrossAll = 0;

  for (let idx = 0; idx < targetPages.length; idx++) {
    const pageNum = targetPages[idx];
    const currentPercent = 10 + Math.round((idx / targetPages.length) * 70);
    onProgress?.(
      currentPercent,
      `Đang trích xuất dữ liệu bảng trang ${idx + 1}/${targetPages.length} (Trang gốc ${pageNum})...`
    );

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const rawItems: RawItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const transform = item.transform; // [sx, ky, kx, sy, tx, ty]
        const fontSize = Math.hypot(transform[0], transform[1]) || Math.abs(transform[3]) || 12;
        rawItems.push({
          str: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width || 0,
          height: item.height || fontSize,
          fontSize,
        });
      }
    }

    const grid = extractPageGrid(rawItems);
    pageGrids.push({ pageNum, grid });

    totalExtractedRows += grid.length;
    for (const r of grid) {
      if (r.length > maxColsAcrossAll) {
        maxColsAcrossAll = r.length;
      }
    }
  }

  onProgress?.(85, 'Đang cấu trúc các trang tính và định dạng cột Excel...');

  const sheetNames: string[] = [];
  let masterPreviewData: (string | number)[][] = [];

  if (mode === 'page-per-sheet') {
    // Each PDF page becomes its own sheet
    for (const item of pageGrids) {
      const sheetName = `Trang ${item.pageNum}`;
      sheetNames.push(sheetName);

      const rows = item.grid.length > 0 ? item.grid : [['(Không tìm thấy dữ liệu bảng biểu trên trang này)']];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);

      // Auto-fit column widths
      autoFitColumnWidths(worksheet, rows);

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }
    masterPreviewData = pageGrids[0]?.grid || [];
  } else {
    // 'smart-table' or 'raw-grid': Combine all pages into one continuous spreadsheet
    const combinedRows: (string | number)[][] = [];

    for (let pIdx = 0; pIdx < pageGrids.length; pIdx++) {
      const { pageNum, grid } = pageGrids[pIdx];

      if (targetPages.length > 1) {
        combinedRows.push([`--- [TÀI LIỆU PDF - TRANG ${pageNum}] ---`]);
      }

      if (grid.length === 0) {
        combinedRows.push(['(Trang này không có dữ liệu văn bản dạng bảng)']);
      } else {
        for (const row of grid) {
          combinedRows.push(row);
        }
      }

      if (pIdx < pageGrids.length - 1 && targetPages.length > 1) {
        combinedRows.push([]); // Empty row as visual separator between pages
      }
    }

    const sheetName = 'Du_lieu_PDF';
    sheetNames.push(sheetName);
    const worksheet = XLSX.utils.aoa_to_sheet(combinedRows);

    autoFitColumnWidths(worksheet, combinedRows);

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    masterPreviewData = combinedRows;
  }

  onProgress?.(95, 'Đang xuất tệp Microsoft Excel (.xlsx)...');

  const excelBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  });

  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const blobUrl = URL.createObjectURL(blob);

  const cleanDownloadName = fileName.toLowerCase().endsWith('.xlsx')
    ? fileName
    : `${fileName.replace(/\.pdf$/i, '')}.xlsx`;

  onProgress?.(100, 'Chuyển đổi sang Excel hoàn tất!');

  return {
    blob,
    blobUrl,
    downloadName: cleanDownloadName,
    size: blob.size,
    totalPages: targetPages.length,
    totalRows: totalExtractedRows,
    totalColumns: maxColsAcrossAll,
    sheetCount: sheetNames.length,
    previewSheetData: masterPreviewData.slice(0, 30), // first 30 rows for preview
    sheetNames,
  };
}

/**
 * Computes and applies optimal column widths for an XLSX worksheet
 */
function autoFitColumnWidths(ws: XLSX.WorkSheet, rows: (string | number)[][]) {
  const colWidths: number[] = [];

  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] ?? '');
      // If it's a page separator row, don't let it blow up column width
      if (cellVal.startsWith('--- [TÀI LIỆU PDF')) continue;

      const len = Math.min(50, cellVal.length);
      colWidths[c] = Math.max(colWidths[c] || 10, len);
    }
  }

  ws['!cols'] = colWidths.map((w) => ({ wch: Math.min(50, Math.max(10, w + 3)) }));
}
