'use client';

import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  ArrowLeft,
  Plus,
  Table,
  Trash2,
  RefreshCw,
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileCheck,
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { submitDocumentJob, triggerFileDownload } from '@/lib/api-client';

interface ExcelToPdfWorkspaceProps {
  tool: ToolDefinition;
}

interface OutputResult {
  downloadUrl: string;
  filename: string;
  size?: number;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ExcelToPdfWorkspace: React.FC<ExcelToPdfWorkspaceProps> = ({ tool }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'converting' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outputResult, setOutputResult] = useState<OutputResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateAndSetFile = (candidateFile: File) => {
    const ext = '.' + candidateFile.name.split('.').pop()?.toLowerCase();
    const isAccepted = tool.accept.length === 0 || tool.accept.some((a) => a.toLowerCase() === ext);

    if (!isAccepted) {
      setErrorMessage(
        `Unsupported file type "${candidateFile.name}". Please upload a valid Excel spreadsheet (${tool.accept.join(', ')}).`
      );
      setStatus('error');
      return;
    }

    // 50MB maximum limit
    if (candidateFile.size > 50 * 1024 * 1024) {
      setErrorMessage(
        `File exceeds the 50MB limit (${formatFileSize(candidateFile.size)}). Please choose a smaller spreadsheet.`
      );
      setStatus('error');
      return;
    }

    setFile(candidateFile);
    setStatus('idle');
    setErrorMessage(null);
    setOutputResult(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = () => {
    setFile(null);
    setStatus('idle');
    setErrorMessage(null);
    setOutputResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConvert = async () => {
    if (!file) return;

    setStatus('converting');
    setProgress(15);
    setStatusMessage('Uploading spreadsheet to conversion engine...');
    setErrorMessage(null);

    try {
      const response = await submitDocumentJob(
        tool.endpoint,
        [file],
        {},
        {
          onProgress: (p, stage) => {
            setProgress(Math.max(15, p));
            if (stage) setStatusMessage(stage);
          }
        }
      );

      const output = response.outputFiles?.[0];
      if (!output || !output.downloadUrl) {
        throw new Error('Conversion completed but no output file was returned by the server.');
      }

      setOutputResult({
        downloadUrl: output.downloadUrl,
        filename: output.filename || file.name.replace(/\.(xlsx?|xlsm|xlsb)$/i, '') + '.pdf',
        size: output.size
      });

      setStatus('completed');
      setProgress(100);
      setStatusMessage('Conversion completed successfully!');

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 }
        });
      } catch {
        // ignore confetti errors
      }
    } catch (err: any) {
      console.error('Excel to PDF conversion error:', err);
      setStatus('error');
      setErrorMessage(
        err?.message || 'An error occurred during conversion. Please check the spreadsheet and try again.'
      );
    }
  };

  const handleDownload = () => {
    if (!outputResult) return;
    triggerFileDownload(outputResult.downloadUrl, outputResult.filename);
  };

  const handleReset = () => {
    setFile(null);
    setStatus('idle');
    setProgress(0);
    setStatusMessage('');
    setErrorMessage(null);
    setOutputResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileExt = file ? file.name.split('.').pop()?.toUpperCase() : '';

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/convert"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Conversions</span>
          </Link>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
              XLSX → PDF
            </span>
          </div>
        </div>

        {/* Tool Header Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs border border-emerald-100">
                <ToolIcon name={tool.iconName} className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                    {tool.title}
                  </h1>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                    <Sparkles className="w-3 h-3 text-rose-500" />
                    <span>Instant Convert</span>
                  </span>
                </div>
                <p className="mt-1 text-sm sm:text-base text-slate-600 max-w-xl">
                  {tool.description}
                </p>
              </div>
            </div>

            {/* Capacity & Format badges */}
            <div className="flex items-center space-x-4 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Accepted</span>
                <span className="font-semibold text-slate-800">{tool.accept.join(', ')}</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Capacity</span>
                <span className="font-semibold text-slate-800">1 spreadsheet</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stable File Input */}
        <input
          ref={fileInputRef}
          type="file"
          id="excel-file-input"
          data-testid="excel-file-input"
          accept={tool.accept.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* ============================================================== */}
        {/* STATE 1: Initial Upload Dropzone */}
        {/* ============================================================== */}
        {!file && !outputResult && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-3xl p-10 sm:p-14 text-center transition-all duration-200 border-2 border-dashed ${
              isDragging
                ? 'bg-rose-50/70 border-rose-500 scale-[1.005]'
                : 'bg-white border-slate-300 hover:border-rose-400 hover:bg-slate-50/50 shadow-xs'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
              <UploadCloud className="w-8 h-8" />
            </div>

            <h3 className="font-heading font-bold text-xl sm:text-2xl text-slate-900">
              {isDragging ? 'Drop your Excel spreadsheet right here' : 'Select Excel spreadsheet to convert'}
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Drag and drop your Microsoft Excel (.xlsx, .xls) file here, or click to browse. Supports files up to 50MB.
            </p>

            <div className="mt-6">
              <span className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 transition-colors">
                <Plus className="w-4 h-4" />
                <span>Choose File</span>
              </span>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STATE 2: File Selected & Ready to Convert */}
        {/* ============================================================== */}
        {file && !outputResult && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            {/* Selected File Card */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center space-x-4 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 shadow-2xs">
                  <Table className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-semibold text-slate-900 text-sm sm:text-base truncate" title={file.name}>
                      {file.name}
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      {fileExt}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>

              {/* File Options: Replace / Remove */}
              <div className="flex items-center space-x-2 shrink-0 ml-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status === 'converting'}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer disabled:opacity-40"
                  title="Replace file"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Replace</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  disabled={status === 'converting'}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                  title="Remove file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Error Message if any */}
            {errorMessage && (
              <div className="flex items-start space-x-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Conversion Notice</p>
                  <p className="mt-0.5 text-rose-700">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Conversion Progress Bar */}
            {status === 'converting' && (
              <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                    <span>{statusMessage || 'Converting spreadsheet...'}</span>
                  </span>
                  <span className="font-mono text-rose-600">{progress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-rose-600 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={handleConvert}
                disabled={status === 'converting'}
                id="convert-to-pdf-btn"
                data-testid="convert-to-pdf-btn"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-lg shadow-rose-600/25 transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {status === 'converting' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Convert to PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* STATE 3: Conversion Complete (Download Screen) */}
        {/* ============================================================== */}
        {outputResult && (
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 shadow-xs text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                <FileCheck className="w-3.5 h-3.5" />
                <span>Conversion Complete</span>
              </span>
              <h3 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                Your PDF is Ready
              </h3>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                The Excel spreadsheet has been converted into a standardized, printable PDF report.
              </p>
            </div>

            {/* Converted File Details Card */}
            <div className="max-w-md mx-auto p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-left">
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate" title={outputResult.filename}>
                    {outputResult.filename}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    {formatFileSize(outputResult.size)}
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shrink-0 ml-2">
                PDF
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownload}
                id="download-pdf-btn"
                data-testid="download-pdf-btn"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-lg shadow-rose-600/25 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                id="convert-another-btn"
                data-testid="convert-another-btn"
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Convert Another</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

