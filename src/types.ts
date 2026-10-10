export type ActiveTab = 'compress' | 'split' | 'merge' | 'to-word' | 'to-excel';

export type CompressionLevel = 'lossless' | 'recommended' | 'extreme';

export type PdfToWordMode = 'standard' | 'with-visuals' | 'raw-text';

export interface PdfToWordResult {
  blob: Blob;
  blobUrl: string;
  downloadName: string;
  size: number;
  totalPages: number;
  totalWords: number;
  totalCharacters: number;
  previewSnippet: string;
}

export type PdfToExcelMode = 'smart-table' | 'page-per-sheet' | 'raw-grid';

export interface PdfToExcelResult {
  blob: Blob;
  blobUrl: string;
  downloadName: string;
  size: number;
  totalPages: number;
  totalRows: number;
  totalColumns: number;
  sheetCount: number;
  previewSheetData: (string | number | boolean | null)[][];
  sheetNames: string[];
}

export interface PageThumbnail {
  pageNumber: number; // 1-indexed
  dataUrl?: string;
  width: number;
  height: number;
  rotation: number;
}

export interface LoadedPdf {
  id: string;
  name: string;
  size: number;
  totalPages: number;
  arrayBuffer: ArrayBuffer;
  bytes?: Uint8Array;
  file?: File;
  thumbnails?: PageThumbnail[];
}

export interface SplitRange {
  from: number;
  to: number;
}

export type SplitAction = 'extract_selected' | 'separate_all' | 'remove_selected';

export interface MergeItem {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  arrayBuffer: ArrayBuffer;
  bytes?: Uint8Array;
  file?: File;
  firstPageThumb?: string;
}

export interface ProcessProgress {
  isProcessing: boolean;
  statusText: string;
  percent: number;
}
