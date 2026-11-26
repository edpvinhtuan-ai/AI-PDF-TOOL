import React, { useState, useEffect, useRef } from 'react';
import {
  PenTool,
  Type,
  Eraser,
  Highlighter,
  Square,
  Image as ImageIcon,
  Stamp,
  MousePointer,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Undo2,
  Download,
  Eye,
  FileText,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Plus,
  X,
  Sparkles,
  Hash,
  Bold,
  ZoomIn,
  ZoomOut,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  LoadedPdf,
  PageEditState,
  PageThumbnail,
  PdfAnnotation,
  PdfEditTool,
  ProcessProgress,
} from '../types';
import {
  downloadBlob,
  formatBytes,
  generatePageThumbnails,
} from '../lib/pdfUtils';
import {
  extractPageTextBlocks,
  exportEditedPdf,
  PageTextBlock,
} from '../lib/pdfEdit';
import { pdfjsLib } from '../lib/pdfWorker';
import { DropZone } from './DropZone';

interface EditPdfViewProps {
  loadedPdf: LoadedPdf | null;
  onSetLoadedPdf: (pdf: LoadedPdf | null) => void;
  onOpenPreview: (data: { title: string; imageUrl?: string; pdfBlobUrl?: string }) => void;
}

const PRESET_COLORS = [
  { label: 'Đen', value: '#111827' },
  { label: 'Đỏ', value: '#dc2626' },
  { label: 'Xanh dương', value: '#2563eb' },
  { label: 'Xanh lá', value: '#16a34a' },
  { label: 'Tím', value: '#7c3aed' },
  { label: 'Cam', value: '#ea580c' },
];

const STAMP_PRESETS = [
  { label: 'ĐÃ DUYỆT', color: '#16a34a', bg: '#f0fdf4', border: '#16a34a' },
  { label: 'ĐÃ THANH TOÁN', color: '#dc2626', bg: '#fef2f2', border: '#dc2626' },
  { label: 'BẢN SAO Y BẢN CHÍNH', color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
  { label: 'KHẨN / ƯU TIÊN', color: '#ea580c', bg: '#fff7ed', border: '#ea580c' },
  { label: 'TÀI LIỆU MẬT', color: '#7c3aed', bg: '#f5f3ff', border: '#7c3aed' },
];

export const EditPdfView: React.FC<EditPdfViewProps> = ({
  loadedPdf,
  onSetLoadedPdf,
  onOpenPreview,
}) => {
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [pageStates, setPageStates] = useState<PageEditState[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0); // Index in pageStates
  const [activeTool, setActiveTool] = useState<PdfEditTool>('select');

  // Annotations & Undo history
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [history, setHistory] = useState<PdfAnnotation[][]>([]);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);

  // Detected existing text blocks on current page for 1-click inline text editing
  const [textBlocks, setTextBlocks] = useState<PageTextBlock[]>([]);
  const [showTextLayerHints, setShowTextLayerHints] = useState<boolean>(true);

  // Active style settings
  const [activeColor, setActiveColor] = useState<string>('#111827');
  const [fontSize, setFontSize] = useState<number>(15);
  const [isBold, setIsBold] = useState<boolean>(false);
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Document-wide options
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [addPageNumbers, setAddPageNumbers] = useState<boolean>(false);

  // Signature pad modal
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState<boolean>(false);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState<boolean>(false);

  // Page canvas rendering state
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayContainerRef = useRef<HTMLDivElement | null>(null);
  const [canvasDim, setCanvasDim] = useState<{ width: number; height: number }>({
    width: 595,
    height: 842,
  });

  // Freehand drawing state on page
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[] | null>(null);

  // Dragging existing annotation state
  const [draggingState, setDraggingState] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Resizing annotation state
  const [resizingState, setResizingState] = useState<{
    id: string;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  // Export state
  const [progress, setProgress] = useState<ProcessProgress>({
    isProcessing: false,
    statusText: '',
    percent: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadTriggered, setDownloadTriggered] = useState<boolean>(false);
  const [editResult, setEditResult] = useState<{
    blob: Blob;
    blobUrl: string;
    fileName: string;
    totalPages: number;
  } | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize when PDF loads
  useEffect(() => {
    if (!loadedPdf) {
      setThumbnails([]);
      setPageStates([]);
      setAnnotations([]);
      setHistory([]);
      setSelectedAnnId(null);
      setEditResult(null);
      setErrorMessage(null);
      return;
    }

    const initialPages: PageEditState[] = Array.from(
      { length: loadedPdf.totalPages },
      (_, idx) => ({
        originalPageNumber: idx + 1,
        rotation: 0,
        deleted: false,
      })
    );
    setPageStates(initialPages);
    setActivePageIndex(0);
    setAnnotations([]);
    setHistory([]);
    setSelectedAnnId(null);
    setEditResult(null);
    setErrorMessage(null);

    let isMounted = true;
    const safeBuffer = loadedPdf.bytes
      ? loadedPdf.bytes.slice(0).buffer
      : loadedPdf.arrayBuffer.slice(0);

    generatePageThumbnails(safeBuffer).then((thumbs) => {
      if (isMounted) setThumbnails(thumbs);
    });

    return () => {
      isMounted = false;
    };
  }, [loadedPdf]);

  const currentPageState = pageStates[activePageIndex];

  // Render current PDF page onto main canvas and extract clickable text blocks
  useEffect(() => {
    if (!loadedPdf || !currentPageState || !pageCanvasRef.current) return;

    let isCancelled = false;
    const renderCurrentPage = async () => {
      try {
        const safeBuffer = loadedPdf.bytes
          ? loadedPdf.bytes.slice(0).buffer
          : loadedPdf.arrayBuffer.slice(0);

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(safeBuffer) });
        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        const page = await pdf.getPage(currentPageState.originalPageNumber);
        if (isCancelled) return;

        const totalRotation = (page.rotate + currentPageState.rotation) % 360;
        const baseViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });

        // Base display width ~680px multiplied by zoomScale
        const displayScale = (680 / baseViewport.width) * zoomScale;
        const viewport = page.getViewport({ scale: displayScale, rotation: totalRotation });

        const canvas = pageCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasDim({ width: viewport.width, height: viewport.height });

        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({
            canvas,
            canvasContext: ctx,
            viewport,
          }).promise;
        }

        // Also extract text blocks for 1-click inline text editing
        const blocks = await extractPageTextBlocks(
          safeBuffer,
          currentPageState.originalPageNumber,
          currentPageState.rotation
        );
        if (!isCancelled) {
          setTextBlocks(blocks);
        }
      } catch (err) {
        console.warn('Lỗi render trang chỉnh sửa:', err);
      }
    };

    renderCurrentPage();
    return () => {
      isCancelled = true;
    };
  }, [loadedPdf, currentPageState?.originalPageNumber, currentPageState?.rotation, zoomScale]);

  const pushAnnotationState = (updater: (prev: PdfAnnotation[]) => PdfAnnotation[]) => {
    setAnnotations((prev) => {
      setHistory((h) => [...h.slice(-19), prev]);
      return updater(prev);
    });
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setAnnotations(previous);
    setSelectedAnnId(null);
  };

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

  // Convert click on existing PDF text block into an editable Whiteout + Text replacement box
  const handleReplaceExistingTextBlock = (block: PageTextBlock) => {
    if (!currentPageState) return;
    const newId = crypto.randomUUID();
    const replacementAnn: PdfAnnotation = {
      id: newId,
      pageNumber: currentPageState.originalPageNumber,
      type: 'whiteout',
      x: Math.max(0, block.x - 0.004),
      y: Math.max(0, block.y - 0.003),
      width: Math.min(1 - block.x, Math.max(block.width + 0.025, 0.14)),
      height: Math.min(1 - block.y, Math.max(block.height + 0.012, 0.036)),
      text: block.text,
      fontSize: block.fontSizePt,
      fontWeight: isBold ? 'bold' : 'normal',
      color: activeColor,
      backgroundColor: '#ffffff',
    };

    pushAnnotationState((prev) => [...prev, replacementAnn]);
    setSelectedAnnId(newId);
    setActiveTool('select');
  };

  // Click on canvas to create new annotation depending on activeTool
  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentPageState || !overlayContainerRef.current) return;
    // Ignore if user clicked inside an existing annotation item
    if ((e.target as HTMLElement).closest('[data-ann-item="true"]')) {
      return;
    }

    const rect = overlayContainerRef.current.getBoundingClientRect();
    const normX = Math.max(0, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(0.95, (e.clientY - rect.top) / rect.height));

    if (activeTool === 'select') {
      setSelectedAnnId(null);
      return;
    }

    if (activeTool === 'draw' || activeTool === 'highlight') {
      setCurrentPath([{ x: normX, y: normY }]);
      return;
    }

    const newId = crypto.randomUUID();

    if (activeTool === 'text') {
      const newAnn: PdfAnnotation = {
        id: newId,
        pageNumber: currentPageState.originalPageNumber,
        type: 'text',
        x: normX,
        y: normY,
        width: 0.28,
        height: 0.055,
        text: 'Nhập văn bản mới...',
        fontSize,
        fontWeight: isBold ? 'bold' : 'normal',
        color: activeColor,
        backgroundColor: 'transparent',
      };
      pushAnnotationState((prev) => [...prev, newAnn]);
      setSelectedAnnId(newId);
      setActiveTool('select');
    } else if (activeTool === 'whiteout') {
      const newAnn: PdfAnnotation = {
        id: newId,
        pageNumber: currentPageState.originalPageNumber,
        type: 'whiteout',
        x: normX,
        y: normY,
        width: 0.26,
        height: 0.05,
        text: '',
        fontSize,
        fontWeight: isBold ? 'bold' : 'normal',
        color: activeColor,
        backgroundColor: '#ffffff',
      };
      pushAnnotationState((prev) => [...prev, newAnn]);
      setSelectedAnnId(newId);
      setActiveTool('select');
    } else if (activeTool === 'rect') {
      const newAnn: PdfAnnotation = {
        id: newId,
        pageNumber: currentPageState.originalPageNumber,
        type: 'rect',
        x: normX,
        y: normY,
        width: 0.22,
        height: 0.12,
        color: activeColor === '#111827' ? '#dc2626' : activeColor,
        backgroundColor: 'transparent',
        strokeWidth: 2.5,
      };
      pushAnnotationState((prev) => [...prev, newAnn]);
      setSelectedAnnId(newId);
      setActiveTool('select');
    }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayContainerRef.current) return;
    const rect = overlayContainerRef.current.getBoundingClientRect();

    // Freehand drawing or highlighting
    if (currentPath && (activeTool === 'draw' || activeTool === 'highlight')) {
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setCurrentPath((prev) => (prev ? [...prev, { x: normX, y: normY }] : null));
      return;
    }

    // Dragging an annotation box
    if (draggingState) {
      const dx = (e.clientX - draggingState.startX) / rect.width;
      const dy = (e.clientY - draggingState.startY) / rect.height;
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === draggingState.id
            ? {
                ...a,
                x: Math.max(0, Math.min(1 - a.width, draggingState.origX + dx)),
                y: Math.max(0, Math.min(1 - a.height, draggingState.origY + dy)),
              }
            : a
        )
      );
      return;
    }

    // Resizing an annotation box
    if (resizingState) {
      const dw = (e.clientX - resizingState.startX) / rect.width;
      const dh = (e.clientY - resizingState.startY) / rect.height;
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === resizingState.id
            ? {
                ...a,
                width: Math.max(0.03, Math.min(1 - a.x, resizingState.origW + dw)),
                height: Math.max(0.02, Math.min(1 - a.y, resizingState.origH + dh)),
              }
            : a
        )
      );
    }
  };

  const handleOverlayMouseUp = () => {
    if (currentPath && currentPath.length > 0 && currentPageState) {
      const isHighlight = activeTool === 'highlight';
      const newAnn: PdfAnnotation = {
        id: crypto.randomUUID(),
        pageNumber: currentPageState.originalPageNumber,
        type: isHighlight ? 'highlight' : 'draw',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        points: currentPath,
        color: isHighlight ? '#facc15' : activeColor === '#111827' ? '#dc2626' : activeColor,
        strokeWidth: isHighlight ? 18 : strokeWidth,
        opacity: isHighlight ? 0.38 : 1,
      };
      pushAnnotationState((prev) => [...prev, newAnn]);
      setCurrentPath(null);
    }
    setDraggingState(null);
    setResizingState(null);
  };

  const updateSelectedAnnotation = (patch: Partial<PdfAnnotation>) => {
    if (!selectedAnnId) return;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === selectedAnnId ? { ...a, ...patch } : a))
    );
  };

  const deleteAnnotation = (id: string) => {
    pushAnnotationState((prev) => prev.filter((a) => a.id !== id));
    if (selectedAnnId === id) setSelectedAnnId(null);
  };

  // Add Stamp annotation
  const handleAddStamp = (stamp: (typeof STAMP_PRESETS)[number]) => {
    if (!currentPageState) return;
    const newId = crypto.randomUUID();
    const newAnn: PdfAnnotation = {
      id: newId,
      pageNumber: currentPageState.originalPageNumber,
      type: 'text',
      x: 0.35,
      y: 0.15,
      width: 0.3,
      height: 0.06,
      text: stamp.label,
      fontSize: 16,
      fontWeight: 'bold',
      color: stamp.color,
      backgroundColor: stamp.bg,
      borderColor: stamp.border,
    };
    pushAnnotationState((prev) => [...prev, newAnn]);
    setSelectedAnnId(newId);
    setActiveTool('select');
  };

  // Add Image annotation
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentPageState) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const newId = crypto.randomUUID();
      const newAnn: PdfAnnotation = {
        id: newId,
        pageNumber: currentPageState.originalPageNumber,
        type: 'image',
        x: 0.3,
        y: 0.3,
        width: 0.25,
        height: 0.16,
        imageDataUrl: dataUrl,
      };
      pushAnnotationState((prev) => [...prev, newAnn]);
      setSelectedAnnId(newId);
      setActiveTool('select');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Signature Pad Handlers
  const clearSignaturePad = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSaveSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas || !currentPageState) return;
    const dataUrl = canvas.toDataURL('image/png');
    const newId = crypto.randomUUID();
    const newAnn: PdfAnnotation = {
      id: newId,
      pageNumber: currentPageState.originalPageNumber,
      type: 'image',
      x: 0.55,
      y: 0.72,
      width: 0.26,
      height: 0.11,
      imageDataUrl: dataUrl,
    };
    pushAnnotationState((prev) => [...prev, newAnn]);
    setSelectedAnnId(newId);
    setActiveTool('select');
    setIsSignatureModalOpen(false);
  };

  // Page operations: Rotate, Move Up/Down, Delete/Restore
  const rotatePage = (index: number) => {
    setPageStates((prev) =>
      prev.map((p, idx) =>
        idx === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
  };

  const toggleDeletePage = (index: number) => {
    const activeCount = pageStates.filter((p) => !p.deleted).length;
    const target = pageStates[index];
    if (!target.deleted && activeCount <= 1) {
      setErrorMessage('Phải giữ lại ít nhất 1 trang trong tài liệu PDF.');
      return;
    }
    setErrorMessage(null);
    setPageStates((prev) =>
      prev.map((p, idx) => (idx === index ? { ...p, deleted: !p.deleted } : p))
    );
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= pageStates.length) return;
    setPageStates((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
    setActivePageIndex(targetIdx);
  };

  // Export final edited PDF
  const handleExportPdf = async () => {
    if (!loadedPdf) return;
    setErrorMessage(null);
    setDownloadTriggered(false);
    setProgress({
      isProcessing: true,
      statusText: 'Đang chuẩn bị xuất tệp PDF đã chỉnh sửa...',
      percent: 10,
    });

    try {
      const safeBuffer = loadedPdf.bytes
        ? loadedPdf.bytes.slice(0).buffer
        : loadedPdf.arrayBuffer.slice(0);

      const res = await exportEditedPdf(
        safeBuffer,
        pageStates,
        annotations,
        watermarkText,
        addPageNumbers,
        (percent, statusText) => {
          setProgress({
            isProcessing: true,
            statusText,
            percent,
          });
        }
      );

      const baseName = loadedPdf.name.replace(/\.pdf$/i, '');
      const finalName = `${baseName}-da-chinh-sua.pdf`;
      const blobUrl = URL.createObjectURL(res.blob);

      setEditResult({
        blob: res.blob,
        blobUrl,
        fileName: finalName,
        totalPages: res.totalPages,
      });

      downloadBlob(res.blob, finalName);
      setDownloadTriggered(true);
    } catch (err: unknown) {
      console.error('Lỗi khi lưu chỉnh sửa PDF:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'Có lỗi xảy ra khi xuất tệp PDF đã chỉnh sửa.'
      );
    } finally {
      setProgress({
        isProcessing: false,
        statusText: '',
        percent: 0,
      });
    }
  };

  const currentPageAnnotations = currentPageState
    ? annotations.filter((a) => a.pageNumber === currentPageState.originalPageNumber)
    : [];

  const selectedAnnotation = annotations.find((a) => a.id === selectedAnnId) || null;

  return (
    <div className="space-y-6">
      {!loadedPdf ? (
        <div className="space-y-4">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold text-stone-900">
              Chỉnh Sửa Nội Dung &amp; Trang File PDF Trực Tiếp
            </h2>
            <p className="text-sm text-stone-600 max-w-2xl mx-auto">
              Sửa chữ trực tiếp trên trang, che tẩy nội dung cũ (Whiteout), chèn văn bản tiếng Việt,
              ký tên điện tử, đóng dấu mộc, tô sáng, xoay và sắp xếp thứ tự trang PDF.
            </p>
          </div>

          <DropZone
            onFilesSelected={handleFileSelected}
            title="Kéo thả tệp PDF cần chỉnh sửa vào đây"
            description="Hỗ trợ sửa văn bản trực tiếp, thêm chữ ký tay, hình ảnh, đóng dấu và xoay/xoá trang"
          />
        </div>
      ) : (
        <div className="space-y-5">
          {/* File Info & Primary Toolbar Header */}
          <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                <PenTool className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900 truncate max-w-xs sm:max-w-md">
                  {loadedPdf.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <span>{formatBytes(loadedPdf.size)}</span>
                  <span>•</span>
                  <span>
                    {pageStates.filter((p) => !p.deleted).length} / {loadedPdf.totalPages} trang
                  </span>
                  <span>•</span>
                  <span className="text-red-600 font-semibold">
                    {annotations.length} mục chỉnh sửa
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40 transition-colors"
                title="Hoàn tác thao tác vừa rồi"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Hoàn tác</span>
              </button>

              <button
                type="button"
                onClick={() => onSetLoadedPdf(null)}
                className="text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-3 py-1.5 rounded-lg border border-stone-200 transition-colors"
              >
                Chọn tệp khác
              </button>

              <button
                type="button"
                id="btn-save-edited-pdf-top"
                onClick={handleExportPdf}
                disabled={progress.isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Lưu &amp; Xuất PDF</span>
              </button>
            </div>
          </div>

          {/* Comprehensive Editor Toolbar */}
          <div className="bg-white rounded-2xl border border-stone-200 p-3 sm:p-4 shadow-xs space-y-3">
            {/* Row 1: Tool Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-stone-100">
              <button
                type="button"
                onClick={() => setActiveTool('select')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTool === 'select'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" />
                <span>Chọn / Sửa chữ có sẵn</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('text')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTool === 'text'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Thêm chữ mới</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('whiteout')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTool === 'whiteout'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
                title="Che xoá nội dung cũ và viết đè chữ mới lên"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Xoá đè (Whiteout)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('highlight')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTool === 'highlight'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" />
                <span>Tô sáng</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('draw')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTool === 'draw'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Vẽ tự do</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTool('rect')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTool === 'rect'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Khung hộp</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSignatureModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-red-600" />
                <span>Chữ ký tay</span>
              </button>

              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all"
              >
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Chèn ảnh / Logo</span>
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              {/* Quick Stamp Dropdown / Pills */}
              <div className="relative group">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-all"
                >
                  <Stamp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Đóng dấu mộc</span>
                </button>
                <div className="hidden group-hover:flex flex-col absolute left-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-stone-200 p-1.5 z-30 gap-1">
                  {STAMP_PRESETS.map((st) => (
                    <button
                      key={st.label}
                      type="button"
                      onClick={() => handleAddStamp(st)}
                      className="text-left px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-stone-100 transition-colors"
                      style={{ color: st.color }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Style properties, Inline text toggle, Watermark & Page Numbering */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Color picker */}
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500 font-medium">Màu:</span>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => {
                        setActiveColor(c.value);
                        if (selectedAnnotation) {
                          updateSelectedAnnotation({ color: c.value });
                        }
                      }}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        (selectedAnnotation?.color || activeColor) === c.value
                          ? 'scale-125 ring-2 ring-red-400 border-white'
                          : 'border-stone-300'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>

                {/* Font size */}
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500 font-medium">Cỡ chữ:</span>
                  <select
                    value={selectedAnnotation?.fontSize || fontSize}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setFontSize(val);
                      if (selectedAnnotation) {
                        updateSelectedAnnotation({ fontSize: val });
                      }
                    }}
                    className="px-2 py-1 rounded-lg border border-stone-300 bg-white font-medium text-stone-800"
                  >
                    {[10, 12, 14, 15, 16, 18, 20, 24, 28, 32, 40].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz} pt
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const nextBold =
                        selectedAnnotation
                          ? selectedAnnotation.fontWeight !== 'bold'
                          : !isBold;
                      setIsBold(nextBold);
                      if (selectedAnnotation) {
                        updateSelectedAnnotation({
                          fontWeight: nextBold ? 'bold' : 'normal',
                        });
                      }
                    }}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      (selectedAnnotation
                        ? selectedAnnotation.fontWeight === 'bold'
                        : isBold)
                        ? 'bg-stone-800 text-white border-stone-800'
                        : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                    }`}
                    title="In đậm"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Toggle clickable existing text layer */}
                <label className="inline-flex items-center gap-1.5 cursor-pointer bg-amber-50/80 border border-amber-200/80 text-amber-900 px-2.5 py-1 rounded-lg font-medium">
                  <input
                    type="checkbox"
                    checked={showTextLayerHints}
                    onChange={(e) => setShowTextLayerHints(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span>Bắt chữ gốc trên PDF để bấm sửa nhanh</span>
                </label>
              </div>

              {/* Zoom & Document options */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1 bg-stone-100 px-2 py-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setZoomScale((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))}
                    className="p-0.5 hover:text-red-600"
                    title="Thu nhỏ"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-[11px] font-semibold px-1">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomScale((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
                    className="p-0.5 hover:text-red-600"
                    title="Phóng to"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <label className="inline-flex items-center gap-1.5 cursor-pointer text-stone-700 font-medium">
                  <input
                    type="checkbox"
                    checked={addPageNumbers}
                    onChange={(e) => setAddPageNumbers(e.target.checked)}
                    className="rounded text-red-600"
                  />
                  <Hash className="w-3.5 h-3.5 text-stone-500" />
                  <span>Đánh số trang</span>
                </label>

                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="Chèn chữ đóng dấu chìm (Watermark)..."
                  className="px-2.5 py-1 rounded-lg border border-stone-300 text-xs w-48 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Main Workspace: Left Sidebar Page Manager + Center Interactive Canvas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Sidebar: Pages List with Rotate, Reorder, Delete */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-stone-200 p-3.5 shadow-xs space-y-3 max-h-[720px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  Danh sách trang ({pageStates.length})
                </h4>
                <span className="text-[11px] text-stone-500">Xoay • Sắp xếp • Xoá</span>
              </div>

              <div className="space-y-2.5">
                {pageStates.map((pState, idx) => {
                  const thumb = thumbnails.find(
                    (t) => t.pageNumber === pState.originalPageNumber
                  );
                  const isActive = idx === activePageIndex;
                  const pageAnnCount = annotations.filter(
                    (a) => a.pageNumber === pState.originalPageNumber
                  ).length;

                  return (
                    <div
                      key={`${pState.originalPageNumber}-${idx}`}
                      onClick={() => setActivePageIndex(idx)}
                      className={`p-2.5 rounded-xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                        pState.deleted
                          ? 'opacity-45 bg-stone-50 border-stone-200'
                          : isActive
                          ? 'border-red-600 bg-red-50/30 shadow-xs'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      {/* Thumbnail preview */}
                      <div className="w-12 h-16 bg-stone-100 rounded-lg border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                        {thumb?.dataUrl ? (
                          <img
                            src={thumb.dataUrl}
                            alt={`Trang ${idx + 1}`}
                            className="w-full h-full object-contain"
                            style={{ transform: `rotate(${pState.rotation}deg)` }}
                          />
                        ) : (
                          <FileText className="w-5 h-5 text-stone-400" />
                        )}
                        {pageAnnCount > 0 && (
                          <span className="absolute bottom-0.5 right-0.5 bg-red-600 text-white text-[9px] font-bold px-1 rounded">
                            {pageAnnCount}
                          </span>
                        )}
                      </div>

                      {/* Page info & Quick controls */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-stone-900">
                            Trang {idx + 1}
                          </span>
                          {pState.originalPageNumber !== idx + 1 && (
                            <span className="text-[10px] text-stone-400">
                              (Gốc: {pState.originalPageNumber})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 mt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              rotatePage(idx);
                            }}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
                            title="Xoay 90°"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePage(idx, -1);
                            }}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-30"
                            title="Chuyển lên"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={idx === pageStates.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePage(idx, 1);
                            }}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-30"
                            title="Chuyển xuống"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDeletePage(idx);
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              pState.deleted
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                            title={pState.deleted ? 'Khôi phục trang' : 'Xoá trang này'}
                          >
                            {pState.deleted ? (
                              <RotateCcw className="w-3.5 h-3.5" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Center Workspace: Interactive PDF Page Canvas + Editable Overlays */}
            <div className="lg:col-span-9 bg-stone-200/70 rounded-2xl border border-stone-300/80 p-4 sm:p-6 flex flex-col items-center overflow-x-auto min-h-[640px]">
              {/* Helper contextual tip */}
              <div className="mb-3 px-3.5 py-1.5 rounded-full bg-white/90 border border-stone-200/80 text-xs text-stone-700 shadow-2xs flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-red-600 shrink-0" />
                {activeTool === 'select' && (
                  <span>
                    <strong>Mẹo:</strong> Nhấp trực tiếp vào bất kỳ dòng chữ nào có viền nét đứt trên trang PDF để <strong>sửa nội dung chữ gốc</strong>, hoặc kéo thả các hộp đã chèn.
                  </span>
                )}
                {activeTool === 'text' && (
                  <span>
                    Nhấp vào vị trí bất kỳ trên trang PDF bên dưới để <strong>chèn khung văn bản mới</strong>.
                  </span>
                )}
                {activeTool === 'whiteout' && (
                  <span>
                    Nhấp vào vùng cần che trên trang PDF để tạo <strong>hộp xoá trắng (Whiteout)</strong> và có thể gõ đè chữ mới lên.
                  </span>
                )}
                {(activeTool === 'draw' || activeTool === 'highlight') && (
                  <span>
                    Nhấn giữ chuột và kéo trên trang PDF để <strong>{activeTool === 'highlight' ? 'tô sáng nội dung' : 'vẽ nét bút tự do'}</strong>.
                  </span>
                )}
                {activeTool === 'rect' && (
                  <span>Nhấp vào trang để chèn khung hình chữ nhật đánh dấu.</span>
                )}
              </div>

              {currentPageState?.deleted ? (
                <div className="my-auto p-8 rounded-2xl bg-white border border-stone-200 text-center space-y-3 max-w-md">
                  <Trash2 className="w-10 h-10 text-red-500 mx-auto" />
                  <h4 className="text-base font-bold text-stone-900">
                    Trang {activePageIndex + 1} đang được đánh dấu xoá
                  </h4>
                  <p className="text-xs text-stone-500">
                    Trang này sẽ bị loại bỏ khi bạn xuất file PDF mới. Bạn có thể bấm khôi phục nếu muốn giữ lại.
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleDeletePage(activePageIndex)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Khôi phục trang này</span>
                  </button>
                </div>
              ) : (
                <div
                  ref={overlayContainerRef}
                  onMouseDown={handleOverlayMouseDown}
                  onMouseMove={handleOverlayMouseMove}
                  onMouseUp={handleOverlayMouseUp}
                  className="relative bg-white shadow-xl border border-stone-300 select-none"
                  style={{
                    width: canvasDim.width,
                    height: canvasDim.height,
                    cursor:
                      activeTool === 'text'
                        ? 'text'
                        : activeTool === 'select'
                        ? 'default'
                        : 'crosshair',
                  }}
                >
                  {/* Underlying PDF Page Canvas */}
                  <canvas
                    ref={pageCanvasRef}
                    className="block pointer-events-none"
                  />

                  {/* Watermark Live Preview */}
                  {watermarkText.trim() && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                      <span
                        className="font-bold text-red-700/15 uppercase tracking-widest whitespace-nowrap select-none"
                        style={{
                          fontSize: `${Math.round(canvasDim.width * 0.08)}px`,
                          transform: 'rotate(-22deg)',
                        }}
                      >
                        {watermarkText}
                      </span>
                    </div>
                  )}

                  {/* Page Number Live Preview */}
                  {addPageNumbers && (
                    <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
                      <span className="text-[11px] font-semibold text-stone-600 bg-white/75 px-2 py-0.5 rounded">
                        Trang {activePageIndex + 1} /{' '}
                        {pageStates.filter((p) => !p.deleted).length}
                      </span>
                    </div>
                  )}

                  {/* Detected PDF Native Text Blocks for 1-click inline replacement */}
                  {showTextLayerHints &&
                    activeTool === 'select' &&
                    textBlocks.map((tb) => (
                      <div
                        key={tb.id}
                        data-ann-item="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplaceExistingTextBlock(tb);
                        }}
                        title={`Bấm để sửa dòng chữ này: "${tb.text}"`}
                        className="absolute border border-transparent hover:border-dashed hover:border-blue-500 hover:bg-blue-500/10 rounded-xs transition-all cursor-text group"
                        style={{
                          left: `${tb.x * 100}%`,
                          top: `${tb.y * 100}%`,
                          width: `${tb.width * 100}%`,
                          height: `${tb.height * 100}%`,
                        }}
                      >
                        <span className="hidden group-hover:inline-flex items-center gap-0.5 absolute -top-5 left-0 bg-blue-600 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded shadow-xs whitespace-nowrap z-20">
                          <PenTool className="w-2.5 h-2.5" />
                          Bấm để sửa chữ
                        </span>
                      </div>
                    ))}

                  {/* SVG Layer for Freehand Drawings & Highlights */}
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${canvasDim.width} ${canvasDim.height}`}
                  >
                    {currentPageAnnotations
                      .filter((a) => a.type === 'draw' || a.type === 'highlight')
                      .map((ann) => {
                        const pts = ann.points || [];
                        if (pts.length === 0) return null;
                        const d = pts
                          .map(
                            (pt, i) =>
                              `${i === 0 ? 'M' : 'L'} ${pt.x * canvasDim.width} ${
                                pt.y * canvasDim.height
                              }`
                          )
                          .join(' ');
                        return (
                          <path
                            key={ann.id}
                            d={d}
                            fill="none"
                            stroke={ann.color || '#dc2626'}
                            strokeWidth={(ann.strokeWidth || 3) * zoomScale}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={ann.opacity ?? 1}
                            className="pointer-events-auto cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAnnId(ann.id);
                            }}
                          />
                        );
                      })}

                    {currentPath && currentPath.length > 0 && (
                      <path
                        d={currentPath
                          .map(
                            (pt, i) =>
                              `${i === 0 ? 'M' : 'L'} ${pt.x * canvasDim.width} ${
                                pt.y * canvasDim.height
                              }`
                          )
                          .join(' ')}
                        fill="none"
                        stroke={
                          activeTool === 'highlight'
                            ? '#facc15'
                            : activeColor === '#111827'
                            ? '#dc2626'
                            : activeColor
                        }
                        strokeWidth={(activeTool === 'highlight' ? 18 : strokeWidth) * zoomScale}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={activeTool === 'highlight' ? 0.4 : 1}
                      />
                    )}
                  </svg>

                  {/* Box Annotations: Text, Whiteout, Rect, Image/Signature */}
                  {currentPageAnnotations
                    .filter((a) => a.type !== 'draw' && a.type !== 'highlight')
                    .map((ann) => {
                      const isSelected = ann.id === selectedAnnId;

                      return (
                        <div
                          key={ann.id}
                          data-ann-item="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAnnId(ann.id);
                          }}
                          onMouseDown={(e) => {
                            if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
                            e.stopPropagation();
                            setSelectedAnnId(ann.id);
                            setDraggingState({
                              id: ann.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              origX: ann.x,
                              origY: ann.y,
                            });
                          }}
                          className={`absolute group transition-shadow ${
                            isSelected
                              ? 'ring-2 ring-red-600 shadow-md z-20'
                              : 'hover:ring-1 hover:ring-blue-500 z-10'
                          }`}
                          style={{
                            left: `${ann.x * 100}%`,
                            top: `${ann.y * 100}%`,
                            width: `${ann.width * 100}%`,
                            height: `${ann.height * 100}%`,
                            backgroundColor:
                              ann.type === 'whiteout'
                                ? ann.backgroundColor || '#ffffff'
                                : ann.backgroundColor && ann.backgroundColor !== 'transparent'
                                ? ann.backgroundColor
                                : 'transparent',
                            border:
                              ann.type === 'rect'
                                ? `${ann.strokeWidth || 2}px solid ${ann.color || '#dc2626'}`
                                : ann.borderColor
                                ? `1.5px solid ${ann.borderColor}`
                                : isSelected
                                ? '1px dashed #dc2626'
                                : '1px dashed transparent',
                            cursor: 'move',
                          }}
                        >
                          {/* Floating Action Bar when selected */}
                          {isSelected && (
                            <div className="absolute -top-7 left-0 flex items-center gap-1 bg-stone-900 text-white text-[10px] px-2 py-0.5 rounded-md shadow-sm whitespace-nowrap z-30">
                              <span>
                                {ann.type === 'whiteout'
                                  ? 'Hộp sửa/che chữ'
                                  : ann.type === 'text'
                                  ? 'Văn bản'
                                  : ann.type === 'image'
                                  ? 'Chữ ký / Ảnh'
                                  : 'Khung hộp'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAnnotation(ann.id);
                                }}
                                className="ml-1.5 text-red-300 hover:text-red-100"
                                title="Xoá mục này"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {/* Content rendering */}
                          {(ann.type === 'text' || ann.type === 'whiteout') && (
                            <textarea
                              value={ann.text || ''}
                              placeholder={
                                ann.type === 'whiteout'
                                  ? 'Để trống để che trắng, hoặc gõ chữ mới...'
                                  : 'Nhập văn bản...'
                              }
                              onChange={(e) =>
                                setAnnotations((prev) =>
                                  prev.map((item) =>
                                    item.id === ann.id
                                      ? { ...item, text: e.target.value }
                                      : item
                                  )
                                )
                              }
                              className="w-full h-full resize-none bg-transparent border-none focus:outline-none p-1 leading-snug overflow-hidden"
                              style={{
                                color: ann.color || '#111827',
                                fontSize: `${(ann.fontSize || 14) * zoomScale}px`,
                                fontWeight: ann.fontWeight === 'bold' ? 700 : 400,
                              }}
                            />
                          )}

                          {ann.type === 'image' && ann.imageDataUrl && (
                            <img
                              src={ann.imageDataUrl}
                              alt="Chữ ký hoặc Hình ảnh"
                              className="w-full h-full object-contain pointer-events-none"
                            />
                          )}

                          {/* Bottom-right resize handle */}
                          {isSelected && (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setResizingState({
                                  id: ann.id,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  origW: ann.width,
                                  origH: ann.height,
                                });
                              }}
                              className="w-3.5 h-3.5 bg-red-600 border-2 border-white rounded-full absolute -bottom-1.5 -right-1.5 cursor-nwse-resize shadow-xs"
                              title="Kéo để thay đổi kích thước"
                            />
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Sticky Save & Export Bar */}
          <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-stone-300/80 p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-stone-700 text-center sm:text-left">
              <p>
                Đang chỉnh sửa trang{' '}
                <strong className="text-stone-900">{activePageIndex + 1}</strong> • Tổng cộng{' '}
                <strong className="text-red-600">{annotations.length}</strong> nội dung thêm/sửa trên{' '}
                <strong className="text-stone-900">
                  {pageStates.filter((p) => !p.deleted).length}
                </strong>{' '}
                trang xuất bản.
              </p>
            </div>

            {progress.isProcessing ? (
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium text-stone-700">
                  {progress.statusText} ({progress.percent}%)
                </span>
              </div>
            ) : (
              <button
                type="button"
                id="btn-save-edited-pdf-bottom"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Hoàn tất &amp; Tải PDF đã chỉnh sửa</span>
              </button>
            )}
          </div>

          {/* Export Result Box */}
          {editResult && (
            <div className="bg-white rounded-2xl border-2 border-emerald-200 p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-stone-900">
                      Đã lưu các chỉnh sửa vào file PDF thành công!
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                      Tài liệu gồm {editResult.totalPages} trang với đầy đủ nội dung văn bản, chữ ký và bố cục bạn đã biên tập.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-red-50/50 border-2 border-red-200/70 space-y-4 text-center">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-stone-900">
                    Tải tệp PDF đã chỉnh sửa về máy:
                  </h4>
                  <p className="text-xs text-stone-500">
                    Tên file:{' '}
                    <span className="font-mono text-stone-700 font-medium">
                      {editResult.fileName}
                    </span>
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                  <a
                    id="btn-download-edited-pdf"
                    href={editResult.blobUrl}
                    download={editResult.fileName}
                    onClick={() => {
                      downloadBlob(editResult.blob, editResult.fileName);
                      setDownloadTriggered(true);
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-base shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    <Download className="w-5 h-5 shrink-0" />
                    <span>TẢI PDF ĐÃ CHỈNH SỬA ({formatBytes(editResult.blob.size)})</span>
                  </a>

                  <button
                    type="button"
                    onClick={() =>
                      onOpenPreview({
                        title: editResult.fileName,
                        pdfBlobUrl: editResult.blobUrl,
                      })
                    }
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 text-sm font-semibold transition-colors"
                  >
                    <Eye className="w-4 h-4 text-stone-500" />
                    <span>Xem trước file kết quả</span>
                  </button>

                  <a
                    href={editResult.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 text-stone-700 text-sm font-semibold transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 text-stone-500" />
                    <span>Mở tab mới</span>
                  </a>
                </div>

                {downloadTriggered && (
                  <p className="text-xs text-emerald-700 font-medium pt-1">
                    ✓ Đã tự động tải tệp về máy. Nếu trình duyệt chặn, hãy nhấn nút đỏ ở trên.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Handwritten Signature Pad Modal */}
      {isSignatureModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold text-stone-900">Tạo chữ ký tay điện tử</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSignatureModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-500">
              Dùng chuột hoặc màn hình cảm ứng ký tên vào khung bên dưới:
            </p>

            <div className="border-2 border-dashed border-stone-300 rounded-xl bg-stone-50 overflow-hidden">
              <canvas
                ref={sigCanvasRef}
                width={400}
                height={170}
                onMouseDown={(e) => {
                  const canvas = sigCanvasRef.current;
                  if (!canvas) return;
                  const rect = canvas.getBoundingClientRect();
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.strokeStyle = activeColor;
                    ctx.lineWidth = 2.6;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                    setIsDrawingSig(true);
                  }
                }}
                onMouseMove={(e) => {
                  if (!isDrawingSig) return;
                  const canvas = sigCanvasRef.current;
                  if (!canvas) return;
                  const rect = canvas.getBoundingClientRect();
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                    ctx.stroke();
                  }
                }}
                onMouseUp={() => setIsDrawingSig(false)}
                onMouseLeave={() => setIsDrawingSig(false)}
                className="w-full h-[170px] cursor-crosshair"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={clearSignaturePad}
                className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-100"
              >
                Xoá ký lại
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSignatureModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-100"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={handleSaveSignature}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Chèn chữ ký vào trang</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
