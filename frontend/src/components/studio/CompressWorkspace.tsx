'use client';

import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import {
  Minimize2,
  ArrowLeft,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Download,
  RefreshCw,
  HardDrive,
  Sliders,
  Check,
  TrendingDown,
  Info,
  Loader2
} from 'lucide-react';
import { ToolDefinition } from '@/types/api';
import { submitDocumentJob, triggerFileDownload, getFullApiUrl } from '@/lib/api-client';
import { PdfOutputViewer } from './OutputPreview';

interface CompressWorkspaceProps {
  tool: ToolDefinition;
}

type CompressionPreset = 'recommended' | 'extreme' | 'less';
type SizeUnit = 'MB' | 'KB';

interface CompressOutputResult {
  jobId: string;
  downloadUrl: string;
  filename: string;
  originalSize: number;
  finalSize: number;
  savedBytes: number;
  reductionPercentage: number;
  targetAchieved?: boolean;
  targetSizeBytes?: number;
  presetUsed: CompressionPreset;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const CompressWorkspace: React.FC<CompressWorkspaceProps> = ({ tool }) => {
  // File state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configuration state
  const [targetSizeInput, setTargetSizeInput] = useState<string>('');
  const [targetUnit, setTargetUnit] = useState<SizeUnit>('MB');
  const [preset, setPreset] = useState<CompressionPreset>('recommended');

  // Processing & completion state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outputResult, setOutputResult] = useState<CompressOutputResult | null>(null);

  // Calculate byte target
  const parsedTargetNum = parseFloat(targetSizeInput);
  const targetSizeBytes = !isNaN(parsedTargetNum) && parsedTargetNum > 0
    ? Math.round(targetUnit === 'MB' ? parsedTargetNum * 1024 * 1024 : parsedTargetNum * 1024)
    : undefined;

  const isTargetBiggerThanOriginal = file && targetSizeBytes ? targetSizeBytes >= file.size : false;

  // Drag and drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectFile(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSelectFile = (selected: File) => {
    if (!selected.name.toLowerCase().endsWith('.pdf') && selected.type !== 'application/pdf') {
      setErrorMessage('Please upload a valid PDF document (.pdf).');
      return;
    }
    setFile(selected);
    setErrorMessage(null);
    setOutputResult(null);

    // Provide default target suggestion (50% of original in MB or KB)
    const origBytes = selected.size;
    const halfBytes = origBytes * 0.5;
    if (halfBytes >= 1024 * 1024) {
      setTargetUnit('MB');
      setTargetSizeInput((halfBytes / (1024 * 1024)).toFixed(1));
    } else {
      setTargetUnit('KB');
      setTargetSizeInput(Math.round(halfBytes / 1024).toString());
    }
  };

  // Preset quick-selection logic
  const handlePresetSelect = (newPreset: CompressionPreset) => {
    setPreset(newPreset);
    if (!file) return;

    let ratio = 0.5; // recommended = 50%
    if (newPreset === 'extreme') ratio = 0.3; // extreme = 30%
    if (newPreset === 'less') ratio = 0.75; // less = 75%

    const suggestedBytes = file.size * ratio;
    if (suggestedBytes >= 1024 * 1024) {
      setTargetUnit('MB');
      setTargetSizeInput((suggestedBytes / (1024 * 1024)).toFixed(1));
    } else {
      setTargetUnit('KB');
      setTargetSizeInput(Math.round(suggestedBytes / 1024).toString());
    }
  };

  // Reset workspace
  const handleReset = () => {
    setFile(null);
    setOutputResult(null);
    setErrorMessage(null);
    setIsProcessing(false);
    setProgress(0);
    setProgressStage('');
    setTargetSizeInput('');
    setPreset('recommended');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Execute compression
  const handleCompress = async () => {
    if (!file) {
      setErrorMessage('Please upload a PDF file first.');
      return;
    }

    setIsProcessing(true);
    setProgress(10);
    setProgressStage('Uploading and preparing document...');
    setErrorMessage(null);

    try {
      const params: Record<string, any> = {
        preset
      };
      if (targetSizeBytes) {
        params.targetSizeBytes = targetSizeBytes;
      }

      const res = await submitDocumentJob(
        tool.endpoint,
        [file],
        params,
        {
          onProgress: (p, stage) => {
            setProgress(p);
            setProgressStage(stage);
          }
        }
      );

      if (!res.success) {
        throw new Error(res.error?.message || 'Compression failed');
      }

      const primaryOutput = res.outputFiles?.[0];
      const downloadUrl = res.downloadUrl || primaryOutput?.downloadUrl;
      if (!downloadUrl) {
        throw new Error('No output file was generated by the compression engine.');
      }

      // Verify and inspect final size from downloaded output
      setProgress(90);
      setProgressStage('Verifying compressed output...');
      const fullUrl = getFullApiUrl(downloadUrl);
      const verifyRes = await fetch(fullUrl);
      let verifiedFinalSize = primaryOutput?.size || 0;
      if (verifyRes.ok) {
        const buf = await verifyRes.arrayBuffer();
        verifiedFinalSize = buf.byteLength;
      }

      const origSize = file.size;
      const finalSize = verifiedFinalSize > 0 ? verifiedFinalSize : primaryOutput?.size || origSize;
      const savedBytes = Math.max(0, origSize - finalSize);
      const reductionPercentage = Number(((savedBytes / origSize) * 100).toFixed(1));

      // Strictly evaluate target achievement against verified output size
      const targetAchieved = targetSizeBytes ? finalSize <= targetSizeBytes : undefined;

      setOutputResult({
        jobId: res.jobId || 'completed',
        downloadUrl,
        filename: primaryOutput?.filename || `compressed-${file.name}`,
        originalSize: origSize,
        finalSize,
        savedBytes,
        reductionPercentage,
        targetAchieved,
        targetSizeBytes,
        presetUsed: preset
      });

      setIsProcessing(false);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Failed to compress document. Please try again.');
    }
  };

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/tools"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to PDF Tools</span>
          </Link>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
              {tool.category}
            </span>
          </div>
        </div>

        {/* Header Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
          <div className="flex items-start space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 shadow-xs border border-rose-100">
              <Minimize2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                  {tool.title}
                </h1>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                  Size-Focused Optimizer
                </span>
              </div>
              <p className="mt-1 text-sm sm:text-base text-slate-600 max-w-2xl">
                Compress PDF files toward a requested target size or preset with genuine raster image
                downsampling and internal stream compaction.
              </p>
            </div>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          id="compress-file-input"
          data-testid="compress-file-input"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* ================================================================ */}
        {/* COMPLETION SCREEN */}
        {/* ================================================================ */}
        {outputResult && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Completion Header Card */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-slate-100">
                <div className="flex items-start space-x-4">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                      outputResult.targetAchieved === false
                        ? 'bg-amber-50 text-amber-600 border border-amber-200'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}
                  >
                    {outputResult.targetAchieved === false ? (
                      <AlertCircle className="w-6 h-6" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900">
                        {outputResult.targetAchieved === false
                          ? 'Compression Complete (Best-Effort)'
                          : 'PDF Successfully Compressed'}
                      </h2>
                      {outputResult.targetSizeBytes && (
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                            outputResult.targetAchieved
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {outputResult.targetAchieved
                            ? '✓ Target Size Achieved'
                            : 'Target Not Fully Reached'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 mt-1">
                      {outputResult.targetSizeBytes ? (
                        outputResult.targetAchieved ? (
                          <>
                            Compressed to <span className="font-semibold text-slate-900">{formatFileSize(outputResult.finalSize)}</span>,
                            meeting your requested target of{' '}
                            <span className="font-semibold text-slate-900">{formatFileSize(outputResult.targetSizeBytes)}</span>.
                          </>
                        ) : (
                          <>
                            Reached the minimum lossless structural size of{' '}
                            <span className="font-semibold text-slate-900">{formatFileSize(outputResult.finalSize)}</span>.
                            The requested target of{' '}
                            <span className="font-semibold text-slate-900">{formatFileSize(outputResult.targetSizeBytes)}</span>{' '}
                            was below the document&apos;s mathematical limit.
                          </>
                        )
                      ) : (
                        <>
                          Successfully saved <span className="font-semibold text-emerald-700">{formatFileSize(outputResult.savedBytes)}</span>{' '}
                          ({outputResult.reductionPercentage}% smaller) using the {outputResult.presetUsed} preset.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Download and Reset Actions */}
                <div className="flex items-center space-x-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => triggerFileDownload(outputResult.downloadUrl, outputResult.filename)}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>New Compression</span>
                  </button>
                </div>
              </div>

              {/* 4-Card Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                {/* Metric 1: Original Size */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Original Size
                  </span>
                  <span className="font-heading font-extrabold text-xl sm:text-2xl text-slate-800 mt-1 block">
                    {formatFileSize(outputResult.originalSize)}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">Source document</span>
                </div>

                {/* Metric 2: Final Size */}
                <div className="bg-rose-50/50 border border-rose-200/70 rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 block">
                    Final Size
                  </span>
                  <span className="font-heading font-extrabold text-xl sm:text-2xl text-rose-600 mt-1 block">
                    {formatFileSize(outputResult.finalSize)}
                  </span>
                  <span className="text-[11px] text-rose-500 font-medium block mt-0.5">
                    Ready for download
                  </span>
                </div>

                {/* Metric 3: Total Saved */}
                <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
                    Total Saved
                  </span>
                  <span className="font-heading font-extrabold text-xl sm:text-2xl text-emerald-600 mt-1 block">
                    {outputResult.savedBytes > 0
                      ? `-${formatFileSize(outputResult.savedBytes)}`
                      : '0 B'}
                  </span>
                  <span className="text-[11px] text-emerald-600/80 font-medium block mt-0.5">
                    Bandwidth & storage saved
                  </span>
                </div>

                {/* Metric 4: Reduction */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Size Reduction
                  </span>
                  <div className="flex items-center space-x-1 mt-1">
                    <TrendingDown className="w-5 h-5 text-emerald-600" />
                    <span className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900">
                      {outputResult.reductionPercentage}%
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    {outputResult.targetSizeBytes
                      ? outputResult.targetAchieved
                        ? 'Target achieved'
                        : 'Best possible'
                      : 'Preset optimization'}
                  </span>
                </div>
              </div>
            </div>

            {/* Verified Multi-Page PDF Preview */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <h3 className="font-heading font-bold text-lg text-slate-900">
                    Output Verification & Live Preview
                  </h3>
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    Scroll all pages
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(outputResult.downloadUrl, outputResult.filename)}
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Direct Download</span>
                </button>
              </div>

              <div className="flex justify-center">
                <PdfOutputViewer
                  downloadUrl={getFullApiUrl(outputResult.downloadUrl)}
                  filename={outputResult.filename}
                  size={outputResult.finalSize}
                  formatSize={formatFileSize}
                />
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SETUP SCREEN (NO LIVE CANVAS PREVIEW DURING SETUP) */}
        {/* ================================================================ */}
        {!outputResult && (
          <div className="space-y-6">
            {/* Error Banner */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs sm:text-sm text-red-700 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold">Error:</span> {errorMessage}
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-red-400 hover:text-red-700 font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Dropzone (If no file selected yet) */}
            {!file && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-3xl p-12 sm:p-16 text-center transition-all duration-200 border-2 border-dashed ${
                  isDragging
                    ? 'bg-rose-50/70 border-rose-500 scale-[1.005]'
                    : 'bg-white border-slate-300 hover:border-slate-400 hover:bg-slate-50/50 shadow-xs'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-xs">
                  <UploadCloud className="w-8 h-8" />
                </div>

                <h3 className="font-heading font-bold text-xl sm:text-2xl text-slate-900">
                  {isDragging ? 'Drop your PDF right here' : 'Select a PDF document to compress'}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                  Upload any PDF up to 50MB. Specify an exact target size or pick a balanced preset.
                </p>

                <div className="mt-6">
                  <span className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                    <FileText className="w-4 h-4" />
                    <span>Choose PDF from Device</span>
                  </span>
                </div>
              </div>
            )}

            {/* Active Setup Configuration (If file is selected) */}
            {file && (
              <div className="space-y-6">
                {/* Uploaded File Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3.5 truncate">
                    <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="truncate">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate" title={file.name}>
                        {file.name}
                      </h3>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-xs font-semibold text-slate-500">
                          Original Size:
                        </span>
                        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Change File</span>
                  </button>
                </div>

                {/* Size-Focused Compression Settings Card */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
                  <div>
                    <h2 className="font-heading font-extrabold text-xl text-slate-900 tracking-tight">
                      Target Size & Compression Options
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      Choose a target size or select a preset. Compression is applied toward your requested threshold.
                    </p>
                  </div>

                  {/* 1. Target Size Input */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label htmlFor="target-size-input" className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                        <HardDrive className="w-4 h-4 text-rose-600" />
                        <span>Desired Target Size (Best Effort)</span>
                      </label>
                      <span className="text-xs text-slate-500">
                        Original: <span className="font-bold text-slate-700">{formatFileSize(file.size)}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1">
                        <input
                          id="target-size-input"
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={targetSizeInput}
                          onChange={(e) => setTargetSizeInput(e.target.value)}
                          placeholder={targetUnit === 'MB' ? 'e.g. 2.5' : 'e.g. 500'}
                          className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
                        />
                      </div>

                      {/* Unit Selector: KB / MB */}
                      <div className="flex items-center rounded-xl bg-slate-200/80 p-1 border border-slate-300/80 shrink-0">
                        <button
                          type="button"
                          onClick={() => setTargetUnit('MB')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            targetUnit === 'MB'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          MB
                        </button>
                        <button
                          type="button"
                          onClick={() => setTargetUnit('KB')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            targetUnit === 'KB'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          KB
                        </button>
                      </div>
                    </div>

                    {/* Calculated Reduction Indicator or Warning */}
                    {targetSizeBytes && (
                      <div className="text-xs pt-1">
                        {isTargetBiggerThanOriginal ? (
                          <span className="text-amber-700 font-medium flex items-center space-x-1">
                            <Info className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Target size is larger than or equal to original size ({formatFileSize(file.size)}).
                              The engine will keep original document size.
                            </span>
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium flex items-center space-x-1">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Requested reduction:{' '}
                              <strong>
                                -{(((file.size - targetSizeBytes) / file.size) * 100).toFixed(1)}%
                              </strong>{' '}
                              (aiming for {formatFileSize(targetSizeBytes)})
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 2. Compression Presets */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                      <Sliders className="w-4 h-4 text-rose-600" />
                      <span>Or Pick a Compression Preset</span>
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      {/* Preset 1: Recommended */}
                      <button
                        type="button"
                        onClick={() => handlePresetSelect('recommended')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                          preset === 'recommended'
                            ? 'bg-rose-50/40 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-heading font-bold text-sm text-slate-900">
                            Balanced
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                            Recommended
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Standard compression for everyday sharing. Retains sharp text and balanced image resolution.
                        </p>
                        <span className="text-[11px] font-semibold text-rose-600 block mt-2">
                          ~40%–60% target reduction
                        </span>
                      </button>

                      {/* Preset 2: Extreme */}
                      <button
                        type="button"
                        onClick={() => handlePresetSelect('extreme')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                          preset === 'extreme'
                            ? 'bg-rose-50/40 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-heading font-bold text-sm text-slate-900">
                            Strong
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            Max Reduction
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          High compression for email limits and upload portals. More aggressive downsampling of embedded graphics.
                        </p>
                        <span className="text-[11px] font-semibold text-rose-600 block mt-2">
                          ~70%–85% target reduction
                        </span>
                      </button>

                      {/* Preset 3: Less */}
                      <button
                        type="button"
                        onClick={() => handlePresetSelect('less')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                          preset === 'less'
                            ? 'bg-rose-50/40 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-heading font-bold text-sm text-slate-900">
                            Light
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            High Fidelity
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Gentle compression preserving maximum image quality and resolution for printing and presentations.
                        </p>
                        <span className="text-[11px] font-semibold text-rose-600 block mt-2">
                          ~15%–30% target reduction
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* 3. Best Effort Notice */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-500 flex items-start space-x-2.5">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Best-effort target size:</strong> The compression engine optimizes internal cross-reference streams,
                      strips metadata, downsamples high-DPI raster images, and recompresses embedded JPEG streams.
                      Vector graphics and pre-compressed text cannot be reduced beyond their mathematical limit without data loss.
                    </span>
                  </div>

                  {/* 4. Primary Execute Button / Progress */}
                  <div className="pt-2">
                    {isProcessing ? (
                      <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
                        <div className="flex items-center justify-center space-x-2 text-rose-600 font-bold text-sm">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{progressStage || 'Compressing document...'}</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden max-w-md mx-auto">
                          <div
                            className="bg-rose-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(progress, 15)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 font-semibold block">
                          {progress}% completed
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCompress}
                        className="w-full py-4 rounded-2xl font-bold text-base text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                      >
                        <Minimize2 className="w-5 h-5" />
                        <span>Compress PDF Now</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompressWorkspace;
