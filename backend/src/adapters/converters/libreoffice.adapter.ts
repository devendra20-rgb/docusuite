import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { IConversionEngine, ConversionResult } from './conversion.interface.js';
import { config } from '../../config/index.js';
import { AppError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const execFileAsync = promisify(execFile);
const logger = createChildLogger('LibreOfficeAdapter');

export class LibreOfficeAdapter implements IConversionEngine {
  public readonly name = 'LibreOfficeHeadlessEngine';
  private cachedBinaryPath: string | null = null;
  private hasCheckedAvailability = false;

  public async isAvailable(): Promise<boolean> {
    const binary = await this.resolveBinaryPath();
    return binary !== null;
  }

  public async resolveBinaryPath(): Promise<string | null> {
    if (this.cachedBinaryPath) {
      return this.cachedBinaryPath;
    }

    if (config.SOFFICE_PATH && fsSync.existsSync(config.SOFFICE_PATH)) {
      this.cachedBinaryPath = config.SOFFICE_PATH;
      return this.cachedBinaryPath;
    }

    const candidatePaths: string[] = [];

    if (process.platform === 'win32') {
      candidatePaths.push(
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
      );
    } else {
      candidatePaths.push(
        '/usr/bin/soffice',
        '/usr/bin/libreoffice',
        '/usr/local/bin/soffice'
      );
    }

    for (const candidate of candidatePaths) {
      if (fsSync.existsSync(candidate)) {
        this.cachedBinaryPath = candidate;
        logger.info('Found LibreOffice binary', { path: candidate });
        return candidate;
      }
    }

    // Check system PATH
    try {
      const checkCmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(checkCmd, ['soffice']);
      const found = stdout.trim().split(/\r?\n/)[0];
      if (found && fsSync.existsSync(found)) {
        this.cachedBinaryPath = found;
        return found;
      }
    } catch {
      // not found in PATH
    }

    if (!this.hasCheckedAvailability) {
      this.hasCheckedAvailability = true;
      logger.warn('LibreOffice headless binary is not detected on the host system.');
    }

    return null;
  }

  public supports(fromExt: string, toExt: string): boolean {
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    const supportedOfficeFrom = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'html', 'pdf'];
    const supportedOfficeTo = ['pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'html', 'txt'];

    if (supportedOfficeFrom.includes(from) && supportedOfficeTo.includes(to)) {
      return from !== to;
    }

    return false;
  }

  public getLimitations(fromExt: string, toExt: string): string[] {
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    const general = [
      'Conversion rendered using LibreOffice headless document filter.',
      'Complex VBA macros, form controls and proprietary fonts may be omitted or substituted.',
      'Layout and pagination may vary slightly from Microsoft 365 or Adobe Acrobat rendering.'
    ];

    if (from === 'pdf' && (to === 'docx' || to === 'xlsx' || to === 'pptx')) {
      general.push(
        'PDF to Office uses heuristic layout reconstruction; tables and floating graphics might not remain natively editable.'
      );
    }

    return general;
  }

  public async convert(
    inputPath: string,
    outputPath: string,
    fromExt: string,
    toExt: string,
    options: Record<string, unknown> = {}
  ): Promise<ConversionResult> {
    const binary = await this.resolveBinaryPath();
    if (!binary) {
      throw new AppError(
        'LibreOffice conversion engine is not installed or available on this host. For full Office format conversions, deploy with the provided Docker container.',
        503
      );
    }

    const startTime = Date.now();
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    // Isolated temp profile per conversion to prevent concurrent worker lock conflicts
    const tempProfileDir = path.join(os.tmpdir(), `soffice-profile-${uuidv4()}`);
    const outDir = path.dirname(outputPath);

    try {
      await fs.mkdir(tempProfileDir, { recursive: true });

      const profileUri = `file:///${tempProfileDir.replace(/\\/g, '/')}`;

      let convertArg = to;
      const extraArgs: string[] = [];

      if (from === 'pdf') {
        if (to === 'docx') {
          convertArg = 'docx:MS Word 2007 XML';
          extraArgs.push('--infilter=writer_pdf_import');
        } else if (to === 'pptx') {
          convertArg = 'pptx:Impress MS PowerPoint 2007 XML';
        } else if (to === 'html') {
          convertArg = 'html:HTML (StarWriter)';
          extraArgs.push('--infilter=writer_pdf_import');
        }
      }

      const args = [
        `--headless`,
        `--invisible`,
        `--nodefault`,
        `--nofirststartwizard`,
        `--nolockcheck`,
        `--nologo`,
        `-env:UserInstallation=${profileUri}`,
        ...extraArgs,
        `--convert-to`,
        convertArg,
        `--outdir`,
        outDir,
        inputPath
      ];

      logger.info('Executing LibreOffice conversion', { binary, from, to, inputPath, outDir });

      await execFileAsync(binary, args, {
        timeout: config.CONVERSION_TIMEOUT_MS,
        windowsHide: true
      });

      // LibreOffice generates output file named after the input file with the new extension
      const inputBasename = path.basename(inputPath, path.extname(inputPath));
      const generatedFile = path.join(outDir, `${inputBasename}.${to}`);

      if (!fsSync.existsSync(generatedFile)) {
        throw new ConversionError(`LibreOffice did not produce expected output file at ${generatedFile}`);
      }

      // If requested outputPath differs from LibreOffice default name, rename it
      if (generatedFile !== outputPath) {
        if (fsSync.existsSync(outputPath)) {
          await fs.unlink(outputPath);
        }
        await fs.rename(generatedFile, outputPath);
      }

      const stats = await fs.stat(outputPath);

      return {
        outputPath,
        outputMime: this.getMimeForExtension(to),
        outputExtension: `.${to}`,
        fileSize: stats.size,
        engineUsed: this.name,
        durationMs: Date.now() - startTime,
        limitations: this.getLimitations(from, to)
      };
    } catch (err: unknown) {
      logger.error('LibreOffice conversion failed', { err, from, to, inputPath });
      throw new ConversionError(
        `Document conversion from .${from} to .${to} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      // Clean up isolated profile
      try {
        await fs.rm(tempProfileDir, { recursive: true, force: true });
      } catch {
        // ignore profile cleanup error
      }
    }
  }

  private getMimeForExtension(ext: string): string {
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ppt: 'application/vnd.ms-powerpoint',
      odt: 'application/vnd.oasis.opendocument.text',
      ods: 'application/vnd.oasis.opendocument.spreadsheet',
      odp: 'application/vnd.oasis.opendocument.presentation',
      rtf: 'application/rtf',
      html: 'text/html',
      txt: 'text/plain'
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
  }
}

export const libreOfficeAdapter = new LibreOfficeAdapter();
