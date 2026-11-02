import archiver from 'archiver';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

/**
 * Escapes characters for safe inclusion in XML attributes and text elements,
 * and strips invalid ASCII control characters that corrupt OpenXML documents.
 */
export function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface DocxRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSizePt?: number;
  colorHex?: string;
  fontFamily?: string;
}

export interface DocxParagraph {
  type: 'paragraph';
  runs: DocxRun[];
  style?: 'Normal' | 'Heading1' | 'Heading2' | 'Heading3' | 'ListBullet';
  alignment?: 'left' | 'center' | 'right' | 'both';
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineSpacingPt?: number;
  indentLeftPt?: number;
  indentFirstLinePt?: number;
  bullet?: boolean;
  pageBreakBefore?: boolean;
}

export interface DocxTableCell {
  text: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right';
  widthDxa?: number;
  backgroundColorHex?: string;
}

export interface DocxTable {
  type: 'table';
  headers?: DocxTableCell[];
  rows: DocxTableCell[][];
  colWidthsDxa?: number[];
  indentDxa?: number;
  alignment?: 'center' | 'left' | 'right';
}

export interface DocxImageBlock {
  type: 'image';
  id: number;
  buffer: Buffer;
  mimeType: string;
  widthPt: number;
  heightPt: number;
  alignment?: 'left' | 'center' | 'right';
}

export interface DocxPageBreak {
  type: 'pageBreak';
}

export type DocxBlock = DocxParagraph | DocxTable | DocxImageBlock | DocxPageBreak;

export interface DocxPageSettings {
  widthPt: number;
  heightPt: number;
  orientation?: 'portrait' | 'landscape';
  marginTopPt?: number;
  marginRightPt?: number;
  marginBottomPt?: number;
  marginLeftPt?: number;
}

export interface DocxDocumentOptions {
  title?: string;
  author?: string;
  pageSettings?: DocxPageSettings;
}

export class DocxBuilder {
  private blocks: DocxBlock[] = [];
  private options: DocxDocumentOptions;
  private imageCounter = 0;

  constructor(options: DocxDocumentOptions = {}) {
    this.options = {
      title: options.title || 'Converted Document',
      author: options.author || 'DocuSuite Precision Studio',
      pageSettings: {
        widthPt: options.pageSettings?.widthPt || 595.28, // A4 default
        heightPt: options.pageSettings?.heightPt || 841.89,
        orientation: options.pageSettings?.orientation || 'portrait',
        marginTopPt: options.pageSettings?.marginTopPt !== undefined ? options.pageSettings.marginTopPt : 54,
        marginRightPt: options.pageSettings?.marginRightPt !== undefined ? options.pageSettings.marginRightPt : 54,
        marginBottomPt: options.pageSettings?.marginBottomPt !== undefined ? options.pageSettings.marginBottomPt : 54,
        marginLeftPt: options.pageSettings?.marginLeftPt !== undefined ? options.pageSettings.marginLeftPt : 54
      }
    };
  }

  public addParagraph(paragraph: DocxParagraph): this {
    this.blocks.push(paragraph);
    return this;
  }

  public addTable(table: DocxTable): this {
    this.blocks.push(table);
    return this;
  }

  public addImage(image: {
    buffer: Buffer;
    mimeType?: string;
    widthPt: number;
    heightPt: number;
    alignment?: 'left' | 'center' | 'right';
  }): this {
    this.imageCounter++;
    this.blocks.push({
      type: 'image',
      id: this.imageCounter,
      buffer: image.buffer,
      mimeType: image.mimeType || 'image/png',
      widthPt: image.widthPt,
      heightPt: image.heightPt,
      alignment: image.alignment || 'center'
    });
    return this;
  }

  public addPageBreak(): this {
    this.blocks.push({ type: 'pageBreak' });
    return this;
  }

  public getBlockCount(): number {
    return this.blocks.length;
  }

  /**
   * Generates the entire OpenXML package and writes it to the specified file path.
   */
  public async writeToFile(outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const outputStream = fsSync.createWriteStream(outputPath);

    await this.pipeToStream(outputStream);
  }

  /**
   * Generates the OpenXML package and returns a Buffer.
   */
  public async toBuffer(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk) => chunks.push(chunk));

    const endPromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    this.buildArchive(archive);
    await archive.finalize();

    return endPromise;
  }

  private pipeToStream(stream: NodeJS.WritableStream): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(stream);

    const endPromise = new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      archive.on('error', reject);
    });

    this.buildArchive(archive);
    archive.finalize().catch(() => {});

    return endPromise;
  }

  private buildArchive(archive: archiver.Archiver): void {
    const images = this.blocks.filter((b): b is DocxImageBlock => b.type === 'image');

    // 1. [Content_Types].xml
    archive.append(this.buildContentTypesXml(images), { name: '[Content_Types].xml' });

    // 2. _rels/.rels
    archive.append(this.buildPackageRelsXml(), { name: '_rels/.rels' });

    // 3. word/_rels/document.xml.rels
    archive.append(this.buildDocumentRelsXml(images), { name: 'word/_rels/document.xml.rels' });

    // 4. word/styles.xml
    archive.append(this.buildStylesXml(), { name: 'word/styles.xml' });

    // 5. word/settings.xml
    archive.append(this.buildSettingsXml(), { name: 'word/settings.xml' });

    // 6. word/fontTable.xml
    archive.append(this.buildFontTableXml(), { name: 'word/fontTable.xml' });

    // 7. docProps/core.xml
    archive.append(this.buildCorePropsXml(), { name: 'docProps/core.xml' });

    // 8. docProps/app.xml
    archive.append(this.buildAppPropsXml(), { name: 'docProps/app.xml' });

    // 9. word/media/image_{id}.{ext}
    for (const img of images) {
      const ext = img.mimeType.includes('jpeg') || img.mimeType.includes('jpg') ? 'jpeg' : 'png';
      archive.append(img.buffer, { name: `word/media/image_${img.id}.${ext}` });
    }

    // 10. word/document.xml
    archive.append(this.buildDocumentXml(), { name: 'word/document.xml' });
  }

  private buildContentTypesXml(images: DocxImageBlock[]): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
  }

  private buildPackageRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
  }

  private buildDocumentRelsXml(images: DocxImageBlock[]): string {
    let imageRels = '';
    for (const img of images) {
      const ext = img.mimeType.includes('jpeg') || img.mimeType.includes('jpg') ? 'jpeg' : 'png';
      imageRels += `<Relationship Id="rIdImg_${img.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image_${img.id}.${ext}"/>\n`;
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
  ${imageRels}
</Relationships>`;
  }

  private buildStylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <!-- Default Document Properties -->
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="1E293B"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="80" w:line="260" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>

  <!-- Normal Paragraph Style -->
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr>
      <w:sz w:val="22"/>
      <w:color w:val="1E293B"/>
    </w:rPr>
  </w:style>

  <!-- Heading 1 -->
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="240" w:after="100" w:line="320" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="36"/>
      <w:szCs w:val="36"/>
      <w:color w:val="0F172A"/>
    </w:rPr>
  </w:style>

  <!-- Heading 2 -->
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="180" w:after="80" w:line="280" w:lineRule="auto"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="28"/>
      <w:szCs w:val="28"/>
      <w:color w:val="1E293B"/>
    </w:rPr>
  </w:style>

  <!-- Heading 3 -->
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="120" w:after="60"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
      <w:color w:val="334155"/>
    </w:rPr>
  </w:style>

  <!-- Bullet / List Paragraph -->
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:ind w:left="720" w:hanging="360"/>
      <w:spacing w:after="60"/>
    </w:pPr>
  </w:style>

  <!-- Table Grid Default Style -->
  <w:style w:type="table" w:default="1" w:styleId="TableGrid">
    <w:name w:val="Table Grid"/>
    <w:tblPr>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
  </w:style>
</w:styles>`;
  }

  private buildSettingsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
</w:settings>`;
  }

  private buildFontTableXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fontTable xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Calibri">
    <w:panose1 w:val="020F0502020204030204"/>
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Arial">
    <w:panose1 w:val="020B0604020202020204"/>
    <w:charset w:val="00"/>
    <w:family w:val="swiss"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Times New Roman">
    <w:panose1 w:val="02020603050405020304"/>
    <w:charset w:val="00"/>
    <w:family w:val="roman"/>
    <w:pitch w:val="variable"/>
  </w:font>
  <w:font w:name="Courier New">
    <w:panose1 w:val="02070309020205020404"/>
    <w:charset w:val="00"/>
    <w:family w:val="modern"/>
    <w:pitch w:val="fixed"/>
  </w:font>
  <w:font w:name="Georgia">
    <w:panose1 w:val="02040502050405020303"/>
    <w:charset w:val="00"/>
    <w:family w:val="roman"/>
    <w:pitch w:val="variable"/>
  </w:font>
</w:fontTable>`;
  }

  private buildCorePropsXml(): string {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(this.options.title || 'Converted Document')}</dc:title>
  <dc:creator>${escapeXml(this.options.author || 'DocuSuite')}</dc:creator>
  <cp:lastModifiedBy>DocuSuite</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
  }

  private buildAppPropsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>DocuSuite Precision Studio</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>DocuSuite</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0.0</AppVersion>
</Properties>`;
  }

  private buildDocumentXml(): string {
    const pageSettings = this.options.pageSettings!;
    // 1 pt = 20 dxa (twips)
    const widthDxa = Math.round(pageSettings.widthPt * 20);
    const heightDxa = Math.round(pageSettings.heightPt * 20);
    const topDxa = Math.round((pageSettings.marginTopPt !== undefined ? pageSettings.marginTopPt : 54) * 20);
    const rightDxa = Math.round((pageSettings.marginRightPt !== undefined ? pageSettings.marginRightPt : 54) * 20);
    const bottomDxa = Math.round((pageSettings.marginBottomPt !== undefined ? pageSettings.marginBottomPt : 54) * 20);
    const leftDxa = Math.round((pageSettings.marginLeftPt !== undefined ? pageSettings.marginLeftPt : 54) * 20);
    const orient = pageSettings.orientation || 'portrait';

    let bodyContent = '';

    for (const block of this.blocks) {
      if (block.type === 'paragraph') {
        bodyContent += this.renderParagraph(block);
      } else if (block.type === 'table') {
        bodyContent += this.renderTable(block);
      } else if (block.type === 'image') {
        bodyContent += this.renderImage(block);
      } else if (block.type === 'pageBreak') {
        bodyContent += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      }
    }

    if (this.blocks.length === 0) {
      bodyContent = '<w:p><w:r><w:t></w:t></w:r></w:p>';
    }

    const sectionXml = `<w:sectPr>
      <w:pgSz w:w="${widthDxa}" w:h="${heightDxa}" w:orient="${orient}"/>
      <w:pgMar w:top="${topDxa}" w:right="${rightDxa}" w:bottom="${bottomDxa}" w:left="${leftDxa}" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyContent}
    ${sectionXml}
  </w:body>
</w:document>`;
  }

  private renderParagraph(p: DocxParagraph): string {
    let pPr = '';
    const pPrParts: string[] = [];

    if (p.style && p.style !== 'Normal') {
      pPrParts.push(`<w:pStyle w:val="${p.style}"/>`);
    }

    if (p.pageBreakBefore) {
      pPrParts.push('<w:pageBreakBefore/>');
    }

    if (p.alignment && p.alignment !== 'left') {
      pPrParts.push(`<w:jc w:val="${p.alignment}"/>`);
    }

    const spacingAttrs: string[] = [];
    if (p.spaceBeforePt !== undefined) {
      spacingAttrs.push(`w:before="${Math.round(p.spaceBeforePt * 20)}"`);
    }
    if (p.spaceAfterPt !== undefined) {
      spacingAttrs.push(`w:after="${Math.round(p.spaceAfterPt * 20)}"`);
    }
    if (p.lineSpacingPt !== undefined) {
      spacingAttrs.push(`w:line="${Math.round(p.lineSpacingPt * 20)}" w:lineRule="auto"`);
    }
    if (spacingAttrs.length > 0) {
      pPrParts.push(`<w:spacing ${spacingAttrs.join(' ')}/>`);
    }

    const indAttrs: string[] = [];
    if (p.indentLeftPt !== undefined && p.indentLeftPt > 0) {
      indAttrs.push(`w:left="${Math.round(p.indentLeftPt * 20)}"`);
    }
    if (p.indentFirstLinePt !== undefined && p.indentFirstLinePt !== 0) {
      if (p.indentFirstLinePt > 0) {
        indAttrs.push(`w:firstLine="${Math.round(p.indentFirstLinePt * 20)}"`);
      } else {
        indAttrs.push(`w:hanging="${Math.round(Math.abs(p.indentFirstLinePt) * 20)}"`);
      }
    }
    if (indAttrs.length > 0) {
      pPrParts.push(`<w:ind ${indAttrs.join(' ')}/>`);
    }

    if (pPrParts.length > 0) {
      pPr = `<w:pPr>${pPrParts.join('')}</w:pPr>`;
    }

    let runsXml = '';
    for (const run of p.runs) {
      runsXml += this.renderRun(run);
    }

    return `<w:p>${pPr}${runsXml}</w:p>`;
  }

  private renderRun(r: DocxRun): string {
    let rPr = '';
    const rPrParts: string[] = [];

    if (r.fontFamily) {
      rPrParts.push(`<w:rFonts w:ascii="${escapeXml(r.fontFamily)}" w:hAnsi="${escapeXml(r.fontFamily)}"/>`);
    }

    if (r.bold) {
      rPrParts.push('<w:b/><w:bCs/>');
    }

    if (r.italic) {
      rPrParts.push('<w:i/><w:iCs/>');
    }

    if (r.underline) {
      rPrParts.push('<w:u w:val="single"/>');
    }

    if (r.fontSizePt) {
      const halfPoints = Math.round(r.fontSizePt * 2);
      rPrParts.push(`<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>`);
    }

    if (r.colorHex) {
      const hex = r.colorHex.replace('#', '').toUpperCase();
      rPrParts.push(`<w:color w:val="${hex}"/>`);
    }

    if (rPrParts.length > 0) {
      rPr = `<w:rPr>${rPrParts.join('')}</w:rPr>`;
    }

    const textXml = `<w:t xml:space="preserve">${escapeXml(r.text)}</w:t>`;
    return `<w:r>${rPr}${textXml}</w:r>`;
  }

  private renderImage(img: DocxImageBlock): string {
    // 1 pt = 12700 EMUs
    const cx = Math.round(img.widthPt * 12700);
    const cy = Math.round(img.heightPt * 12700);
    const align = img.alignment || 'center';
    const rId = `rIdImg_${img.id}`;

    return `<w:p>
      <w:pPr>
        <w:jc w:val="${align}"/>
        <w:spacing w:before="120" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${cx}" cy="${cy}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="${img.id}" name="Picture ${img.id}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="${img.id}" name="Picture ${img.id}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${rId}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${cx}" cy="${cy}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
  }

  private renderTable(table: DocxTable): string {
    const colCount = Math.max(
      table.headers?.length || 0,
      ...table.rows.map((r) => r.length),
      table.colWidthsDxa?.length || 0
    );

    if (colCount === 0) return '';

    const defaultColWidth = Math.floor(9000 / colCount);
    const colWidths = table.colWidthsDxa || Array(colCount).fill(defaultColWidth);

    let gridXml = '<w:tblGrid>';
    for (let i = 0; i < colCount; i++) {
      gridXml += `<w:gridCol w:w="${colWidths[i] || defaultColWidth}"/>`;
    }
    gridXml += '</w:tblGrid>';

    let rowsXml = '';

    if (table.headers && table.headers.length > 0) {
      let cellsXml = '';
      table.headers.forEach((cell, colIdx) => {
        const cellWidth = colWidths[colIdx] || defaultColWidth;
        cellsXml += `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${cellWidth}" w:type="dxa"/>
            <w:shd w:val="clear" w:color="auto" w:fill="${cell.backgroundColorHex || 'F1F5F9'}"/>
            <w:tcMar>
              <w:top w:w="120" w:type="dxa"/>
              <w:left w:w="140" w:type="dxa"/>
              <w:bottom w:w="120" w:type="dxa"/>
              <w:right w:w="140" w:type="dxa"/>
            </w:tcMar>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
              ${cell.alignment && cell.alignment !== 'left' ? `<w:jc w:val="${cell.alignment}"/>` : ''}
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:b/><w:bCs/>
                <w:sz w:val="20"/>
                <w:color w:val="0F172A"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(cell.text)}</w:t>
            </w:r>
          </w:p>
        </w:tc>`;
      });

      rowsXml += `<w:tr>
        <w:trPr>
          <w:tblHeader/>
          <w:cantSplit/>
        </w:trPr>
        ${cellsXml}
      </w:tr>`;
    }

    table.rows.forEach((row, rowIdx) => {
      let cellsXml = '';
      const isEven = rowIdx % 2 === 1;
      const rowBg = isEven ? 'F8FAFC' : 'FFFFFF';

      for (let colIdx = 0; colIdx < colCount; colIdx++) {
        const cell = row[colIdx] || { text: '' };
        const cellWidth = colWidths[colIdx] || defaultColWidth;
        const bg = cell.backgroundColorHex || rowBg;

        cellsXml += `<w:tc>
          <w:tcPr>
            <w:tcW w:w="${cellWidth}" w:type="dxa"/>
            ${bg !== 'FFFFFF' ? `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>` : ''}
            <w:tcMar>
              <w:top w:w="100" w:type="dxa"/>
              <w:left w:w="140" w:type="dxa"/>
              <w:bottom w:w="100" w:type="dxa"/>
              <w:right w:w="140" w:type="dxa"/>
            </w:tcMar>
          </w:tcPr>
          <w:p>
            <w:pPr>
              <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
              ${cell.alignment && cell.alignment !== 'left' ? `<w:jc w:val="${cell.alignment}"/>` : ''}
            </w:pPr>
            <w:r>
              <w:rPr>
                ${cell.bold ? '<w:b/><w:bCs/>' : ''}
                ${cell.italic ? '<w:i/><w:iCs/>' : ''}
                <w:sz w:val="20"/>
                <w:color w:val="1E293B"/>
              </w:rPr>
              <w:t xml:space="preserve">${escapeXml(cell.text)}</w:t>
            </w:r>
          </w:p>
        </w:tc>`;
      }

      rowsXml += `<w:tr>
        <w:trPr>
          <w:cantSplit/>
        </w:trPr>
        ${cellsXml}
      </w:tr>`;
    });

    const indentAttr = table.indentDxa !== undefined && table.indentDxa > 0
      ? `<w:tblInd w:w="${table.indentDxa}" w:type="dxa"/>`
      : '';

    return `<w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="0" w:type="auto"/>
        <w:jc w:val="${table.alignment || 'left'}"/>
        ${indentAttr}
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        </w:tblBorders>
        <w:tblCellMar>
          <w:top w:w="100" w:type="dxa"/>
          <w:left w:w="140" w:type="dxa"/>
          <w:bottom w:w="100" w:type="dxa"/>
          <w:right w:w="140" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      ${gridXml}
      ${rowsXml}
    </w:tbl>`;
  }
}
