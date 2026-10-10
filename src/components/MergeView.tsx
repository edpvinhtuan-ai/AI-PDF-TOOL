import React, { useState } from 'react';
import {
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Plus,
  FileText,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  Eye,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { MergeItem, ProcessProgress } from '../types';
import { downloadBlob, formatBytes, mergePdfs } from '../lib/pdfUtils';
import { DropZone } from './DropZone';

interface MergeViewProps {
  onOpenPreview: (data: { title: string; pdfBlobUrl?: string }) => void;
}

export const MergeView: React.FC<MergeViewProps> = ({ onOpenPreview }) => {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [outputFileName, setOutputFileName] = useState<string>('tai-lieu-ghep-noi.pdf');
  const [progress, setProgress] = useState<ProcessProgress>({
    isProcessing: false,
    statusText: '',
    percent: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadTriggered, setDownloadTriggered] = useState(false);

  const [mergedResult, setMergedResult] = useState<{
    blob: Blob;
    totalPages: number;
    totalSize: number;
    blobUrl: string;
    downloadName: string;
  } | null>(null);

  const handleFilesAdded = async (files: File[]) => {
    const { PDFDocument } = await import('pdf-lib');
    const newItems: MergeItem[] = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        newItems.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          pageCount: doc.getPageCount(),
          arrayBuffer,
        });
      } catch (e) {
        console.warn(`Không đọc được file ${file.name}:`, e);
      }
    }

    if (newItems.length > 0) {
      setItems((prev) => [...prev, ...newItems]);
      setMergedResult(null);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
    setMergedResult(null);
  };

  const moveDown = (index: number) => {
    if (index === items.length - 1) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
    setMergedResult(null);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setMergedResult(null);
  };

  const clearAll = () => {
    setItems([]);
    setMergedResult(null);
  };

  const totalPages = items.reduce((acc, it) => acc + it.pageCount, 0);
  const totalOriginalSize = items.reduce((acc, it) => acc + it.size, 0);

  const handleMerge = async () => {
    if (items.length < 2) {
      alert('Vui lòng chọn ít nhất 2 tệp PDF để ghép nối.');
      return;
    }

    setErrorMessage(null);
    setDownloadTriggered(false);
    setProgress({
      isProcessing: true,
      statusText: 'Đang chuẩn bị ghép nối các tệp...',
      percent: 10,
    });

    try {
      const filesForMerge = items.map((it) => ({
        arrayBuffer: it.arrayBuffer,
        name: it.name,
      }));

      const res = await mergePdfs(filesForMerge, (percent, statusText) => {
        setProgress({
          isProcessing: true,
          statusText,
          percent,
        });
      });

      const blobUrl = URL.createObjectURL(res.blob);
      const cleanName = outputFileName.trim().toLowerCase().endsWith('.pdf')
        ? outputFileName.trim()
        : `${outputFileName.trim() || 'tai-lieu-ghep-noi'}.pdf`;

      setMergedResult({
        blob: res.blob,
        totalPages: res.totalPages,
        totalSize: res.totalSize,
        blobUrl,
        downloadName: cleanName,
      });

      // Auto download
      try {
        downloadBlob(res.blob, cleanName);
        setDownloadTriggered(true);
      } catch (dlErr) {
        console.warn('Auto download error:', dlErr);
      }
    } catch (err: unknown) {
      console.error('Lỗi khi ghép PDF:', err);
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi ghép nối PDF.';
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
    if (!mergedResult) return;
    downloadBlob(mergedResult.blob, mergedResult.downloadName);
    setDownloadTriggered(true);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-xl font-bold text-stone-900">Ghép Nối Nhiều File PDF Thành 1</h2>
        <p className="text-sm text-stone-600 max-w-xl mx-auto">
          Kết hợp 2 hoặc nhiều tài liệu PDF theo thứ tự bạn mong muốn thành một file duy nhất nhanh chóng và dễ dàng.
        </p>
      </div>

      {/* When no files added yet */}
      {items.length === 0 ? (
        <div className="space-y-4">
          <DropZone
            multiple={true}
            onFilesSelected={handleFilesAdded}
            title="Kéo thả nhiều tệp PDF cần ghép vào đây"
            description="Có thể chọn nhiều tệp cùng lúc từ máy tính để ghép nối"
          />
        </div>
      ) : (
        <div className="space-y-6">
          {/* List header & controls */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  Danh sách tệp tin ghép nối ({items.length} tệp • {totalPages} trang)
                </h3>
                <p className="text-xs text-stone-500">
                  Dùng mũi tên lên/xuống để sắp xếp thứ tự xuất hiện trong file kết quả
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-clear-merge-list"
                  onClick={clearAll}
                  className="text-xs text-stone-500 hover:text-red-600 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
                >
                  Xoá toàn bộ
                </button>
              </div>
            </div>

            {/* Reorderable Items List */}
            <div className="space-y-2.5">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  id={`merge-item-${index}`}
                  className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white hover:border-stone-300 transition-all shadow-2xs gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Index badge */}
                    <span className="w-7 h-7 rounded-lg bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>

                    <div className="w-9 h-9 rounded-lg bg-white border border-stone-200 text-red-600 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-medium text-stone-900 truncate">{item.name}</h4>
                      <p className="text-[11px] text-stone-500">
                        {item.pageCount} trang • {formatBytes(item.size)}
                      </p>
                    </div>
                  </div>

                  {/* Move & delete actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      id={`btn-move-up-${index}`}
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="p-1.5 rounded-lg hover:bg-stone-200 disabled:opacity-30 text-stone-600 transition-colors"
                      title="Di chuyển lên trên"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      id={`btn-move-down-${index}`}
                      onClick={() => moveDown(index)}
                      disabled={index === items.length - 1}
                      className="p-1.5 rounded-lg hover:bg-stone-200 disabled:opacity-30 text-stone-600 transition-colors"
                      title="Di chuyển xuống dưới"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      id={`btn-remove-${index}`}
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-600 transition-colors ml-1"
                      title="Xoá tệp này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add more files dropzone or button */}
            <div className="pt-2">
              <DropZone
                multiple={true}
                onFilesSelected={handleFilesAdded}
                title="Thêm tệp PDF khác vào danh sách"
                description="Kéo thả hoặc nhấn để chọn thêm tài liệu"
              />
            </div>
          </div>

          {/* Configuration & Action Card */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 max-w-sm">
                <label htmlFor="output-filename" className="block text-xs font-medium text-stone-700 mb-1">
                  Tên tệp sau khi ghép nối:
                </label>
                <input
                  type="text"
                  id="output-filename"
                  value={outputFileName}
                  onChange={(e) => setOutputFileName(e.target.value)}
                  placeholder="tai-lieu-ghep-noi.pdf"
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              {/* Progress or Merge Button */}
              {progress.isProcessing ? (
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-medium text-stone-700">{progress.statusText}</span>
                </div>
              ) : (
                <button
                  type="button"
                  id="btn-run-merge"
                  onClick={handleMerge}
                  disabled={items.length < 2}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-sm shadow-xs transition-colors self-end sm:self-auto"
                >
                  <Layers className="w-4 h-4" />
                  <span>Ghép nối {items.length} tệp PDF</span>
                </button>
              )}
            </div>

            {items.length < 2 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Cần tối thiểu 2 tệp PDF để thực hiện ghép nối. Vui lòng thêm thêm tệp.</span>
              </div>
            )}
          </div>

          {/* Success Result View */}
          {mergedResult && (
            <div className="bg-white rounded-2xl border-2 border-emerald-200 p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900">Ghép nối PDF thành công!</h3>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      Đã gộp <strong>{items.length}</strong> tệp thành 1 file gồm <strong>{mergedResult.totalPages}</strong> trang ({formatBytes(mergedResult.totalSize)}).
                    </p>
                  </div>
                </div>
              </div>

              {/* Prominent Download Call-To-Action Box */}
              <div className="p-6 rounded-2xl bg-red-50/50 border-2 border-red-200/70 space-y-4 text-center">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-stone-900">
                    Bấm vào đây để tải tệp đã ghép về máy:
                  </h4>
                  <p className="text-xs text-stone-500">
                    Tên tệp: <span className="font-mono text-stone-700 font-medium">{mergedResult.downloadName}</span>
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                  <a
                    id="btn-download-merged-main"
                    href={mergedResult.blobUrl}
                    download={mergedResult.downloadName}
                    onClick={handleDownload}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-base sm:text-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    <Download className="w-6 h-6 shrink-0" />
                    <span>TẢI TỆP ĐÃ GHÉP ({formatBytes(mergedResult.totalSize)})</span>
                  </a>

                  <a
                    id="btn-open-merged-tab"
                    href={mergedResult.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 text-sm font-semibold transition-colors"
                    title="Mở file trong tab mới của trình duyệt"
                  >
                    <ExternalLink className="w-4 h-4 text-stone-500" />
                    <span>Mở trong tab mới</span>
                  </a>
                </div>

                {downloadTriggered && (
                  <p className="text-xs text-emerald-700 font-medium pt-1">
                    ✓ Trình duyệt đã kích hoạt tải tệp tự động. Nếu chưa thấy tệp, vui lòng bấm nút đỏ ở trên.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  id="btn-merge-another"
                  onClick={() => setMergedResult(null)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4 text-stone-500" />
                  <span>Tuỳ chỉnh lại danh sách</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-preview-merged"
                    onClick={() =>
                      onOpenPreview({
                        title: mergedResult.downloadName,
                        pdfBlobUrl: mergedResult.blobUrl,
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
