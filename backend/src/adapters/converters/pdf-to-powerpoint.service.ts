import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PDFDocument } from 'pdf-lib';
import { pdfEngine } from '../pdf/pdf-engine.adapter.js';
import { ValidationError, ConversionError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('PdfToPowerPointConverterService');

export interface PdfToPowerPointResult {
  outputPath: string;
  fileSize: number;
  pageCount: number;
}

export class PdfToPowerPointConverterService {
  /**
   * Converts a PDF file into a standard, valid Microsoft PowerPoint (.pptx) presentation.
   * Renders each PDF page at high fidelity into an OpenXML PresentationML slide deck
   * with zero external LibreOffice dependencies.
   */
  public async convert(
    inputPath: string,
    outputPath: string,
    options: Record<string, unknown> = {}
  ): Promise<PdfToPowerPointResult> {
    const startTime = Date.now();
    logger.info('Starting native PDF to PowerPoint conversion', { inputPath, outputPath });

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await fs.readFile(inputPath);
    } catch (err) {
      throw new ConversionError(`Failed to read input PDF file: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (pdfBuffer.length < 10) {
      throw new ValidationError('Input PDF file is empty or corrupted.');
    }

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('encrypted')) {
        throw new ValidationError('The provided PDF is encrypted or password-protected. Please unlock it before converting to PowerPoint.');
      }
      throw new ValidationError(`Failed to parse PDF document: ${errMsg}`);
    }

    const pageCount = pdfDoc.getPageCount();
    if (pageCount === 0) {
      throw new ValidationError('The PDF document contains 0 pages.');
    }

    // High quality rendering: 1.5x scale (108 DPI) balances razor-sharp visuals with rapid conversion speed and lightweight PPTX file sizes
    const scale = typeof options.scale === 'number' ? options.scale : 1.5;
    let images: { page: number; buffer: Buffer; mimeType: string }[] = [];
    try {
      images = await pdfEngine.pdfToImages(pdfBuffer, 'png', scale);
    } catch (renderErr: any) {
      logger.warn('pdfToImages fallback attempt', { err: renderErr?.message });
      // Retry at 1.0x scale if memory/render failed
      images = await pdfEngine.pdfToImages(pdfBuffer, 'png', 1.0);
    }

    if (images.length === 0) {
      throw new ConversionError('Failed to render any slides from the PDF document.');
    }

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Determine presentation slide dimensions from first page (in EMUs: 1 pt = 12700 EMUs)
    const firstPage = pdfDoc.getPage(0);
    const { width: pWidthPt, height: pHeightPt } = firstPage.getSize();
    const widthEmu = Math.max(1, Math.round(pWidthPt * 12700));
    const heightEmu = Math.max(1, Math.round(pHeightPt * 12700));

    // Construct valid ECMA-376 OpenXML PPTX package
    await new Promise<void>((resolve, reject) => {
      const outStream = fsSync.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      outStream.on('close', () => resolve());
      outStream.on('error', (err) => reject(err));
      archive.on('error', (err) => reject(err));

      archive.pipe(outStream);

      // 1. [Content_Types].xml
      let contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`;

      for (let i = 1; i <= pageCount; i++) {
        contentTypes += `\n  <Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
      }
      contentTypes += `\n</Types>`;
      archive.append(contentTypes, { name: '[Content_Types].xml' });

      // 2. _rels/.rels
      const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
      archive.append(rootRels, { name: '_rels/.rels' });

      // 3. ppt/presentation.xml
      let sldIdLst = '';
      for (let i = 1; i <= pageCount; i++) {
        sldIdLst += `\n    <p:sldId id="${255 + i}" r:id="rIdSlide${i}"/>`;
      }

      const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>${sldIdLst}
  </p:sldIdLst>
  <p:sldSz cx="${widthEmu}" cy="${heightEmu}" type="custom"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
      archive.append(presentation, { name: 'ppt/presentation.xml' });

      // 4. ppt/_rels/presentation.xml.rels
      let presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`;
      for (let i = 1; i <= pageCount; i++) {
        presRels += `\n  <Relationship Id="rIdSlide${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
      }
      presRels += `\n</Relationships>`;
      archive.append(presRels, { name: 'ppt/_rels/presentation.xml.rels' });

      // 5. ppt/slideMasters/slideMaster1.xml
      const slideMaster = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rId1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;
      archive.append(slideMaster, { name: 'ppt/slideMasters/slideMaster1.xml' });

      // 6. ppt/slideMasters/_rels/slideMaster1.xml.rels
      const masterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
      archive.append(masterRels, { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels' });

      // 7. ppt/slideLayouts/slideLayout1.xml
      const slideLayout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
              xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
              type="blank" preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sldLayout>`;
      archive.append(slideLayout, { name: 'ppt/slideLayouts/slideLayout1.xml' });

      // 8. ppt/slideLayouts/_rels/slideLayout1.xml.rels
      const layoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
      archive.append(layoutRels, { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels' });

      // 9. ppt/theme/theme1.xml
      const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="37000"/></a:schemeClr></a:gs></a:gsLst></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs></a:gsLst></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="s" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="25400" cap="flat" cmpd="s" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="38100" cap="flat" cmpd="s" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="40000"/></a:schemeClr></a:gs></a:gsLst></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/></a:schemeClr></a:gs></a:gsLst></a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;
      archive.append(theme, { name: 'ppt/theme/theme1.xml' });

      // 10. For each slide: add page image, slide XML, and rels
      for (let i = 0; i < pageCount; i++) {
        const slideIdx = i + 1;
        const pageImage = images[i] ? images[i].buffer : images[0].buffer;
        const pageObj = pdfDoc.getPage(i);
        const { width: pW, height: pH } = pageObj.getSize();
        const curWidthEmu = Math.max(1, Math.round(pW * 12700));
        const curHeightEmu = Math.max(1, Math.round(pH * 12700));

        // Media
        archive.append(pageImage, { name: `ppt/media/image${slideIdx}.png` });

        // Slide XML
        const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="Slide ${slideIdx} Content"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rIdPic1"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="${curWidthEmu}" cy="${curHeightEmu}"/>
          </a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
        archive.append(slideXml, { name: `ppt/slides/slide${slideIdx}.xml` });

        // Slide rels
        const slideRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdPic1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${slideIdx}.png"/>
</Relationships>`;
        archive.append(slideRelsXml, { name: `ppt/slides/_rels/slide${slideIdx}.xml.rels` });
      }

      archive.finalize().catch(reject);
    });

    const stats = await fs.stat(outputPath);
    logger.info('Native PDF to PowerPoint conversion completed', {
      outputPath,
      fileSize: stats.size,
      pageCount,
      durationMs: Date.now() - startTime
    });

    return {
      outputPath,
      fileSize: stats.size,
      pageCount
    };
  }
}

export const pdfToPowerPointConverter = new PdfToPowerPointConverterService();

