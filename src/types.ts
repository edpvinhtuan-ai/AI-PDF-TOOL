export type ActiveTab = 'merge' | 'split' | 'compress' | 'edit' | 'to-word' | 'to-excel';

export type PdfEditTool = 'select' | 'text' | 'whiteout' | 'draw' | 'highlight' | 'rect' | 'signature' | 'stamp';

export interface PdfAnnotation {
  id: string;
  pageNumber: number; // 1-indexed original page number
  type: 'text' | 'whiteout' | 'draw' | 'highlight' | 'rect' | 'image';
  // Normalized coordinates (0 to 1) relative to currently displayed page box
  x: number;
  y: number;
  width: number;
  height: number;
  // Text / Whiteout / Stamp properties
  text?: string;
  fontSize?: number; // in PDF pt (e.g. 14)
  fontWeight?: 'normal' | 'bold';
  color?: string; // hex e.g. '#111827'
  backgroundColor?: string; // hex e.g. '#ffffff' or 'transparent'
  borderColor?: string;
  // Freehand / Highlight path points (normalized 0..1)
  points?: { x: number; y: number }[];
  strokeWidth?: number;
  opacity?: number;
  // Image / Signature dataUrl
  imageDataUrl?: string;
}

export interface PageEditState {
  originalPageNumber: number; // 1-indexed
  rotation: number; // 0, 90, 180, 270 added rotation
  deleted: boolean;
}

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
