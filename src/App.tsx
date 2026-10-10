/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ActiveTab, LoadedPdf } from './types';
import { Header } from './components/Header';
import { CompressView } from './components/CompressView';
import { SplitView } from './components/SplitView';
import { MergeView } from './components/MergeView';
import { PdfToWordView } from './components/PdfToWordView';
import { PdfToExcelView } from './components/PdfToExcelView';
import { PreviewModal } from './components/PreviewModal';
import { ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('merge');
  const [compressPdf, setCompressPdf] = useState<LoadedPdf | null>(null);
  const [splitPdf, setSplitPdf] = useState<LoadedPdf | null>(null);
  const [wordPdf, setWordPdf] = useState<LoadedPdf | null>(null);
  const [excelPdf, setExcelPdf] = useState<LoadedPdf | null>(null);

  // Modal preview state
  const [previewState, setPreviewState] = useState<{
    isOpen: boolean;
    title: string;
    imageUrl?: string | null;
    pdfBlobUrl?: string | null;
  }>({
    isOpen: false,
    title: '',
  });

  const handleOpenPreview = (data: { title: string; imageUrl?: string; pdfBlobUrl?: string }) => {
    setPreviewState({
      isOpen: true,
      title: data.title,
      imageUrl: data.imageUrl || null,
      pdfBlobUrl: data.pdfBlobUrl || null,
    });
  };

  const handleClosePreview = () => {
    setPreviewState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="min-h-screen bg-stone-100/60 text-stone-900 flex flex-col font-sans selection:bg-red-100 selection:text-red-900">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Active View */}
        {activeTab === 'compress' && (
          <CompressView
            loadedPdf={compressPdf}
            onSetLoadedPdf={setCompressPdf}
            onOpenPreview={handleOpenPreview}
          />
        )}

        {activeTab === 'split' && (
          <SplitView
            loadedPdf={splitPdf}
            onSetLoadedPdf={setSplitPdf}
            onOpenPreview={handleOpenPreview}
          />
        )}

        {activeTab === 'merge' && (
          <MergeView
            onOpenPreview={handleOpenPreview}
          />
        )}

        {activeTab === 'to-word' && (
          <PdfToWordView
            loadedPdf={wordPdf}
            onSetLoadedPdf={setWordPdf}
            onOpenPreview={handleOpenPreview}
          />
        )}

        {activeTab === 'to-excel' && (
          <PdfToExcelView
            loadedPdf={excelPdf}
            onSetLoadedPdf={setExcelPdf}
            onOpenPreview={handleOpenPreview}
          />
        )}
      </main>

      {/* Security & Privacy Banner */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-4">
        <div className="rounded-2xl bg-white border border-stone-200/80 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-600 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-stone-800">Xử lý cục bộ 100% trên trình duyệt (Client-side)</p>
              <p className="text-stone-500 text-[11px]">
                Tệp tin PDF không được lưu trữ hay gửi lên bất kỳ máy chủ bên thứ ba nào, an toàn và bảo mật thông tin tối đa.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-stone-500 text-[11px]">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Không giới hạn dung lượng
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Miễn phí hoàn toàn
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-4 mt-4">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
          <p>© 2026 PDF Tools Studio. Bộ công cụ Ghép nối, Cắt &amp; Nén PDF trực tuyến.</p>
          <div className="flex items-center gap-4">
            <span>Xử lý siêu tốc</span>
            <span>•</span>
            <span>Bảo mật dữ liệu</span>
            <span>•</span>
            <span>Chuẩn PDF quốc tế</span>
          </div>
        </div>
      </footer>

      {/* Preview Modal */}
      <PreviewModal
        isOpen={previewState.isOpen}
        onClose={handleClosePreview}
        title={previewState.title}
        imageUrl={previewState.imageUrl}
        pdfBlobUrl={previewState.pdfBlobUrl}
      />
    </div>
  );
}
