import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { pdfjsLib } from './pdfWorker';
import { CompressionLevel, PageThumbnail, SplitAction } from '../types';

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {
      // ignore
    }
    URL.revokeObjectURL(url);
  }, 10000);
}

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

export function parsePageRanges(input: string, maxPages: number): number[] {
  const pages = new Set<number>();
  const cleanInput = input.replace(/\s+/g, '');
  if (!cleanInput) return [];

  const parts = cleanInput.split(',');
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(maxPages, Math.max(start, end));
        for (let i = min; i <= max; i++) {
          pages.add(i);
        }
      }
    } else {
      const page = parseInt(part, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        pages.add(page);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

export async function getPdfInfo(arrayBuffer: ArrayBuffer) {
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  return { totalPages, pdfDoc };
}

export async function generatePageThumbnails(
  arrayBuffer: ArrayBuffer,
  onProgress?: (rendered: number, total: number) => void
): Promise<PageThumbnail[]> {
  try {
    const bufferCopy = arrayBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const thumbnails: PageThumbnail[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const originalViewport = page.getViewport({ scale: 1 });
        
        // Target width ~180 for crisp grid previews
        const scale = 180 / originalViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        if (context) {
          // Fill white background first
          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, canvas.width, canvas.height);
          
          await page.render({
            canvas: canvas,
            canvasContext: context,
            viewport: viewport,
          }).promise;

          thumbnails.push({
            pageNumber: pageNum,
            dataUrl: canvas.toDataURL('image/jpeg', 0.8),
            width: originalViewport.width,
            height: originalViewport.height,
            rotation: viewport.rotation,
          });
        }
      } catch (pageErr) {
        console.warn(`Lỗi render thumbnail trang ${pageNum}:`, pageErr);
        thumbnails.push({
          pageNumber: pageNum,
          width: 595,
          height: 842,
          rotation: 0,
        });
      }

      if (onProgress) {
        onProgress(pageNum, numPages);
      }
    }

    return thumbnails;
  } catch (err) {
    console.warn('Lỗi render PDF thumbnails qua PDF.js, dùng fallback:', err);
    // Fallback: use pdf-lib to get total pages and return placeholders
    const { totalPages } = await getPdfInfo(arrayBuffer.slice(0));
    const fallbacks: PageThumbnail[] = [];
    for (let i = 1; i <= totalPages; i++) {
      fallbacks.push({
        pageNumber: i,
        width: 595,
        height: 842,
        rotation: 0,
      });
    }
    return fallbacks;
  }
}

export async function renderHighResPage(arrayBuffer: ArrayBuffer, pageNum: number): Promise<string | null> {
  try {
    const bufferCopy = arrayBuffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNum);
    
    // High res scale
    const originalViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, 1000 / originalViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    if (context) {
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas,
        canvasContext: context,
        viewport: viewport,
      }).promise;
      return canvas.toDataURL('image/png');
    }
  } catch (e) {
    console.error('Không thể render trang độ phân giải cao:', e);
  }
  return null;
}

export async function compressPdf(
  arrayBuffer: ArrayBuffer,
  level: CompressionLevel,
  onProgress: (percent: number, statusText: string) => void
): Promise<{ blob: Blob; originalSize: number; compressedSize: number }> {
  const originalSize = arrayBuffer.byteLength;
  const originalCopy = arrayBuffer.slice(0);

  if (level === 'lossless') {
    onProgress(20, 'Đang đọc cấu trúc tài liệu PDF...');
    const pdfDoc = await PDFDocument.load(originalCopy, { ignoreEncryption: true });
    
    onProgress(60, 'Đang tối ưu luồng dữ liệu và lược bỏ metadata thừa...');
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('PDF Tools');
    pdfDoc.setCreator('PDF Tools');

    onProgress(85, 'Đang nén cross-reference streams...');
    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    onProgress(100, 'Nén hoàn tất!');
    const blob = new Blob([compressedBytes], { type: 'application/pdf' });
    return {
      blob,
      originalSize,
      compressedSize: blob.size,
    };
  }

  // Balanced or Extreme image/content raster re-compression
  try {
    onProgress(15, 'Đang phân tích cấu trúc từng trang PDF...');
    const workerData = new Uint8Array(arrayBuffer.slice(0));
    const loadingTask = pdfjsLib.getDocument({ data: workerData });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    const newPdf = await PDFDocument.create();

    // Settings based on level
    const scale = level === 'extreme' ? 1.2 : 1.6;
    const quality = level === 'extreme' ? 0.45 : 0.68;

    for (let i = 1; i <= numPages; i++) {
      const currentPercent = Math.round(15 + ((i - 1) / numPages) * 75);
      onProgress(currentPercent, `Đang xử lý và nén trang ${i} / ${numPages}...`);

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      if (!ctx) continue;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas: canvas,
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      // Direct synchronous conversion from dataURL to Uint8Array (no fetch, no CSP issues)
      const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
      const jpegBytes = dataUrlToUint8Array(jpegDataUrl);

      const embeddedImage = await newPdf.embedJpg(jpegBytes);
      const origViewport = page.getViewport({ scale: 1 });
      const newPage = newPdf.addPage([origViewport.width, origViewport.height]);
      
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
    }

    onProgress(92, 'Đang đóng gói tệp PDF nén tối ưu...');
    const compressedBytes = await newPdf.save({
      useObjectStreams: true,
    });

    let finalBlob = new Blob([compressedBytes], { type: 'application/pdf' });

    // If raster compression produced a larger file than original (e.g. pure text PDF),
    // fall back to stream-compressed original using the safe cloned buffer
    if (finalBlob.size >= originalSize) {
      onProgress(96, 'Kiểm tra dung lượng và tối ưu hóa luồng đối tượng...');
      const fallbackDoc = await PDFDocument.load(originalCopy, { ignoreEncryption: true });
      const fallbackBytes = await fallbackDoc.save({ useObjectStreams: true });
      if (fallbackBytes.byteLength < finalBlob.size) {
        finalBlob = new Blob([fallbackBytes], { type: 'application/pdf' });
      }
    }

    onProgress(100, 'Nén hoàn tất thành công!');
    return {
      blob: finalBlob,
      originalSize,
      compressedSize: finalBlob.size,
    };
  } catch (rasterErr) {
    console.warn('Lỗi khi rasterize PDF, chuyển sang nén cấu trúc lossless:', rasterErr);
    onProgress(85, 'Đang áp dụng nén cấu trúc luồng an toàn...');
    const fallbackDoc = await PDFDocument.load(originalCopy, { ignoreEncryption: true });
    const fallbackBytes = await fallbackDoc.save({ useObjectStreams: true });
    const blob = new Blob([fallbackBytes], { type: 'application/pdf' });
    onProgress(100, 'Nén hoàn tất!');
    return {
      blob,
      originalSize,
      compressedSize: blob.size,
    };
  }
}

export async function splitPdf(
  arrayBuffer: ArrayBuffer,
  selectedPages: number[], // 1-indexed
  action: SplitAction,
  onProgress: (percent: number, statusText: string) => void
): Promise<{ blob: Blob; filename: string; count: number }> {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('Dữ liệu tệp PDF bị rỗng hoặc không hợp lệ. Vui lòng tải lại tệp.');
  }

  const safeBuffer = arrayBuffer.slice(0);

  // Bulletproof fallback: if pdf-lib cannot parse or copy specific pages, rasterize via PDF.js
  const fallbackExtractViaPdfJs = async (pagesToExtract: number[], outFilename: string) => {
    onProgress(40, 'Đang trích xuất trang bằng bộ xử lý đồ họa an toàn...');
    const task = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
    const pdf = await task.promise;
    const newDoc = await PDFDocument.create();

    for (let i = 0; i < pagesToExtract.length; i++) {
      const pageNum = pagesToExtract[i];
      const percent = Math.round(40 + ((i + 1) / pagesToExtract.length) * 45);
      onProgress(percent, `Đang xử lý xuất sắc nét trang ${pageNum} (${i + 1}/${pagesToExtract.length})...`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const jpgBytes = dataUrlToUint8Array(jpgDataUrl);
        const embeddedImg = await newDoc.embedJpg(jpgBytes);
        const origViewport = page.getViewport({ scale: 1 });
        const newPage = newDoc.addPage([origViewport.width, origViewport.height]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: origViewport.width,
          height: origViewport.height,
        });
      }
    }

    onProgress(90, 'Đang đóng gói tệp PDF xuất bản...');
    const bytes = await newDoc.save({ useObjectStreams: true });
    onProgress(100, 'Tách trang hoàn tất!');
    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      filename: outFilename,
      count: pagesToExtract.length,
    };
  };

  try {
    onProgress(15, 'Đang phân tích cấu trúc trang PDF...');
    const sourceDoc = await PDFDocument.load(safeBuffer, { ignoreEncryption: true });
    const totalPages = sourceDoc.getPageCount();

    if (action === 'extract_selected') {
      onProgress(35, `Đang trích xuất ${selectedPages.length} trang đã chọn...`);
      const newDoc = await PDFDocument.create();
      // Convert 1-indexed to 0-indexed
      const pageIndices = selectedPages.map(p => p - 1).filter(idx => idx >= 0 && idx < totalPages);

      if (pageIndices.length === 0) {
        throw new Error('Vui lòng chọn ít nhất 1 trang để trích xuất.');
      }

      try {
        const copiedPages = await newDoc.copyPages(sourceDoc, pageIndices);
        copiedPages.forEach(page => newDoc.addPage(page));
      } catch (batchErr) {
        console.warn('Batch copy failed, copying page by page:', batchErr);
        for (const idx of pageIndices) {
          try {
            const [p] = await newDoc.copyPages(sourceDoc, [idx]);
            newDoc.addPage(p);
          } catch (singleErr) {
            console.warn(`Lỗi copy trang ${idx + 1}:`, singleErr);
          }
        }
      }

      if (newDoc.getPageCount() === 0) {
        return await fallbackExtractViaPdfJs(selectedPages, `trich-xuat-${selectedPages.length}-trang.pdf`);
      }

      onProgress(85, 'Đang xuất tệp PDF mới...');
      const pdfBytes = await newDoc.save({ useObjectStreams: true });
      onProgress(100, 'Tách trang hoàn tất!');
      return {
        blob: new Blob([pdfBytes], { type: 'application/pdf' }),
        filename: `trich-xuat-${selectedPages.length}-trang.pdf`,
        count: selectedPages.length,
      };
    }

    if (action === 'remove_selected') {
      onProgress(35, `Đang xoá ${selectedPages.length} trang đã chọn và giữ lại phần còn lại...`);
      const newDoc = await PDFDocument.create();
      const selectedSet = new Set(selectedPages);
      const keepIndices: number[] = [];
      const keepPages: number[] = [];
      for (let i = 1; i <= totalPages; i++) {
        if (!selectedSet.has(i)) {
          keepIndices.push(i - 1);
          keepPages.push(i);
        }
      }

      if (keepIndices.length === 0) {
        throw new Error('Không thể xoá toàn bộ các trang. Phải giữ lại ít nhất 1 trang.');
      }

      try {
        const copiedPages = await newDoc.copyPages(sourceDoc, keepIndices);
        copiedPages.forEach(page => newDoc.addPage(page));
      } catch (batchErr) {
        console.warn('Batch copy failed, copying page by page:', batchErr);
        for (const idx of keepIndices) {
          try {
            const [p] = await newDoc.copyPages(sourceDoc, [idx]);
            newDoc.addPage(p);
          } catch (singleErr) {
            console.warn(`Lỗi copy trang ${idx + 1}:`, singleErr);
          }
        }
      }

      if (newDoc.getPageCount() === 0) {
        return await fallbackExtractViaPdfJs(keepPages, `da-loai-bo-${selectedPages.length}-trang.pdf`);
      }

      onProgress(85, 'Đang xuất tệp PDF sau khi xoá trang...');
      const pdfBytes = await newDoc.save({ useObjectStreams: true });
      onProgress(100, 'Xoá trang hoàn tất!');
      return {
        blob: new Blob([pdfBytes], { type: 'application/pdf' }),
        filename: `da-loai-bo-${selectedPages.length}-trang.pdf`,
        count: keepIndices.length,
      };
    }

    // Separate all pages into individual PDFs in a ZIP archive
    onProgress(20, 'Đang khởi tạo gói tệp nén ZIP...');
    const zip = new JSZip();
    const pagesToProcess = selectedPages.length > 0 ? selectedPages : Array.from({ length: totalPages }, (_, i) => i + 1);

    for (let i = 0; i < pagesToProcess.length; i++) {
      const pageNum = pagesToProcess[i];
      const percent = Math.round(20 + ((i + 1) / pagesToProcess.length) * 65);
      onProgress(percent, `Đang tách riêng trang ${pageNum} (${i + 1}/${pagesToProcess.length})...`);

      const singlePageDoc = await PDFDocument.create();
      try {
        const [copiedPage] = await singlePageDoc.copyPages(sourceDoc, [pageNum - 1]);
        singlePageDoc.addPage(copiedPage);
        const pageBytes = await singlePageDoc.save({ useObjectStreams: true });
        const padNum = String(pageNum).padStart(3, '0');
        zip.file(`trang-${padNum}.pdf`, pageBytes);
      } catch (copyErr) {
        console.warn(`Fallback rasterizing page ${pageNum}:`, copyErr);
        const task = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdf = await task.promise;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          const jpgBytes = dataUrlToUint8Array(canvas.toDataURL('image/jpeg', 0.92));
          const embeddedImg = await singlePageDoc.embedJpg(jpgBytes);
          const origViewport = page.getViewport({ scale: 1 });
          const newP = singlePageDoc.addPage([origViewport.width, origViewport.height]);
          newP.drawImage(embeddedImg, { x: 0, y: 0, width: origViewport.width, height: origViewport.height });
          const pageBytes = await singlePageDoc.save({ useObjectStreams: true });
          const padNum = String(pageNum).padStart(3, '0');
          zip.file(`trang-${padNum}.pdf`, pageBytes);
        }
      }
    }

    onProgress(90, 'Đang nén các tệp PDF thành file ZIP...');
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    onProgress(100, 'Đã tạo gói ZIP thành công!');

    return {
      blob: zipBlob,
      filename: `cac-trang-tach-roi-${pagesToProcess.length}-file.zip`,
      count: pagesToProcess.length,
    };
  } catch (err) {
    console.warn('Lỗi khi xử lý cấu trúc PDF bằng pdf-lib, kích hoạt giải pháp rasterize toàn phần:', err);
    const targetPages = selectedPages.length > 0 ? selectedPages : [1];
    return await fallbackExtractViaPdfJs(targetPages, `trich-xuat-${targetPages.length}-trang.pdf`);
  }
}

export async function mergePdfs(
  files: { arrayBuffer: ArrayBuffer; name: string }[],
  onProgress: (percent: number, statusText: string) => void
): Promise<{ blob: Blob; totalPages: number; totalSize: number }> {
  if (files.length < 2) {
    throw new Error('Vui lòng chọn ít nhất 2 tệp PDF để ghép nối.');
  }

  onProgress(10, 'Đang chuẩn bị tệp PDF hợp nhất...');
  const mergedDoc = await PDFDocument.create();
  let totalPages = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const currentPercent = Math.round(15 + ((i + 1) / files.length) * 70);
    onProgress(currentPercent, `Đang ghép tệp ${i + 1}/${files.length}: ${file.name}...`);

    const srcDoc = await PDFDocument.load(file.arrayBuffer.slice(0), { ignoreEncryption: true });
    const pageCount = srcDoc.getPageCount();
    totalPages += pageCount;

    const indices = srcDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
    copiedPages.forEach(p => mergedDoc.addPage(p));
  }

  onProgress(90, 'Đang lưu tệp PDF đã ghép nối...');
  const mergedBytes = await mergedDoc.save({ useObjectStreams: true });
  onProgress(100, 'Ghép nối PDF thành công!');

  const blob = new Blob([mergedBytes], { type: 'application/pdf' });
  return {
    blob,
    totalPages,
    totalSize: blob.size,
  };
}

export async function createSamplePdf(type: 'report' | 'invoice' | 'document' = 'report'): Promise<File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  if (type === 'invoice') {
    // 1 Page Invoice
    const page = doc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();

    // Header banner
    page.drawRectangle({
      x: 0,
      y: height - 100,
      width: width,
      height: 100,
      color: rgb(0.1, 0.35, 0.65),
    });

    page.drawText('HOA DON GIA TRI GIA TANG', {
      x: 40,
      y: height - 60,
      size: 20,
      font: font,
      color: rgb(1, 1, 1),
    });

    page.drawText('SO HOA DON: HD-2026-98124 | NGAY: 12/09/2026', {
      x: 40,
      y: height - 85,
      size: 10,
      font: regularFont,
      color: rgb(0.9, 0.95, 1),
    });

    // Content box
    page.drawRectangle({
      x: 40,
      y: height - 240,
      width: width - 80,
      height: 110,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.85, 0.88, 0.93),
      borderWidth: 1,
    });

    page.drawText('DON VI BAN HANG: CONG TY CO PHAN CONG NGHE SO', {
      x: 55,
      y: height - 160,
      size: 11,
      font: font,
      color: rgb(0.15, 0.2, 0.3),
    });
    page.drawText('KHACH HANG: NGUYEN VAN AN - TP. HO CHI MINH', {
      x: 55,
      y: height - 185,
      size: 10,
      font: regularFont,
      color: rgb(0.2, 0.25, 0.35),
    });
    page.drawText('HINH THUC THANH TOAN: CHUYEN KHOAN NGAN HANG', {
      x: 55,
      y: height - 210,
      size: 10,
      font: regularFont,
      color: rgb(0.2, 0.25, 0.35),
    });

    // Table
    page.drawRectangle({
      x: 40,
      y: height - 380,
      width: width - 80,
      height: 110,
      borderColor: rgb(0.7, 0.75, 0.85),
      borderWidth: 1,
    });

    page.drawText('1. Ban quyen Phan mem PDF Pro (1 nam) - 1.250.000 VND', {
      x: 55,
      y: height - 310,
      size: 11,
      font: regularFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('2. Goi luu tru dam may 100GB (1 nam) - 750.000 VND', {
      x: 55,
      y: height - 340,
      size: 11,
      font: regularFont,
      color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText('TONG CONG: 2.000.000 VND (DA BAO GOM VAT 10%)', {
      x: 55,
      y: height - 420,
      size: 13,
      font: font,
      color: rgb(0.8, 0.15, 0.15),
    });

    const bytes = await doc.save({ useObjectStreams: true });
    return new File([bytes], 'hoa-don-mau.pdf', { type: 'application/pdf' });
  }

  // 4 Pages Multi-page Report
  const totalReportPages = 4;
  for (let p = 1; p <= totalReportPages; p++) {
    const page = doc.addPage([595, 842]);
    const { width, height } = page.getSize();

    // Top decor
    page.drawRectangle({
      x: 30,
      y: height - 70,
      width: width - 60,
      height: 40,
      color: rgb(0.08, 0.3, 0.55),
    });

    page.drawText(`BAO CAO TOAN DIEN - PHAN ${p} / ${totalReportPages}`, {
      x: 45,
      y: height - 52,
      size: 13,
      font: font,
      color: rgb(1, 1, 1),
    });

    // Content
    page.drawText(`Trang ${p}: Muc tieu va Phan tich Du lieu`, {
      x: 45,
      y: height - 120,
      size: 16,
      font: font,
      color: rgb(0.1, 0.15, 0.25),
    });

    const lines = [
      `Day la trang thu ${p} cua tai lieu mau duoc tao tu dong boi ung dung PDF Tools.`,
      'Tai lieu nay hoan toan hop le va phu hop de kiem tra cac tinh nang:',
      '- Nen PDF (Giam dung luong file nhanh chong va giu nguyen tinh nguyen ban)',
      '- Cat & Tach trang PDF (Chon trang tuy bien hoac tach rieng tung trang)',
      '- Ghep noi PDF (Ket hop tai lieu nay voi cac tai lieu khac thanh 1 file duy nhat)',
      '',
      `Chi so hoat dong ky quy ${p}: Do tang truong dat 138%, nguoi dung hoat dong: 50.000+`,
      'Moi thong tin duoc luu tru va ma hoa an toan ngay tren thiet bi cua ban.',
    ];

    let yOffset = height - 170;
    for (const line of lines) {
      page.drawText(line, {
        x: 45,
        y: yOffset,
        size: 10.5,
        font: regularFont,
        color: rgb(0.2, 0.25, 0.35),
      });
      yOffset -= 24;
    }

    // Colored illustration block
    page.drawRectangle({
      x: 45,
      y: yOffset - 120,
      width: width - 90,
      height: 100,
      color: p % 2 === 0 ? rgb(0.93, 0.96, 1.0) : rgb(0.94, 0.98, 0.95),
      borderColor: rgb(0.7, 0.8, 0.9),
      borderWidth: 1,
    });

    page.drawText(`DO THI MINH HOA DULIEU - TRANG ${p}`, {
      x: 65,
      y: yOffset - 50,
      size: 12,
      font: font,
      color: rgb(0.1, 0.3, 0.5),
    });
    page.drawText(`Thong ke san pham va hieu suat xu ly du lieu tap ${p}`, {
      x: 65,
      y: yOffset - 80,
      size: 9.5,
      font: regularFont,
      color: rgb(0.3, 0.4, 0.5),
    });

    // Footer
    page.drawText(`Trang ${p} / ${totalReportPages} | PDF Tools Studio`, {
      x: width / 2 - 60,
      y: 35,
      size: 9,
      font: regularFont,
      color: rgb(0.5, 0.55, 0.65),
    });
  }

  const bytes = await doc.save({ useObjectStreams: true });
  return new File([bytes], 'tai-lieu-bao-cao-mau.pdf', { type: 'application/pdf' });
}
