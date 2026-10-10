import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Download,
  RotateCcw,
  CheckCircle2,
  Sliders,
  ShieldCheck,
  AlertCircle,
  Eye,
  BookOpen,
  ArrowRight,
  Layers,
  FileType,
  Sparkles,
} from 'lucide-react';
import { LoadedPdf, PdfToWordMode, PdfToWordResult, ProcessProgress } from '../types';
import { downloadBlob, formatBytes, parsePageRanges } from '../lib/pdfUtils';
import { convertPdfToWordDocx } from '../lib/pdfToWord';
import { DropZone } from './DropZone';

interface PdfToWordViewProps {
  loadedPdf: LoadedPdf | null;
  onSetLoadedPdf: (pdf: LoadedPdf | null) => void;
  onOpenPreview: (data: { title: string; pdfBlobUrl?: string }) => void;
}

export const PdfToWordView: React.FC<PdfToWordViewProps> = ({
  loadedPdf,
  onSetLoadedPdf,
  onOpenPreview,
}) => {
  const [mode, setMode] = useState<PdfToWordMode>('standard');
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
  const [wordResult, setWordResult] = useState<PdfToWordResult | null>(null);

  const resultRef = useRef<HTMLDivElement | null>(null);

  // Set default output file name when PDF changes
  useEffect(() => {
    if (loadedPdf) {
      const baseName = loadedPdf.name.replace(/\.pdf$/i, '');
      setOutputFileName(`${baseName}.docx`);
      setWordResult(null);
      setErrorMessage(null);
      setDownloadTriggered(false);
    }
  }, [loadedPdf]);

  // Scroll to result when ready
  useEffect(() => {
    if (wordResult && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [wordResult]);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setWordResult(null);
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
      statusText: 'Đang bắt đầu quá trình chuyển đổi...',
      percent: 5,
    });

    try {
      const cleanName = outputFileName.trim().toLowerCase().endsWith('.docx')
        ? outputFileName.trim()
        : `${outputFileName.trim() || 'tai-lieu'}.docx`;

      const result = await convertPdfToWordDocx(loadedPdf.arrayBuffer, {
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

      setWordResult(result);
    } catch (err: unknown) {
      console.error('Lỗi chuyển đổi PDF sang Word:', err);
      const msg = err instanceof Error ? err.message : 'Đã xảy ra lỗi trong quá trình chuyển đổi.';
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
    if (!wordResult) return;
    downloadBlob(wordResult.blob, wordResult.downloadName);
    setDownloadTriggered(true);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-xl font-bold text-stone-900 flex items-center justify-center gap-2">
          <span>Chuyển Đổi File PDF Sang Word (.docx)</span>
          <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
            DOCX
          </span>
        </h2>
        <p className="text-sm text-stone-600 max-w-xl mx-auto">
          Chuyển đổi văn bản, tiêu đề và hình ảnh từ tài liệu PDF thành tệp Microsoft Word có thể chỉnh sửa trực tiếp trên thiết bị của bạn.
        </p>
      </div>

      {!loadedPdf ? (
        <div className="space-y-4">
          <DropZone
            onFilesSelected={handleFileSelected}
            title="Kéo thả tệp PDF cần chuyển sang Word vào đây"
            description="Tệp tin được xử lý an toàn 100% trên trình duyệt của bạn, hoàn toàn bảo mật"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <FileType className="w-4 h-4 text-blue-600" />
                <span>Word (.docx) Chuẩn</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Tạo file .docx tiêu chuẩn mở được bằng Microsoft Word, Google Docs, WPS Office và LibreOffice.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Bảo Mật Tuyệt Đối</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Không tải tài liệu lên bất kỳ máy chủ nào. Bạn hoàn toàn có thể ngắt kết nối Internet mà vẫn chuyển đổi bình thường.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span>Giữ Bố Cục &amp; Tiêu Đề</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Tự động nhận diện tiêu đề, ngắt đoạn, phân tách dòng và danh sách mục gạch đầu dòng tiện lợi.
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
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                <FileText className="w-6 h-6" />
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
                  <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-medium border border-blue-100">
                    Sẵn sàng chuyển đổi
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-preview-pdf-to-word"
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
                id="btn-change-word-file"
                onClick={() => {
                  onSetLoadedPdf(null);
                  setWordResult(null);
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
                <Sliders className="w-4 h-4 text-blue-600" />
                <span>Tuỳ chọn xuất tệp Word (.docx)</span>
              </h3>
              <p className="text-xs text-stone-500">
                Tuỳ chỉnh chế độ trích xuất nội dung và phạm vi trang phù hợp với nhu cầu sử dụng
              </p>
            </div>

            {/* 1. Conversion Mode */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                1. Chế độ chuyển đổi
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Standard */}
                <div
                  onClick={() => setMode('standard')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'standard'
                      ? 'border-blue-600 bg-blue-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-stone-900">Word Chuẩn (Khuyên dùng)</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        mode === 'standard' ? 'border-blue-600 bg-blue-600' : 'border-stone-300'
                      }`}
                    >
                      {mode === 'standard' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Trích xuất đầy đủ văn bản, tự động phát hiện tiêu đề lớn/nhỏ và ngắt đoạn. Có thể chỉnh sửa toàn bộ chữ và font.
                  </p>
                </div>

                {/* With Visuals */}
                <div
                  onClick={() => setMode('with-visuals')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'with-visuals'
                      ? 'border-blue-600 bg-blue-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-stone-900">Kèm Ảnh Trang Minh Họa</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        mode === 'with-visuals' ? 'border-blue-600 bg-blue-600' : 'border-stone-300'
                      }`}
                    >
                      {mode === 'with-visuals' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Chèn cả ảnh chụp trang độ phân giải cao và các đoạn văn bản có thể chỉnh sửa. Rất tốt cho tài liệu có biểu đồ, bảng.
                  </p>
                </div>

                {/* Raw Text */}
                <div
                  onClick={() => setMode('raw-text')}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    mode === 'raw-text'
                      ? 'border-blue-600 bg-blue-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-stone-900">Văn Bản Tối Giản</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        mode === 'raw-text' ? 'border-blue-600 bg-blue-600' : 'border-stone-300'
                      }`}
                    >
                      {mode === 'raw-text' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Tốc độ xử lý siêu nhanh, chỉ lấy nội dung chữ và đoạn văn đơn giản để dễ sao chép hoặc trích dẫn.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Page Scope */}
            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                2. Phạm vi trang chuyển đổi
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-800 bg-stone-50 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 transition-colors">
                  <input
                    type="radio"
                    name="page-scope"
                    checked={pageScope === 'all'}
                    onChange={() => setPageScope('all')}
                    className="accent-blue-600"
                  />
                  <span>Chuyển đổi tất cả các trang (Toàn bộ {loadedPdf.totalPages} trang)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-sm text-stone-800 bg-stone-50 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 transition-colors">
                  <input
                    type="radio"
                    name="page-scope"
                    checked={pageScope === 'custom'}
                    onChange={() => setPageScope('custom')}
                    className="accent-blue-600"
                  />
                  <span>Chỉ định các trang cụ thể</span>
                </label>
              </div>

              {pageScope === 'custom' && (
                <div className="pt-2 max-w-md">
                  <input
                    type="text"
                    id="input-custom-page-range"
                    value={customRange}
                    onChange={(e) => setCustomRange(e.target.value)}
                    placeholder={`Ví dụ: 1-3, 5 (tối đa ${loadedPdf.totalPages})`}
                    className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                  <p className="text-[11px] text-stone-500 mt-1">
                    Nhập số trang riêng lẻ cách nhau bằng dấu phẩy hoặc khoảng trang bằng dấu gạch ngang (ví dụ: 1-2, 4).
                  </p>
                </div>
              )}
            </div>

            {/* 3. Output File Name */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                3. Tên tệp Word đầu ra
              </label>
              <div className="max-w-md">
                <input
                  type="text"
                  id="input-word-filename"
                  value={outputFileName}
                  onChange={(e) => setOutputFileName(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                  placeholder="tai-lieu.docx"
                />
              </div>
            </div>

            {/* Execute Button */}
            <div className="pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-stone-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>File Word được tạo cục bộ trên máy bạn và lưu trực tiếp về thư mục Downloads.</span>
              </div>

              <button
                type="button"
                id="btn-start-convert-to-word"
                disabled={progress.isProcessing}
                onClick={handleStartConversion}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
              >
                <FileType className="w-4 h-4" />
                <span>Bắt Đầu Chuyển Sang Word (.docx)</span>
              </button>
            </div>
          </div>

          {/* Progress Modal / Bar */}
          {progress.isProcessing && (
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-blue-200 shadow-sm space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-stone-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
                  {progress.statusText}
                </span>
                <span className="font-bold text-blue-600">{progress.percent}%</span>
              </div>
              <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Result Section */}
          {wordResult && (
            <div
              ref={resultRef}
              id="word-conversion-result-card"
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
                        Chuyển Đổi Thành Công!
                      </h3>
                      <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        .DOCX
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Đã trích xuất và tạo tệp Microsoft Word chuẩn với đầy đủ định dạng văn bản.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-download-word-file"
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-all cursor-pointer active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải Xuống File Word ({formatBytes(wordResult.size)})</span>
                </button>
              </div>

              {/* Statistics Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Tên tệp xuất</span>
                  <p className="text-xs font-semibold text-stone-900 truncate mt-0.5 font-mono">
                    {wordResult.downloadName}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Dung lượng file Word</span>
                  <p className="text-xs font-semibold text-stone-900 mt-0.5">
                    {formatBytes(wordResult.size)}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Số trang đã chuyển</span>
                  <p className="text-xs font-semibold text-stone-900 mt-0.5">
                    {wordResult.totalPages} trang
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80">
                  <span className="text-[11px] text-stone-500 font-medium">Tổng số từ ước tính</span>
                  <p className="text-xs font-semibold text-stone-900 mt-0.5">
                    ~{wordResult.totalWords.toLocaleString()} từ
                  </p>
                </div>
              </div>

              {/* Text Snippet Preview */}
              {wordResult.previewSnippet && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                      <span>Xem trước văn bản đã trích xuất</span>
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {wordResult.totalCharacters.toLocaleString()} ký tự
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-700 font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-all">
                    {wordResult.previewSnippet}
                    {wordResult.totalCharacters > 800 && '\n... [Xem toàn bộ nội dung trong tệp Word sau khi tải về]'}
                  </div>
                </div>
              )}

              {downloadTriggered && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>
                    Tệp Word đã được tải về máy của bạn! Bạn có thể mở trực tiếp bằng Microsoft Word, Google Docs hoặc WPS Office.
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
