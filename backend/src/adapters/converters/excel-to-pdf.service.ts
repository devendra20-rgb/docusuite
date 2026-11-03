import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { libreOfficeAdapter } from './libreoffice.adapter.js';
import { ValidationError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('ExcelToPdfService');

export interface ExcelToPdfOptions {
  engine?: 'auto' | 'native' | 'libreoffice';
  paperSize?: 'A4' | 'Letter';
  orientation?: 'auto' | 'portrait' | 'landscape';
  author?: string;
  title?: string;
  showGridlines?: boolean;
  repeatHeaders?: boolean;
  [key: string]: unknown;
}

export interface ExcelToPdfResult {
  outputPath: string;
  fileSize: number;
  pageCount: number;
  sheetCount: number;
  rowCount: number;
  engineUsed: string;
  durationMs: number;
}

interface ParsedCellData {
  text: string;
  isHeader?: boolean;
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  bgColor?: string;
  textColor?: string;
}

interface SheetGridData {
  name: string;
  colCount: number;
  rowCount: number;
  colWidths: number[];
  rows: ParsedCellData[][];
  isLandscape: boolean;
}

export class ExcelToPdfService {
  /**
   * Converts a Microsoft Excel spreadsheet (.xlsx, .xls) into a clean,
   * high-fidelity PDF report. Employs headless LibreOffice when available in Docker,
   * and seamlessly falls back to our dedicated Native Node.js Excel-to-PDF engine
   * with zero external dependencies.
   */
  public async convert(
    inputPath: string,
    outputPath: string,
    options: ExcelToPdfOptions = {}
  ): Promise<ExcelToPdfResult> {
    const startTime = Date.now();
    const ext = path.extname(inputPath).toLowerCase();

    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new ValidationError(`Unsupported spreadsheet format "${ext}". Expected .xlsx or .xls.`);
    }

    try {
      await fs.access(inputPath);
    } catch {
      throw new ValidationError(`Input spreadsheet file not found at: ${inputPath}`);
    }

    const engineChoice = options.engine || 'auto';

    // 1. Try LibreOffice if explicitly requested or auto-selected when available
    if (engineChoice === 'libreoffice' || (engineChoice === 'auto' && (await libreOfficeAdapter.isAvailable()))) {
      try {
        logger.info('Attempting conversion via LibreOffice headless engine', { inputPath });
        const loResult = await libreOfficeAdapter.convert(
          inputPath,
          outputPath,
          ext.replace('.', ''),
          'pdf',
          options
        );
        const stats = await fs.stat(outputPath);
        return {
          outputPath,
          fileSize: stats.size,
          pageCount: 1,
          sheetCount: 1,
          rowCount: 0,
          engineUsed: 'LibreOfficeHeadlessEngine',
          durationMs: Date.now() - startTime
        };
      } catch (loErr) {
        if (engineChoice === 'libreoffice') {
          throw loErr;
        }
        logger.warn('LibreOffice conversion failed or not available, seamlessly executing Native Excel-to-PDF engine', {
          error: loErr instanceof Error ? loErr.message : String(loErr)
        });
      }
    }

    // 2. Dedicated Native Node.js Excel-to-PDF Engine
    logger.info('Executing Native Node.js Excel-to-PDF Engine', { inputPath, outputPath });
    const nativeResult = await this.convertNative(inputPath, outputPath, options);

    const stats = await fs.stat(outputPath);
    return {
      outputPath,
      fileSize: stats.size,
      pageCount: nativeResult.pageCount,
      sheetCount: nativeResult.sheetCount,
      rowCount: nativeResult.rowCount,
      engineUsed: 'NativeExcelToPdfEngine',
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Native converter implementation using ExcelJS and PDFKit.
   */
  public async convertNative(
    inputPath: string,
    outputPath: string,
    options: ExcelToPdfOptions = {}
  ): Promise<{ pageCount: number; sheetCount: number; rowCount: number }> {
    const workbook = await this.loadWorkbook(inputPath);
    const sheetsData: SheetGridData[] = [];
    let totalRows = 0;

    for (const worksheet of workbook.worksheets) {
      if (!worksheet || worksheet.rowCount === 0) continue;

      const sheetGrid = this.parseWorksheet(worksheet, options);
      if (sheetGrid.rows.length > 0) {
        sheetsData.push(sheetGrid);
        totalRows += sheetGrid.rows.length;
      }
    }

    // If no sheets have data, create a minimal fallback grid
    if (sheetsData.length === 0) {
      sheetsData.push({
        name: 'Empty Spreadsheet',
        colCount: 1,
        rowCount: 1,
        colWidths: [400],
        rows: [[{ text: 'Spreadsheet contains no extractable data rows.', align: 'left', isHeader: false }]],
        isLandscape: false
      });
    }

    const result = await this.renderWorkbookToPdf(sheetsData, outputPath, options, path.basename(inputPath));
    return {
      pageCount: result.pageCount,
      sheetCount: sheetsData.length,
      rowCount: totalRows
    };
  }

  /**
   * Safely loads a workbook across XLSX and HTML/CSV-based XLS formats.
   */
  private async loadWorkbook(inputPath: string): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    const fileBuffer = await fs.readFile(inputPath);

    // Standard OpenXML XLSX container (starts with PK\x03\x04)
    const isZipContainer = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B;

    if (isZipContainer) {
      try {
        await workbook.xlsx.load(fileBuffer as any);
        return workbook;
      } catch (err) {
        logger.warn('Standard xlsx load failed on zip container, attempting buffer read fallback', { err });
      }
    }

    // Fallback for HTML table XLS exports (e.g. <table><tr><td>...</td></tr></table>)
    const textSample = fileBuffer.slice(0, 4096).toString('utf-8');
    if (textSample.includes('<table') || textSample.includes('<html') || textSample.includes('<tr')) {
      logger.info('Detected HTML-based XLS format, extracting table cells');
      return this.parseHtmlSpreadsheet(fileBuffer.toString('utf-8'));
    }

    // Fallback for CSV/TSV data named as .xls
    if (textSample.includes(',') || textSample.includes('\t') || textSample.includes(';')) {
      try {
        const ws = workbook.addWorksheet('Data');
        const lines = fileBuffer.toString('utf-8').split(/\r?\n/).filter(l => l.trim().length > 0);
        for (const line of lines) {
          const sep = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
          const cells = line.split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
          ws.addRow(cells);
        }
        return workbook;
      } catch (csvErr) {
        logger.warn('CSV fallback parsing failed for spreadsheet', { csvErr });
      }
    }

    // If ExcelJS direct load succeeds
    try {
      await workbook.xlsx.readFile(inputPath);
      return workbook;
    } catch (finalErr: any) {
      throw new ConversionError(
        `Unable to read spreadsheet: ${finalErr?.message || 'File format is corrupted or unsupported.'}`
      );
    }
  }

  /**
   * Extracts HTML <table> contents into an ExcelJS Workbook.
   */
  private parseHtmlSpreadsheet(htmlContent: string): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Export');
    const rowMatches = htmlContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    for (const rowHtml of rowMatches) {
      const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      const rowValues: string[] = [];
      for (const cellHtml of cellMatches) {
        const cleanText = cellHtml
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .trim();
        rowValues.push(cleanText);
      }
      if (rowValues.length > 0) {
        ws.addRow(rowValues);
      }
    }
    return workbook;
  }

  /**
   * Parses an ExcelJS Worksheet into structured cell models, computing
   * alignment, typography, and proportional column widths.
   */
  private parseWorksheet(
    worksheet: ExcelJS.Worksheet,
    options: ExcelToPdfOptions
  ): SheetGridData {
    const rawRows: ParsedCellData[][] = [];
    let maxCols = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rowCells: ParsedCellData[] = [];
      const isHeaderRow = rowNumber === 1;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const cellText = this.formatCellValue(cell);
        const inferredAlign = this.inferCellAlignment(cell, isHeaderRow);
        const isBold = Boolean(isHeaderRow || cell.font?.bold);
        const isItalic = Boolean(cell.font?.italic);

        // Header and fill colors
        let bgColor: string | undefined;
        let textColor: string | undefined;

        if (isHeaderRow) {
          bgColor = '#1E293B'; // Slate 800
          textColor = '#FFFFFF';
        } else if (cell.fill && cell.fill.type === 'pattern' && cell.fill.fgColor?.argb) {
          bgColor = '#' + cell.fill.fgColor.argb.slice(-6);
        }

        if (!isHeaderRow && cell.font?.color?.argb) {
          textColor = '#' + cell.font.color.argb.slice(-6);
        }

        rowCells[colNumber - 1] = {
          text: cellText,
          isHeader: isHeaderRow,
          align: inferredAlign,
          bold: isBold,
          italic: isItalic,
          bgColor,
          textColor
        };

        if (colNumber > maxCols) maxCols = colNumber;
      });

      // Fill in undefined leading/trailing cells
      for (let c = 0; c < maxCols; c++) {
        if (!rowCells[c]) {
          rowCells[c] = {
            text: '',
            isHeader: isHeaderRow,
            align: 'left'
          };
        }
      }

      rawRows.push(rowCells);
    });

    if (rawRows.length === 0) {
      return {
        name: worksheet.name,
        colCount: 0,
        rowCount: 0,
        colWidths: [],
        rows: [],
        isLandscape: false
      };
    }

    // Determine Orientation: Landscape if > 6 columns or user explicitly sets landscape
    const userOrientation = options.orientation || 'auto';
    const isLandscape =
      userOrientation === 'landscape' || (userOrientation === 'auto' && maxCols > 6);

    // Page dimensions and margins
    const pageWidth = isLandscape ? 841.89 : 595.28; // A4 Landscape / Portrait
    const margin = 36; // 0.5 inch margins
    const usableWidth = pageWidth - margin * 2;

    // Calculate Column Widths
    const colWidths = this.computeColumnWidths(rawRows, maxCols, usableWidth);

    return {
      name: worksheet.name,
      colCount: maxCols,
      rowCount: rawRows.length,
      colWidths,
      rows: rawRows,
      isLandscape
    };
  }

  /**
   * Calculates balanced proportional column widths based on cell text content
   * and scales them to fit the exact printable width without overflow.
   */
  private computeColumnWidths(
    rows: ParsedCellData[][],
    colCount: number,
    usableWidth: number
  ): number[] {
    const minColWidth = 45;
    const maxCharLengths: number[] = new Array(colCount).fill(4);

    for (const row of rows) {
      for (let c = 0; c < colCount; c++) {
        const textLen = (row[c]?.text || '').length;
        if (textLen > maxCharLengths[c]) {
          maxCharLengths[c] = Math.min(60, textLen);
        }
      }
    }

    // Convert character lengths to approximate points (approx 6.5pt per char)
    const rawWidths = maxCharLengths.map((len) => Math.max(minColWidth, len * 6.5 + 16));
    const totalRaw = rawWidths.reduce((a, b) => a + b, 0);

    // Scale proportionally to fill usableWidth
    const scale = usableWidth / totalRaw;
    const scaled = rawWidths.map((w) => Math.floor(w * scale));

    // Distribute any fractional rounding difference
    const currentTotal = scaled.reduce((a, b) => a + b, 0);
    const diff = usableWidth - currentTotal;
    if (diff !== 0 && scaled.length > 0) {
      scaled[scaled.length - 1] += diff;
    }

    return scaled;
  }

  /**
   * Formats a raw ExcelJS cell value into human-readable text.
   */
  private formatCellValue(cell: ExcelJS.Cell): string {
    if (cell.value === null || cell.value === undefined) return '';

    // If cell.text is already rendered by ExcelJS (e.g. formatted currency or dates)
    if (typeof cell.text === 'string' && cell.text.trim().length > 0) {
      return cell.text;
    }

    const val = cell.value;

    // Formula result object: { formula: '...', result: 123 }
    if (typeof val === 'object' && 'result' in (val as any)) {
      const res = (val as any).result;
      if (res !== null && res !== undefined) {
        return this.formatScalar(res);
      }
      return String((val as any).formula || '');
    }

    // Rich text object: { richText: [{ text: '...' }] }
    if (typeof val === 'object' && 'richText' in (val as any)) {
      return ((val as any).richText || []).map((r: any) => r.text).join('');
    }

    // Hyperlink object: { text: '...', hyperlink: '...' }
    if (typeof val === 'object' && 'hyperlink' in (val as any)) {
      return (val as any).text || (val as any).hyperlink || '';
    }

    // Date object
    if (val instanceof Date) {
      return val.toISOString().split('T')[0];
    }

    return this.formatScalar(val);
  }

  private formatScalar(val: unknown): string {
    if (typeof val === 'number') {
      // If it looks like integer currency/amount or regular float
      if (Number.isInteger(val)) {
        return val.toLocaleString('en-US');
      }
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (typeof val === 'boolean') {
      return val ? 'TRUE' : 'FALSE';
    }
    return String(val).trim();
  }

  /**
   * Infers cell alignment based on data type and explicit cell alignment.
   */
  private inferCellAlignment(cell: ExcelJS.Cell, isHeader: boolean): 'left' | 'center' | 'right' {
    if (cell.alignment?.horizontal) {
      const h = cell.alignment.horizontal;
      if (h === 'center' || h === 'centerContinuous') return 'center';
      if (h === 'right') return 'right';
      return 'left';
    }

    if (isHeader) return 'left';

    const val = cell.value;
    if (typeof val === 'number') return 'right';
    if (typeof val === 'boolean' || val instanceof Date) return 'center';

    return 'left';
  }

  /**
   * Renders the parsed worksheet data into a multi-page PDF document.
   */
  private async renderWorkbookToPdf(
    sheets: SheetGridData[],
    outputPath: string,
    options: ExcelToPdfOptions,
    originalFilename: string
  ): Promise<{ pageCount: number }> {
    const firstSheet = sheets[0];
    const isInitialLandscape = firstSheet?.isLandscape ?? false;
    const paperSize = options.paperSize === 'Letter' ? [612, 792] : [595.28, 841.89];
    const margins = { top: 40, bottom: 44, left: 36, right: 36 };

    const doc = new PDFDocument({
      size: isInitialLandscape ? [paperSize[1], paperSize[0]] : [paperSize[0], paperSize[1]],
      layout: isInitialLandscape ? 'landscape' : 'portrait',
      margins,
      bufferPages: true,
      info: {
        Title: options.title || originalFilename.replace(/\.(xlsx?|xlsm)$/i, ''),
        Author: options.author || 'DocuSuite Native Engine',
        Creator: 'DocuSuite Precision Studio'
      }
    });

    const writeStream = fsSync.createWriteStream(outputPath);
    doc.pipe(writeStream);

    for (let sIdx = 0; sIdx < sheets.length; sIdx++) {
      const sheet = sheets[sIdx];
      const pageW = sheet.isLandscape ? paperSize[1] : paperSize[0];
      const pageH = sheet.isLandscape ? paperSize[0] : paperSize[1];
      const usableW = pageW - margins.left - margins.right;

      // Start each subsequent sheet on a new page with proper orientation
      if (sIdx > 0) {
        doc.addPage({
          size: [pageW, pageH],
          layout: sheet.isLandscape ? 'landscape' : 'portrait',
          margins
        });
      }

      // 1. Render Sheet Header Banner
      this.renderSheetBanner(doc, sheet.name, sIdx + 1, sheets.length, originalFilename, usableW, margins.left);

      // 2. Render Sheet Table
      const headerRow = sheet.rows[0];
      const dataRows = sheet.rows.slice(1);

      this.renderTable(
        doc,
        headerRow,
        dataRows,
        sheet.colWidths,
        sheet.colCount,
        pageH,
        margins,
        usableW,
        options.repeatHeaders !== false
      );
    }

    // 3. Running Headers & Footers Pass Across All Buffered Pages
    const pageRange = doc.bufferedPageRange();
    const totalPages = pageRange.count;

    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      const currentPageW = doc.page.width;
      const currentPageH = doc.page.height;
      const currentUsableW = currentPageW - margins.left - margins.right;

      // Save page margins temporarily
      const savedBottom = doc.page.margins.bottom;
      const savedTop = doc.page.margins.top;
      doc.page.margins.bottom = 0;
      doc.page.margins.top = 0;

      // Running Top Header Line
      doc.rect(margins.left, 24, currentUsableW, 0.5).fillColor('#E2E8F0').fill();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94A3B8')
        .text(originalFilename, margins.left, 14, {
          width: currentUsableW / 2,
          align: 'left',
          lineBreak: false
        });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94A3B8')
        .text('Generated with DocuSuite', margins.left + currentUsableW / 2, 14, {
          width: currentUsableW / 2,
          align: 'right',
          lineBreak: false
        });

      // Running Bottom Footer Line
      doc.rect(margins.left, currentPageH - 26, currentUsableW, 0.5).fillColor('#E2E8F0').fill();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748B')
        .text(`Confidential • Precision Conversion`, margins.left, currentPageH - 20, {
          width: currentUsableW / 2,
          align: 'left',
          lineBreak: false
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#475569')
        .text(`Page ${i + 1} of ${totalPages}`, margins.left + currentUsableW / 2, currentPageH - 20, {
          width: currentUsableW / 2,
          align: 'right',
          lineBreak: false
        });

      doc.page.margins.bottom = savedBottom;
      doc.page.margins.top = savedTop;
    }

    doc.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    return { pageCount: totalPages };
  }

  /**
   * Renders a modern styled sheet banner at the top of a worksheet.
   */
  private renderSheetBanner(
    doc: PDFKit.PDFDocument,
    sheetName: string,
    sheetIndex: number,
    totalSheets: number,
    filename: string,
    usableW: number,
    startX: number
  ): void {
    const startY = doc.y;

    // Clean emerald sheet badge
    doc.roundedRect(startX, startY, 70, 16, 4).fillColor('#ECFDF5').fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor('#059669')
      .text('WORKSHEET', startX, startY + 4, { width: 70, align: 'center' });

    // Sheet Title
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#0F172A')
      .text(sheetName, startX + 78, startY + 1, { width: usableW - 180, align: 'left', lineBreak: false });

    // Sheet counter metadata
    if (totalSheets > 1) {
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#64748B')
        .text(`Sheet ${sheetIndex} of ${totalSheets}`, startX + usableW - 100, startY + 4, {
          width: 100,
          align: 'right',
          lineBreak: false
        });
    }

    doc.y = startY + 24;
    doc.moveDown(0.3);
  }

  /**
   * Renders tabular data rows with dynamic row height, alternating shading,
   * crisp cell borders, and repeated headers across pagination.
   */
  private renderTable(
    doc: PDFKit.PDFDocument,
    headerRow: ParsedCellData[] | undefined,
    dataRows: ParsedCellData[][],
    colWidths: number[],
    colCount: number,
    pageH: number,
    margins: { top: number; bottom: number; left: number; right: number },
    usableW: number,
    repeatHeaders: boolean
  ): void {
    const tableStartX = margins.left;
    const bottomLimit = pageH - margins.bottom;

    // Helper to render the header row
    const drawHeader = () => {
      if (!headerRow || headerRow.length === 0) return;
      const headerH = this.calcRowHeight(headerRow, colWidths, 10, true);

      // Page break check for header
      if (doc.y + headerH > bottomLimit) {
        doc.addPage();
      }

      const currentY = doc.y;
      let currentX = tableStartX;

      // Dark slate header background
      doc.rect(tableStartX, currentY, usableW, headerH).fillColor('#1E293B').fill();

      for (let c = 0; c < colCount; c++) {
        const cell = headerRow[c] || { text: '', align: 'left' };
        const cWidth = colWidths[c] || 80;

        // Header cell border
        doc.rect(currentX, currentY, cWidth, headerH).lineWidth(0.5).strokeColor('#334155').stroke();

        // Header cell text
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#FFFFFF')
          .text(cell.text || '', currentX + 6, currentY + 6, {
            width: cWidth - 12,
            height: headerH - 10,
            align: cell.align,
            ellipsis: true
          });

        currentX += cWidth;
      }
      doc.y = currentY + headerH;
    };

    // Draw initial header
    drawHeader();

    // Render Data Rows
    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const row = dataRows[rIdx];
      const isEven = rIdx % 2 === 0;
      const rowH = this.calcRowHeight(row, colWidths, 8.5, false);

      // Check if row exceeds remaining page height
      if (doc.y + rowH > bottomLimit) {
        doc.addPage();
        if (repeatHeaders) {
          drawHeader();
        }
      }

      const currentY = doc.y;
      let currentX = tableStartX;

      // Alternating row background shading
      const rowBg = isEven ? '#FFFFFF' : '#F8FAFC';
      doc.rect(tableStartX, currentY, usableW, rowH).fillColor(rowBg).fill();

      for (let c = 0; c < colCount; c++) {
        const cell = row[c] || { text: '', align: 'left' };
        const cWidth = colWidths[c] || 80;

        // Custom cell background if specified in spreadsheet
        if (cell.bgColor && cell.bgColor !== '#FFFFFF') {
          doc.rect(currentX, currentY, cWidth, rowH).fillColor(cell.bgColor).fill();
        }

        // Cell border
        doc.rect(currentX, currentY, cWidth, rowH).lineWidth(0.5).strokeColor('#E2E8F0').stroke();

        // Typography
        const font = cell.bold ? 'Helvetica-Bold' : (cell.italic ? 'Helvetica-Oblique' : 'Helvetica');
        const textColor = cell.textColor || (cell.bold ? '#0F172A' : '#334155');

        doc
          .font(font)
          .fontSize(8)
          .fillColor(textColor)
          .text(cell.text || '', currentX + 5, currentY + 5, {
            width: cWidth - 10,
            height: rowH - 10,
            align: cell.align,
            ellipsis: true
          });

        currentX += cWidth;
      }

      doc.y = currentY + rowH;
    }

    doc.moveDown(0.8);
  }

  /**
   * Calculates dynamic row height based on cell content length and column width.
   */
  private calcRowHeight(
    row: ParsedCellData[],
    colWidths: number[],
    fontSize: number,
    isHeader: boolean
  ): number {
    const baseHeight = isHeader ? 22 : 18;
    let maxH = baseHeight;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const cWidth = colWidths[c] || 80;
      const textLen = (cell?.text || '').length;

      // Approximate characters per line for the cell's printable width
      const charsPerLine = Math.max(1, Math.floor((cWidth - 12) / (fontSize * 0.55)));
      const lines = Math.max(1, Math.ceil(textLen / charsPerLine));

      // Limit row height to reasonable maximum (up to 4 lines) so cells don't consume entire page
      const cellH = Math.min(65, lines * (fontSize + 3.5) + 10);
      if (cellH > maxH) {
        maxH = cellH;
      }
    }

    return maxH;
  }
}

export const excelToPdfConverter = new ExcelToPdfService();
