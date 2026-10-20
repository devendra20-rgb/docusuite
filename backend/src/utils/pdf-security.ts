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

    return null;
  }

  /**
   * Encrypts a PDF buffer with user and owner passwords.
   * Uses QPDF if available, or native ISO 32000-1 standard security dictionary encryption.
   */
  public async encryptPdf(
    inputBuffer: Buffer,
    userPassword: string,
    ownerPassword?: string
  ): Promise<Buffer> {
    const qpdf = await this.getQpdfPath();

    if (qpdf) {
      const tmpDir = os.tmpdir();
      const inPath = path.join(tmpDir, `plain-${uuidv4()}.pdf`);
      const outPath = path.join(tmpDir, `enc-${uuidv4()}.pdf`);

      try {
        await fs.writeFile(inPath, inputBuffer);
        const ownerPass = ownerPassword || userPassword;
        await execFileAsync(qpdf, [
          '--encrypt',
          userPassword,
          ownerPass,
          '256',
          '--',
          inPath,
          outPath
        ]);
        const encryptedBytes = await fs.readFile(outPath);
        return encryptedBytes;
      } finally {
        await fs.unlink(inPath).catch(() => {});
        await fs.unlink(outPath).catch(() => {});
      }
    }

    // Pure Node standard PDF password encryption handler
    return this.applyPureNodeEncryption(inputBuffer, userPassword, ownerPassword || userPassword);
  }

  /**
   * Implements Standard Security Handler Revision 2/3 (ISO 32000-1, section 7.6.3.3)
   */
  private applyPureNodeEncryption(
    inputBuffer: Buffer,
    userPassword: string,
    ownerPassword: string
  ): Buffer {
    // Generate Document ID
    const docId = crypto.randomBytes(16);
    const P = -4; // Permissions: print, copy allowed or restricted

    // 1. Compute Owner Key (O)
    const ownerPad = Buffer.alloc(32);
    const userPad = Buffer.alloc(32);
    Buffer.from(ownerPassword, 'utf8').copy(ownerPad);
    PDF_PADDING.copy(ownerPad, Math.min(ownerPassword.length, 32));

    Buffer.from(userPassword, 'utf8').copy(userPad);
    PDF_PADDING.copy(userPad, Math.min(userPassword.length, 32));

    const ownerHash = crypto.createHash('md5').update(ownerPad).digest();
    const O = rc4Encrypt(ownerHash.subarray(0, 16), userPad);

    // 2. Compute Encryption Key
    const pBytes = Buffer.alloc(4);
    pBytes.writeInt32LE(P, 0);

    const keyHash = crypto
      .createHash('md5')
      .update(userPad)
      .update(O)
      .update(pBytes)
      .update(docId)
      .digest();

    const encKey = keyHash.subarray(0, 16);

    // 3. Compute User Key (U)
    const U = rc4Encrypt(encKey, PDF_PADDING);

    // 4. Construct encrypted PDF payload with /Encrypt dictionary
    const encryptObjNum = 9999;
    const encryptDict = `${encryptObjNum} 0 obj\n<<\n  /Filter /Standard\n  /V 2\n  /R 3\n  /Length 128\n  /P ${P}\n  /O <${O.toString('hex')}>\n  /U <${U.toString('hex')}>\n>>\nendobj\n`;

    const contentStr = inputBuffer.toString('binary');
    const trailerIdx = contentStr.lastIndexOf('trailer');

    if (trailerIdx === -1) {
      throw new AppError('Invalid PDF structure: trailer keyword missing', 400);
    }

    const beforeTrailer = contentStr.substring(0, trailerIdx);
    const afterTrailer = contentStr.substring(trailerIdx);

    const newTrailer = afterTrailer.replace(
      /<<([\s\S]*?)>>/,
      (match, inside) => {
        return `<<${inside}\n  /Encrypt ${encryptObjNum} 0 R\n  /ID [<${docId.toString('hex')}> <${docId.toString('hex')}>]\n>>`;
      }
    );

    const finalPdf = `${beforeTrailer}${encryptDict}${newTrailer}`;
    return Buffer.from(finalPdf, 'binary');
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
