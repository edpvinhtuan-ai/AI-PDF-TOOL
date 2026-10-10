import React, { useState, useEffect } from 'react';
import {
  Scissors,
  Download,
  Eye,
  RotateCcw,
  Check,
  CheckSquare,
  Square,
  FileArchive,
  Trash2,
  Layers,
  FileText,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { LoadedPdf, PageThumbnail, ProcessProgress, SplitAction } from '../types';
import {
  downloadBlob,
  formatBytes,
  generatePageThumbnails,
  parsePageRanges,
  renderHighResPage,
  splitPdf,
} from '../lib/pdfUtils';
import { DropZone } from './DropZone';

interface SplitViewProps {
  loadedPdf: LoadedPdf | null;
  onSetLoadedPdf: (pdf: LoadedPdf | null) => void;
  onOpenPreview: (data: { title: string; imageUrl?: string; pdfBlobUrl?: string }) => void;
}

export const SplitView: React.FC<SplitViewProps> = ({
  loadedPdf,
  onSetLoadedPdf,
  onOpenPreview,
}) => {
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [loadingThumbnails, setLoadingThumbnails] = useState<boolean>(false);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState<string>('');
  const [action, setAction] = useState<SplitAction>('extract_selected');
  const [progress, setProgress] = useState<ProcessProgress>({
    isProcessing: false,
    statusText: '',
    percent: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadTriggered, setDownloadTriggered] = useState(false);
  const [splitResult, setSplitResult] = useState<{
    blob: Blob;
    blobUrl: string;
    fileName: string;
    totalPages: number;
    isZip: boolean;
  } | null>(null);

  // When a new PDF is loaded, generate its page thumbnails
  useEffect(() => {
    if (!loadedPdf) {
      setThumbnails([]);
      setSelectedPages(new Set());
      setRangeInput('');
      setErrorMessage(null);
      setSplitResult(null);
      return;
    }

    // Default select page 1 immediately so user can run right away
    setSelectedPages(new Set([1]));
    setRangeInput('1');
    setErrorMessage(null);
    setSplitResult(null);

    let isMounted = true;
    setLoadingThumbnails(true);

    const safeBuffer = loadedPdf.bytes
      ? loadedPdf.bytes.slice(0).buffer
      : loadedPdf.arrayBuffer.slice(0);

    generatePageThumbnails(safeBuffer, () => {
      // Progressively updated
    }).then((thumbs) => {
      if (!isMounted) return;
      setThumbnails(thumbs);
      setLoadingThumbnails(false);
    }).catch((err) => {
      console.warn('Lỗi tạo thumbnails trang:', err);
      if (isMounted) setLoadingThumbnails(false);
    });

    return () => {
      isMounted = false;
    };
  }, [loadedPdf]);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    let totalPages = 1;
    try {
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true });
      totalPages = doc.getPageCount();
    } catch {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
        const pdf = await loadingTask.promise;
        totalPages = pdf.numPages;
      } catch {
        totalPages = 1;
      }
    }

    onSetLoadedPdf({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      totalPages,
      arrayBuffer: bytes.slice(0).buffer,
      bytes: bytes.slice(0),
      file,
    });
  };

  const updateRangeInputFromSet = (set: Set<number>) => {
    const sorted = Array.from(set).sort((a, b) => a - b);
    if (sorted.length === 0) {
      setRangeInput('');
      return;
    }

    // Helper to format ranges nicely (e.g., 1-3, 5, 8-10)
    const ranges: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      if (curr === prev + 1) {
        prev = curr;
      } else {
        ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = curr;
        prev = curr;
      }
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    setRangeInput(ranges.join(', '));
  };

  const togglePage = (pageNumber: number) => {
    setSelectedPages((prev: Set<number>) => {
      const next = new Set<number>(prev);
      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else {
        next.add(pageNumber);
      }
      updateRangeInputFromSet(next);
      return next;
    });
  };

  const handleRangeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRangeInput(value);
    if (!loadedPdf) return;

    const parsed = parsePageRanges(value, loadedPdf.totalPages);
    setSelectedPages(new Set<number>(parsed));
  };

  const selectAll = () => {
    if (!loadedPdf) return;
    const all = new Set<number>();
    for (let i = 1; i <= loadedPdf.totalPages; i++) all.add(i);
    setSelectedPages(all);
    updateRangeInputFromSet(all);
  };

  const deselectAll = () => {
    setSelectedPages(new Set<number>());
    setRangeInput('');
  };

  const selectEven = () => {
    if (!loadedPdf) return;
    const even = new Set<number>();
    for (let i = 2; i <= loadedPdf.totalPages; i += 2) even.add(i);
    setSelectedPages(even);
    updateRangeInputFromSet(even);
  };

  const selectOdd = () => {
    if (!loadedPdf) return;
    const odd = new Set<number>();
    for (let i = 1; i <= loadedPdf.totalPages; i += 2) odd.add(i);
    setSelectedPages(odd);
    updateRangeInputFromSet(odd);
  };

  const handleZoomPage = async (pageNumber: number) => {
    if (!loadedPdf) return;
    const safeBuffer = loadedPdf.bytes ? loadedPdf.bytes.slice(0).buffer : loadedPdf.arrayBuffer.slice(0);
    const highResUrl = await renderHighResPage(safeBuffer, pageNumber);
    if (highResUrl) {
      onOpenPreview({
        title: `${loadedPdf.name} - Trang ${pageNumber}`,
        imageUrl: highResUrl,
      });
    }
  };

  const handleExecuteSplit = async () => {
    if (!loadedPdf) return;

    if (action === 'extract_selected' && selectedPages.size === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 trang để trích xuất (bấm vào trang hoặc nhập số trang vào ô bên dưới).');
      return;
    }

    if (action === 'remove_selected' && selectedPages.size >= loadedPdf.totalPages) {
      setErrorMessage('Bạn không thể xoá hết toàn bộ các trang. Phải giữ lại ít nhất 1 trang.');
      return;
    }

    const sortedSelected: number[] = Array.from<number>(selectedPages).sort((a: number, b: number) => a - b);

    setErrorMessage(null);
    setDownloadTriggered(false);
    setProgress({
      isProcessing: true,
      statusText: 'Đang bắt đầu xử lý cắt tách...',
      percent: 10,
    });

    try {
      let bufferToProcess: ArrayBuffer;
      if (loadedPdf.bytes && loadedPdf.bytes.byteLength > 0) {
        bufferToProcess = loadedPdf.bytes.slice(0).buffer;
      } else if (loadedPdf.file) {
        bufferToProcess = await loadedPdf.file.arrayBuffer();
      } else {
        bufferToProcess = loadedPdf.arrayBuffer.slice(0);
      }

      const res = await splitPdf(
        bufferToProcess,
        sortedSelected,
        action,
        (percent, statusText) => {
          setProgress({
            isProcessing: true,
            statusText,
            percent,
          });
        }
      );

      const baseName = loadedPdf.name.replace(/\.pdf$/i, '');
      const finalName = action === 'separate_all'
        ? `${baseName}-tung-trang.zip`
        : action === 'remove_selected'
        ? `${baseName}-da-xoa-trang.pdf`
        : `${baseName}-trang-${rangeInput.replace(/[^a-zA-Z0-9-]/g, '_') || 'trich-xuat'}.pdf`;

      const blobUrl = URL.createObjectURL(res.blob);
      setSplitResult({
        blob: res.blob,
        blobUrl,
        fileName: finalName,
        totalPages: res.count,
        isZip: action === 'separate_all',
      });

      // Auto download
      try {
        downloadBlob(res.blob, finalName);
        setDownloadTriggered(true);
      } catch (dlErr) {
        console.warn('Auto download error:', dlErr);
      }
    } catch (err: unknown) {
      console.error('Lỗi khi cắt/tách PDF:', err);
      const message = err instanceof Error ? err.message : 'Có lỗi xảy ra khi cắt tệp PDF.';
      setErrorMessage(message);
    } finally {
      setProgress({
        isProcessing: false,
        statusText: '',
        percent: 0,
      });
    }
  };

  return (
    <div className="space-y-6">
      {!loadedPdf ? (
        <div className="space-y-4">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold text-stone-900">Cắt &amp; Tách Trang File PDF</h2>
            <p className="text-sm text-stone-600 max-w-xl mx-auto">
              Trích xuất các trang bạn cần thành file mới, tách riêng từng trang vào file ZIP hoặc loại bỏ các trang thừa.
            </p>
          </div>

          <DropZone
            onFilesSelected={handleFileSelected}
            title="Kéo thả tệp PDF cần cắt hoặc tách vào đây"
            description="Hỗ trợ xem trực tiếp hình ảnh từng trang để bạn dễ dàng lựa chọn"
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* File summary */}
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
                  <span className="text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md font-medium">
                    Đã chọn: <strong className="text-red-600">{selectedPages.size}</strong> trang
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              id="btn-change-split-file"
              onClick={() => onSetLoadedPdf(null)}
              className="text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200 transition-colors"
            >
              Chọn tệp khác
            </button>
          </div>

          {/* Action selection & options */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-stone-900">1. Chọn phương thức xử lý</h3>
              <p className="text-xs text-stone-500">Bạn muốn xuất các trang được chọn như thế nào?</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Extract selected */}
              <button
                type="button"
                id="action-extract"
                onClick={() => setAction('extract_selected')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                  action === 'extract_selected'
                    ? 'border-red-600 bg-red-50/40 text-stone-900'
                    : 'border-stone-200 hover:border-stone-300 text-stone-700 bg-white'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    action === 'extract_selected' ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold">Trích xuất trang chọn</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">Tạo 1 file PDF mới chứa các trang đã chọn</p>
                </div>
              </button>

              {/* Separate all into ZIP */}
              <button
                type="button"
                id="action-separate-all"
                onClick={() => setAction('separate_all')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                  action === 'separate_all'
                    ? 'border-red-600 bg-red-50/40 text-stone-900'
                    : 'border-stone-200 hover:border-stone-300 text-stone-700 bg-white'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    action === 'separate_all' ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  <FileArchive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold">Tách rời từng trang (ZIP)</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">Mỗi trang thành 1 file PDF riêng biệt</p>
                </div>
              </button>

              {/* Remove selected */}
              <button
                type="button"
                id="action-remove-selected"
                onClick={() => setAction('remove_selected')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                  action === 'remove_selected'
                    ? 'border-red-600 bg-red-50/40 text-stone-900'
                    : 'border-stone-200 hover:border-stone-300 text-stone-700 bg-white'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    action === 'remove_selected' ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold">Xoá trang đã chọn</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5">Giữ lại các trang còn lại thành 1 file mới</p>
                </div>
              </button>
            </div>

            {/* Quick selectors and Range input */}
            <div className="pt-2 border-t border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 max-w-md">
                <label htmlFor="range-input" className="block text-xs font-medium text-stone-700 mb-1">
                  Nhập khoảng trang (Ví dụ: 1-2, 4):
                </label>
                <input
                  type="text"
                  id="range-input"
                  value={rangeInput}
                  onChange={handleRangeInputChange}
                  placeholder={`1-${loadedPdf.totalPages}`}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-mono"
                />
              </div>

              {/* Quick action buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <button
                  type="button"
                  id="btn-select-all"
                  onClick={selectAll}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  id="btn-deselect-all"
                  onClick={deselectAll}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  id="btn-select-odd"
                  onClick={selectOdd}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
                >
                  Trang lẻ (1, 3, 5...)
                </button>
                <button
                  type="button"
                  id="btn-select-even"
                  onClick={selectEven}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
                >
                  Trang chẵn (2, 4, 6...)
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Page Thumbnails Grid */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  2. Chọn trang trực quan ({loadedPdf.totalPages} trang)
                </h3>
                <p className="text-xs text-stone-500">Nhấp vào từng trang để chọn hoặc bỏ chọn</p>
              </div>

              {loadingThumbnails && (
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <span>Đang tải hình xem trước...</span>
                </div>
              )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pt-2">
              {Array.from({ length: loadedPdf.totalPages }, (_, idx) => {
                const pageNum = idx + 1;
                const isSelected = selectedPages.has(pageNum);
                const thumb = thumbnails.find((t) => t.pageNumber === pageNum);

                return (
                  <div
                    key={pageNum}
                    id={`page-card-${pageNum}`}
                    onClick={() => togglePage(pageNum)}
                    className={`group relative rounded-xl border-2 cursor-pointer p-2 transition-all flex flex-col items-center select-none ${
                      isSelected
                        ? 'border-red-600 bg-red-50/20 shadow-md ring-2 ring-red-100'
                        : 'border-stone-200 hover:border-stone-300 bg-white shadow-xs'
                    }`}
                  >
                    {/* Header badge with checkbox */}
                    <div className="w-full flex items-center justify-between mb-2 px-1">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          isSelected ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        Trang {pageNum}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          id={`btn-zoom-${pageNum}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleZoomPage(pageNum);
                          }}
                          className="p-1 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors opacity-80 group-hover:opacity-100"
                          title="Phóng to trang này"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-red-600 text-white' : 'border border-stone-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    </div>

                    {/* Page image or placeholder */}
                    <div className="w-full aspect-[1/1.414] bg-stone-100 rounded-lg overflow-hidden border border-stone-200/80 flex items-center justify-center relative">
                      {thumb?.dataUrl ? (
                        <img
                          src={thumb.dataUrl}
                          alt={`Trang ${pageNum}`}
                          className="w-full h-full object-contain pointer-events-none"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-3 text-center space-y-1 text-stone-400">
                          <FileText className="w-8 h-8 stroke-1" />
                          <span className="text-[10px]">Trang {pageNum}</span>
                        </div>
                      )}

                      {/* Highlight overlay when selected */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-red-500/10 pointer-events-none border-2 border-red-500 rounded-lg" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action trigger footer */}
          <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-stone-300/80 p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 transition-all">
            <div className="text-xs text-stone-700 text-center sm:text-left">
              {action === 'extract_selected' && (
                <p>
                  Sẽ trích xuất <strong className="text-red-700 font-bold">{selectedPages.size}</strong> trang đã chọn vào 1 tệp PDF duy nhất.
                </p>
              )}
              {action === 'separate_all' && (
                <p>
                  Sẽ xuất riêng từng trang thành các tệp PDF độc lập và đóng gói thành 1 file <strong>.ZIP</strong>.
                </p>
              )}
              {action === 'remove_selected' && (
                <p>
                  Sẽ loại bỏ <strong className="text-red-700 font-bold">{selectedPages.size}</strong> trang đã chọn, giữ lại{' '}
                  <strong className="text-stone-900 font-bold">{loadedPdf.totalPages - selectedPages.size}</strong> trang.
                </p>
              )}
            </div>

            {progress.isProcessing ? (
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium text-stone-700">{progress.statusText}</span>
              </div>
            ) : (
              <button
                type="button"
                id="btn-run-split"
                onClick={handleExecuteSplit}
                disabled={action === 'extract_selected' && selectedPages.size === 0}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98]"
              >
                <Scissors className="w-4 h-4" />
                <span>
                  {action === 'extract_selected'
                    ? `Thực hiện cắt tách (${selectedPages.size} trang)`
                    : action === 'separate_all'
                    ? 'Tách rời từng trang (ZIP)'
                    : `Xoá ${selectedPages.size} trang đã chọn`}
                </span>
              </button>
            )}
          </div>

          {/* Success Result View */}
          {splitResult && (
            <div className="bg-white rounded-2xl border-2 border-emerald-200 p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900">
                      {splitResult.isZip ? 'Đóng gói các trang thành ZIP thành công!' : 'Cắt tách PDF thành công!'}
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      Tệp tin đã sẵn sàng để tải về máy tính của bạn.
                    </p>
                  </div>
                </div>
              </div>

              {/* Prominent Download CTA Box */}
              <div className="p-6 rounded-2xl bg-red-50/50 border-2 border-red-200/70 space-y-4 text-center">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-stone-900">
                    Bấm vào đây để tải file về máy tính:
                  </h4>
                  <p className="text-xs text-stone-500">
                    Tên file: <span className="font-mono text-stone-700 font-medium">{splitResult.fileName}</span>
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                  <a
                    id="btn-download-split-main"
                    href={splitResult.blobUrl}
                    download={splitResult.fileName}
                    onClick={() => {
                      downloadBlob(splitResult.blob, splitResult.fileName);
                      setDownloadTriggered(true);
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-base sm:text-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    <Download className="w-6 h-6 shrink-0" />
                    <span>TẢI TỆP VỀ MÁY ({formatBytes(splitResult.blob.size)})</span>
                  </a>

                  {!splitResult.isZip && (
                    <a
                      id="btn-open-split-tab"
                      href={splitResult.blobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 text-sm font-semibold transition-colors"
                      title="Mở trong tab mới của trình duyệt"
                    >
                      <ExternalLink className="w-4 h-4 text-stone-500" />
                      <span>Mở trong tab mới</span>
                    </a>
                  )}
                </div>

                {downloadTriggered && (
                  <p className="text-xs text-emerald-700 font-medium pt-1">
                    ✓ Trình duyệt đã kích hoạt tải tệp tự động. Nếu bạn chưa thấy tệp, vui lòng bấm vào nút đỏ phía trên.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  id="btn-split-reset"
                  onClick={() => setSplitResult(null)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4 text-stone-500" />
                  <span>Tuỳ chỉnh lại trang</span>
                </button>

                {!splitResult.isZip && (
                  <button
                    type="button"
                    id="btn-preview-split"
                    onClick={() =>
                      onOpenPreview({
                        title: splitResult.fileName,
                        pdfBlobUrl: splitResult.blobUrl,
                      })
                    }
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-sm font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4 text-stone-500" />
                    <span>Xem thử tài liệu</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
