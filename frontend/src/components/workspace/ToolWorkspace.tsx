'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import {
  UploadCloud,
  FileText,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Info,
  ArrowLeft
} from 'lucide-react';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import {
  submitDocumentJob,
  triggerFileDownload,
  saveSessionHistoryItem
} from '@/lib/api-client';

interface ToolWorkspaceProps {
  tool: ToolDefinition;
}

interface UploadedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl?: string;
  estimatedPages?: number;
}

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ tool }) => {
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [parameters, setParameters] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    tool.params?.forEach((p) => {
      if (p.defaultValue !== undefined) {
        initial[p.name] = p.defaultValue;
      }
    });
    return initial;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<{
    jobId: string;
    downloadUrl: string;
    outputFiles?: { filename: string; downloadUrl: string }[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Add files with client-side extension validation
  const handleAddFiles = (incomingFiles: FileList | File[]) => {
    setError(null);
    const newItems: UploadedFileItem[] = [];

    const fileList = Array.from(incomingFiles);
    for (const file of fileList) {
      if (files.length + newItems.length >= tool.maxFiles) {
        setError(`Maximum of ${tool.maxFiles} file(s) allowed for this tool.`);
        break;
      }

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const isAccepted = tool.accept.some((a) => a.toLowerCase() === ext);

      if (!isAccepted && tool.accept.length > 0) {
        setError(`File "${file.name}" is not supported. Please upload: ${tool.accept.join(', ')}`);
        continue;
      }

      // Estimate pages roughly by size (~40KB per text/PDF page average)
      const estPages = Math.max(1, Math.round(file.size / 45000));

      newItems.push({
        id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        size: file.size,
        estimatedPages: estPages
      });
    }

    if (newItems.length > 0) {
      if (tool.maxFiles === 1) {
        setFiles(newItems.slice(0, 1));
      } else {
        setFiles((prev) => [...prev, ...newItems]);
      }
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
    // reset input so user can pick the same file again if desired
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleMoveFile = (index: number, direction: 'up' | 'down') => {
    setFiles((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleParamChange = (name: string, value: any) => {
    setParameters((prev) => ({ ...prev, [name]: value }));
  };

  // Run the document job
  const handleExecute = async () => {
    if (files.length < tool.minFiles) {
      setError(`Please upload at least ${tool.minFiles} file(s) to continue.`);
      return;
    }

    // Verify required params
    if (tool.params) {
      for (const p of tool.params) {
        if (p.required && (parameters[p.name] === undefined || parameters[p.name] === '')) {
          setError(`Please provide a value for "${p.label}".`);
          return;
        }
      }
    }

    setIsProcessing(true);
    setProgress(10);
    setStatusMessage('Preparing files for transmission...');
    setError(null);
    setCompletedJob(null);

    try {
      const rawFiles = files.map((f) => f.file);
      const res = await submitDocumentJob(
        tool.endpoint,
        rawFiles,
        parameters,
        {
          onProgress: (p, stage) => {
            setProgress(p);
            setStatusMessage(stage);
          }
        }
      );

      if (res.success && (res.downloadUrl || res.outputFiles)) {
        const primaryDownload = res.downloadUrl || res.outputFiles?.[0]?.downloadUrl || '';
        const outputList = res.outputFiles?.map((o) => ({
          filename: o.filename || 'processed_document',
          downloadUrl: o.downloadUrl
        }));

        setCompletedJob({
          jobId: res.jobId || 'completed',
          downloadUrl: primaryDownload,
          outputFiles: outputList
        });

        // Trigger celebratory confetti
        try {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 }
          });
        } catch {
          // Ignore if canvas confetti not supported in environment
        }

        // Save session history item
        saveSessionHistoryItem({
          jobId: res.jobId || 'completed',
          toolId: tool.id,
          toolTitle: tool.title,
          inputFiles: files.map((f) => ({ name: f.name, size: f.size })),
          outputFiles: outputList?.map((o) => ({ name: o.filename, downloadUrl: o.downloadUrl })),
          status: 'completed'
        });
      } else {
        throw new Error(res.error?.message || 'Processing completed with unexpected format');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to process document');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset workspace
  const handleReset = () => {
    setFiles([]);
    setCompletedJob(null);
    setError(null);
    setProgress(0);
    setStatusMessage('');
  };

  // Calculate statistics
  const totalSizeBytes = files.reduce((acc, f) => acc + f.size, 0);
  const estimatedTotalPages = files.reduce((acc, f) => acc + (f.estimatedPages || 1), 0);

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={tool.isConversion ? '/convert' : '/tools'}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to {tool.isConversion ? 'Conversions' : 'PDF Tools'}</span>
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
            {tool.category}
          </span>
        </div>

        {/* Tool Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
                <ToolIcon name={tool.iconName} className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                    {tool.title}
                  </h1>
                  {tool.badge && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                      {tool.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm sm:text-base text-slate-600 max-w-2xl">
                  {tool.description}
                </p>
                {tool.limitations && (
                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 inline-block">
                    Note: {tool.limitations}
                  </p>
                )}
              </div>
            </div>

            {/* Quick stats / requirements */}
            <div className="flex items-center space-x-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-600 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Accepted</span>
                <span className="font-semibold text-slate-800">{tool.accept.join(', ')}</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Capacity</span>
                <span className="font-semibold text-slate-800">
                  {tool.minFiles === tool.maxFiles
                    ? `${tool.minFiles} file`
                    : `${tool.minFiles}–${tool.maxFiles} files`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SUCCESS STATE */}
        {/* ============================================================== */}
        {completedJob && (
          <div className="bg-white rounded-3xl border border-emerald-200 p-8 sm:p-12 text-center shadow-lg shadow-emerald-500/5 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-200">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Document Processed Successfully!
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
              Your generated output is ready for download. Files are wiped automatically according to our zero-retention guarantee.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() =>
                  triggerFileDownload(
                    completedJob.downloadUrl,
                    completedJob.outputFiles?.[0]?.filename || `${tool.slug}_result.pdf`
                  )
                }
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
              >
                <Download className="w-5 h-5" />
                <span>Download Result File</span>
              </button>

              <button
                onClick={handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Process Another File</span>
              </button>
            </div>

            {completedJob.outputFiles && completedJob.outputFiles.length > 1 && (
              <div className="mt-8 pt-6 border-t border-slate-100 max-w-md mx-auto text-left">
                <span className="text-xs font-semibold text-slate-500 block mb-2">
                  Generated Individual Outputs:
                </span>
                <div className="space-y-1.5">
                  {completedJob.outputFiles.map((out, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-xs"
                    >
                      <span className="font-medium text-slate-700 truncate max-w-[240px]">
                        {out.filename}
                      </span>
                      <button
                        onClick={() => triggerFileDownload(out.downloadUrl, out.filename)}
                        className="text-rose-600 hover:underline font-semibold"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* ACTIVE WORKSPACE (UPLOAD + REORDER + SIDEBAR) */}
        {/* ============================================================== */}
        {!completedJob && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* LEFT / CENTER: Upload Dropzone & File Workspace (Cols 8) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Dropzone */}
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
                  multiple={tool.maxFiles > 1}
                  accept={tool.accept.join(',')}
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100/80 group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-8 h-8" />
                </div>

                <h3 className="font-heading font-bold text-lg sm:text-xl text-slate-900">
                  {isDragging ? 'Drop your files right here' : 'Choose files or drag and drop here'}
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                  Supports {tool.accept.join(', ')} up to 50MB per file.
                </p>

                <div className="mt-5">
                  <span className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-xs">
                    <Plus className="w-4 h-4" />
                    <span>Select from Device</span>
                  </span>
                </div>
              </div>

              {/* Error Banner */}
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

              {/* File Workspace List */}
              {files.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-heading font-semibold text-slate-900 text-base">
                        Selected Documents ({files.length})
                      </h3>
                      <span className="text-xs text-slate-400">
                        {tool.maxFiles > 1 ? 'Drag or use arrows to reorder' : 'Ready to process'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3">
                      {files.length < tool.maxFiles && (
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
                        Remove All
                      </button>
                    </div>
                  </div>

                  {/* List of files */}
                  <div className="space-y-2.5">
                    {files.map((item, index) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          {/* Order index pill */}
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
                              <span>{formatSize(item.size)}</span>
                              <span>•</span>
                              <span>~{item.estimatedPages} pages (est.)</span>
                            </div>
                          </div>
                        </div>

                        {/* File actions */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {tool.maxFiles > 1 && (
                            <>
                              <button
                                disabled={index === 0}
                                onClick={() => handleMoveFile(index, 'up')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none"
                                title="Move up"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button
                                disabled={index === files.length - 1}
                                onClick={() => handleMoveFile(index, 'down')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none"
                                title="Move down"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleRemoveFile(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1"
                            title="Remove file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT SIDEBAR: Parameters & Execution (Cols 4) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 sticky top-24">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-heading font-bold text-slate-900 text-lg">
                    Configuration & Overview
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Fine-tune options before running the engine
                  </p>
                </div>

                {/* Document summary stats */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Files</span>
                    <span className="font-heading font-bold text-base text-slate-800">
                      {files.length}
                    </span>
                  </div>
                  <div className="border-x border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Size</span>
                    <span className="font-heading font-bold text-sm text-slate-800">
                      {formatSize(totalSizeBytes)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Pages (est.)</span>
                    <span className="font-heading font-bold text-base text-slate-800">
                      ~{estimatedTotalPages}
                    </span>
                  </div>
                </div>

                {/* Tool specific parameters */}
                {tool.params && tool.params.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                      Options
                    </span>

                    {tool.params.map((param) => {
                      const val = parameters[param.name] ?? param.defaultValue ?? '';

                      if (param.type === 'select') {
                        return (
                          <div key={param.name} className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 block">
                              {param.label} {param.required && <span className="text-rose-600">*</span>}
                            </label>
                            <select
                              value={val}
                              onChange={(e) => handleParamChange(param.name, e.target.value)}
                              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                            >
                              {param.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            {param.description && (
                              <p className="text-[11px] text-slate-400 leading-tight">{param.description}</p>
                            )}
                          </div>
                        );
                      }

                      if (param.type === 'rotation') {
                        return (
                          <div key={param.name} className="space-y-2">
                            <label className="text-xs font-semibold text-slate-700 block">
                              {param.label}
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {param.options?.map((opt) => {
                                const isSelected = Number(val) === Number(opt.value);
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleParamChange(param.name, Number(opt.value))}
                                    className={`py-2 px-2 text-xs font-semibold rounded-lg border transition-all ${
                                      isSelected
                                        ? 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      if (param.type === 'password') {
                        return (
                          <div key={param.name} className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700 block">
                              {param.label} {param.required && <span className="text-rose-600">*</span>}
                            </label>
                            <input
                              type="password"
                              value={val}
                              placeholder={param.placeholder}
                              onChange={(e) => handleParamChange(param.name, e.target.value)}
                              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                            />
                            {param.description && (
                              <p className="text-[11px] text-slate-400 leading-tight">{param.description}</p>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={param.name} className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 block">
                            {param.label} {param.required && <span className="text-rose-600">*</span>}
                          </label>
                          <input
                            type={param.type === 'number' ? 'number' : 'text'}
                            value={val}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            placeholder={param.placeholder}
                            onChange={(e) =>
                              handleParamChange(
                                param.name,
                                param.type === 'number' ? Number(e.target.value) : e.target.value
                              )
                            }
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                          />
                          {param.description && (
                            <p className="text-[11px] text-slate-400 leading-tight">{param.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Progress bar during processing */}
                {isProcessing && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center space-x-1.5 text-blue-600">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{statusMessage || 'Processing...'}</span>
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

                {/* Action button */}
                <div className="pt-2">
                  <button
                    disabled={isProcessing || files.length < tool.minFiles}
                    onClick={handleExecute}
                    className="w-full py-3.5 px-4 rounded-xl font-heading font-semibold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing Document...</span>
                      </>
                    ) : (
                      <>
                        <ToolIcon name={tool.iconName} className="w-4 h-4" />
                        <span>
                          {files.length === 0
                            ? `Upload File to ${tool.title}`
                            : files.length < tool.minFiles
                            ? `Requires ${tool.minFiles} Files`
                            : `Execute ${tool.title}`}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center space-x-2 text-[11px] text-slate-400 justify-center">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  <span>Lossless vector manipulation • 100% private</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
