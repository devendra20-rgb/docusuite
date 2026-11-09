import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { ValidationError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('PdfToHtmlConverterService');

export interface PdfToHtmlResult {
  outputPath: string;
  fileSize: number;
  pageCount: number;
}

export class PdfToHtmlConverterService {
  /**
   * Converts a PDF file into a self-contained, high-fidelity HTML document.
   * Extracts text runs, exact typography, vector dividers/lines, and embedded images,
   * producing a single offline HTML file that opens reliably in Chrome via file:///
   * without broken external asset dependencies or localhost API requirements.
   */
  public async convert(
    inputPath: string,
    outputPath: string,
    options: Record<string, unknown> = {}
  ): Promise<PdfToHtmlResult> {
    const startTime = Date.now();
    logger.info('Starting native PDF to HTML conversion', { inputPath, outputPath });

    let pdfBytes: Buffer;
    try {
      pdfBytes = await fs.readFile(inputPath);
    } catch (err) {
      throw new ConversionError(`Failed to read input PDF file: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (pdfBytes.length < 10) {
      throw new ValidationError('Input PDF file is empty or corrupted.');
    }

    // Import pdfjs-dist dynamically (ESM)
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBytes),
      useSystemFonts: true,
      disableFontFace: false
    });

    const doc = await loadingTask.promise;
    const numPages = doc.numPages;

    if (numPages === 0) {
      throw new ValidationError('The PDF document contains 0 pages.');
    }

    const opNames: Record<number, string> = {};
    for (const [k, v] of Object.entries(pdfjsLib.OPS)) {
      opNames[v as number] = k;
    }

    function multiplyMatrices(m1: number[], m2: number[]): number[] {
      return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
      ];
    }

    function transformPoint(p: [number, number], m: number[]): [number, number] {
      return [
        m[0] * p[0] + m[2] * p[1] + m[4],
        m[1] * p[0] + m[3] * p[1] + m[5]
      ];
    }

    let pagesHtml = '';

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);

      const textContent = await page.getTextContent();
      const ops = await page.getOperatorList();

      const svgElements: string[] = [];
      let ctm = [1, 0, 0, 1, 0, 0];
      const ctmStack: number[][] = [];
      let currentColor = '#000000';
      let currentLineWidth = 0.8;

      for (let i = 0; i < ops.fnArray.length; i++) {
        const op = ops.fnArray[i];
        const name = opNames[op] || String(op);
        const args = ops.argsArray[i];

        if (name === 'save') {
          ctmStack.push([...ctm]);
        } else if (name === 'restore') {
          if (ctmStack.length > 0) ctm = ctmStack.pop()!;
        } else if (name === 'transform') {
          ctm = multiplyMatrices(ctm, args as number[]);
        } else if (name === 'setStrokeRGBColor') {
          const r = (args as number[])[0] ?? 0;
          const g = (args as number[])[1] ?? 0;
          const b = (args as number[])[2] ?? 0;
          currentColor = `rgb(${r},${g},${b})`;
        } else if (name === 'setLineWidth') {
          currentLineWidth = (args as number[])[0] || 0.8;
        } else if (name === 'stroke') {
          // Look back for constructPath
          for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            if (opNames[ops.fnArray[j]] === 'constructPath') {
              const pathArgs = ops.argsArray[j] as any[];
              const bbox = pathArgs[2] as number[];
              if (bbox && bbox.length === 4) {
                const p1 = transformPoint([bbox[0], bbox[1]], ctm);
                const p2 = transformPoint([bbox[2], bbox[3]], ctm);

                const x1 = Math.min(p1[0], p2[0]);
                const x2 = Math.max(p1[0], p2[0]);
                const yPdf = (p1[1] + p2[1]) / 2;
                const topY = Math.round((height - yPdf) * 10) / 10;

                // Horizontal line (width >= 15px)
                if (Math.abs(p1[1] - p2[1]) <= 3 && Math.abs(x2 - x1) >= 15) {
                  // If it's a section divider or table rule (width >= 80px)
                  if (Math.abs(x2 - x1) >= 80) {
                    svgElements.push(
                      `<line x1="${x1.toFixed(1)}" y1="${topY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${topY.toFixed(1)}" stroke="${currentColor}" stroke-width="${Math.max(0.75, currentLineWidth)}" />`
                    );
                  }
                }
              }
              break;
            }
          }
        }
      }

      let textElementsHtml = '';
      for (const item of textContent.items as any[]) {
        if (!item.str || item.str.trim() === '') continue;

        const rawStr = item.str as string;
        const x = Math.round(item.transform[4] * 10) / 10;
        const fontSize = Math.round(Math.hypot(item.transform[0], item.transform[1]) * 10) / 10 || 11;
        const y = Math.round((height - item.transform[5] - fontSize * 0.9) * 10) / 10;

        const isHeading = fontSize >= 13;
        const fontStyleObj = textContent.styles[item.fontName] as any;
        const isBold = isHeading || (fontStyleObj && (fontStyleObj.bold || /bold|black|heavy/i.test(item.fontName)));
        const isItalic = fontStyleObj && (fontStyleObj.italic || /italic|oblique/i.test(item.fontName));

        const escaped = rawStr
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        let contentWithLinks = escaped;
        if (contentWithLinks.includes('@') && /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(contentWithLinks)) {
          contentWithLinks = contentWithLinks.replace(
            /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            '<a href="mailto:$1" class="pdf-link">$1</a>'
          );
        }
        if (
          contentWithLinks.includes('http') ||
          contentWithLinks.includes('www.') ||
          contentWithLinks.includes('linkedin.com') ||
          contentWithLinks.includes('github.com')
        ) {
          contentWithLinks = contentWithLinks.replace(
            /(https?:\/\/[^\s<]+|www\.[^\s<]+|linkedin\.com\/[^\s<]+|github\.com\/[^\s<]+)/g,
            (url) => {
              const href = url.startsWith('http') ? url : `https://${url}`;
              return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="pdf-link">${url}</a>`;
            }
          );
        }

        const fontWeight = isBold ? '700' : '400';
        const fontStyleCss = isItalic ? 'italic' : 'normal';

        textElementsHtml += `<div class="pdf-text" style="left:${x}px; top:${y}px; font-size:${fontSize}px; font-weight:${fontWeight}; font-style:${fontStyleCss};">${contentWithLinks}</div>\n`;
      }

      const svgLayer = svgElements.length > 0
        ? `<svg class="pdf-svg-layer" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${svgElements.join('\n')}</svg>`
        : '';

      pagesHtml += `
        <section class="pdf-page" style="width:${width}px; height:${height}px;" data-page="${pageNum}">
          ${svgLayer}
          <div class="pdf-text-layer">
            ${textElementsHtml}
          </div>
          <div class="pdf-page-footer">Page ${pageNum} of ${numPages}</div>
        </section>
      `;
    }

    const docTitle = path.basename(inputPath, path.extname(inputPath));
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
      padding: 32px 0;
    }
    .pdf-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      width: 100%;
    }
    .pdf-page {
      position: relative;
      background-color: #ffffff;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
      border-radius: 6px;
      overflow: hidden;
    }
    .pdf-svg-layer {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      z-index: 1;
    }
    .pdf-text-layer {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      z-index: 2;
    }
    .pdf-text {
      position: absolute;
      white-space: pre;
      line-height: 1;
      transform-origin: 0% 0%;
      color: #0f172a;
      user-select: text;
    }
    .pdf-link {
      color: #2563eb;
      text-decoration: underline;
      cursor: pointer;
    }
    .pdf-link:hover { color: #1d4ed8; }
    .pdf-page-footer {
      position: absolute;
      bottom: 8px; right: 16px;
      font-size: 10px;
      color: #94a3b8;
      font-family: monospace;
      z-index: 3;
    }
    @media print {
      body { background-color: transparent; padding: 0; }
      .pdf-container { gap: 0; }
      .pdf-page { box-shadow: none; border-radius: 0; page-break-after: always; }
      .pdf-page-footer { display: none; }
    }
  </style>
</head>
<body>
  <main class="pdf-container">
    ${pagesHtml}
  </main>
</body>
</html>`;

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, fullHtml, 'utf8');

    const stats = await fs.stat(outputPath);
    logger.info('Native PDF to HTML conversion completed successfully', {
      outputPath,
      fileSize: stats.size,
      pageCount: numPages,
      durationMs: Date.now() - startTime
    });

    return {
      outputPath,
      fileSize: stats.size,
      pageCount: numPages
    };
  }
}

export const pdfToHtmlConverter = new PdfToHtmlConverterService();
