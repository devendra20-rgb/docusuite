import { IConversionEngine, ConversionResult } from './conversion.interface.js';
import { nativeNodeAdapter } from './native-node.adapter.js';
import { libreOfficeAdapter } from './libreoffice.adapter.js';
import { AppError, UnsupportedFormatError } from '../../utils/errors.js';
import { createChildLogger } from '../../utils/logger.js';

const logger = createChildLogger('ConversionRouterService');

export interface EngineCapability {
  name: string;
  available: boolean;
  supportedConversions: string[];
}

export class ConversionRouterService {
  private engines: IConversionEngine[] = [nativeNodeAdapter, libreOfficeAdapter];

  public async getEngineCapabilities(): Promise<EngineCapability[]> {
    const results: EngineCapability[] = [];
    for (const engine of this.engines) {
      const available = await engine.isAvailable();
      results.push({
        name: engine.name,
        available,
        supportedConversions: this.getEngineSupportedConversions(engine)
      });
    }
    return results;
  }

  private getEngineSupportedConversions(engine: IConversionEngine): string[] {
    const commonPairs = [
      'pdf->docx',
      'docx->pdf',
      'pdf->xlsx',
      'xlsx->pdf',
      'pdf->pptx',
      'pptx->pdf',
      'html->pdf',
      'docx->html',
      'csv->xlsx',
      'xlsx->csv',
      'txt->pdf',
      'rtf->pdf',
      'odt->pdf',
      'ods->pdf',
      'odp->pdf'
    ];

    return commonPairs.filter((pair) => {
      const [from, to] = pair.split('->');
      return engine.supports(from, to);
    });
  }

  public async routeConversion(
    inputPath: string,
    outputPath: string,
    fromExt: string,
    toExt: string,
    options: Record<string, unknown> = {}
  ): Promise<ConversionResult> {
    const from = fromExt.toLowerCase().replace('.', '');
    const to = toExt.toLowerCase().replace('.', '');

    // First check if native Node adapter supports it (zero external dependencies)
    if (nativeNodeAdapter.supports(from, to) && (await nativeNodeAdapter.isAvailable())) {
      logger.info('Routing to Native Node engine', { from, to });
      return nativeNodeAdapter.convert(inputPath, outputPath, from, to, options);
    }

    // Next check LibreOffice adapter
    if (libreOfficeAdapter.supports(from, to)) {
      const isAvailable = await libreOfficeAdapter.isAvailable();
      if (!isAvailable) {
        throw new AppError(
          `Conversion from .${from} to .${to} requires LibreOffice, which is not available in the current host environment. Please run the backend inside Docker where LibreOffice is packaged.`,
          503
        );
      }
      logger.info('Routing to LibreOffice engine', { from, to });
      return libreOfficeAdapter.convert(inputPath, outputPath, from, to, options);
    }

    throw new UnsupportedFormatError(`Conversion from .${from} to .${to} is not supported by any registered conversion engine.`);
  }
}

export const conversionRouter = new ConversionRouterService();
