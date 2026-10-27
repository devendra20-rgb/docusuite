'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  DragEvent,
  ChangeEvent
} from 'react';
import Link from 'next/link';
import {
  Download,
  RefreshCw,
  ArrowLeft,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Plus,
  SlidersHorizontal,
  Layers,
  ExternalLink,
  Image as ImageIcon,
  Archive,
  Check,
  CheckSquare,
  Square,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  GripVertical
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { submitDocumentJob, triggerFileDownload, saveSessionHistoryItem, getFullApiUrl } from '@/lib/api-client';
import { loadPdfDocument, generatePageThumbnail } from './pdf-loader';

interface PdfToJpgWorkspaceProps {
  tool: ToolDefinition;
}

interface ConvertedImageOutput {
  fileId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  downloadUrl: string;
}

interface ConversionResult {
  jobId: string;
  zipFile?: ConvertedImageOutput;
  images: ConvertedImageOutput[];
  totalConverted: number;
  format: 'jpg' | 'png';
  dpi: number;
}

/**
 * Parses page range input (e.g. "1-2, 4") into a sorted array of 1-based page numbers
 */
function parseRangesToPageArray(rangesStr: string, maxPages: number): number[] {
  const set = new Set<number>();
  if (!rangesStr || !rangesStr.trim()) return [];
  const parts = rangesStr.split(',').map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        const clampedStart = Math.max(1, start);
        const clampedEnd = Math.min(maxPages, end);
        for (let i = clampedStart; i <= clampedEnd; i++) {
          set.add(i);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxPages) {
        set.add(num);
      }
    }
  }

  return Array.from(set).sort((a, b) => a - b);
}

function formatFileSize(bytes?: number): string {
  if (!bytes || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export const PdfToJpgWorkspace: React.FC<PdfToJpgWorkspaceProps> = ({ tool }) => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  // Conversion Settings
  const [format, setFormat] = useState<'jpg' | 'png'>('jpg');
  const [dpi, setDpi] = useState<72 | 150 | 300>(150);
  const [quality, setQuality] = useState<75 | 85 | 95>(85);
  const [scopeMode, setScopeMode] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState<string>('');

  // Processing state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleResetWorkspace = useCallback(() => {
    setFile(null);
    setPdfDoc(null);
    setTotalPages(0);
    setPageOrder([]);
    setThumbnails({});
    setScopeMode('all');
    setCustomRange('');
    setErrorMessage(null);
    setResult(null);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSelectFile = async (incomingFile: File) => {
    if (!incomingFile.name.toLowerCase().endsWith('.pdf') && incomingFile.type !== 'application/pdf') {
      setErrorMessage('Please upload a valid PDF document (.pdf).');
      return;
    }

    setFile(incomingFile);
    setThumbnails({});
    setScopeMode('all');
    setCustomRange('');
    setErrorMessage(null);
    setResult(null);
    setIsProcessing(false);

    try {
      const buffer = await incomingFile.arrayBuffer();
      const loaded = await loadPdfDocument(buffer);
      if (!isMountedRef.current) return;
      setPdfDoc(loaded);
      const num = loaded.numPages || 1;
      setTotalPages(num);
      setPageOrder(Array.from({ length: num }, (_, i) => i + 1));
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setErrorMessage(err?.message || 'Failed to read PDF document. The file may be password-protected or corrupt.');
    }
  };

  const movePage = (fromIndex: number, toIndex: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (
      fromIndex < 0 ||
      fromIndex >= pageOrder.length ||
      toIndex < 0 ||
      toIndex >= pageOrder.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const next = [...pageOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setPageOrder(next);
  };

  const resetPageOrder = () => {
    setPageOrder(Array.from({ length: totalPages }, (_, i) => i + 1));
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
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectFile(e.target.files[0]);
    }
  };

  const handleLoadDemo = async () => {
    try {
      const res = await fetch('/sample-rotate.pdf');
      if (!res.ok) throw new Error('Failed to load demo file');
      const blob = await res.blob();
      const demoFile = new File([blob], 'quarterly_report_demo.pdf', { type: 'application/pdf' });
      await handleSelectFile(demoFile);
    } catch (err: any) {
      setErrorMessage('Failed to load demo document: ' + err.message);
    }
  };

  // Generate page thumbnails lazily for setup grid
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return;
    let isCancelled = false;

    const renderThumbnails = async () => {
      for (let p = 1; p <= totalPages; p++) {
        if (isCancelled || !isMountedRef.current) break;
        if (!thumbnails[p]) {
          try {
            const url = await generatePageThumbnail(pdfDoc, p, 160);
            if (!isCancelled && isMountedRef.current) {
              setThumbnails((prev) => ({ ...prev, [p]: url }));
            }
          } catch {
            // ignore
          }
        }
      }
    };

    renderThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, totalPages, thumbnails]);

  // Selected pages array calculation - strictly respects pageOrder
  const selectedPagesList = useMemo(() => {
    const baseList =
      pageOrder.length === totalPages
        ? pageOrder
        : Array.from({ length: totalPages }, (_, i) => i + 1);

    if (scopeMode === 'all') {
      return baseList;
    }
    const customSet = new Set(parseRangesToPageArray(customRange, totalPages));
    return baseList.filter((p) => customSet.has(p));
  }, [scopeMode, customRange, totalPages, pageOrder]);

  const selectedPagesSet = useMemo(() => new Set(selectedPagesList), [selectedPagesList]);

  const togglePageInCustomRange = (pageNum: number) => {
    setScopeMode('custom');
    const curSet = new Set(parseRangesToPageArray(customRange, totalPages));
    if (curSet.has(pageNum)) {
      curSet.delete(pageNum);
    } else {
      curSet.add(pageNum);
    }
    const arr = Array.from(curSet).sort((a, b) => a - b);
    setCustomRange(arr.join(', '));
  };

  // Convert execution
  const handleExecute = async () => {
    if (!file) return;

    if (scopeMode === 'custom' && selectedPagesList.length === 0) {
      setErrorMessage('Please specify at least one valid page number in your custom range.');
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingMessage('Preparing document rasterization...');
    setErrorMessage(null);

    try {
      const payload: Record<string, any> = {
        format,
        dpi,
        quality,
        pages: selectedPagesList.join(',')
      };

      const res = await submitDocumentJob('/tools/pdf/to-images', [file], payload, {
        isAsync: true,
        onProgress: (p, msg) => {
          setProcessingProgress(p);
          setProcessingMessage(msg);
        }
      });

      if (res.success && res.outputFiles && res.outputFiles.length > 0) {
        const rawOutputs: ConvertedImageOutput[] = res.outputFiles.map((o: any) => ({
          fileId: o.fileId,
          filename: o.filename,
          originalName: o.originalName || o.filename,
          mimeType: o.mimeType,
          size: o.size || 0,
          downloadUrl: o.downloadUrl
        }));

        const zipFile = rawOutputs.find((o) => o.mimeType === 'application/zip');
        const images = rawOutputs.filter(
          (o) => o.mimeType === 'image/jpeg' || o.mimeType === 'image/png' || /\.(jpe?g|png)$/i.test(o.filename)
        );

        setResult({
          jobId: res.jobId || 'completed',
          zipFile,
          images,
          totalConverted: images.length,
          format,
          dpi
        });
        setIsProcessing(false);

        try {
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
        } catch {
          // ignore
        }

        saveSessionHistoryItem({
          jobId: res.jobId || 'completed',
          toolId: tool.id,
          toolTitle: tool.title,
          inputFiles: [{ name: file.name, size: file.size }],
          outputFiles: rawOutputs.map((o) => ({ name: o.originalName, downloadUrl: o.downloadUrl })),
          status: 'completed'
        });
      } else {
        throw new Error(res.error?.message || 'Failed to convert PDF pages to images. Please try again.');
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Processing failed. Please check the document and try again.');
    }
  };

  // =========================================================================
  // VIEW: COMPLETION SCREEN (CONVERTED RESULTS GALLERY)
  // =========================================================================
  if (result) {
    const isMultiPage = result.images.length > 1;

    return (
      <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb Navigation */}
          <div className="mb-6 flex items-center justify-between">
            <Link
              href="/tools"
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Tools</span>
            </Link>
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
              Conversion Completed
            </span>
          </div>

          {/* Success Banner Card */}
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-10 shadow-xs mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-slate-100">
              <div className="flex items-start space-x-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-xs border border-emerald-100">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                      Converted Successfully!
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {result.format.toUpperCase()} • {result.dpi} DPI
                    </span>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600">
                    Rendered <span className="font-bold text-slate-800">{result.totalConverted}</span>{' '}
                    {result.totalConverted === 1 ? 'page' : 'pages'} into high-fidelity{' '}
                    {result.format.toUpperCase()} images. Zero quality degradation guaranteed.
                  </p>
                </div>
              </div>

              {/* Primary ZIP / Image Action */}
              <div className="flex flex-wrap items-center gap-3">
                {isMultiPage && result.zipFile && (
                  <button
                    type="button"
                    id="btn-download-all-zip"
                    data-testid="download-all-zip"
                    onClick={() =>
                      triggerFileDownload(result.zipFile!.downloadUrl, result.zipFile!.originalName)
                    }
                    className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download All as ZIP ({formatFileSize(result.zipFile.size)})</span>
                  </button>
                )}

                {result.images.length === 1 && (
                  <button
                    type="button"
                    id="btn-download-single-image"
                    data-testid="download-single-image"
                    onClick={() =>
                      triggerFileDownload(result.images[0].downloadUrl, result.images[0].originalName)
                    }
                    className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download {result.format.toUpperCase()} Image ({formatFileSize(result.images[0].size)})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="inline-flex items-center space-x-1.5 px-4 py-3 rounded-xl font-heading font-semibold text-xs sm:text-sm text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-xs transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4 text-slate-500" />
                  <span>Adjust Settings</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetWorkspace}
                  className="inline-flex items-center space-x-1.5 px-4 py-3 rounded-xl font-heading font-semibold text-xs sm:text-sm text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-slate-500" />
                  <span>Convert Another PDF</span>
                </button>
              </div>
            </div>

            {/* Gallery Grid of Converted Pages */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4 text-rose-500" />
                  <h3 className="font-heading font-bold text-sm sm:text-base text-slate-900">
                    Converted Page Images ({result.images.length})
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  Click any thumbnail to inspect or download individually
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {result.images.map((img, idx) => {
                  const fullUrl = getFullApiUrl(img.downloadUrl);
                  const pageMatch = img.originalName.match(/page_(\d+)/i);
                  const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : idx + 1;
                  const thumbSrc = thumbnails[pageNum] || fullUrl;
                  return (
                    <div
                      key={img.fileId || idx}
                      id={`converted-image-card-${pageNum}`}
                      data-testid={`converted-image-card-${pageNum}`}
                      className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all p-3 flex flex-col justify-between group"
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-xs">
                        <span className="font-heading font-bold text-slate-800">
                          Page #{pageNum}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {formatFileSize(img.size)}
                        </span>
                      </div>

                      {/* Image Thumbnail Viewport */}
                      <div className="relative w-full h-48 rounded-xl bg-slate-100/70 border border-slate-200/80 flex items-center justify-center p-2 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbSrc}
                          alt={img.originalName}
                          className="max-h-full max-w-full object-contain rounded shadow-xs bg-white"
                          loading="lazy"
                        />
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                          title="Open Full Size in New Tab"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {/* Card Footer Download Action */}
                      <div className="mt-3 pt-2.5 border-t border-slate-100">
                        <button
                          type="button"
                          id={`btn-download-page-${pageNum}`}
                          data-testid={`download-page-${pageNum}`}
                          onClick={() => triggerFileDownload(img.downloadUrl, img.originalName)}
                          className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Page #{pageNum}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: SETUP WORKSPACE (LEFT CONTROL DRAWER + RIGHT THUMBNAIL GRID)
  // =========================================================================
  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/tools"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Tools</span>
          </Link>
          <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
            {tool.category}
          </span>
        </div>

        {/* Tool Header Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 shadow-xs border border-rose-100">
                <ToolIcon name={tool.iconName} className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                    {tool.title}
                  </h1>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                    <Sparkles className="w-3 h-3 text-rose-500" />
                    <span>High-Fidelity Studio</span>
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                  Convert PDF pages into high-resolution JPG or PNG images with customizable DPI resolution,
                  compression quality, and selective page range export.
                </p>
              </div>
            </div>

            {/* Quick Specs Pill */}
            <div className="flex items-center space-x-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs text-slate-600 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">DPI Presets</span>
                <span className="font-semibold text-slate-800">72 • 150 • 300 DPI</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Format</span>
                <span className="font-semibold text-slate-800">JPG & PNG</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          id="pdf-to-jpg-file-input"
          data-testid="pdf-to-jpg-file-input"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start space-x-3 text-xs sm:text-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Error:</span> {errorMessage}
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-800 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Dropzone State (When no document selected) */}
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
              <ImageIcon className="w-8 h-8" />
            </div>

            <h3 className="font-heading font-bold text-xl sm:text-2xl text-slate-900">
              {isDragging ? 'Drop your PDF right here' : 'Select a PDF to convert to images'}
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Extract every sheet or chosen page range into crisp JPG or PNG images with individual downloads and full ZIP archive.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <span className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-heading font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 transition-all cursor-pointer">
                <Plus className="w-4 h-4" />
                <span>Choose PDF File</span>
              </span>

              <button
                type="button"
                id="btn-load-demo-to-images"
                data-testid="load-demo-to-images"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadDemo();
                }}
                className="inline-flex items-center space-x-1.5 px-4 py-3 rounded-xl text-xs sm:text-sm font-heading font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-rose-500" />
                <span>Try Demo Document (3 Pages)</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Setup View: Left Settings Drawer + Right Pages Grid */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* ========================================================== */}
            {/* LEFT CONFIGURATION DRAWER (Cols 4)                         */}
            {/* ========================================================== */}
            <div className="lg:col-span-4 sticky top-20 z-20 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-5">
                {/* File Information Card */}
                <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-heading font-bold text-xs sm:text-sm text-slate-800 truncate" title={file.name}>
                        {file.name}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {formatFileSize(file.size)} • {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    title="Change PDF File"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {/* 1. Format Selection */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Output Format
                  </label>
                  <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-xl gap-1">
                    <button
                      type="button"
                      id="format-tab-jpg"
                      data-testid="format-tab-jpg"
                      onClick={() => setFormat('jpg')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                        format === 'jpg'
                          ? 'bg-white text-rose-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>JPG (Compact)</span>
                    </button>

                    <button
                      type="button"
                      id="format-tab-png"
                      data-testid="format-tab-png"
                      onClick={() => setFormat('png')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                        format === 'png'
                          ? 'bg-white text-rose-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>PNG (Crisp)</span>
                    </button>
                  </div>
                </div>

                {/* 2. DPI / Resolution Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Resolution / DPI
                    </label>
                    <span className="text-[11px] font-mono font-bold text-rose-600">
                      {dpi === 72 ? '72 DPI (Web)' : dpi === 150 ? '150 DPI (Balanced)' : '300 DPI (Print)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { val: 72 as const, label: '72 DPI', desc: 'Standard' },
                      { val: 150 as const, label: '150 DPI', desc: 'Balanced' },
                      { val: 300 as const, label: '300 DPI', desc: 'Print' }
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        id={`dpi-btn-${opt.val}`}
                        data-testid={`dpi-btn-${opt.val}`}
                        onClick={() => setDpi(opt.val)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          dpi === opt.val
                            ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-400 text-rose-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-heading font-bold text-xs block">{opt.label}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. JPG Quality Selector (Only when format is JPG) */}
                {format === 'jpg' && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        JPEG Quality
                      </label>
                      <span className="text-[11px] font-mono font-bold text-rose-600">
                        {quality}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: 75 as const, label: '75%', desc: 'Compact' },
                        { val: 85 as const, label: '85%', desc: 'Balanced' },
                        { val: 95 as const, label: '95%', desc: 'Maximum' }
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          id={`quality-btn-${opt.val}`}
                          data-testid={`quality-btn-${opt.val}`}
                          onClick={() => setQuality(opt.val)}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            quality === opt.val
                              ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-400 text-rose-900'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-heading font-bold text-xs block">{opt.label}</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Page Scope Selection */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Page Selection
                  </label>
                  <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-xl gap-1 mb-2.5">
                    <button
                      type="button"
                      id="scope-tab-all"
                      data-testid="scope-tab-all"
                      onClick={() => setScopeMode('all')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                        scopeMode === 'all'
                          ? 'bg-white text-rose-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>All ({totalPages})</span>
                    </button>

                    <button
                      type="button"
                      id="scope-tab-custom"
                      data-testid="scope-tab-custom"
                      onClick={() => setScopeMode('custom')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                        scopeMode === 'custom'
                          ? 'bg-white text-rose-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>Custom Range</span>
                    </button>
                  </div>

                  {scopeMode === 'custom' && (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        id="custom-page-range-input"
                        data-testid="custom-page-range-input"
                        value={customRange}
                        onChange={(e) => setCustomRange(e.target.value)}
                        placeholder="e.g. 1-2, 4"
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-rose-500 font-mono"
                      />
                      <p className="text-[11px] text-slate-500">
                        Selected: <span className="font-bold text-slate-800">{selectedPagesList.length}</span> of {totalPages} pages
                      </p>
                    </div>
                  )}
                </div>

                {/* Primary Action Button */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <button
                    type="button"
                    id="btn-apply-convert-jpg"
                    data-testid="apply-convert-jpg"
                    onClick={handleExecute}
                    disabled={isProcessing}
                    className="w-full py-3.5 px-4 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{processingMessage || 'Converting...'}</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        <span>Convert {selectedPagesList.length} {selectedPagesList.length === 1 ? 'Page' : 'Pages'} to {format.toUpperCase()}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* ========================================================== */}
            {/* RIGHT PAGE THUMBNAILS GRID (Cols 8)                       */}
            {/* ========================================================== */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-heading font-bold text-slate-800 text-sm">
                    Document Pages ({totalPages})
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500 text-[11px] hidden sm:inline">
                    {scopeMode === 'custom'
                      ? 'Click any page to toggle selection. Reorder pages using arrow buttons or drag & drop.'
                      : 'Reorder pages using arrow buttons or drag & drop to change export sequence.'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {pageOrder.some((p, i) => p !== i + 1) && (
                    <button
                      type="button"
                      id="btn-reset-page-order"
                      onClick={resetPageOrder}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 transition-colors flex items-center space-x-1 cursor-pointer"
                      title="Reset pages back to original 1..N order"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reset Order</span>
                    </button>
                  )}
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                    {selectedPagesList.length} pages selected
                  </span>
                </div>
              </div>

              {/* Grid of Pages */}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                {(pageOrder.length === totalPages ? pageOrder : Array.from({ length: totalPages }, (_, i) => i + 1)).map((pageNum, idx) => {
                  const isSelected = selectedPagesSet.has(pageNum);
                  const thumbUrl = thumbnails[pageNum];

                  return (
                    <div
                      key={`${pageNum}-${idx}`}
                      id={`setup-page-card-${pageNum}`}
                      data-testid={`setup-page-card-${pageNum}`}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', String(idx));
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        if (!isNaN(from)) movePage(from, idx);
                      }}
                      onClick={() => togglePageInCustomRange(pageNum)}
                      className={`group bg-white rounded-2xl border transition-all duration-200 p-3 flex flex-col justify-between shadow-2xs hover:shadow-xs cursor-pointer ${
                        isSelected
                          ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/15'
                          : 'border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* Card Header with Reorder Actions */}
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 text-xs">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-rose-600 fill-rose-50 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className="font-heading font-bold text-xs text-slate-800 truncate">
                            Page #{pageNum}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0"
                            title={`Export sequence position: ${idx + 1}`}
                          >
                            #{idx + 1}
                          </span>
                        </div>

                        {/* Reorder Controls */}
                        <div className="flex items-center space-x-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            id={`btn-move-left-page-${pageNum}`}
                            data-testid={`move-left-${pageNum}`}
                            onClick={(e) => movePage(idx, idx - 1, e)}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                            title="Move Earlier in Export Order"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            id={`btn-move-right-page-${pageNum}`}
                            data-testid={`move-right-${pageNum}`}
                            onClick={(e) => movePage(idx, idx + 1, e)}
                            disabled={idx === pageOrder.length - 1}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                            title="Move Later in Export Order"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Thumbnail Container */}
                      <div className="relative w-full h-44 sm:h-48 rounded-xl bg-slate-100/70 border border-slate-200/80 flex items-center justify-center p-2.5 overflow-hidden">
                        {thumbUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={thumbUrl}
                            alt={`Page ${pageNum}`}
                            className="max-h-full max-w-full object-contain rounded-sm border border-slate-200/80 bg-white shadow-xs"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center space-y-1 text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                            <span className="text-[10px] font-medium">Page {pageNum}...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfToJpgWorkspace;
