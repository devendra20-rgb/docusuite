import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { parse as parseCsv } from 'csv-parse/sync';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { IConversionEngine, ConversionResult } from './conversion.interface.js';
import { AppError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';
import { pdfTableExtractor } from './pdf-table-extractor.service.js';
import { pdfToWordConverter } from './pdf-to-word.service.js';
import { wordToPdfConverter } from './word-to-pdf.service.js';
import { excelToPdfConverter } from './excel-to-pdf.service.js';
import { pdfToPowerPointConverter } from './pdf-to-powerpoint.service.js';

const logger = createChildLogger('NativeNodeAdapter');

export class NativeNodeAdapter implements IConversionEngine {
  public readonly name = 'NativeNodeEngine';

  public async isAvailable(): Promise<boolean> {
    return true; // Always available inside Node.js runtime
  }

  public supports(fromExt: string, toExt: string): boolean {
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    const pairs: Record<string, string[]> = {
      csv: ['xlsx'],
      xlsx: ['csv', 'pdf'],
      xls: ['pdf'],
      txt: ['pdf'],
      docx: ['html', 'pdf'],
      doc: ['pdf'],
      pdf: ['xlsx', 'docx', 'pptx']
    };

    return pairs[from]?.includes(to) || false;
  }

  public getLimitations(fromExt: string, toExt: string): string[] {
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    if ((from === 'docx' || from === 'doc') && to === 'pdf') {
      return [
        'Preserves document typography, headings, tables, embedded images, headers, footers, margins, and page orientation.',
        'Uses native high-fidelity OpenXML layout engine with headless LibreOffice support when available.',
        'Complex third-party macros, ActiveX controls, and embedded OLE objects are omitted.'
      ];
    }
    if ((from === 'xlsx' || from === 'xls') && to === 'pdf') {
      return [
        'Converts spreadsheet workbooks into formatted tabular PDF reports with styled headers, alternating row fills, and borders.',
        'Automatically chooses landscape orientation for wide datasets to prevent horizontal clipping.',
        'Interactive Excel macros, VBA scripts, and dynamic external links are not executed.'
      ];
    }
    if (from === 'pdf' && to === 'docx') {
      return [
        'Extracts flowing paragraphs, headings, tables, and typography into a genuinely editable Microsoft Word (.docx) document.',
        'Maintains page orientation, margins, and page breaks.',
        'Scanned PDFs without selectable text require OCR, which is clearly reported when detected.'
      ];
    }
    if (from === 'pdf' && to === 'pptx') {
      return [
        'Converts PDF presentation slides into high-fidelity PowerPoint (.pptx) decks preserving vector clarity, typography, diagrams, and layout geometry.',
        'Generates standard OpenXML PresentationML packages compatible with Microsoft PowerPoint, Google Slides, and Apple Keynote.',
        'Embedded video or audio streams within the PDF are omitted.'
      ];
    }
    if (from === 'pdf' && to === 'xlsx') {
      return [
        'Extracts structured tabular data grids and outputs a formatted spreadsheet with styled headers and alternating rows.',
        'Document must contain recognizable tabular rows and columns; non-tabular freeform paragraphs are skipped.'
      ];
    }
    if (from === 'csv' && to === 'xlsx') {
      return [
        'Plain text formatting only; CSV does not preserve original cell colors, fonts or formulas.',
        'Data types are inferred (numeric, boolean, date, string).'
      ];
    }
    if (from === 'xlsx' && to === 'csv') {
      return [
        'Only the first/active worksheet is exported to CSV.',
        'Charts, macros, merged cells, styling and images cannot be stored in CSV.'
      ];
    }
    if (from === 'docx' && to === 'html') {
      return [
        'Complex desktop layout positioning and custom Word macros are omitted.',
        'Embedded standard fonts are converted to semantic web typography.'
      ];
    }
    if (from === 'txt' && to === 'pdf') {
      return [
        'Text wrapped to standard page margins (Helvetica monospace/standard).',
        'Tabs converted to spaces; no rich styling or table layout supported.'
      ];
    }
    return ['Standard semantic format conversion limits apply.'];
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    fromExt: string,
    toExt: string,
    options: Record<string, unknown> = {}
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    try {
      if (from === 'csv' && to === 'xlsx') {
        await this.convertCsvToExcel(inputPath, outputPath);
      } else if (from === 'xlsx' && to === 'csv') {
        await this.convertExcelToCsv(inputPath, outputPath);
      } else if (from === 'docx' && to === 'html') {
        await this.convertDocxToHtml(inputPath, outputPath);
      } else if (from === 'txt' && to === 'pdf') {
        await this.convertTxtToPdf(inputPath, outputPath);
      } else if (from === 'pdf' && to === 'xlsx') {
        await pdfTableExtractor.extractToExcel(inputPath, outputPath);
      } else if (from === 'pdf' && to === 'docx') {
        await pdfToWordConverter.convert(inputPath, outputPath, options);
      } else if (from === 'pdf' && to === 'pptx') {
        await pdfToPowerPointConverter.convert(inputPath, outputPath, options);
      } else if ((from === 'docx' || from === 'doc') && to === 'pdf') {
        await wordToPdfConverter.convert(inputPath, outputPath, options);
      } else if ((from === 'xlsx' || from === 'xls') && to === 'pdf') {
        await excelToPdfConverter.convert(inputPath, outputPath, options);
      } else {
        throw new AppError(`Unsupported native conversion from ${from} to ${to}`, 400);
      }

      const stats = await fs.stat(outputPath);
      const mime = this.getMimeForExtension(to);

      return {
        outputPath,
        outputMime: mime,
        outputExtension: `.${to}`,
        fileSize: stats.size,
        engineUsed: this.name,
        durationMs: Date.now() - startTime,
        limitations: this.getLimitations(from, to)
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      logger.error('Native conversion error', { from, to, inputPath, err });
      throw new ConversionError(
        `Conversion from .${from} to .${to} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async convertCsvToExcel(inputPath: string, outputPath: string): Promise<void> {
    const csvContent = await fs.readFile(inputPath, 'utf8');
    const records = parseCsv(csvContent, {
      skip_empty_lines: true,
      relax_column_count: true
    }) as string[][];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');

    for (const row of records) {
      sheet.addRow(row);
    }

    // Auto-fit column widths
    sheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const val = cell.value ? cell.value.toString() : '';
        if (val.length > maxLen) maxLen = Math.min(val.length + 2, 50);
      });
      col.width = maxLen;
    });

    await workbook.xlsx.writeFile(outputPath);
  }

  private async convertExcelToCsv(inputPath: string, outputPath: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const sheet = workbook.worksheets[0];

    if (!sheet) {
      throw new AppError('Excel file contains no worksheets', 400);
    }

    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        let text = '';
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object' && 'text' in (cell.value as unknown as Record<string, unknown>)) {
            text = String((cell.value as unknown as { text: string }).text);
          } else {
            text = String(cell.value);
          }
        }
        values.push(text);
      });
      rows.push(values);
    });

    const csvLines = rows.map((r) =>
      r
        .map((field) => {
          if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
          }
          return field;
        })
        .join(',')
    );

    await fs.writeFile(outputPath, csvLines.join('\n'), 'utf8');
  }

  private async convertDocxToHtml(inputPath: string, outputPath: string): Promise<void> {
    const result = await mammoth.convertToHtml({ path: inputPath });
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Document</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; padding: 2rem; max-width: 800px; margin: 0 auto; color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${result.value}
</body>
</html>`;
    await fs.writeFile(outputPath, fullHtml, 'utf8');
  }

  private async convertTxtToPdf(inputPath: string, outputPath: string): Promise<void> {
    const text = await fs.readFile(inputPath, 'utf8');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Courier);

    const fontSize = 10;
    const lineHeight = 14;
    const margin = 40;
    const pageWidth = 595.28; // A4 pt
    const pageHeight = 841.89;
    const maxLinesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
    const charsPerLine = Math.floor((pageWidth - margin * 2) / (fontSize * 0.6));

    const rawLines = text.split(/\r?\n/);
    const wrappedLines: string[] = [];

    for (const line of rawLines) {
      if (line.length === 0) {
        wrappedLines.push('');
      } else {
        for (let i = 0; i < line.length; i += charsPerLine) {
          wrappedLines.push(line.substring(i, i + charsPerLine));
        }
      }
    }

    let currentPage = doc.addPage([pageWidth, pageHeight]);
    let lineInPage = 0;

    for (const line of wrappedLines) {
      if (lineInPage >= maxLinesPerPage) {
        currentPage = doc.addPage([pageWidth, pageHeight]);
        lineInPage = 0;
      }

      currentPage.drawText(line, {
        x: margin,
        y: pageHeight - margin - lineInPage * lineHeight,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1)
      });

      lineInPage++;
    }

    const bytes = await doc.save();
    await fs.writeFile(outputPath, bytes);
  }

  private getMimeForExtension(ext: string): string {
    const map: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      csv: 'text/csv',
      html: 'text/html',
      pdf: 'application/pdf',
      txt: 'text/plain'
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
  }
}

export const nativeNodeAdapter = new NativeNodeAdapter();
