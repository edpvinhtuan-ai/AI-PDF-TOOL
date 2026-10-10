import React, { useState, useRef, useEffect } from 'react';
import {
  Minimize2,
  Download,
  Eye,
  RotateCcw,
  CheckCircle2,
  Layers,
  Sparkles,
  Zap,
  Gauge,
  Sliders,
  FileText,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
  AlertCircle,
  Check,
} from 'lucide-react';
import { CompressionLevel, LoadedPdf, ProcessProgress } from '../types';
import { compressPdf, downloadBlob, formatBytes } from '../lib/pdfUtils';
import { DropZone } from './DropZone';

interface CompressViewProps {
  loadedPdf: LoadedPdf | null;
  onSetLoadedPdf: (pdf: LoadedPdf | null) => void;
  onOpenPreview: (data: { title: string; pdfBlobUrl?: string }) => void;
}

export const CompressView: React.FC<CompressViewProps> = ({
  loadedPdf,
  onSetLoadedPdf,
  onOpenPreview,
}) => {
  const [level, setLevel] = useState<CompressionLevel>('recommended');
  const [progress, setProgress] = useState<ProcessProgress>({
    isProcessing: false,
    statusText: '',
    percent: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadTriggered, setDownloadTriggered] = useState(false);

  const [result, setResult] = useState<{
    blob: Blob;
    originalSize: number;
    compressedSize: number;
    blobUrl: string;
    downloadName: string;
  } | null>(null);

  const resultRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to result when completed
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMessage(null);
    setResult(null);
    setDownloadTriggered(false);

    const file = files[0];
    const arrayBuffer = await file.arrayBuffer();
    
    // Quick load to check page count
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
      setResult(null);
    } catch {
      setErrorMessage('Không thể đọc tệp PDF. Tệp có thể có mật khẩu bảo vệ hoặc định dạng không hợp lệ.');
    }
  };

  const handleStartCompress = async (overrideLevel?: CompressionLevel) => {
    if (!loadedPdf) return;
    const selectedLevel = overrideLevel || level;

    setErrorMessage(null);
    setDownloadTriggered(false);
    setProgress({
      isProcessing: true,
      statusText: 'Đang chuẩn bị quá trình nén...',
      percent: 5,
    });

    try {
      const res = await compressPdf(
        loadedPdf.arrayBuffer,
        selectedLevel,
        (percent, statusText) => {
          setProgress({
            isProcessing: true,
            statusText,
            percent,
          });
        }
      );

      const blobUrl = URL.createObjectURL(res.blob);
      const cleanName = loadedPdf.name.replace(/\.pdf$/i, '');
      const downloadName = `${cleanName}-da-nen.pdf`;

      const newResult = {
        blob: res.blob,
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
        blobUrl,
        downloadName,
      };

      setResult(newResult);

      // Auto-trigger download
      try {
        downloadBlob(res.blob, downloadName);
        setDownloadTriggered(true);
      } catch (dlErr) {
        console.warn('Auto download error, user can click manual button:', dlErr);
      }
    } catch (err: unknown) {
      console.error('Lỗi khi nén PDF:', err);
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra trong quá trình nén tệp PDF.';
      setErrorMessage(`${msg} Bạn có thể thử lại với chế độ "Nén cấu trúc (Lossless)".`);
    } finally {
      setProgress({
        isProcessing: false,
        statusText: '',
        percent: 0,
      });
    }
  };

  const handleManualDownload = () => {
    if (!result) return;
    downloadBlob(result.blob, result.downloadName);
    setDownloadTriggered(true);
  };

  const handleReset = () => {
    setResult(null);
    setErrorMessage(null);
    setDownloadTriggered(false);
    onSetLoadedPdf(null);
  };

  return (
    <div className="space-y-6">
      {/* If no file is loaded, show dropzone */}
      {!loadedPdf ? (
        <div className="space-y-4">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold text-stone-900">Nén &amp; Giảm Dung Lượng File PDF</h2>
            <p className="text-sm text-stone-600 max-w-xl mx-auto">
              Giảm kích thước file PDF an toàn, nhanh chóng mà vẫn giữ được độ rõ nét cho văn bản và hình ảnh.
            </p>
          </div>

          <DropZone
            onFilesSelected={handleFileSelected}
            title="Kéo thả tệp PDF cần nén vào đây"
            description="Tệp tin được xử lý trực tiếp trên trình duyệt của bạn, hoàn toàn bảo mật"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <Zap className="w-4 h-4 text-amber-600" />
                <span>Nén siêu tốc</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Xử lý hoàn toàn trong máy tính của bạn bằng thuật toán tối ưu luồng đối tượng và rasterization thông minh.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Tuyệt đối riêng tư</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Tệp tin PDF không tải lên bất kỳ máy chủ nào. Bạn hoàn toàn có thể ngắt kết nối mạng vẫn nén được.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-stone-200/80 space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2 text-stone-900 font-semibold text-sm">
                <Sliders className="w-4 h-4 text-red-600" />
                <span>3 Chế độ nén linh hoạt</span>
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                Tuỳ chọn nén cân bằng thông thường, nén tối đa cho hồ sơ &lt;2MB hoặc nén cấu trúc giữ nguyên chất lượng.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* File is loaded */
        <div className="space-y-6">
          {/* Error Message if any */}
          {errorMessage && (
            <div className="p-4 sm:p-5 rounded-2xl bg-red-50 border border-red-200 text-red-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-start sm:items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
                <div className="text-xs sm:text-sm">
                  <p className="font-semibold text-red-900">Không thể hoàn tất nén</p>
                  <p className="text-red-700 text-xs mt-0.5">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-retry-lossless"
                onClick={() => handleStartCompress('lossless')}
                disabled={progress.isProcessing}
                className="text-xs font-semibold px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white shrink-0 transition-colors shadow-2xs"
              >
                Thử nén cấu trúc an toàn
              </button>
            </div>
          )}

          {/* File summary header */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-stone-900 truncate max-w-xs sm:max-w-md">
                  {loadedPdf.name}
                </h3>
                <div className="flex items-center gap-2.5 text-xs text-stone-500 mt-0.5">
                  <span className="font-medium text-stone-700">{formatBytes(loadedPdf.size)}</span>
                  <span>•</span>
                  <span>{loadedPdf.totalPages} trang</span>
                  <span>•</span>
                  {result ? (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-medium border border-emerald-200/50">
                      Đã nén xong ({formatBytes(result.compressedSize)})
                    </span>
                  ) : (
                    <span className="text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md font-medium border border-stone-200">
                      Sẵn sàng nén
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {result && (
                <a
                  id="btn-header-quick-download"
                  href={result.blobUrl}
                  download={result.downloadName}
                  onClick={handleManualDownload}
                  className="inline-flex items-center gap-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl shadow-xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải file</span>
                </a>
              )}
              <button
                type="button"
                id="btn-change-compress-file"
                onClick={handleReset}
                disabled={progress.isProcessing}
                className="text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-2 rounded-xl border border-stone-200 transition-colors"
              >
                Chọn tệp khác
              </button>
            </div>
          </div>

          {/* Compression Level Selector */}
          {!result && (
            <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-stone-900">Chọn mức độ nén phù hợp</h3>
                <p className="text-xs text-stone-500">Mỗi mức độ tối ưu cho từng mục đích sử dụng khác nhau:</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Recommended */}
                <button
                  type="button"
                  id="level-recommended"
                  onClick={() => setLevel('recommended')}
                  disabled={progress.isProcessing}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                    level === 'recommended'
                      ? 'border-red-600 bg-red-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="absolute top-3 right-3">
                    <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Khuyên dùng
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-sm text-stone-900">
                      <Sparkles className="w-4 h-4 text-red-600" />
                      <span>Cân bằng</span>
                    </div>
                    <p className="text-xs text-stone-500 pt-1">
                      Giảm kích thước tối ưu (40 - 70%), văn bản và hình ảnh vẫn sắc nét để đọc và in ấn.
                    </p>
                  </div>
                  <div className="pt-3 text-[11px] font-medium text-red-700">Thích hợp: Email, Zalo, chia sẻ chung</div>
                </button>

                {/* Extreme */}
                <button
                  type="button"
                  id="level-extreme"
                  onClick={() => setLevel('extreme')}
                  disabled={progress.isProcessing}
                  className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                    level === 'extreme'
                      ? 'border-red-600 bg-red-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-sm text-stone-900">
                      <Gauge className="w-4 h-4 text-amber-600" />
                      <span>Nén tối đa</span>
                    </div>
                    <p className="text-xs text-stone-500 pt-1">
                      Giảm dung lượng xuống mức thấp nhất (lên tới 85%). Hình ảnh được nén tinh gọn.
                    </p>
                  </div>
                  <div className="pt-3 text-[11px] font-medium text-amber-700">Thích hợp: Nộp hồ sơ công trực tuyến &lt;2MB</div>
                </button>

                {/* Lossless */}
                <button
                  type="button"
                  id="level-lossless"
                  onClick={() => setLevel('lossless')}
                  disabled={progress.isProcessing}
                  className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                    level === 'lossless'
                      ? 'border-red-600 bg-red-50/40 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300 bg-white'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-sm text-stone-900">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>Nén cấu trúc</span>
                    </div>
                    <p className="text-xs text-stone-500 pt-1">
                      Giữ nguyên bản 100% đồ họa vector và font chữ, nén lại bảng luồng đối tượng và metadata thừa.
                    </p>
                  </div>
                  <div className="pt-3 text-[11px] font-medium text-blue-700">Thích hợp: Hợp đồng, bản vẽ kỹ thuật</div>
                </button>
              </div>

              {/* Progress Bar when processing */}
              {progress.isProcessing && (
                <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2 mt-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs font-medium text-stone-700">
                    <span>{progress.statusText || 'Đang nén tệp tin...'}</span>
                    <span className="font-mono font-bold text-red-600">{progress.percent}%</span>
                  </div>
                  <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-600 rounded-full transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Start Compress Button */}
              {!progress.isProcessing && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    id="btn-run-compress"
                    onClick={() => handleStartCompress()}
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm shadow-xs transition-colors"
                  >
                    <Minimize2 className="w-4 h-4" />
                    <span>Bắt đầu nén PDF</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Success Result View & Prominent Download Section */}
          {result && (
            <div
              ref={resultRef}
              className="bg-white rounded-2xl border-2 border-emerald-200 p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in zoom-in-95 duration-200"
            >
              {/* Status Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900">
                      Nén tệp PDF thành công!
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      Tệp tin đã sẵn sàng. Bạn có thể tải ngay về máy bên dưới.
                    </p>
                  </div>
                </div>

                <div className="self-start sm:self-auto">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3.5 h-3.5" />
                    Hoàn tất 100%
                  </span>
                </div>
              </div>

              {/* Size Comparison Card */}
              <div className="bg-stone-50 rounded-2xl p-5 border border-stone-200/80 flex flex-col md:flex-row items-center justify-between gap-5">
                <div className="flex items-center gap-4 text-center sm:text-left">
                  <div>
                    <span className="text-[11px] text-stone-500 block uppercase font-bold tracking-wider">
                      Kích thước gốc
                    </span>
                    <span className="text-base sm:text-lg font-bold text-stone-500 line-through">
                      {formatBytes(result.originalSize)}
                    </span>
                  </div>

                  <ArrowRight className="w-5 h-5 text-stone-400 shrink-0" />

                  <div>
                    <span className="text-[11px] text-emerald-800 block uppercase font-bold tracking-wider">
                      Kích thước mới (Đã nén)
                    </span>
                    <span className="text-lg sm:text-2xl font-black text-emerald-700">
                      {formatBytes(result.compressedSize)}
                    </span>
                  </div>
                </div>

                {/* Savings Badge */}
                <div className="text-center md:text-right">
                  {result.compressedSize < result.originalSize ? (
                    <div className="inline-flex flex-col sm:flex-row items-center gap-2 bg-emerald-100/80 text-emerald-900 text-xs font-bold px-4 py-2 rounded-xl border border-emerald-200">
                      <span className="text-emerald-800 font-extrabold text-sm">
                        Giảm{' '}
                        {Math.round(
                          ((result.originalSize - result.compressedSize) / result.originalSize) * 100
                        )}
                        %
                      </span>
                      <span className="hidden sm:inline">•</span>
                      <span>Tiết kiệm {formatBytes(result.originalSize - result.compressedSize)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-stone-600 bg-stone-200/80 px-3.5 py-2 rounded-xl font-medium">
                      Tệp đã được tối ưu sẵn ở mức cao nhất
                    </span>
                  )}
                </div>
              </div>

              {/* Prominent Download Call-To-Action Box */}
              <div className="p-6 rounded-2xl bg-red-50/50 border-2 border-red-200/70 space-y-4 text-center">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-stone-900">
                    Bấm vào đây để lưu file về máy tính:
                  </h4>
                  <p className="text-xs text-stone-500">
                    Tên tệp xuất ra: <span className="font-mono text-stone-700 font-medium">{result.downloadName}</span>
                  </p>
                </div>

                {/* PRIMARY DOWNLOAD BUTTON (Real Anchor Tag) */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                  <a
                    id="btn-download-compressed-main"
                    href={result.blobUrl}
                    download={result.downloadName}
                    onClick={handleManualDownload}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-base sm:text-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    <Download className="w-6 h-6 shrink-0" />
                    <span>TẢI FILE ĐÃ NÉN VỀ MÁY ({formatBytes(result.compressedSize)})</span>
                  </a>

                  {/* Fallback open in new tab if browser suppresses download dialog */}
                  <a
                    id="btn-open-in-tab"
                    href={result.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 text-sm font-semibold transition-colors"
                    title="Mở file trong tab mới của trình duyệt để xem hoặc lưu thủ công"
                  >
                    <ExternalLink className="w-4 h-4 text-stone-500" />
                    <span>Mở trong tab mới</span>
                  </a>
                </div>

                {/* Notification about auto-download */}
                {downloadTriggered && (
                  <p className="text-xs text-emerald-700 font-medium pt-1">
                    ✓ Trình duyệt đã kích hoạt tải tệp. Nếu bạn chưa thấy tệp tải về, vui lòng nhấp vào nút đỏ lớn ở trên.
                  </p>
                )}
              </div>

              {/* Auxiliary Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  id="btn-compress-another"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4 text-stone-500" />
                  <span>Nén tệp khác</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-preview-compressed"
                    onClick={() =>
                      onOpenPreview({
                        title: `Xem trước: ${result.downloadName}`,
                        pdfBlobUrl: result.blobUrl,
                      })
                    }
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-sm font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4 text-stone-500" />
                    <span>Xem thử tài liệu</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

