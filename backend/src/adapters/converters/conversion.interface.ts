export interface ConversionResult {
  outputPath: string;
  outputMime: string;
  outputExtension: string;
  fileSize: number;
  engineUsed: string;
  durationMs: number;
  limitations: string[];
}

export interface IConversionEngine {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  supports(fromExt: string, toExt: string): boolean;
  convert(
    inputPath: string,
    outputPath: string,
    fromExt: string,
    toExt: string,
    options?: Record<string, unknown>
  ): Promise<ConversionResult>;
  getLimitations(fromExt: string, toExt: string): string[];
}
