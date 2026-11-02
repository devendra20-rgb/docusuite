import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import { createChildLogger } from './logger.js';
import { AppError } from './errors.js';

const execFileAsync = promisify(execFile);
const logger = createChildLogger('PdfSecurity');

// Standard PDF padding bytes specified by ISO 32000-1 / Adobe PDF Reference
const PDF_PADDING = Buffer.from([
  0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56,
  0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80,
  0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A
]);

/**
 * Pure JavaScript RC4 stream cipher for ISO 32000-1 PDF security
 * (avoiding OpenSSL 3.0 deprecated cipher issues across Node versions)
 */
export function rc4Encrypt(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }
  let i = 0;
  j = 0;
  const out = Buffer.alloc(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

export class PdfSecurityHelper {
  private cachedQpdfPath: string | null = null;

  public async getQpdfPath(): Promise<string | null> {
    if (this.cachedQpdfPath) return this.cachedQpdfPath;

    if (config.QPDF_PATH && fsSync.existsSync(config.QPDF_PATH)) {
      this.cachedQpdfPath = config.QPDF_PATH;
      return this.cachedQpdfPath;
    }

    try {
      const checkCmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execFileAsync(checkCmd, ['qpdf']);
      const found = stdout.trim().split(/\r?\n/)[0];
      if (found && fsSync.existsSync(found)) {
        this.cachedQpdfPath = found;
        return found;
      }
    } catch {
      // not in path
    }

    // Standard platform candidate paths
    if (process.platform === 'win32') {
      const winCandidates = [
        'C:\\Program Files\\qpdf 12.4.2\\bin\\qpdf.exe',
        'C:\\Program Files\\qpdf\\bin\\qpdf.exe',
        'C:\\Program Files (x86)\\qpdf\\bin\\qpdf.exe',
      ];
      for (const candidate of winCandidates) {
        if (fsSync.existsSync(candidate)) {
          this.cachedQpdfPath = candidate;
          return candidate;
        }
      }

      // Dynamic scan of Program Files for any installed qpdf version
      try {
        const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
        if (fsSync.existsSync(programFiles)) {
          const entries = await fs.readdir(programFiles);
          for (const entry of entries) {
            if (/^qpdf/i.test(entry)) {
              const fullCandidate = path.join(programFiles, entry, 'bin', 'qpdf.exe');
              if (fsSync.existsSync(fullCandidate)) {
                this.cachedQpdfPath = fullCandidate;
                return fullCandidate;
              }
            }
          }
        }
      } catch {
        // ignore scan error
      }
    } else {
      const unixCandidates = [
        '/usr/bin/qpdf',
        '/usr/local/bin/qpdf',
        '/opt/homebrew/bin/qpdf'
      ];
      for (const candidate of unixCandidates) {
        if (fsSync.existsSync(candidate)) {
          this.cachedQpdfPath = candidate;
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Encrypts a PDF buffer with user and owner passwords using genuine AES-256.
   * Requires QPDF as the primary encryption engine. Fails safely if unavailable.
   */
  public async encryptPdf(
    inputBuffer: Buffer,
    userPassword: string,
    ownerPassword?: string
  ): Promise<Buffer> {
    if (!userPassword || userPassword.length === 0) {
      throw new AppError('A non-empty password is required to encrypt the PDF document', 400);
    }

    const qpdf = await this.getQpdfPath();

    if (!qpdf) {
      throw new AppError(
        'PDF encryption engine (QPDF) is not installed or available on this system. Cannot securely encrypt document.',
        500
      );
    }

    const tmpDir = os.tmpdir();
    const inPath = path.join(tmpDir, `plain-${uuidv4()}.pdf`);
    const outPath = path.join(tmpDir, `enc-${uuidv4()}.pdf`);

    try {
      await fs.writeFile(inPath, inputBuffer);
      const ownerPass = ownerPassword && ownerPassword.trim().length > 0 ? ownerPassword : userPassword;

      // 1. Perform genuine AES-256 encryption
      await execFileAsync(qpdf, [
        '--warning-exit-0',
        '--encrypt',
        `--user-password=${userPassword}`,
        `--owner-password=${ownerPass}`,
        '--bits=256',
        '--',
        inPath,
        outPath
      ]);

      // 2. Post-encryption verification: verify incorrect password fails
      try {
        await execFileAsync(qpdf, [
          '--warning-exit-0',
          '--password=__INVALID_VERIFY_PWD_CHECK__',
          '--check',
          outPath
        ]);
        // If the above did not throw, the document is NOT password protected!
        throw new AppError('Encryption verification failed: PDF was not properly password protected', 500);
      } catch (checkErr: any) {
        if (checkErr instanceof AppError) throw checkErr;
        // Expected to fail with invalid password
      }

      // 3. Post-encryption verification: verify correct password succeeds
      await execFileAsync(qpdf, [
        '--warning-exit-0',
        `--password=${userPassword}`,
        '--check',
        outPath
      ]);

      const encryptedBytes = await fs.readFile(outPath);
      return encryptedBytes;
    } finally {
      await fs.unlink(inPath).catch(() => {});
      await fs.unlink(outPath).catch(() => {});
    }
  }

  /**
   * Validates password and unlocks an encrypted PDF, returning an unlocked PDF buffer.
   */
  public async unlockPdf(pdfBuffer: Buffer, password: string): Promise<Buffer> {
    const qpdf = await this.getQpdfPath();

    if (qpdf) {
      const tmpDir = os.tmpdir();
      const inPath = path.join(tmpDir, `enc-${uuidv4()}.pdf`);
      const outPath = path.join(tmpDir, `dec-${uuidv4()}.pdf`);

      try {
        await fs.writeFile(inPath, pdfBuffer);
        await execFileAsync(qpdf, [
          '--warning-exit-0',
          `--password=${password}`,
          '--decrypt',
          inPath,
          outPath
        ]);
        const decBuf = await fs.readFile(outPath);
        return decBuf;
      } catch {
        throw new AppError('Incorrect password or unable to decrypt PDF with QPDF', 400);
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    }

    return this.applyPureNodeDecryption(pdfBuffer, password);
  }

  private applyPureNodeDecryption(pdfBuffer: Buffer, password: string): Buffer {
    const content = pdfBuffer.toString('binary');
    if (!content.includes('/Encrypt')) {
      return pdfBuffer; // Not encrypted
    }

    // Match /O <hex>, /U <hex>, /P num, /ID [<hex> <hex>]
    const oMatch = content.match(/\/O\s*<([0-9a-fA-F]+)>/);
    const uMatch = content.match(/\/U\s*<([0-9a-fA-F]+)>/);
    const pMatch = content.match(/\/P\s+(-?\d+)/);
    const idMatch = content.match(/\/ID\s*\[\s*<([0-9a-fA-F]+)>/);

    if (oMatch && uMatch && pMatch && idMatch) {
      const O = Buffer.from(oMatch[1], 'hex');
      const U = Buffer.from(uMatch[1], 'hex');
      const P = parseInt(pMatch[1], 10);
      const docId = Buffer.from(idMatch[1], 'hex');

      // 1. Verify User Password
      const userPad = Buffer.alloc(32);
      Buffer.from(password, 'utf8').copy(userPad);
      PDF_PADDING.copy(userPad, Math.min(password.length, 32));

      const pBytes = Buffer.alloc(4);
      pBytes.writeInt32LE(P, 0);

      const userKeyHash = crypto
        .createHash('md5')
        .update(userPad)
        .update(O)
        .update(pBytes)
        .update(docId)
        .digest();

      const userEncKey = userKeyHash.subarray(0, 16);
      const computedU = rc4Encrypt(userEncKey, PDF_PADDING);

      // Check user password
      let isValid = computedU.equals(U);

      // If user password fails, check owner password
      if (!isValid) {
        const ownerHash = crypto.createHash('md5').update(userPad).digest();
        const recoveredUserPad = rc4Encrypt(ownerHash.subarray(0, 16), O);
        const ownerKeyHash = crypto
          .createHash('md5')
          .update(recoveredUserPad)
          .update(O)
          .update(pBytes)
          .update(docId)
          .digest();
        const ownerEncKey = ownerKeyHash.subarray(0, 16);
        const computedOwnerU = rc4Encrypt(ownerEncKey, PDF_PADDING);
        isValid = computedOwnerU.equals(U);
      }

      if (!isValid) {
        throw new AppError('Incorrect password provided to unlock document', 400);
      }
    }

    // Remove /Encrypt reference and encrypt object to produce unlocked PDF
    let unlocked = content.replace(/\d+\s+0\s+obj\s*<<\s*\/Filter\s+\/Standard[\s\S]*?>>\s*endobj\s*/g, '');
    unlocked = unlocked.replace(/\/Encrypt\s+\d+\s+\d+\s+R/g, '');

    return Buffer.from(unlocked, 'binary');
  }
}

export const pdfSecurity = new PdfSecurityHelper();
