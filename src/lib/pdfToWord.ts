import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Packer,
  PageBreak,
  ImageRun,
  AlignmentType,
} from 'docx';
import { pdfjsLib } from './pdfWorker';
import { PdfToWordMode, PdfToWordResult } from '../types';

interface RawTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName?: string;
  hasEOL?: boolean;
}

interface TextLine {
  y: number;
  fontSize: number;
  text: string;
  isHeading: boolean;
  headingLevel?: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2 | typeof HeadingLevel.HEADING_3;
  isBullet: boolean;
}

/**
 * Extracts and groups text items from a PDF page into coherent lines and paragraphs.
 */
function processPageTextItems(items: RawTextItem[]): TextLine[] {
  if (items.length === 0) return [];

  // Group items that are approximately on the same horizontal line (within 3pt vertical tolerance)
  const lineBuckets: { y: number; items: RawTextItem[] }[] = [];

  // Sort items top-to-bottom first
  const sortedItems = [...items].sort((a, b) => b.y - a.y);

  for (const item of sortedItems) {
    if (!item.str || item.str.trim() === '') continue;

    // Find bucket within tolerance
    const bucket = lineBuckets.find((b) => Math.abs(b.y - item.y) <= Math.max(3, item.fontSize * 0.35));
    if (bucket) {
      bucket.items.push(item);
    } else {
      lineBuckets.push({ y: item.y, items: [item] });
    }
  }

  // Sort buckets top-to-bottom
  lineBuckets.sort((a, b) => b.y - a.y);

  const lines: TextLine[] = [];

  for (const bucket of lineBuckets) {
    // Sort items left-to-right
    bucket.items.sort((a, b) => a.x - b.x);

    let lineStr = '';
    let maxFontSize = 0;
    let prevItemEnd = -1;

    for (const item of bucket.items) {
      const itemText = item.str;
      if (item.fontSize > maxFontSize) {
        maxFontSize = item.fontSize;
      }

      if (prevItemEnd !== -1) {
        const gap = item.x - prevItemEnd;
        // If gap is more than ~20% of font size and neither item has space, insert space
        if (gap > item.fontSize * 0.2 && !lineStr.endsWith(' ') && !itemText.startsWith(' ')) {
          lineStr += ' ';
        }
      }

      lineStr += itemText;
      prevItemEnd = item.x + (item.width || itemText.length * (item.fontSize * 0.5));
    }

    const trimmed = lineStr.trim();
    if (trimmed.length === 0) continue;

    const isBullet = /^[•\-\*\u2022\u25AA\u25CF\u25BA]\s*/.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed);
    const isHeading1 = maxFontSize >= 17;
    const isHeading2 = maxFontSize >= 13.5 && maxFontSize < 17;
    const isHeading3 = maxFontSize >= 12 && maxFontSize < 13.5;

    let headingLevel: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2 | typeof HeadingLevel.HEADING_3 | undefined = undefined;
    if (isHeading1) headingLevel = HeadingLevel.HEADING_1;
    else if (isHeading2) headingLevel = HeadingLevel.HEADING_2;
    else if (isHeading3) headingLevel = HeadingLevel.HEADING_3;

    lines.push({
      y: bucket.y,
      fontSize: maxFontSize,
      text: trimmed,
      isHeading: isHeading1 || isHeading2 || isHeading3,
      headingLevel,
      isBullet,
    });
  }

  return lines;
}

/**
 * Converts a PDF ArrayBuffer into a standard Microsoft Word (.docx) file.
 */
export async function convertPdfToWordDocx(
  arrayBuffer: ArrayBuffer,
  options: {
    mode?: PdfToWordMode;
    pageNumbers?: number[];
    fileName?: string;
    onProgress?: (percent: number, statusText: string) => void;
  } = {}
): Promise<PdfToWordResult> {
  const { mode = 'standard', pageNumbers, fileName = 'tai-lieu-chuyen-doi.docx', onProgress } = options;

  onProgress?.(5, 'Đang đọc và phân tích cấu trúc tệp PDF...');

  const bufferCopy = arrayBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bufferCopy) });
  const pdfDoc = await loadingTask.promise;
  const totalDocPages = pdfDoc.numPages;

  // Determine pages to process
  const targetPages = pageNumbers && pageNumbers.length > 0
    ? pageNumbers.filter((p) => p >= 1 && p <= totalDocPages)
    : Array.from({ length: totalDocPages }, (_, i) => i + 1);

  if (targetPages.length === 0) {
    throw new Error('Không có trang nào hợp lệ được chọn để chuyển đổi.');
  }

  const docxChildren: (Paragraph)[] = [];
  let fullExtractedText = '';
  let totalWordCount = 0;

  for (let idx = 0; idx < targetPages.length; idx++) {
    const pageNum = targetPages[idx];
    const currentPercent = 10 + Math.round((idx / targetPages.length) * 75);
    onProgress?.(
      currentPercent,
      `Đang trích xuất văn bản trang ${idx + 1}/${targetPages.length} (Trang gốc ${pageNum})...`
    );

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    const rawItems: RawTextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const transform = item.transform; // [sx, ky, kx, sy, tx, ty]
        const fontSize = Math.hypot(transform[0], transform[1]) || Math.abs(transform[3]) || 12;
        rawItems.push({
          str: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width || 0,
          height: item.height || fontSize,
          fontSize,
          fontName: item.fontName,
          hasEOL: item.hasEOL,
        });
      }
    }

    // Process items into lines
    const textLines = processPageTextItems(rawItems);

    // If "with-visuals" mode, capture a clear screenshot of the page and insert as an ImageRun
    if (mode === 'with-visuals') {
      try {
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({
            canvas,
            canvasContext: ctx,
            viewport,
          }).promise;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64Data = dataUrl.split(',')[1];
          const binaryStr = atob(base64Data);
          const imgBytes = new Uint8Array(binaryStr.length);
          for (let b = 0; b < binaryStr.length; b++) {
            imgBytes[b] = binaryStr.charCodeAt(b);
          }

          // Scaled image width for standard Word document margin (around 540 max pt width)
          const targetWidth = Math.min(540, Math.round(viewport.width * 0.6));
          const targetHeight = Math.round((targetWidth / viewport.width) * viewport.height);

          docxChildren.push(
            new Paragraph({
              spacing: { before: 120, after: 120 },
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: imgBytes,
                  transformation: {
                    width: targetWidth,
                    height: targetHeight,
                  },
                  type: 'jpg',
                }),
              ],
            })
          );
        }
      } catch (err) {
        console.warn(`Không thể chụp ảnh trang ${pageNum}:`, err);
      }
    }

    // Add page header marker in document if multiple pages
    if (targetPages.length > 1) {
      docxChildren.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: `[Trang ${pageNum}]`,
              size: 18, // 9pt
              color: '94a3b8',
              italics: true,
            }),
          ],
        })
      );
    }

    if (textLines.length === 0) {
      // Empty page or scanned image only
      docxChildren.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [
            new TextRun({
              text: '(Trang này không có lớp ký tự văn bản có thể nhận dạng, có thể là trang ảnh quét)',
              italics: true,
              color: '64748b',
              size: 20,
            }),
          ],
        })
      );
    } else {
      // Group lines into paragraphs
      let currentParaLines: TextLine[] = [];

      const flushParagraph = () => {
        if (currentParaLines.length === 0) return;

        const firstLine = currentParaLines[0];
        const combinedText = currentParaLines.map((l) => l.text).join(' ');
        fullExtractedText += combinedText + '\n\n';

        const words = combinedText.trim().split(/\s+/).filter(Boolean);
        totalWordCount += words.length;

        if (firstLine.isHeading && firstLine.headingLevel) {
          docxChildren.push(
            new Paragraph({
              heading: firstLine.headingLevel,
              spacing: { before: 240, after: 120 },
              children: [
                new TextRun({
                  text: combinedText,
                  bold: true,
                  size: firstLine.fontSize >= 17 ? 32 : 28, // 16pt or 14pt
                  color: '0f172a',
                }),
              ],
            })
          );
        } else if (firstLine.isBullet) {
          docxChildren.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { before: 80, after: 80 },
              children: [
                new TextRun({
                  text: combinedText.replace(/^[•\-\*\u2022\u25AA\u25CF\u25BA]\s*/, ''),
                  size: 22, // 11pt
                  color: '1e293b',
                }),
              ],
            })
          );
        } else {
          docxChildren.push(
            new Paragraph({
              spacing: { before: 100, after: 120, line: 276 },
              children: [
                new TextRun({
                  text: combinedText,
                  size: 22, // 11pt
                  color: '1e293b',
                }),
              ],
            })
          );
        }

        currentParaLines = [];
      };

      for (let lIdx = 0; lIdx < textLines.length; lIdx++) {
        const line = textLines[lIdx];

        if (line.isHeading || line.isBullet) {
          flushParagraph();
          currentParaLines.push(line);
          flushParagraph();
        } else {
          if (currentParaLines.length > 0) {
            const prevLine = currentParaLines[currentParaLines.length - 1];
            const vertGap = prevLine.y - line.y;
            // If gap is unusually large, start new paragraph
            if (vertGap > line.fontSize * 1.9) {
              flushParagraph();
            }
          }
          currentParaLines.push(line);
        }
      }
      flushParagraph();
    }

    // Page break between pages (except last page)
    if (idx < targetPages.length - 1) {
      docxChildren.push(
        new Paragraph({
          children: [new PageBreak()],
        })
      );
    }
  }

  onProgress?.(90, 'Đang xây dựng định dạng Microsoft Word (.docx)...');

  const wordDoc = new Document({
    creator: 'PDF Tools Studio',
    title: fileName,
    description: 'Chuyển đổi tự động từ tài liệu PDF bằng PDF Tools Studio',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch = 1440 twips
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: docxChildren,
      },
    ],
  });

  onProgress?.(95, 'Đang xuất gói tệp .docx chuẩn...');
  const blob = await Packer.toBlob(wordDoc);
  const blobUrl = URL.createObjectURL(blob);

  const cleanDownloadName = fileName.toLowerCase().endsWith('.docx')
    ? fileName
    : `${fileName.replace(/\.pdf$/i, '')}.docx`;

  const previewSnippet = fullExtractedText.slice(0, 800).trim();

  onProgress?.(100, 'Chuyển đổi hoàn tất!');

  return {
    blob,
    blobUrl,
    downloadName: cleanDownloadName,
    size: blob.size,
    totalPages: targetPages.length,
    totalWords: totalWordCount,
    totalCharacters: fullExtractedText.length,
    previewSnippet,
  };
}
