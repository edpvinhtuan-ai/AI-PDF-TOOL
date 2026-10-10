import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  RotateCcw,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  AlertCircle,
  Eye,
  Table,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { LoadedPdf, PdfToExcelMode, PdfToExcelResult, ProcessProgress } from '../types';
import { downloadBlob, formatBytes, parsePageRanges } from '../lib/pdfUtils';
import { convertPdfToExcel } from '../lib/pdfToExcel';
import { DropZone } from './DropZone';

interface PdfToExcelViewProps {
  loadedPdf: LoadedPdf | null;
  onSetLoadedPdf: (pdf: LoadedPdf | null) => void;
  onOpenPreview: (data: { title: string; pdfBlobUrl?: string }) => void;
}

export const PdfToExcelView: React.FC<PdfToExcelViewProps> = ({
  loadedPdf,
  onSetLoadedPdf,
  onOpenPreview,
}) => {
  const [mode, setMode] = useState<PdfToExcelMode>('smart-table');
  const [pageScope, setPageScope] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState<string>('');
  const [outputFileName, setOutputFileName] = useState<string>('');
  const [progress, setProgress] = useState<ProcessProgress>({
    isProcessing: false,
    statusText: '',
    percent: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadTriggered, setDownloadTriggered] = useState(false);
  const [excelResult, setExcelResult] = useState<PdfToExcelResult | null>(null);

  const resultRef = useRef<HTMLDivElement | null>(null);

  // Set default output file name when PDF changes
  useEffect(() => {
    if (loadedPdf) {
      const baseName = loadedPdf.name.replace(/\.pdf$/i, '');
      setOutputFileName(`${baseName}.xlsx`);
      setExcelResult(null);
      setErrorMessage(null);
      setDownloadTriggered(false);
    }
  }, [loadedPdf]);

  // Scroll to result when ready
  useEffect(() => {
    if (excelResult && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [excelResult]);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setExcelResult(null);
    setDownloadTriggered(false);

    const file = files[0];
    const arrayBuffer = await file.arrayBuffer();

    const { PDFDocument } = await import('pdf-lib');
    try {
      const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      onSetLoadedPdf({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        totalPages: doc.getPageCount(),
        arrayBuffer,
      });
    } catch {
      setErrorMessage(
        'Không thể đọc tệp PDF. Tệp có thể có mật khẩu bảo vệ hoặc định dạng bị lỗi.'
      );
    }
  };

  const handleStartConversion = async () => {
    if (!loadedPdf) return;

    setErrorMessage(null);
    setDownloadTriggered(false);

    let targetPages: number[] | undefined = undefined;
    if (pageScope === 'custom') {
      const parsed = parsePageRanges(customRange, loadedPdf.totalPages);
      if (parsed.length === 0) {
        setErrorMessage(
          `Khoảng trang không hợp lệ. Vui lòng nhập trong khoảng 1 đến ${loadedPdf.totalPages} (Ví dụ: 1-3, 5).`
        );
        return;
      }
      targetPages = parsed;
    }

    setProgress({
      isProcessing: true,
      statusText: 'Đang chuẩn bị phân tích tệp PDF...',
      percent: 5,
    });

    try {
      const cleanName = outputFileName.trim().toLowerCase().endsWith('.xlsx')
        ? outputFileName.trim()
        : `${outputFileName.trim() || 'bang-tinh'}.xlsx`;

      const result = await convertPdfToExcel(loadedPdf.arrayBuffer, {
        mode,
        pageNumbers: targetPages,
        fileName: cleanName,
        onProgress: (percent, statusText) => {
          setProgress({
            isProcessing: true,
            statusText,
            percent,
          });
        },
      });

      setExcelResult(result);
    } catch (err: unknown) {
      console.error('Lỗi chuyển đổi PDF sang Excel:', err);
      const msg = err instanceof Error ? err.message : 'Đã xảy ra lỗi trong quá trình chuyển đổi sang Excel.';
      setErrorMessage(msg);
    } finally {
      setProgress({
        isProcessing: false,
        statusText: '',
        percent: 0,
      });
    }
  };

  const handleDownload = () => {
    if (!excelResult) return;
    downloadBlob(excelResult.blob, excelResult.downloadName);
    setDownloadTriggered(true);
  };

  // Helper to generate column headers like A, B, C, ... AA, AB
  const getColLetter = (index: number): string => {
    let letter = '';
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-xl font-bold text-stone-900 flex items-center justify-center gap-2">
          <span>Chuyển Đổi File PDF Sang Excel (.xlsx)</span>
          <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
            XLSX
          </span>
        </h2>
        <p className="text-sm text-stone-600 max-w-xl mx-auto">
          Trích xuất bảng biểu, dữ liệu số và danh sách từ tài liệu PDF thành bảng tính Microsoft Excel (.xlsx) có thể tính toán và chỉnh sửa công thức.
        </p>
      </div>

      {!loadedPdf ? (
        <div className="space-y-4">
          <DropZone
            onFilesSelected={handleFileSelected}
            title="Kéo thả tệp PDF cần chuyển sang Excel vào đây"
            description="Tệp tin được phân tích và trích xuất bảng tính trực tiếp trên trình duyệt của bạn, an toàn tuyệt đối"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Bảng Tính .XLSX Chuẩn</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Tạo file Excel chuẩn mở ngay bằng Microsoft Excel, Google Sheets, Apple Numbers và WPS Office.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <Table className="w-4 h-4 text-teal-600" />
                <span>Nhận Diện Cột &amp; Kiểu Số</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Tự động canh chỉnh cột, hàng và nhận diện định dạng số, tiền tệ, phần trăm để tính tổng SUM ngay.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Bảo Mật Riêng Tư 100%</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Không tải dữ liệu lên máy chủ ngoài. Dữ liệu bảng lương, kế toán hay hóa đơn của bạn luôn an toàn trên máy.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 shadow-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold">Thông báo chuyển đổi</h4>
                  <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-xs font-semibold text-red-700 hover:text-red-900 px-2 py-1 rounded-md"
              >
                Đóng
              </button>
            </div>
          )}

          {/* Loaded PDF Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-stone-900 truncate max-w-xs sm:max-w-md">
                  {loadedPdf.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5">
                  <span className="font-medium text-stone-700">{formatBytes(loadedPdf.size)}</span>
                  <span>•</span>
                  <span>{loadedPdf.totalPages} trang</span>
                  <span>•</span>
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-100">
                    Sẵn sàng trích xuất bảng
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-preview-pdf-to-excel"
                onClick={() => {
                  const blob = new Blob([loadedPdf.arrayBuffer], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  onOpenPreview({ title: loadedPdf.name, pdfBlobUrl: url });
                }}
                className="text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-2 rounded-xl border border-stone-200 transition-colors flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem PDF gốc</span>
              </button>

              <button
                type="button"
                id="btn-change-excel-file"
                onClick={() => {
                  onSetLoadedPdf(null);
                  setExcelResult(null);
                }}
                className="text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-2 rounded-xl border border-stone-200 transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Chọn tệp khác</span>
              </button>
            </div>
          </div>

          {/* Options Card */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-6">
            <div className="space-y-1 border-b border-stone-100 pb-4">
              <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span>Tuỳ chọn xuất tệp Excel (.xlsx)</span>
              </h3>
              <p className="text-xs text-stone-500">
                Lựa chọn cấu trúc Sheet và phạm vi trang trích xuất dữ liệu
              </p>
            </div>

            {/* 1. Conversion Mode */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                1. Cấu trúc Sheet Excel
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Smart Table */}
                <div
                  onClick={() => setMode('smart-table')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'smart-table'
                      ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-stone-900">Bảng Tính Gộp (Khuyên dùng)</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        mode === 'smart-table' ? 'border-emerald-600 bg-emerald-600' : 'border-stone-300'
                      }`}
                    >
                      {mode === 'smart-table' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Gộp tất cả trang vào 1 Sheet duy nhất, tự động nhận diện cột và tự căn chỉnh độ rộng cột Excel tối ưu.
                  </p>
                </div>

                {/* Page Per Sheet */}
                <div
                  onClick={() => setMode('page-per-sheet')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'page-per-sheet'
                      ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-stone-900">Mỗi Trang 1 Sheet Riêng</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        mode === 'page-per-sheet' ? 'border-emerald-600 bg-emerald-600' : 'border-stone-300'
                      }`}
                    >
                      {mode === 'page-per-sheet' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Mỗi trang PDF sẽ tạo thành một tab Sheet riêng (Trang 1, Trang 2...), rất thuận tiện cho báo cáo nhiều kỳ.
                  </p>
                </div>

                {/* Raw Grid */}
                <div
                  onClick={() => setMode('raw-grid')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'raw-grid'
                      ? 'border-emerald-600 bg-emerald-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-stone-900">Lưới Ô Nguyên Bản</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        mode === 'raw-grid' ? 'border-emerald-600 bg-emerald-600' : 'border-stone-300'
                      }`}
                    >
                      {mode === 'raw-grid' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Bảo lưu vị trí toạ độ chính xác của từng cụm từ trên trang vào ô tương ứng trong bảng tính.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Page Scope */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                2. Phạm vi trang trích xuất
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-800 bg-stone-50 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 transition-colors">
                  <input
                    type="radio"
                    name="excel-page-scope"
                    checked={pageScope === 'all'}
                    onChange={() => setPageScope('all')}
                    className="accent-emerald-600"
                  />
                  <span>Trích xuất tất cả các trang ({loadedPdf.totalPages} trang)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-800 bg-stone-50 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 transition-colors">
                  <input
                    type="radio"
                    name="excel-page-scope"
                    checked={pageScope === 'custom'}
                    onChange={() => setPageScope('custom')}
                    className="accent-emerald-600"
                  />
                  <span>Chỉ định các trang cụ thể</span>
                </label>
              </div>

              {pageScope === 'custom' && (
                <div className="pt-2 max-w-md">
                  <input
                    type="text"
                    id="input-custom-excel-range"
                    value={customRange}
                    onChange={(e) => setCustomRange(e.target.value)}
                    placeholder={`Ví dụ: 1-3, 5 (tối đa ${loadedPdf.totalPages})`}
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <p className="text-[11px] text-stone-500 mt-1">
                    Nhập số trang cần chuyển sang Excel cách nhau bằng dấu phẩy hoặc khoảng trang (ví dụ: 1, 3-4).
                  </p>
                </div>
              )}
            </div>

            {/* 3. Output File Name */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                3. Tên tệp Excel đầu ra
              </label>
              <div className="max-w-md">
                <input
                  type="text"
                  id="input-excel-filename"
                  value={outputFileName}
                  onChange={(e) => setOutputFileName(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                  placeholder="bang-tinh.xlsx"
                />
              </div>
            </div>

            {/* Execute Button */}
            <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-stone-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>File Excel (.xlsx) được tạo cục bộ trên máy bạn và lưu trực tiếp về thư mục Downloads.</span>
              </div>

              <button
                type="button"
                id="btn-start-convert-to-excel"
                disabled={progress.isProcessing}
                onClick={handleStartConversion}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Bắt Đầu Chuyển Sang Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Progress Modal / Bar */}
          {progress.isProcessing && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-emerald-200 shadow-sm space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-stone-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping" />
                  {progress.statusText}
                </span>
                <span className="font-bold text-emerald-600">{progress.percent}%</span>
              </div>
              <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Result Section */}
          {excelResult && (
            <div
              ref={resultRef}
              id="excel-conversion-result-card"
              className="p-6 sm:p-8 rounded-2xl bg-white border-2 border-emerald-500/30 shadow-md space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-stone-900">
                        Trích Xuất Bảng Tính Thành Công!
                      </h3>
                      <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        .XLSX
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Đã phân tích các hàng cột và đóng gói thành tệp Microsoft Excel chuẩn (.xlsx).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-download-excel-file"
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md transition-all cursor-pointer active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Xuống File Excel ({formatBytes(excelResult.size)})</span>
                </button>
              </div>

              {/* Statistics Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Tên tệp xuất</span>
                  <p className="text-xs font-semibold text-stone-900 truncate mt-0.5 font-mono">
                    {excelResult.downloadName}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Dung lượng file Excel</span>
                  <p className="text-xs font-semibold text-stone-900 mt-0.5">
                    {formatBytes(excelResult.size)}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Số hàng dữ liệu</span>
                  <p className="text-xs font-semibold text-stone-900 mt-0.5">
                    {excelResult.totalRows} hàng ({excelResult.totalColumns} cột)
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Số trang tính (Sheet)</span>
                  <p className="text-xs font-semibold text-stone-900 mt-0.5">
                    {excelResult.sheetCount} Sheet
                  </p>
                </div>
              </div>

              {/* Interactive Spreadsheet Preview */}
              {excelResult.previewSheetData && excelResult.previewSheetData.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Xem trước bảng dữ liệu Excel</span>
                    </span>
                    <span className="text-[11px] text-stone-400">
                      Hiển thị {Math.min(excelResult.previewSheetData.length, 25)} hàng đầu tiên
                    </span>
                  </div>

                  <div className="border border-stone-200 rounded-xl overflow-x-auto max-h-72 bg-white shadow-xs">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-100 border-b border-stone-200 text-stone-600 font-semibold select-none">
                          <th className="py-2 px-3 text-center border-r border-stone-200 w-12 bg-stone-200/60 font-mono text-[11px]">
                            #
                          </th>
                          {Array.from({ length: excelResult.totalColumns || 1 }).map((_, cIdx) => (
                            <th
                              key={cIdx}
                              className="py-2 px-3 text-left border-r border-stone-200 font-mono text-[11px] text-stone-700 min-w-[90px]"
                            >
                              {getColLetter(cIdx)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {excelResult.previewSheetData.map((row, rIdx) => {
                          const isHeaderOrSeparator =
                            row.length === 1 && String(row[0]).startsWith('--- [TÀI LIỆU PDF');
                          return (
                            <tr
                              key={rIdx}
                              className={`border-b border-stone-100 transition-colors ${
                                isHeaderOrSeparator
                                  ? 'bg-emerald-50/70 font-semibold text-emerald-800'
                                  : rIdx % 2 === 0
                                  ? 'bg-white hover:bg-stone-50/80'
                                  : 'bg-stone-50/40 hover:bg-stone-50'
                              }`}
                            >
                              <td className="py-1.5 px-3 text-center border-r border-stone-200 font-mono text-[11px] text-stone-400 select-none bg-stone-50">
                                {rIdx + 1}
                              </td>
                              {isHeaderOrSeparator ? (
                                <td
                                  colSpan={excelResult.totalColumns || 1}
                                  className="py-1.5 px-3 text-xs text-emerald-800 font-medium"
                                >
                                  {row[0]}
                                </td>
                              ) : (
                                Array.from({ length: excelResult.totalColumns || 1 }).map((_, cIdx) => {
                                  const val = row[cIdx];
                                  const isNumeric = typeof val === 'number';
                                  return (
                                    <td
                                      key={cIdx}
                                      className={`py-1.5 px-3 border-r border-stone-100 truncate max-w-xs ${
                                        isNumeric ? 'text-right font-mono text-emerald-950' : 'text-stone-800'
                                      }`}
                                    >
                                      {val !== undefined && val !== null ? String(val) : ''}
                                    </td>
                                  );
                                })
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {downloadTriggered && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>
                    Tệp Excel (.xlsx) đã được tải về máy của bạn! Bạn có thể mở trực tiếp bằng Microsoft Excel hoặc tải lên Google Sheets.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
