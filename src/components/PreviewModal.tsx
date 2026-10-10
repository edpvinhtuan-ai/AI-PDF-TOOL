import React from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  imageUrl?: string | null;
  pdfBlobUrl?: string | null;
  onDownload?: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  imageUrl,
  pdfBlobUrl,
  onDownload,
}) => {
  const [zoom, setZoom] = React.useState<number>(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <h3 className="font-semibold text-stone-900 text-sm sm:text-base truncate max-w-[70%]">{title}</h3>
          
          <div className="flex items-center gap-2">
            {imageUrl && (
              <div className="flex items-center border border-stone-200 rounded-lg bg-white overflow-hidden text-xs">
                <button
                  type="button"
                  id="btn-zoom-out"
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                  className="p-1.5 hover:bg-stone-100 text-stone-600 transition-colors"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-stone-600">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  id="btn-zoom-in"
                  onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                  className="p-1.5 hover:bg-stone-100 text-stone-600 transition-colors"
                  title="Phóng to"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            )}

            {onDownload && (
              <button
                type="button"
                id="btn-preview-download"
                onClick={onDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải về</span>
              </button>
            )}

            <button
              type="button"
              id="btn-close-modal"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-stone-100/70 flex items-center justify-center min-h-[350px]">
          {imageUrl ? (
            <div
              className="transition-transform duration-150 shadow-md bg-white rounded-lg p-2 max-w-full"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            >
              <img
                src={imageUrl}
                alt="Bản xem trước trang PDF"
                className="max-h-[70vh] object-contain rounded-xs border border-stone-200 select-none"
              />
            </div>
          ) : pdfBlobUrl ? (
            <iframe
              src={pdfBlobUrl}
              title="Xem tệp PDF"
              className="w-full h-[70vh] border-0 rounded-lg shadow-xs bg-white"
            />
          ) : (
            <p className="text-sm text-stone-500">Đang tải bản xem trước...</p>
          )}
        </div>
      </div>
    </div>
  );
};
