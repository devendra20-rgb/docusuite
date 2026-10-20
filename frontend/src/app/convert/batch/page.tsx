'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import {
  UploadCloud,
  FileText,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Info,
  ArrowLeft,
  Layers,
  ArrowRight
} from 'lucide-react';
import { triggerFileDownload, saveSessionHistoryItem } from '@/lib/api-client';

interface UploadedBatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
}

interface ConvertedBatchResult {
  fileId: string;
  originalName: string;
  convertedName: string;
  filename: string;
  mimeType: string;
  size: number;
  engineUsed: string;
  limitations?: string[];
  downloadUrl: string;
}

const SUPPORTED_TARGET_FORMATS = [
  { value: 'pdf', label: 'PDF Document (.pdf)', desc: 'Standardized vector layout' },
  { value: 'docx', label: 'Word Document (.docx)', desc: 'Editable Microsoft Word' },
  { value: 'xlsx', label: 'Excel Spreadsheet (.xlsx)', desc: 'Tabular workbook' },
  { value: 'html', label: 'HTML Web Page (.html)', desc: 'Semantic web markup' },
  { value: 'txt', label: 'Plain Text (.txt)', desc: 'Unformatted UTF-8 text' },
  { value: 'csv', label: 'CSV Spreadsheet (.csv)', desc: 'Comma-separated values' }
];

export default function BatchConversionPage() {
  const [files, setFiles] = useState<UploadedBatchItem[]>([]);
  const [targetFormat, setTargetFormat] = useState('pdf');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [convertedItems, setConvertedItems] = useState<ConvertedBatchResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleAddFiles = (incomingFiles: FileList | File[]) => {
    setError(null);
    const newItems: UploadedBatchItem[] = [];
    const list = Array.from(incomingFiles);

    for (const f of list) {
      if (files.length + newItems.length >= 20) {
        setError('Maximum of 20 files allowed in a single batch operation.');
        break;
      }
      newItems.push({
        id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file: f,
        name: f.name,
        size: f.size
      });
    }

    if (newItems.length > 0) {
      setFiles((prev) => [...prev, ...newItems]);
    }
  };

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
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleExecuteBatch = async () => {
    if (files.length === 0) {
      setError('Please add at least one document to convert.');
      return;
    }

    setIsProcessing(true);
    setProgress(20);
    setError(null);

    const formData = new FormData();
    files.forEach((item) => {
      formData.append('files', item.file);
    });
    formData.append('targetFormat', targetFormat);

    try {
      setProgress(40);
      const res = await fetch('http://localhost:4000/api/tools/convert/batch', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error?.message || `Batch conversion failed (status ${res.status})`);
      }

      setProgress(100);
      setConvertedItems(data.items || data.outputFiles || []);

      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch {
        // ignore
      }

      saveSessionHistoryItem({
        jobId: data.jobId || 'batch-job',
        toolId: 'batch-convert',
        toolTitle: `Batch Convert to ${targetFormat.toUpperCase()}`,
        inputFiles: files.map((f) => ({ name: f.name, size: f.size })),
        outputFiles: (data.items || []).map((o: any) => ({
          name: o.convertedName || o.filename,
          downloadUrl: o.downloadUrl
        })),
        status: 'completed'
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to complete batch conversion');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setConvertedItems(null);
    setError(null);
    setProgress(0);
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/convert"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to File Conversions</span>
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
            Multi-File Processing
          </span>
        </div>

        {/* Tool Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
                <Layers className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                    Batch File Conversion
                  </h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                    High-Capacity
                  </span>
                </div>
                <p className="mt-1 text-sm sm:text-base text-slate-600 max-w-2xl">
                  Convert heterogeneous collections of documents (Word, Excel, PowerPoint, CSV, HTML, RTF, images, plain text) into any target format in a single pass.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-600 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Capacity</span>
                <span className="font-semibold text-slate-800">Up to 20 files</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Formats</span>
                <span className="font-semibold text-slate-800">Universal Mixed</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SUCCESS STATE */}
        {/* ============================================================== */}
        {convertedItems && (
          <div className="bg-white rounded-3xl border border-emerald-200 p-8 sm:p-12 text-center shadow-lg shadow-emerald-500/5 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-200">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Batch Conversion Complete!
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
              Successfully converted {convertedItems.length} document{convertedItems.length > 1 ? 's' : ''} to {targetFormat.toUpperCase()}. Files are ready for download below.
            </p>

            <div className="mt-8 max-w-2xl mx-auto divide-y divide-slate-100 text-left bg-slate-50 rounded-2xl border border-slate-200 p-4">
              {convertedItems.map((item, idx) => (
                <div key={idx} className="py-3 px-2 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">
                      {item.convertedName || item.filename}
                    </p>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                      <span>Source: {item.originalName}</span>
                      <span>•</span>
                      <span>{formatSize(item.size)}</span>
                      <span>•</span>
                      <span className="text-emerald-700 font-medium">
                        {item.engineUsed || 'Engine Active'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      triggerFileDownload(
                        item.downloadUrl,
                        item.convertedName || item.filename || `batch_file_${idx + 1}.${targetFormat}`
                      )
                    }
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <button
                onClick={handleReset}
                className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Convert Another Batch</span>
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* ACTIVE WORKSPACE */}
        {/* ============================================================== */}
        {!convertedItems && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT: Dropzone & File List (Cols 8) */}
            <div className="lg:col-span-8 space-y-6">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-2xl p-8 sm:p-12 text-center transition-all duration-200 border-2 border-dashed ${
                  isDragging
                    ? 'bg-rose-50/70 border-rose-500 scale-[1.005]'
                    : 'bg-white border-slate-300 hover:border-slate-400 hover:bg-slate-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100/80">
                  <UploadCloud className="w-8 h-8" />
                </div>

                <h3 className="font-heading font-bold text-lg sm:text-xl text-slate-900">
                  {isDragging ? 'Drop your files right here' : 'Drop mixed files here to convert'}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                  Upload up to 20 documents simultaneously (PDF, Word, Excel, CSV, PPTX, TXT, HTML, RTF).
                </p>

                <div className="mt-5">
                  <span className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-xs">
                    <Plus className="w-4 h-4" />
                    <span>Select Documents</span>
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start space-x-3 text-xs sm:text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-800">Operation Error</p>
                    <p className="mt-0.5">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-700 text-xs font-semibold"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {files.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-heading font-semibold text-slate-900 text-base">
                        Batch Queue ({files.length} documents)
                      </h3>
                    </div>

                    <div className="flex items-center space-x-3">
                      {files.length < 20 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline flex items-center space-x-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add More</span>
                        </button>
                      )}
                      <button
                        onClick={() => setFiles([])}
                        className="text-xs text-slate-400 hover:text-red-600 font-medium"
                      >
                        Clear Queue
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {files.map((item, index) => {
                      const ext = item.name.split('.').pop()?.toUpperCase() || 'FILE';
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 transition-all"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="w-6 h-6 rounded-md bg-white border border-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate max-w-xs sm:max-w-md">
                                {item.name}
                              </p>
                              <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                                <span className="px-1.5 py-0.2 rounded bg-slate-200/70 font-semibold text-slate-700">
                                  {ext}
                                </span>
                                <span>•</span>
                                <span>{formatSize(item.size)}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleRemoveFile(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Batch Target Format & Action (Cols 4) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 sticky top-24">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-heading font-bold text-slate-900 text-lg">
                    Batch Configuration
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select target output format for all documents
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Queue Count</span>
                    <span className="font-heading font-bold text-base text-slate-800">
                      {files.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Size</span>
                    <span className="font-heading font-bold text-sm text-slate-800">
                      {formatSize(totalSize)}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                    Target Format
                  </label>
                  <div className="space-y-2">
                    {SUPPORTED_TARGET_FORMATS.map((fmt) => (
                      <label
                        key={fmt.value}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          targetFormat === fmt.value
                            ? 'bg-rose-50/70 border-rose-500 ring-1 ring-rose-500 text-rose-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="radio"
                            name="targetFormat"
                            value={fmt.value}
                            checked={targetFormat === fmt.value}
                            onChange={() => setTargetFormat(fmt.value)}
                            className="text-rose-600 focus:ring-rose-500"
                          />
                          <div>
                            <span className="text-xs font-semibold block">{fmt.label}</span>
                            <span className="text-[10px] text-slate-400 block">{fmt.desc}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {isProcessing && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center space-x-1.5 text-blue-600">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Converting batch queue...</span>
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-rose-600 transition-all duration-300 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    disabled={isProcessing || files.length === 0}
                    onClick={handleExecuteBatch}
                    className="w-full py-3.5 px-4 rounded-xl font-heading font-semibold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing Batch...</span>
                      </>
                    ) : (
                      <>
                        <span>Convert {files.length} File{files.length === 1 ? '' : 's'} to {targetFormat.toUpperCase()}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center space-x-2 text-[11px] text-slate-400 justify-center">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Batch parallel processing • Zero-retention guaranteed</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
