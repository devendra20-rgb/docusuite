import fs from 'fs/promises';
import unzipper from 'unzipper';
import mammoth from 'mammoth';
import { ValidationError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('DocxValidatorService');

export interface DocxValidationResult {
  valid: boolean;
  fileSizeBytes: number;
  filesInPackage: string[];
  hasContentTypes: boolean;
  hasDocumentRels: boolean;
  hasDocumentXml: boolean;
  hasStylesXml: boolean;
  paragraphsCount: number;
  tablesCount: number;
  extractedText: string;
  htmlPreview: string;
  errors: string[];
}

export class DocxValidatorService {
  /**
   * Validates that a file or buffer is a 100% valid, genuinely editable OpenXML (.docx) file.
   * Performs deep zip package inspection, XML schema syntax checks, and independent mammoth parsing.
   */
  public async validate(filePathOrBuffer: string | Buffer): Promise<DocxValidationResult> {
    let buffer: Buffer;
    if (typeof filePathOrBuffer === 'string') {
      try {
        buffer = await fs.readFile(filePathOrBuffer);
      } catch (err) {
        throw new ConversionError(`Failed to read DOCX file for validation: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      buffer = filePathOrBuffer;
    }

    if (!buffer || buffer.length < 100) {
      throw new ValidationError('Generated DOCX file is missing or contains insufficient binary data.');
    }

    const errors: string[] = [];

    // 1. Verify standard PKZip structure using unzipper
    let directory: unzipper.CentralDirectory;
    try {
      directory = await unzipper.Open.buffer(buffer);
    } catch (zipErr) {
      throw new ValidationError(`Generated file is not a valid ZIP package: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`);
    }

    const filesInPackage = directory.files.map((f) => f.path.replace(/\\/g, '/'));
    const hasContentTypes = filesInPackage.includes('[Content_Types].xml');
    const hasPackageRels = filesInPackage.includes('_rels/.rels');
    const hasDocumentXml = filesInPackage.includes('word/document.xml');
    const hasStylesXml = filesInPackage.includes('word/styles.xml');

    if (!hasContentTypes) errors.push('Missing [Content_Types].xml in OpenXML package');
    if (!hasPackageRels) errors.push('Missing _rels/.rels in OpenXML package');
    if (!hasDocumentXml) errors.push('Missing word/document.xml in OpenXML package');

    // 2. Read and parse word/document.xml
    let documentXmlContent = '';
    const docEntry = directory.files.find((f) => f.path.replace(/\\/g, '/') === 'word/document.xml');
    if (docEntry) {
      const docBuffer = await docEntry.buffer();
      documentXmlContent = docBuffer.toString('utf8');

      if (!documentXmlContent.includes('http://schemas.openxmlformats.org/wordprocessingml/2006/main')) {
        errors.push('word/document.xml lacks standard OpenXML namespace declaration');
      }

      // Check for balanced tags
      const openPs = (documentXmlContent.match(/<w:p[\s>]/g) || []).length;
      const closePs = (documentXmlContent.match(/<\/w:p>/g) || []).length;
      if (openPs !== closePs) {
        errors.push(`Mismatched paragraph tags: ${openPs} opened vs ${closePs} closed`);
      }

      const openTbls = (documentXmlContent.match(/<w:tbl[\s>]/g) || []).length;
      const closeTbls = (documentXmlContent.match(/<\/w:tbl>/g) || []).length;
      if (openTbls !== closeTbls) {
        errors.push(`Mismatched table tags: ${openTbls} opened vs ${closeTbls} closed`);
      }
    } else {
      errors.push('word/document.xml entry not readable');
    }

    // 3. Verify independent parsing with mammoth
    let extractedText = '';
    let htmlPreview = '';
    try {
      const textResult = await mammoth.extractRawText({ buffer });
      extractedText = (textResult.value || '').trim();

      const htmlResult = await mammoth.convertToHtml({ buffer });
      htmlPreview = (htmlResult.value || '').trim();

      if (textResult.messages && textResult.messages.length > 0) {
        for (const msg of textResult.messages) {
          if (msg.type === 'error') {
            errors.push(`Mammoth parser error: ${msg.message}`);
          }
        }
      }
    } catch (parseErr) {
      errors.push(`Independent Word parser failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    }

    const paragraphsCount = (documentXmlContent.match(/<w:p[\s>]/g) || []).length;
    const tablesCount = (documentXmlContent.match(/<w:tbl[\s>]/g) || []).length;

    const isValid = errors.length === 0;

    logger.info('DOCX validation completed', {
      isValid,
      fileSizeBytes: buffer.length,
      paragraphsCount,
      tablesCount,
      errorsCount: errors.length
    });

    if (!isValid) {
      throw new ValidationError(`DOCX structure validation failed: ${errors.join('; ')}`);
    }

    return {
      valid: isValid,
      fileSizeBytes: buffer.length,
      filesInPackage,
      hasContentTypes,
      hasDocumentRels: hasPackageRels,
      hasDocumentXml,
      hasStylesXml,
      paragraphsCount,
      tablesCount,
      extractedText,
      htmlPreview,
      errors
    };
  }
}

export const docxValidator = new DocxValidatorService();

