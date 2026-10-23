import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { ValidationError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('PdfTableExtractorService');

interface RawTextItem {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
}

export interface ExtractedTable {
  pageNumber: number;
  tableIndex: number;
  headers: string[];
  rows: string[][];
}

export class PdfTableExtractorService {
  /**
   * Extracts tables from a PDF document and writes them to an Excel workbook (.xlsx).
   * Throws a user-friendly ValidationError if no tables can be extracted.
   */
  public async extractToExcel(inputPath: string, outputPath: string): Promise<{ tableCount: number; rowCount: number }> {
    logger.info('Starting PDF table extraction', { inputPath, outputPath });

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fs.readFile(inputPath);
    } catch (err) {
      throw new ConversionError(`Failed to read input PDF file: ${err instanceof Error ? err.message : String(err)}`);
    }

    const tables = await this.extractTablesFromPdf(pdfBuffer);

    if (tables.length === 0) {
      throw new ValidationError(
        'No extractable tables found in the provided PDF document. Please ensure the PDF contains tabular data with recognizable rows and columns.'
      );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DocuSuite Precision Document Studio';
    workbook.created = new Date();

    let totalRows = 0;

    tables.forEach((table, idx) => {
      const sheetName = tables.length === 1 
        ? 'Sheet1' 
        : `Table_${idx + 1}_Page_${table.pageNumber}`.substring(0, 31);
      
      const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }]
      });

      // Write Header Row
      const headerRow = worksheet.addRow(table.headers);
      headerRow.height = 26;
      headerRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E293B' } // Professional dark slate
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF334155' } },
          left: { style: 'thin', color: { argb: 'FF334155' } },
          bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
          right: { style: 'thin', color: { argb: 'FF334155' } }
        };
      });

      // Write Data Rows
      table.rows.forEach((rowValues, rowIdx) => {
        totalRows++;
        const row = worksheet.addRow(rowValues);
        row.height = 20;

        const isEven = rowIdx % 2 === 1;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
          if (isEven) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' } // Subtle alternating zebra background
            };
          }
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        });
      });

      // Auto-fit column widths
      worksheet.columns.forEach((col) => {
        let maxLen = 12;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
          const val = cell.value ? String(cell.value) : '';
          if (val.length > maxLen) {
            maxLen = Math.min(val.length + 3, 50);
          }
        });
        col.width = maxLen;
      });
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await workbook.xlsx.writeFile(outputPath);

    logger.info('PDF table extraction completed successfully', {
      tableCount: tables.length,
      totalRows,
      outputPath
    });

    return { tableCount: tables.length, rowCount: totalRows };
  }

  /**
   * Parses the PDF buffer with pdfjs-dist and extracts all tabular structures.
   */
  public async extractTablesFromPdf(pdfBuffer: Buffer): Promise<ExtractedTable[]> {
    // Dynamically load pdfjs-dist legacy build for Node.js
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(pdfBuffer);
    
    let pdfDoc;
    try {
      pdfDoc = await pdfjsLib.getDocument({
        data,
        useSystemFonts: true,
        disableFontFace: true
      }).promise;
    } catch (err) {
      throw new ConversionError(`Failed to parse PDF document: ${err instanceof Error ? err.message : String(err)}`);
    }

    const allTables: ExtractedTable[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const items: RawTextItem[] = [];
      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const str = item.str.trim();
        if (!str) continue;

        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const x = Math.round(transform[4] * 10) / 10;
        const y = Math.round(transform[5] * 10) / 10;
        const w = Math.round((item.width || 10) * 10) / 10;
        const h = Math.round((item.height || Math.abs(transform[0]) || Math.abs(transform[3]) || 10) * 10) / 10;

        items.push({
          text: str,
          x,
          y,
          w,
          h,
          right: x + w
        });
      }

      if (items.length === 0) continue;

      const pageTables = this.detectTablesOnPage(items, pageNum);
      allTables.push(...pageTables);
    }

    return allTables;
  }

  /**
   * Detects and reconstructs table matrices from text items on a single page.
   */
  private detectTablesOnPage(items: RawTextItem[], pageNum: number): ExtractedTable[] {
    // 1. Sort items top-to-bottom (PDF y is bottom-up, so higher y is higher on the page)
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    // 2. Cluster text items into visual horizontal lines
    const lines: RawTextItem[][] = [];
    for (const item of items) {
      let matchedLine = lines.find((line) => {
        const avgY = line.reduce((sum, it) => sum + it.y, 0) / line.length;
        const avgH = line.reduce((sum, it) => sum + it.h, 0) / line.length;
        const tolerance = Math.max(3.5, avgH * 0.45);
        return Math.abs(item.y - avgY) <= tolerance;
      });

      if (matchedLine) {
        matchedLine.push(item);
      } else {
        lines.push([item]);
      }
    }

    // 3. Within each line, sort left-to-right and merge words belonging to the same cell
    const processedLines: RawTextItem[][] = [];
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);

      const merged: RawTextItem[] = [];
      for (const chunk of line) {
        // Also check if text has tab separators or multiple spaces
        if (merged.length === 0) {
          merged.push({ ...chunk, right: chunk.x + chunk.w });
        } else {
          const last = merged[merged.length - 1];
          const gap = chunk.x - last.right;
          // If the horizontal gap is small, it's words in the same cell
          const mergeThreshold = Math.max(7, Math.min(last.h, chunk.h) * 0.75);

          if (gap >= -3 && gap < mergeThreshold) {
            const separator = last.text.endsWith(' ') || chunk.text.startsWith(' ') ? '' : ' ';
            last.text += separator + chunk.text;
            last.right = Math.max(last.right, chunk.x + chunk.w);
            last.w = last.right - last.x;
          } else {
            merged.push({ ...chunk, right: chunk.x + chunk.w });
          }
        }
      }

      // Check if single chunk contains internal tab or multi-space delimiters
      const expanded: RawTextItem[] = [];
      for (const m of merged) {
        if (/\t+|\s{3,}/.test(m.text)) {
          const subparts = m.text.split(/\t+|\s{3,}/).map((s) => s.trim()).filter(Boolean);
          if (subparts.length > 1) {
            const partWidth = m.w / subparts.length;
            subparts.forEach((sp, idx) => {
              expanded.push({
                text: sp,
                x: m.x + idx * partWidth,
                y: m.y,
                w: partWidth,
                h: m.h,
                right: m.x + (idx + 1) * partWidth
              });
            });
            continue;
          }
        }
        expanded.push(m);
      }

      processedLines.push(expanded);
    }

    // 4. Identify blocks of consecutive lines that represent tables (>= 2 columns across >= 2 rows)
    const tableBlocks: RawTextItem[][][] = [];
    let currentBlock: RawTextItem[][] = [];

    for (const line of processedLines) {
      if (line.length >= 2) {
        currentBlock.push(line);
      } else {
        if (currentBlock.length >= 2) {
          tableBlocks.push(currentBlock);
        }
        currentBlock = [];
      }
    }
    if (currentBlock.length >= 2) {
      tableBlocks.push(currentBlock);
    }

    const tables: ExtractedTable[] = [];

    tableBlocks.forEach((block, blockIdx) => {
      const table = this.reconstructGrid(block, pageNum, blockIdx + 1);
      if (table) {
        tables.push(table);
      }
    });

    return tables;
  }

  /**
   * Aligns cells in a table block into a clean rectangular grid based on column anchors.
   */
  private reconstructGrid(block: RawTextItem[][], pageNum: number, tableIdx: number): ExtractedTable | null {
    if (block.length < 2) return null;

    // 1. Collect all starting X positions to detect column boundaries
    const allX: number[] = [];
    for (const row of block) {
      for (const cell of row) {
        allX.push(cell.x);
      }
    }
    allX.sort((a, b) => a - b);

    // 2. Cluster X coordinates into discrete column anchors
    const colClusters: number[][] = [];
    const clusterThreshold = 18; // points

    for (const x of allX) {
      let matchedCluster = colClusters.find((cluster) => {
        const avg = cluster.reduce((sum, v) => sum + v, 0) / cluster.length;
        return Math.abs(x - avg) <= clusterThreshold;
      });

      if (matchedCluster) {
        matchedCluster.push(x);
      } else {
        colClusters.push([x]);
      }
    }

    if (colClusters.length < 2) {
      return null; // Not a multi-column table
    }

    // Sort column anchors from left to right
    const columnAnchors = colClusters
      .map((cluster) => Math.round(cluster.reduce((sum, v) => sum + v, 0) / cluster.length))
      .sort((a, b) => a - b);

    // 3. Build rectangular 2D row array
    const gridRows: string[][] = [];

    for (const rawRow of block) {
      const rowValues = new Array(columnAnchors.length).fill('');

      for (const cell of rawRow) {
        // Find best matching column index
        let bestColIdx = 0;
        let minDiff = Infinity;

        for (let c = 0; c < columnAnchors.length; c++) {
          const diff = Math.abs(cell.x - columnAnchors[c]);
          if (diff < minDiff) {
            minDiff = diff;
            bestColIdx = c;
          }
        }

        if (rowValues[bestColIdx]) {
          rowValues[bestColIdx] += ' ' + cell.text;
        } else {
          rowValues[bestColIdx] = cell.text;
        }
      }

      // Check if row has at least one non-empty value
      if (rowValues.some((v) => v.trim().length > 0)) {
        gridRows.push(rowValues);
      }
    }

    if (gridRows.length < 2) return null;

    // Header is row 0, data rows are 1..N
    const headers = gridRows[0].map((h, i) => (h.trim().length > 0 ? h.trim() : `Column_${i + 1}`));
    const dataRows = gridRows.slice(1);

    // Verify at least one data row exists with actual content
    if (dataRows.length === 0 || !dataRows.some((r) => r.some((c) => c.trim().length > 0))) {
      return null;
    }

    return {
      pageNumber: pageNum,
      tableIndex: tableIdx,
      headers,
      rows: dataRows
    };
  }
}

export const pdfTableExtractor = new PdfTableExtractorService();
