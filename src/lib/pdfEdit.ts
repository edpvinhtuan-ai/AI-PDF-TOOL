import { PDFDocument, degrees } from 'pdf-lib';
import { pdfjsLib } from './pdfWorker';
import { PageEditState, PdfAnnotation } from '../types';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface PageTextBlock {
  id: string;
  text: string;
  // Normalized 0..1 relative to unrotated page viewport
  x: number;
  y: number;
  width: number;
  height: number;
  fontSizePt: number;
}

/**
 * Extracts text blocks from a specific PDF page using PDF.js so users can click any existing text to edit/replace it (Whiteout + Text).
 */
export async function extractPageTextBlocks(
  arrayBuffer: ArrayBuffer,
  pageNumber: number,
  extraRotation = 0
): Promise<PageTextBlock[]> {
  try {
    const bufferCopy = arrayBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);

    const baseRotation = (page.rotate + extraRotation) % 360;
    const viewport = page.getViewport({ scale: 1.0, rotation: baseRotation });
    const textContent = await page.getTextContent();

    const rawBlocks: PageTextBlock[] = [];

    for (let i = 0; i < textContent.items.length; i++) {
      const item = textContent.items[i] as {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      };
      if (!item.str || !item.str.trim() || !item.transform) continue;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 12;
      const x = tx[4];
      const y = tx[5] - fontHeight * 0.85;
      const w = Math.max(item.width ? item.width * viewport.scale : item.str.length * (fontHeight * 0.52), 16);
      const h = Math.max(fontHeight * 1.18, 12);

      const normX = Math.max(0, Math.min(0.98, x / viewport.width));
      const normY = Math.max(0, Math.min(0.98, y / viewport.height));
      const normW = Math.max(0.02, Math.min(1 - normX, w / viewport.width));
      const normH = Math.max(0.015, Math.min(1 - normY, h / viewport.height));

      rawBlocks.push({
        id: `tb-${pageNumber}-${i}`,
        text: item.str,
        x: normX,
        y: normY,
        width: normW,
        height: normH,
        fontSizePt: Math.round(Math.max(8, Math.min(48, fontHeight))),
      });
    }

    // Group adjacent horizontal fragments on the same line for comfortable editing
    const merged: PageTextBlock[] = [];
    for (const block of rawBlocks) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        Math.abs(prev.y - block.y) < 0.008 &&
        Math.abs(prev.fontSizePt - block.fontSizePt) <= 3 &&
        block.x >= prev.x &&
        block.x - (prev.x + prev.width) < 0.03
      ) {
        const rightEdge = Math.max(prev.x + prev.width, block.x + block.width);
        const needSpace = !prev.text.endsWith(' ') && !block.text.startsWith(' ');
        prev.text = `${prev.text}${needSpace ? ' ' : ''}${block.text}`;
        prev.width = rightEdge - prev.x;
        prev.height = Math.max(prev.height, block.height);
      } else {
        merged.push({ ...block });
      }
    }

    return merged;
  } catch (err) {
    console.warn('Không thể trích xuất text layer để sửa nhanh:', err);
    return [];
  }
}

/**
 * Renders an annotation onto a 2D HTML5 Canvas context at the given canvas width/height and scale ratio.
 * Using HTML5 Canvas guarantees 100% Vietnamese Unicode support, custom shapes, opacity, and smooth curves.
 */
export async function drawAnnotationsOnCanvas(
  ctx: CanvasRenderingContext2D,
  annotations: PdfAnnotation[],
  canvasWidth: number,
  canvasHeight: number,
  scaleRatio: number
): Promise<void> {
  for (const ann of annotations) {
    ctx.save();

    if (ann.type === 'draw' || ann.type === 'highlight') {
      const pts = ann.points || [];
      if (pts.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = ann.color || (ann.type === 'highlight' ? '#facc15' : '#dc2626');
        ctx.lineWidth = (ann.strokeWidth || (ann.type === 'highlight' ? 18 : 3)) * scaleRatio;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = ann.opacity ?? (ann.type === 'highlight' ? 0.4 : 1);

        ctx.moveTo(pts[0].x * canvasWidth, pts[0].y * canvasHeight);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * canvasWidth, pts[i].y * canvasHeight);
        }
        if (pts.length === 1) {
          ctx.lineTo(pts[0].x * canvasWidth + 0.5, pts[0].y * canvasHeight + 0.5);
        }
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    const x = ann.x * canvasWidth;
    const y = ann.y * canvasHeight;
    const w = ann.width * canvasWidth;
    const h = ann.height * canvasHeight;

    ctx.globalAlpha = ann.opacity ?? 1;

    if (ann.type === 'rect') {
      if (ann.backgroundColor && ann.backgroundColor !== 'transparent') {
        ctx.fillStyle = ann.backgroundColor;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = ann.color || '#dc2626';
      ctx.lineWidth = (ann.strokeWidth || 2) * scaleRatio;
      ctx.strokeRect(x, y, w, h);
    } else if (ann.type === 'whiteout' || ann.type === 'text') {
      // Background box (Whiteout always has background fill, Text may have optional background fill)
      if (ann.type === 'whiteout' || (ann.backgroundColor && ann.backgroundColor !== 'transparent')) {
        ctx.fillStyle = ann.backgroundColor && ann.backgroundColor !== 'transparent' ? ann.backgroundColor : '#ffffff';
        ctx.fillRect(x, y, w, h);
      }

      if (ann.borderColor && ann.borderColor !== 'transparent') {
        ctx.strokeStyle = ann.borderColor;
        ctx.lineWidth = 1.5 * scaleRatio;
        ctx.strokeRect(x, y, w, h);
      }

      if (ann.text && ann.text.trim()) {
        const fontSizePx = (ann.fontSize || 14) * scaleRatio;
        const weight = ann.fontWeight === 'bold' ? 'bold' : 'normal';
        ctx.font = `${weight} ${fontSizePx}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = ann.color || '#111827';
        ctx.textBaseline = 'top';

        const paddingX = 4 * scaleRatio;
        const paddingY = 3 * scaleRatio;
        const lines = ann.text.split('\n');
        const lineHeight = fontSizePx * 1.25;

        lines.forEach((line, idx) => {
          ctx.fillText(line, x + paddingX, y + paddingY + idx * lineHeight);
        });
      }
    } else if (ann.type === 'image' && ann.imageDataUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, x, y, w, h);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = ann.imageDataUrl!;
      });
    }

    ctx.restore();
  }
}

/**
 * Exports the edited PDF document preserving pristine vector pages where possible and embedding high-DPI
 * transparent PNG overlays for pages containing Vietnamese text/drawings/signatures/whiteouts.
 */
export async function exportEditedPdf(
  arrayBuffer: ArrayBuffer,
  pageStates: PageEditState[],
  annotations: PdfAnnotation[],
  watermarkText: string,
  addPageNumbers: boolean,
  onProgress: (percent: number, statusText: string) => void
): Promise<{ blob: Blob; totalPages: number }> {
  const activePages = pageStates.filter((p) => !p.deleted);
  if (activePages.length === 0) {
    throw new Error('Không thể xuất file PDF khi đã xoá toàn bộ các trang. Vui lòng giữ lại ít nhất 1 trang.');
  }

  onProgress(10, 'Đang đọc cấu trúc tài liệu PDF gốc...');
  const safeBuffer = arrayBuffer.slice(0);
  const sourceDoc = await PDFDocument.load(safeBuffer, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();

  for (let i = 0; i < activePages.length; i++) {
    const pageState = activePages[i];
    const origIdx = pageState.originalPageNumber - 1;
    const percent = Math.round(15 + ((i + 1) / activePages.length) * 75);
    onProgress(percent, `Đang áp dụng chỉnh sửa cho trang ${i + 1} / ${activePages.length}...`);

    const [copiedPage] = await outDoc.copyPages(sourceDoc, [origIdx]);
    const currentRotation = copiedPage.getRotation().angle;
    const totalRotation = (currentRotation + pageState.rotation) % 360;
    if (pageState.rotation !== 0) {
      copiedPage.setRotation(degrees(totalRotation));
    }

    outDoc.addPage(copiedPage);

    const pageAnns = annotations.filter((a) => a.pageNumber === pageState.originalPageNumber);
    const hasWatermark = Boolean(watermarkText.trim());

    if (pageAnns.length > 0 || hasWatermark || addPageNumbers) {
      const { width, height } = copiedPage.getSize();
      const isRotated90or270 = totalRotation % 180 !== 0;
      const displayWidth = isRotated90or270 ? height : width;
      const displayHeight = isRotated90or270 ? width : height;

      // Render annotations onto a crisp 2.5x DPI transparent canvas
      const dpiScale = 2.5;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(displayWidth * dpiScale);
      canvas.height = Math.round(displayHeight * dpiScale);
      const ctx = canvas.getContext('2d');

      if (ctx) {
        await drawAnnotationsOnCanvas(ctx, pageAnns, canvas.width, canvas.height, dpiScale);

        // Optional diagonal watermark
        if (hasWatermark) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(-Math.PI / 5);
          const wmFontSize = Math.round(Math.min(displayWidth, displayHeight) * 0.085 * dpiScale);
          ctx.font = `bold ${wmFontSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(185, 28, 28, 0.14)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(watermarkText.trim(), 0, 0);
          ctx.restore();
        }

        // Optional page numbering
        if (addPageNumbers) {
          ctx.save();
          const numFontSize = Math.round(10.5 * dpiScale);
          ctx.font = `600 ${numFontSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = '#44403c';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(
            `Trang ${i + 1} / ${activePages.length}`,
            canvas.width / 2,
            canvas.height - 14 * dpiScale
          );
          ctx.restore();
        }

        const pngDataUrl = canvas.toDataURL('image/png');
        const pngBytes = dataUrlToUint8Array(pngDataUrl);
        const embeddedOverlay = await outDoc.embedPng(pngBytes);

        // Draw overlay matching the page visual orientation
        if (totalRotation === 0) {
          copiedPage.drawImage(embeddedOverlay, {
            x: 0,
            y: 0,
            width: displayWidth,
            height: displayHeight,
          });
        } else if (totalRotation === 90) {
          copiedPage.drawImage(embeddedOverlay, {
            x: 0,
            y: height,
            width: displayWidth,
            height: displayHeight,
            rotate: degrees(-90),
          });
        } else if (totalRotation === 180) {
          copiedPage.drawImage(embeddedOverlay, {
            x: width,
            y: height,
            width: displayWidth,
            height: displayHeight,
            rotate: degrees(180),
          });
        } else if (totalRotation === 270) {
          copiedPage.drawImage(embeddedOverlay, {
            x: width,
            y: 0,
            width: displayWidth,
            height: displayHeight,
            rotate: degrees(90),
          });
        }
      }
    }
  }

  onProgress(94, 'Đang đóng gói tệp PDF đã chỉnh sửa...');
  const savedBytes = await outDoc.save({ useObjectStreams: true });
  onProgress(100, 'Lưu chỉnh sửa PDF hoàn tất!');

  return {
    blob: new Blob([savedBytes], { type: 'application/pdf' }),
    totalPages: activePages.length,
  };
}
