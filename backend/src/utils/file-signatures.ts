import { AppError, UnsupportedFormatError } from './errors.js';

export interface FileTypeInfo {
  mime: string;
  extension: string;
  category: 'pdf' | 'image' | 'office' | 'text' | 'unknown';
}

/**
 * Validates file signature (magic bytes) to prevent extension-spoofing attacks.
 */
export const detectFileTypeFromBuffer = (buffer: Buffer): FileTypeInfo => {
  if (!buffer || buffer.length < 4) {
    throw new AppError('File buffer too small or empty', 400);
  }

  // PDF check: %PDF (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { mime: 'application/pdf', extension: '.pdf', category: 'pdf' };
  }

  // PNG check: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mime: 'image/png', extension: '.png', category: 'image' };
  }

  // JPEG check: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mime: 'image/jpeg', extension: '.jpg', category: 'image' };
  }

  // ZIP-based Office formats: PK.. (50 4B 03 04 or 50 4B 05 06)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && (buffer[2] === 0x03 || buffer[2] === 0x05)) {
    // Inspect contents or return generic zip-based office container
    return { mime: 'application/vnd.openxmlformats-officedocument', extension: '.docx', category: 'office' };
  }

  // RTF check: {\rtf
  if (buffer[0] === 0x7B && buffer[1] === 0x5C && buffer[2] === 0x72 && buffer[3] === 0x74 && buffer[4] === 0x66) {
    return { mime: 'application/rtf', extension: '.rtf', category: 'office' };
  }

  // Check if plain text / CSV
  let isAscii = true;
  const checkLength = Math.min(buffer.length, 512);
  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i];
    // Check printable ASCII or UTF-8 or common whitespace (newline, cr, tab)
    if (byte < 0x09 || (byte > 0x0D && byte < 0x20 && byte !== 0x1B) || byte === 0x7F) {
      isAscii = false;
      break;
    }
  }

  if (isAscii) {
    const sample = buffer.subarray(0, checkLength).toString('utf8');
    if (sample.includes(',') || sample.includes(';') || sample.includes('\t')) {
      return { mime: 'text/csv', extension: '.csv', category: 'text' };
    }
    return { mime: 'text/plain', extension: '.txt', category: 'text' };
  }

  return { mime: 'application/octet-stream', extension: '.bin', category: 'unknown' };
};

export const assertFileIsPdf = (buffer: Buffer): void => {
  const type = detectFileTypeFromBuffer(buffer);
  if (type.category !== 'pdf') {
    throw new UnsupportedFormatError('Expected a valid PDF document with %PDF header');
  }
};

export const assertFileIsImage = (buffer: Buffer): void => {
  const type = detectFileTypeFromBuffer(buffer);
  if (type.category !== 'image') {
    throw new UnsupportedFormatError('Expected a valid image file (PNG or JPEG)');
  }
};
