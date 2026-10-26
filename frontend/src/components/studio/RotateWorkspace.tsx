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
  RotateCw,
  RotateCcw,
  UploadCloud,
  ArrowLeft,
  Download,
  RefreshCw,
  Undo2,
  FileText,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Plus,
  CheckSquare,
  Square,
  HardDrive,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { submitDocumentJob, triggerFileDownload, saveSessionHistoryItem, getFullApiUrl } from '@/lib/api-client';
import { loadPdfDocument, generatePageThumbnail } from './pdf-loader';
import { PdfOutputViewer } from './OutputPreview';

interface RotateWorkspaceProps {
  tool: ToolDefinition;
}

interface RotateOutputResult {
  jobId: string;
  downloadUrl: string;
  filename: string;
  size: number;
}

/**
 * Parses range input (e.g. "1-3, 5, 7") into a Set of 1-based page numbers
 */
function parseRangesToPageSet(rangesStr: string, maxPages: number): Set<number> {
  const set = new Set<number>();
  if (!rangesStr || !rangesStr.trim()) return set;
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

  return set;
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

export const RotateWorkspace: React.FC<RotateWorkspaceProps> = ({ tool }) => {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [activePageNum, setActivePageNum] = useState<number | null>(null);
  const [drawerTargetMode, setDrawerTargetMode] = useState<'selection' | 'all'>('selection');
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [rangeInput, setRangeInput] = useState<string>('');

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outputResult, setOutputResult] = useState<RotateOutputResult | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Cleanup helper when resetting or changing file
  const handleResetWorkspace = useCallback(() => {
    setFile(null);
    setPdfDoc(null);
    setTotalPages(0);
    setRotations({});
    setSelectedPages(new Set());
    setActivePageNum(null);
    setDrawerTargetMode('selection');
    setThumbnails({});
    setRangeInput('');
    setErrorMessage(null);
    setOutputResult(null);
    setHasDownloaded(false);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle file selection (with complete stale-state clearing)
  const handleSelectFile = async (incomingFile: File) => {
    if (!incomingFile.name.toLowerCase().endsWith('.pdf') && incomingFile.type !== 'application/pdf') {
      setErrorMessage('Please upload a valid PDF document (.pdf).');
      return;
    }

    setFile(incomingFile);
    setRotations({});
    setSelectedPages(new Set([1])); // Default select page 1 for immediate drawer context
    setActivePageNum(1);
    setDrawerTargetMode('selection');
    setThumbnails({});
    setRangeInput('');
    setErrorMessage(null);
    setOutputResult(null);
    setHasDownloaded(false);
    setIsProcessing(false);

    try {
      const buffer = await incomingFile.arrayBuffer();
      const loaded = await loadPdfDocument(buffer);
      if (!isMountedRef.current) return;
      setPdfDoc(loaded);
      setTotalPages(loaded.numPages || 1);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setErrorMessage(err?.message || 'Failed to read PDF document. The file may be password-protected or corrupt.');
    }
  };

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
  };

  const handleLoadDemo = async () => {
    try {
      const res = await fetch('/sample-rotate.pdf');
      if (!res.ok) throw new Error('Failed to load sample-rotate.pdf');
      const blob = await res.blob();
      const demoFile = new File([blob], 'mixed_portrait_landscape.pdf', { type: 'application/pdf' });
      await handleSelectFile(demoFile);
    } catch (err: any) {
      setErrorMessage('Failed to load demo document: ' + err.message);
    }
  };

  // Generate page thumbnails lazily
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
            // ignore thumbnail render failures
          }
        }
      }
    };

    renderThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, totalPages, thumbnails]);

  // Rotations logic
  const rotatePage = (pageNum: number, delta: 90 | -90 | 180) => {
    setRotations((prev) => {
      const cur = prev[pageNum] || 0;
      const next = ((cur + delta) % 360 + 360) % 360;
      return { ...prev, [pageNum]: next };
    });
  };

  const resetPageRotation = (pageNum: number) => {
    setRotations((prev) => {
      const next = { ...prev };
      delete next[pageNum];
      return next;
    });
  };

  const rotateSelected = (delta: 90 | -90 | 180) => {
    const targets = selectedPages.size > 0
      ? Array.from(selectedPages)
      : activePageNum ? [activePageNum] : [];

    if (targets.length === 0) return;

    setRotations((prev) => {
      const next = { ...prev };
      targets.forEach((p) => {
        const cur = prev[p] || 0;
        next[p] = ((cur + delta) % 360 + 360) % 360;
      });
      return next;
    });
  };

  const resetSelected = () => {
    const targets = selectedPages.size > 0
      ? Array.from(selectedPages)
      : activePageNum ? [activePageNum] : [];

    if (targets.length === 0) return;

    setRotations((prev) => {
      const next = { ...prev };
      targets.forEach((p) => {
        delete next[p];
      });
      return next;
    });
  };

  const rotateAll = (delta: 90 | -90 | 180) => {
    setRotations((prev) => {
      const next = { ...prev };
      for (let p = 1; p <= totalPages; p++) {
        const cur = prev[p] || 0;
        next[p] = ((cur + delta) % 360 + 360) % 360;
      }
      return next;
    });
  };

  const resetAllRotations = () => {
    setRotations({});
  };

  // Card selection handlers
  const handleCardClick = (pageNum: number) => {
    setActivePageNum(pageNum);
    setSelectedPages(new Set([pageNum]));
    setDrawerTargetMode('selection');
  };

  const handleCheckboxClick = (e: React.MouseEvent, pageNum: number) => {
    e.stopPropagation();
    setActivePageNum(pageNum);
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      return next;
    });
    setDrawerTargetMode('selection');
  };

  const handleSelectAll = () => {
    const all = new Set<number>();
    for (let p = 1; p <= totalPages; p++) all.add(p);
    setSelectedPages(all);
    setDrawerTargetMode('selection');
  };

  const handleDeselectAll = () => {
    setSelectedPages(new Set());
    setActivePageNum(null);
  };

  const handleRangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeInput.trim()) return;
    const parsed = parseRangesToPageSet(rangeInput, totalPages);
    setSelectedPages(parsed);
    setDrawerTargetMode('selection');
    if (parsed.size > 0) {
      setActivePageNum(Array.from(parsed)[0]);
    }
  };

  // Count of rotated pages
  const rotatedCount = useMemo(() => {
    let count = 0;
    for (let p = 1; p <= totalPages; p++) {
      if ((rotations[p] || 0) !== 0) count++;
    }
    return count;
  }, [rotations, totalPages]);

  // Execute rotate job
  const handleExecute = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingMessage('Preparing rotation operations...');
    setErrorMessage(null);

    try {
      let payload: Record<string, any> = {};

      if (rotatedCount === 0) {
        // Prevents the 360°/0° reset bug: all pages are net 0° rotation.
        payload = {
          rotation: 0,
          pageRotations: {}
        };
      } else {
        const pageRotationsMap: Record<number, number> = {};
        for (let p = 1; p <= totalPages; p++) {
          const deg = rotations[p] || 0;
          if (deg !== 0) {
            pageRotationsMap[p] = deg;
          }
        }
        payload = {
          pageRotations: pageRotationsMap
        };
      }

      setProcessingProgress(40);
      setProcessingMessage('Applying rotations to PDF engine...');

      const res = await submitDocumentJob('/tools/pdf/rotate', [file], payload, {
        onProgress: (p, msg) => {
          setProcessingProgress(p);
          setProcessingMessage(msg);
        }
      });

      if (res.success && res.outputFiles && res.outputFiles.length > 0) {
        const primary = res.outputFiles[0];
        const fullDl = getFullApiUrl(primary.downloadUrl);
        setOutputResult({
          jobId: res.jobId || 'completed',
          downloadUrl: fullDl,
          filename: primary.filename,
          size: primary.size || 0
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
          outputFiles: [{ name: primary.filename, downloadUrl: primary.downloadUrl }],
          status: 'completed'
        });
      } else {
        throw new Error(res.error?.message || 'Failed to rotate PDF. Please try again.');
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || 'Processing failed. Please check the document and try again.');
    }
  };

  // Determine current active target page or selected count for drawer display
  const isTargetSinglePage = selectedPages.size === 1 || (selectedPages.size === 0 && activePageNum !== null);
  const targetPageNumber = selectedPages.size === 1
    ? Array.from(selectedPages)[0]
    : activePageNum || 1;
  const singlePageRotation = rotations[targetPageNumber] || 0;

  // =========================================================================
  // VIEW: COMPLETION SCREEN
  // =========================================================================
  if (outputResult) {
    return (
      <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <Link
              href="/tools"
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to PDF Tools</span>
            </Link>
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
              Completed
            </span>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-10 shadow-xs mb-8">
            <div className="text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h2 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                PDF Rotated Successfully!
              </h2>
              <p className="mt-2 text-xs sm:text-sm text-slate-600">
                Your pages have been reoriented and saved with exact orientation parity.
              </p>

              {/* File details card */}
              <div className="mt-6 bg-slate-50/80 rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-left">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-white text-rose-600 flex items-center justify-center border border-slate-200 shadow-2xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-heading font-bold text-xs sm:text-sm text-slate-800 block truncate max-w-[240px] sm:max-w-xs">
                      {outputResult.filename}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {formatFileSize(outputResult.size)} • {totalPages} {totalPages === 1 ? 'page' : 'pages'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      triggerFileDownload(outputResult.downloadUrl, outputResult.filename);
                      setHasDownloaded(true);
                    }}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{hasDownloaded ? 'Download Again' : 'Download Rotated PDF'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Rotated PDF Visual Verification Preview */}
            <div className="mt-10 pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  <h3 className="font-heading font-bold text-sm sm:text-base text-slate-900">
                    Rotated PDF Preview
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  Scroll to inspect all pages
                </span>
              </div>

              <div className="h-[520px] rounded-2xl border border-slate-200 overflow-hidden bg-slate-100/50">
                <PdfOutputViewer
                  downloadUrl={outputResult.downloadUrl}
                  filename={outputResult.filename}
                  size={outputResult.size}
                  formatSize={formatFileSize}
                />
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setOutputResult(null)}
                className="px-5 py-2.5 rounded-xl font-heading font-semibold text-xs sm:text-sm text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500" />
                <span>Back to Workspace</span>
              </button>

              <button
                type="button"
                onClick={handleResetWorkspace}
                className="px-5 py-2.5 rounded-xl font-heading font-semibold text-xs sm:text-sm text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4 text-slate-500" />
                <span>Rotate Another PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: MAIN ROTATE WORKSPACE (LEFT DRAWER + RIGHT GRID)
  // =========================================================================
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
            <span>Back to PDF Tools</span>
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
                    <span>Precision Control Studio</span>
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                  Select and rotate individual sheets, batches, or all pages using the left control drawer.
                  Real-time orientation parity is preserved upon export.
                </p>
              </div>
            </div>

            {/* Quick specifications badge */}
            <div className="flex items-center space-x-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-xs text-slate-600 shrink-0">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Accepted</span>
                <span className="font-semibold text-slate-800">.pdf only</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Rotations</span>
                <span className="font-semibold text-slate-800">90° • 180° • 270°</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          id="rotate-file-input"
          data-testid="rotate-file-input"
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

        {/* 1. UPLOAD DROPZONE (When no file uploaded) */}
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
              {isDragging ? 'Drop your PDF right here' : 'Select a PDF to rotate pages'}
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Preview pages, rotate individual sheets or all pages simultaneously with complete orientation fidelity.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <span className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-heading font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20 transition-all cursor-pointer">
                <Plus className="w-4 h-4" />
                <span>Choose PDF File</span>
              </span>

              <button
                type="button"
                id="btn-load-demo-pdf"
                data-testid="load-demo-pdf"
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

        {/* 2. ACTIVE ROTATE WORKSPACE: LEFT DRAWER + RIGHT GRID */}
        {file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* ========================================================== */}
            {/* LEFT ROTATION CONTROL DRAWER (Cols 4)                      */}
            {/* ========================================================== */}
            <div className="lg:col-span-4 sticky top-20 z-20 space-y-4">
              {/* Mobile Drawer Accordion Header */}
              <div className="lg:hidden flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center space-x-2">
                  <RotateCw className="w-4 h-4 text-rose-600" />
                  <span className="font-heading font-bold text-xs text-slate-800">
                    Rotation Control Drawer ({rotatedCount} rotated)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
                  className="p-1 rounded text-slate-500 hover:text-slate-800"
                >
                  {isMobileDrawerOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Drawer Container */}
              <div className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-5 ${isMobileDrawerOpen ? 'block' : 'hidden lg:block'}`}>
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

                {/* Target Scope Pill Selector */}
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Rotation Scope
                  </span>
                  <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-xl gap-1">
                    <button
                      type="button"
                      id="drawer-tab-selection"
                      data-testid="drawer-tab-selection"
                      onClick={() => setDrawerTargetMode('selection')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                        drawerTargetMode === 'selection'
                          ? 'bg-white text-rose-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>
                        {selectedPages.size > 1
                          ? `Selected (${selectedPages.size})`
                          : isTargetSinglePage
                          ? `Page ${targetPageNumber}`
                          : 'Selection'}
                      </span>
                    </button>

                    <button
                      type="button"
                      id="drawer-tab-all"
                      data-testid="drawer-tab-all"
                      onClick={() => setDrawerTargetMode('all')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                        drawerTargetMode === 'all'
                          ? 'bg-white text-rose-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>All Pages ({totalPages})</span>
                    </button>
                  </div>
                </div>

                {/* Scope Details Banner */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  {drawerTargetMode === 'all' ? (
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-800 block">All Document Pages</span>
                      <p className="text-[11px] text-slate-500">
                        Applies rotation uniformly across all {totalPages} sheets in this document.
                      </p>
                    </div>
                  ) : selectedPages.size > 1 ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-700">
                          {selectedPages.size} Pages Selected
                        </span>
                        <button
                          type="button"
                          onClick={handleDeselectAll}
                          className="text-[11px] text-slate-400 hover:text-slate-700 underline"
                        >
                          Deselect
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono truncate">
                        Pages: {Array.from(selectedPages).sort((a, b) => a - b).join(', ')}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 block">Page {targetPageNumber} Focused</span>
                        <p className="text-[11px] text-slate-500">
                          Click any thumbnail on the right to focus it.
                        </p>
                      </div>
                      {singlePageRotation !== 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            singlePageRotation === 90
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : singlePageRotation === 180
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          +{singlePageRotation}°
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Primary Large Drawer Rotation Buttons */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    Rotation Controls
                  </span>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Rotate CCW (-90) Button */}
                    <button
                      type="button"
                      id="drawer-rotate-ccw"
                      data-testid="drawer-rotate-ccw"
                      onClick={() => {
                        if (drawerTargetMode === 'all') {
                          rotateAll(-90);
                        } else {
                          rotateSelected(-90);
                        }
                      }}
                      className="py-3 px-3 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-700 font-heading font-semibold text-xs sm:text-sm flex flex-col items-center justify-center space-y-1.5 transition-all shadow-2xs hover:shadow-xs cursor-pointer group"
                      title={drawerTargetMode === 'all' ? 'Rotate all pages -90° CCW' : 'Rotate target page(s) -90° CCW'}
                    >
                      <RotateCcw className="w-5 h-5 text-slate-600 group-hover:text-rose-600 transition-colors" />
                      <span className="font-bold text-xs">-90° CCW</span>
                    </button>

                    {/* Rotate CW (+90) Button */}
                    <button
                      type="button"
                      id="drawer-rotate-cw"
                      data-testid="drawer-rotate-cw"
                      onClick={() => {
                        if (drawerTargetMode === 'all') {
                          rotateAll(90);
                        } else {
                          rotateSelected(90);
                        }
                      }}
                      className="py-3 px-3 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-700 font-heading font-semibold text-xs sm:text-sm flex flex-col items-center justify-center space-y-1.5 transition-all shadow-2xs hover:shadow-xs cursor-pointer group"
                      title={drawerTargetMode === 'all' ? 'Rotate all pages +90° CW' : 'Rotate target page(s) +90° CW'}
                    >
                      <RotateCw className="w-5 h-5 text-slate-600 group-hover:text-rose-600 transition-colors" />
                      <span className="font-bold text-xs">+90° CW</span>
                    </button>
                  </div>

                  {/* Secondary 180 & Reset Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      id="drawer-rotate-180"
                      data-testid="drawer-rotate-180"
                      onClick={() => {
                        if (drawerTargetMode === 'all') {
                          rotateAll(180);
                        } else {
                          rotateSelected(180);
                        }
                      }}
                      className="py-2 px-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                      title="Turn upside down (180°)"
                    >
                      <span>180° Half Turn</span>
                    </button>

                    <button
                      type="button"
                      id="drawer-reset-target"
                      data-testid="drawer-reset-target"
                      onClick={() => {
                        if (drawerTargetMode === 'all') {
                          resetAllRotations();
                        } else {
                          resetSelected();
                        }
                      }}
                      className="py-2 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                      title="Reset target rotation to 0°"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Reset to 0°</span>
                    </button>
                  </div>
                </div>

                {/* Multi-Selection Helpers & Custom Range */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Selection Tools
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        id="btn-drawer-select-all"
                        onClick={handleSelectAll}
                        className="text-xs font-semibold text-slate-600 hover:text-rose-600 transition-colors"
                      >
                        Select All
                      </button>
                      {selectedPages.size > 0 && (
                        <>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Range selection input */}
                  <form onSubmit={handleRangeSubmit} className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={rangeInput}
                      onChange={(e) => setRangeInput(e.target.value)}
                      placeholder="Range (e.g. 1-3, 5)"
                      className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none focus:border-rose-500 font-mono"
                    />
                    <button
                      type="submit"
                      className="px-3 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer shrink-0"
                    >
                      Select
                    </button>
                  </form>
                </div>

                {/* Summary & Primary Action Button */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">Total Rotated:</span>
                    <span className="font-bold font-mono text-rose-600">
                      {rotatedCount} of {totalPages} pages
                    </span>
                  </div>

                  <button
                    type="button"
                    id="btn-apply-rotate"
                    data-testid="apply-rotate-btn"
                    onClick={handleExecute}
                    disabled={isProcessing}
                    className="w-full py-3.5 px-4 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{processingMessage || 'Processing...'}</span>
                      </>
                    ) : (
                      <>
                        <RotateCw className="w-4 h-4" />
                        <span>Rotate PDF & Download</span>
                      </>
                    )}
                  </button>

                  {rotatedCount > 0 && (
                    <button
                      type="button"
                      id="btn-drawer-reset-all"
                      onClick={resetAllRotations}
                      disabled={isProcessing}
                      className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Reset All Rotations ({rotatedCount})</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ========================================================== */}
            {/* RIGHT PAGE THUMBNAILS GRID (Cols 8)                       */}
            {/* ========================================================== */}
            <div className="lg:col-span-8 space-y-4">
              {/* Grid Header Info Bar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="font-heading font-bold text-slate-800 text-sm">
                    Document Pages ({totalPages})
                  </span>
                  <span className="text-slate-400">|</span>
                  <span className="text-slate-500 text-[11px] hidden sm:inline">
                    Click a card to focus in drawer, or use the card rotate buttons below.
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {selectedPages.size > 0 && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                      {selectedPages.size} selected
                    </span>
                  )}
                  {rotatedCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      {rotatedCount} rotated
                    </span>
                  )}
                </div>
              </div>

              {/* Grid of Pages */}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                  const angle = rotations[pageNum] || 0;
                  const isSelected = selectedPages.has(pageNum);
                  const isFocused = activePageNum === pageNum;
                  const thumbUrl = thumbnails[pageNum];

                  return (
                    <div
                      key={pageNum}
                      id={`page-card-${pageNum}`}
                      data-testid={`page-card-${pageNum}`}
                      onClick={() => handleCardClick(pageNum)}
                      className={`group bg-white rounded-2xl border transition-all duration-200 p-3 flex flex-col justify-between shadow-2xs hover:shadow-xs cursor-pointer ${
                        isSelected
                          ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/15'
                          : isFocused
                          ? 'border-slate-400 ring-1 ring-slate-400/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Card Header: Checkbox & Page Number & Angle Badge */}
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100 text-xs">
                        <div
                          onClick={(e) => handleCheckboxClick(e, pageNum)}
                          className="flex items-center space-x-1.5 cursor-pointer text-slate-700 hover:text-slate-900"
                          title={isSelected ? 'Deselect page' : 'Select page'}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-rose-600 fill-rose-50 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 group-hover:text-slate-500 shrink-0" />
                          )}
                          <span className="font-heading font-bold text-xs text-slate-800">
                            #{pageNum}
                          </span>
                        </div>

                        {angle !== 0 ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              angle === 90
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : angle === 180
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            +{angle}°
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">0°</span>
                        )}
                      </div>

                      {/* Thumbnail Viewport (Zero-Clipping Scale Constrained) */}
                      <div
                        className="relative w-full h-44 sm:h-48 rounded-xl bg-slate-100/70 border border-slate-200/80 flex items-center justify-center p-2.5 overflow-hidden shadow-2xs transition-colors"
                        title={`Page ${pageNum} • Current Rotation: ${angle}°`}
                      >
                        {thumbUrl ? (
                          <div
                            className="relative flex items-center justify-center transition-transform duration-200 ease-out"
                            style={{
                              transform: `rotate(${angle}deg)`,
                              width: '100%',
                              height: '100%'
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbUrl}
                              alt={`Page ${pageNum}`}
                              style={{
                                maxWidth: angle % 180 !== 0 ? '70%' : '88%',
                                maxHeight: angle % 180 !== 0 ? '70%' : '88%'
                              }}
                              className="object-contain shadow-xs border border-slate-200/80 rounded-sm bg-white"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center space-y-1 text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                            <span className="text-[10px] font-medium">Page {pageNum}...</span>
                          </div>
                        )}
                      </div>

                      {/* Card Footer: Small Direct Clockwise & Counter-Clockwise Actions */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-slate-600">
                        <button
                          type="button"
                          id={`btn-rotate-ccw-${pageNum}`}
                          data-testid={`rotate-ccw-${pageNum}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            rotatePage(pageNum, -90);
                            setActivePageNum(pageNum);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                          title="Rotate -90° (Counter-Clockwise)"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          id={`btn-rotate-cw-${pageNum}`}
                          data-testid={`rotate-cw-${pageNum}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            rotatePage(pageNum, 90);
                            setActivePageNum(pageNum);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                          title="Rotate +90° (Clockwise)"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>

                        {angle !== 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              resetPageRotation(pageNum);
                              setActivePageNum(pageNum);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer ml-auto"
                            title="Reset page rotation to 0°"
                          >
                            <Undo2 className="w-3.5 h-3.5" />
                          </button>
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
