'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Scissors,
  Layers,
  Download,
  RefreshCw,
  Undo2,
  Redo2,
  FileText,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  ExternalLink,
  Settings2,
  CheckSquare,
  Square,
  Archive,
  Split,
  Eye,
  SlidersHorizontal,
  HardDrive
} from 'lucide-react';
import { ToolDefinition } from '@/types/api';
import { StudioDocument, StudioPage } from './types';
import { useDocumentStudio } from './useDocumentStudio';
import { DocumentViewer } from './DocumentViewer';
import { generatePageThumbnail } from './pdf-loader';
import { triggerFileDownload, getFullApiUrl } from '@/lib/api-client';

interface SplitWorkspaceProps {
  tool: ToolDefinition;
}

type SplitMode = 'custom' | 'burst' | 'interval';

/**
 * Converts a comma-separated range string ("1-3, 5, 8-10") into a Set of 1-based page numbers.
 */
function parseRangesToPageSet(rangesStr: string, maxPages: number): Set<number> {
  const set = new Set<number>();
  if (!rangesStr || !rangesStr.trim()) return set;
  const parts = rangesStr.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      if (!isNaN(s) && !isNaN(e)) {
        const start = Math.max(1, Math.min(s, e));
        const end = Math.min(maxPages, Math.max(s, e));
        for (let i = start; i <= end; i++) set.add(i);
      }
    } else {
      const num = Number(part);
      if (!isNaN(num) && num >= 1 && num <= maxPages) {
        set.add(num);
      }
    }
  }
  return set;
}

/**
 * Converts an array of 1-based page numbers into a normalized range string ("1-3, 5, 8-10").
 */
function pageNumbersToRangeString(pageNums: number[]): string {
  if (pageNums.length === 0) return '';
  const sorted = Array.from(new Set(pageNums)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

export const SplitWorkspace: React.FC<SplitWorkspaceProps> = ({ tool }) => {
  const {
    documents,
    activeDocument,
    activePageIndex,
    activePages,
    activePage,
    activePdfDoc,
    zoom,
    zoomMode,
    parameters,
    processingState,
    outputResult,
    canUndo,
    canRedo,
    addFiles,
    removeDocument,
    setActivePageIndex,
    rotatePage,
    toggleDeletePage,
    undo,
    redo,
    setZoom,
    setZoomMode,
    setParameter,
    executeProcess,
    resetWorkspace,
    dismissOutput,
    getPdfDoc,
    dismissError
  } = useDocumentStudio({ tool });

  const [isDraggingDropzone, setIsDraggingDropzone] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [splitMode, setSplitMode] = useState<SplitMode>('custom');
  const [rangeInput, setRangeInput] = useState<string>('1');
  const [intervalCount, setIntervalCount] = useState<number>(2);
  const [hasDownloaded, setHasDownloaded] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const downloadedJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const currentDoc = documents[0] || null;
  const totalPages = currentDoc?.pageCount || activePages.length || 0;

  // Initialize or update default range when a new document is loaded
  useEffect(() => {
    if (totalPages > 0 && (!rangeInput || rangeInput === '1')) {
      const defaultRange = totalPages > 1 ? `1-${Math.min(totalPages, 3)}` : '1';
      setRangeInput(defaultRange);
      setParameter('ranges', defaultRange);
      setParameter('mergeOne', true);
    }
  }, [totalPages]);

  // Synchronize range parameter with current split mode
  const updateSplitConfig = useCallback(
    (mode: SplitMode, rawRange?: string, interval?: number) => {
      setSplitMode(mode);
      if (mode === 'burst') {
        setParameter('ranges', ''); // empty/undefined triggers full burst in backend
        setParameter('mergeOne', false);
      } else if (mode === 'interval') {
        const n = interval || intervalCount;
        const parts: string[] = [];
        for (let i = 1; i <= totalPages; i += n) {
          const end = Math.min(i + n - 1, totalPages);
          parts.push(i === end ? `${i}` : `${i}-${end}`);
        }
        const calculated = parts.join(', ');
        setParameter('ranges', calculated);
        setParameter('mergeOne', false);
      } else {
        const r = rawRange !== undefined ? rawRange : rangeInput;
        setRangeInput(r);
        setParameter('ranges', r);
        setParameter('mergeOne', true);
      }
    },
    [intervalCount, rangeInput, setParameter, totalPages]
  );

  // Selected pages set calculated from current range input
  const selectedPagesSet = useMemo(() => {
    if (splitMode === 'burst') {
      return new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
    }
    if (splitMode === 'interval') {
      return new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
    }
    return parseRangesToPageSet(rangeInput, totalPages);
  }, [splitMode, rangeInput, totalPages]);

  // Handle clicking checkbox on page thumbnail
  const handleTogglePageSelection = (pageNum: number) => {
    const nextSet = new Set(selectedPagesSet);
    if (nextSet.has(pageNum)) {
      nextSet.delete(pageNum);
    } else {
      nextSet.add(pageNum);
    }
    const newRangeStr = pageNumbersToRangeString(Array.from(nextSet));
    setRangeInput(newRangeStr);
    updateSplitConfig('custom', newRangeStr);
  };

  // Quick preset selections
  const handleSelectAll = () => {
    const allStr = totalPages > 1 ? `1-${totalPages}` : '1';
    setRangeInput(allStr);
    updateSplitConfig('custom', allStr);
  };

  const handleSelectOdd = () => {
    const oddNums: number[] = [];
    for (let i = 1; i <= totalPages; i += 2) oddNums.push(i);
    const oddStr = pageNumbersToRangeString(oddNums);
    setRangeInput(oddStr);
    updateSplitConfig('custom', oddStr);
  };

  const handleSelectEven = () => {
    const evenNums: number[] = [];
    for (let i = 2; i <= totalPages; i += 2) evenNums.push(i);
    const evenStr = pageNumbersToRangeString(evenNums);
    setRangeInput(evenStr);
    updateSplitConfig('custom', evenStr);
  };

  const handleClearSelection = () => {
    setRangeInput('');
    updateSplitConfig('custom', '');
  };

  // Lazy render thumbnails for all pages of current document
  useEffect(() => {
    if (!currentDoc) return;
    let isCancelled = false;

    const renderAllThumbnails = async () => {
      const pdfDoc = getPdfDoc(currentDoc.id);
      if (!pdfDoc) return;

      for (const page of currentDoc.pages) {
        if (isCancelled || !isMountedRef.current) break;
        if (!thumbnails[page.id]) {
          try {
            const url = await generatePageThumbnail(pdfDoc, page.originalPageNumber, 120);
            if (!isCancelled && isMountedRef.current) {
              setThumbnails((prev) => ({
                ...prev,
                [page.id]: url
              }));
            }
          } catch {
            // ignore
          }
        }
      }
    };

    renderAllThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [currentDoc, getPdfDoc, thumbnails]);

  // Dropzone drag-and-drop
  const handleDropzoneDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingDropzone(true);
  };

  const handleDropzoneDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingDropzone(false);
  };

  const handleDropzoneDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingDropzone(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Auto-download once when output result arrives
  useEffect(() => {
    if (!outputResult) {
      setHasDownloaded(false);
      return;
    }
    const output = outputResult.primaryOutput || outputResult.outputFiles?.[0];
    if (output && !downloadedJobIdsRef.current.has(outputResult.jobId)) {
      downloadedJobIdsRef.current.add(outputResult.jobId);
      triggerFileDownload(output.downloadUrl, output.filename);
      setHasDownloaded(true);
    }
  }, [outputResult]);

  const handleStartNewSplit = () => {
    setThumbnails({});
    setHasDownloaded(false);
    setRangeInput('');
    setSplitMode('custom');
    setIntervalCount(2);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    resetWorkspace();
  };

  const formatSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Calculate parsed parts for display
  const parsedPartsCount = useMemo(() => {
    if (splitMode === 'burst') return totalPages;
    if (splitMode === 'interval') return Math.ceil(totalPages / Math.max(1, intervalCount));
    return selectedPagesSet.size > 0 ? 1 : 0;
  }, [splitMode, totalPages, intervalCount, selectedPagesSet.size]);

  // =========================================================================
  // VIEW: Polished Full-Screen Completion Page
  // =========================================================================
  if (outputResult) {
    const selectedOutput =
      outputResult.primaryOutput ||
      outputResult.outputFiles?.[0] || {
        filename: 'split-result.pdf',
        downloadUrl: outputResult.downloadUrl || '',
        size: currentDoc?.size || 0,
        pageCount: selectedPagesSet.size
      };

    const fullDownloadUrl = getFullApiUrl(selectedOutput.downloadUrl);
    const isZipArchive = selectedOutput.filename.endsWith('.zip');

    return (
      <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden select-none">
        {/* Top Header */}
        <header className="h-14 px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center space-x-2.5">
            <Link
              href="/"
              className="font-heading font-extrabold text-base text-slate-900 tracking-tight flex items-center space-x-1.5"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
              <span>DocuSuite</span>
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-semibold text-slate-600">Split PDF</span>
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 ml-2">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>Completed</span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              id="top-back-to-studio"
              data-testid="top-back-to-studio"
              onClick={dismissOutput}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Studio</span>
            </button>

            <Link
              href="/tools"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              <span>Back to PDF Tools</span>
            </Link>
          </div>
        </header>

        {/* Completion Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center">
          <div className="max-w-2xl w-full my-auto bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 sm:p-10 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            {/* Success Icon Badge */}
            <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-5">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            {/* Heading */}
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Your PDF has been split and downloaded
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
              {isZipArchive
                ? 'Your document has been extracted into separate PDF parts and packaged into a convenient ZIP archive.'
                : 'Your specified page selection has been extracted into a single verified PDF document.'}
            </p>

            {/* Verified Metrics Card */}
            <div className="mt-8 w-full bg-slate-50/90 border border-slate-200 rounded-2xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {/* Filename */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  {isZipArchive ? <Archive className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Output File</div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate" title={selectedOutput.filename}>
                    {selectedOutput.filename}
                  </div>
                </div>
              </div>

              {/* File Size */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">File Size</div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-800 truncate">
                    {formatSize(selectedOutput.size || 0)}
                  </div>
                </div>
              </div>

              {/* Verified Result Status */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {isZipArchive ? 'Generated Parts' : 'Verified Pages'}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-emerald-700 truncate font-mono">
                    {isZipArchive
                      ? `${parsedPartsCount} PDF files`
                      : selectedOutput.pageCount
                      ? `${selectedOutput.pageCount} pages`
                      : 'Verified'}
                  </div>
                </div>
              </div>
            </div>

            {/* Output Display: Live PDF Preview or ZIP Archive Summary */}
            {!isZipArchive ? (
              <div className="mt-6 w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center p-3 sm:p-4 relative">
                <div className="w-full h-[360px] sm:h-[420px] rounded-xl overflow-hidden border border-slate-700 bg-white shadow-md relative">
                  <iframe
                    id="split-pdf-preview-frame"
                    src={`${fullDownloadUrl}${fullDownloadUrl.includes('?') ? '&' : '?'}preview=true#toolbar=0`}
                    title="Split PDF Preview"
                    className="w-full h-full border-0 bg-white"
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between w-full px-2 text-xs text-slate-400">
                  <span className="truncate max-w-[280px] font-mono text-[11px] text-slate-300">
                    {selectedOutput.filename}
                  </span>
                  <a
                    href={fullDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 hover:underline text-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Fullscreen</span>
                  </a>
                </div>
              </div>
            ) : (
              <div
                id="split-zip-summary-card"
                data-testid="split-zip-summary"
                className="mt-6 w-full bg-slate-50 border border-slate-200/90 rounded-2xl p-5 text-left"
              >
                <div className="flex items-start space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-heading font-bold text-sm text-slate-900">
                        Multi-Part Output Archive (.zip)
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {parsedPartsCount} PDF Parts
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Your document was split into multiple individual PDF files and packaged into a ZIP archive for convenient download.
                    </p>

                    <div className="mt-3.5 bg-white rounded-xl border border-slate-200/80 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 flex items-center space-x-1.5">
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          <span>Archive Package</span>
                        </span>
                        <span className="font-mono font-semibold text-slate-800 truncate max-w-[220px]">
                          {selectedOutput.filename}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                        <span className="text-slate-500 flex items-center space-x-1.5">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>Extracted Files</span>
                        </span>
                        <span className="font-semibold text-emerald-700">
                          {parsedPartsCount} separate PDF documents
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                        <span className="text-slate-500 flex items-center space-x-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                          <span>Total Package Size</span>
                        </span>
                        <span className="font-semibold text-slate-700">
                          {formatSize(selectedOutput.size || 0)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center space-x-1.5 text-[11px] text-slate-500 bg-amber-50/60 rounded-lg px-2.5 py-1.5 border border-amber-100">
                      <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Ready to extract. Unzip the downloaded file to access each split PDF part.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                id="btn-back-to-studio"
                data-testid="back-to-studio"
                onClick={dismissOutput}
                className="w-full sm:w-auto px-5 py-3 rounded-xl font-heading font-semibold text-xs sm:text-sm text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer"
                title="Return to Split Studio workspace with your document and ranges intact"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
                <span>Back to Studio</span>
              </button>

              <button
                type="button"
                id="btn-start-new-split"
                data-testid="start-new-split"
                onClick={handleStartNewSplit}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                title="Reset workspace and start a fresh split"
              >
                <Plus className="w-4 h-4" />
                <span>New Split</span>
              </button>

              <button
                type="button"
                id="btn-download-again"
                data-testid="download-again"
                onClick={() => {
                  triggerFileDownload(selectedOutput.downloadUrl, selectedOutput.filename);
                  setHasDownloaded(true);
                }}
                className="w-full sm:w-auto px-5 py-3 rounded-xl font-semibold text-xs sm:text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-200 transition-colors flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-slate-600" />
                <span>{hasDownloaded ? 'Download Again' : 'Download Output'}</span>
              </button>
            </div>

            {/* Back to PDF Tools Link */}
            <div className="mt-6 pt-4 border-t border-slate-100 w-full flex items-center justify-center">
              <Link
                href="/tools"
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to PDF Tools</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // VIEW: Interactive Full-Screen Split Workspace
  // =========================================================================
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        id="studio-file-input"
        data-testid="studio-file-input"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* TOP STUDIO TOOLBAR */}
      <header className="h-14 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-20">
        {/* Left: Back & Title */}
        <div className="flex items-center space-x-3">
          <Link
            href="/tools"
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">PDF Tools</span>
          </Link>

          <div className="h-5 w-px bg-slate-200" />

          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <Scissors className="w-4 h-4" />
            </div>
            <h1 className="font-heading font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
              Split PDF
            </h1>
            <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
              Studio
            </span>
          </div>

          {currentDoc && (
            <div className="hidden md:flex items-center space-x-1.5 ml-2 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/60">
              <span className="truncate max-w-[180px] font-semibold text-slate-700">{currentDoc.name}</span>
              <span>•</span>
              <span>{totalPages} Pages</span>
              <span>•</span>
              <span>{formatSize(currentDoc.size)}</span>
            </div>
          )}
        </div>

        {/* Center: History Undo/Redo */}
        <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Change Document / Reset Workspace */}
        <div className="flex items-center space-x-2.5">
          {currentDoc && (
            <button
              type="button"
              id="change-pdf-btn"
              data-testid="change-pdf-btn"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Change PDF</span>
            </button>
          )}

          {currentDoc && (
            <button
              type="button"
              onClick={handleStartNewSplit}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Clear workspace"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* DISMISSIBLE ERROR BANNER */}
      {processingState.error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between text-xs text-red-700 z-30 shrink-0">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="font-medium">{processingState.error}</span>
          </div>
          <button
            type="button"
            onClick={dismissError}
            className="font-bold text-red-700 hover:text-red-900 ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE BODY */}
      {!currentDoc ? (
        /* EMPTY STATE DROPZONE */
        <main
          onDragOver={handleDropzoneDragOver}
          onDragLeave={handleDropzoneDragLeave}
          onDrop={handleDropzoneDrop}
          className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-slate-50 relative overflow-y-auto"
        >
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`w-full max-w-xl p-10 sm:p-14 text-center rounded-3xl border-2 border-dashed transition-all cursor-pointer ${
              isDraggingDropzone
                ? 'bg-rose-50/70 border-rose-500 scale-[1.01]'
                : 'bg-white border-slate-300 hover:border-slate-400 hover:bg-white/80 shadow-xs'
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-xs">
              <Scissors className="w-8 h-8" />
            </div>

            <h2 className="font-heading font-extrabold text-2xl text-slate-900 tracking-tight">
              {isDraggingDropzone ? 'Drop your PDF right here' : 'Split & Extract PDF Pages'}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Upload a PDF to inspect page thumbnails, select custom ranges, burst pages into individual documents,
              and preview pages in full resolution before splitting.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <span className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                <Plus className="w-4 h-4" />
                <span>Select PDF from Device</span>
              </span>
            </div>

            <p className="mt-4 text-[11px] text-slate-400">
              Supports PDF documents up to 50MB • Lossless fidelity • Zero retention
            </p>
          </div>
        </main>
      ) : (
        /* ACTIVE WORKSPACE: THREE-COLUMN STUDIO LAYOUT */
        <div className="flex-1 flex overflow-hidden relative">
          {/* LEFT COLUMN: Page Thumbnails & Quick Select */}
          <aside className="w-56 sm:w-64 lg:w-72 xl:w-80 h-full bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden z-10">
            {/* Sidebar Title & Quick Actions */}
            <div className="p-3 bg-slate-50/90 border-b border-slate-200 space-y-2 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <span>Pages ({totalPages})</span>
                </span>
                <span className="text-[11px] font-semibold text-rose-600 font-mono">
                  {selectedPagesSet.size} selected
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="py-1 px-1.5 rounded-lg text-[10px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={handleSelectOdd}
                  className="py-1 px-1.5 rounded-lg text-[10px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors"
                >
                  Odd
                </button>
                <button
                  type="button"
                  onClick={handleSelectEven}
                  className="py-1 px-1.5 rounded-lg text-[10px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors"
                >
                  Even
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="py-1 px-1.5 rounded-lg text-[10px] font-semibold bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Scrollable Thumbnails List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {currentDoc.pages.map((page) => {
                const pageNum = page.originalPageNumber;
                const isSelected = selectedPagesSet.has(pageNum);
                const isActive = activePageIndex === pageNum;

                return (
                  <div
                    key={page.id}
                    data-page-item="true"
                    onClick={() => setActivePageIndex(pageNum)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center space-x-2.5 ${
                      isActive
                        ? 'border-rose-500 bg-rose-50/30 ring-2 ring-rose-500/20 shadow-xs'
                        : isSelected
                        ? 'border-slate-300 bg-white hover:border-slate-400'
                        : 'border-slate-200 bg-slate-50/60 opacity-60 hover:opacity-100'
                    }`}
                  >
                    {/* Selection Checkbox */}
                    <button
                      type="button"
                      data-action="toggle-split-page"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePageSelection(pageNum);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                      title={isSelected ? 'Remove page from split' : 'Include page in split'}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-rose-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {/* Thumbnail Canvas / Fallback */}
                    <div className="w-14 h-18 bg-white border border-slate-200 rounded-md overflow-hidden shadow-xs flex items-center justify-center shrink-0 relative">
                      {thumbnails[page.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnails[page.id]}
                          alt={`Page ${pageNum}`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-300">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    {/* Page Label & Status */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-xs text-slate-800">Page {pageNum}</span>
                        {isActive && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-rose-100 text-rose-700">
                            Viewing
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {isSelected ? 'Included in split' : 'Excluded'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* CENTER COLUMN: Large Document Preview */}
          <main className="flex-1 h-full flex flex-col overflow-hidden bg-slate-100 relative">
            <DocumentViewer
              document={activeDocument}
              activePdfDoc={activePdfDoc}
              activePage={activePage}
              activePageIndex={activePageIndex}
              totalPages={activePages.length}
              zoom={zoom}
              zoomMode={zoomMode}
              onPageChange={setActivePageIndex}
              onZoomChange={setZoom}
              onZoomModeChange={setZoomMode}
              onRotatePage={rotatePage}
              onToggleDeletePage={toggleDeletePage}
              canAddMore={false}
            />
          </main>

          {/* RIGHT COLUMN: Split Configuration Panel */}
          <aside className="w-64 sm:w-72 lg:w-80 xl:w-88 h-full bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto p-4 sm:p-5 space-y-6 z-10">
            {/* Header */}
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-slate-900">
                <SlidersHorizontal className="w-4 h-4 text-rose-600" />
                <h3 className="font-heading font-bold text-sm sm:text-base">Split Configuration</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">Configure how pages are partitioned into files</p>
            </div>

            {/* Split Modes */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Split Method
              </label>

              <div className="grid grid-cols-1 gap-2">
                {/* Mode 1: Custom Ranges */}
                <button
                  type="button"
                  onClick={() => updateSplitConfig('custom')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    splitMode === 'custom'
                      ? 'border-rose-500 bg-rose-50/40 ring-1 ring-rose-500 text-slate-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs">Custom Ranges / Extract</span>
                    <Scissors className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Extract selected page ranges (e.g. 1-3, 5) into separate files or one PDF.
                  </p>
                </button>

                {/* Mode 2: Split Every Page */}
                <button
                  type="button"
                  onClick={() => updateSplitConfig('burst')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    splitMode === 'burst'
                      ? 'border-rose-500 bg-rose-50/40 ring-1 ring-rose-500 text-slate-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs">Extract Every Page</span>
                    <Archive className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Burst all {totalPages} pages into independent single-page PDFs in a ZIP.
                  </p>
                </button>

                {/* Mode 3: Split Every N Pages */}
                <button
                  type="button"
                  onClick={() => updateSplitConfig('interval')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    splitMode === 'interval'
                      ? 'border-rose-500 bg-rose-50/40 ring-1 ring-rose-500 text-slate-900'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs">Split by Page Interval</span>
                    <Split className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Group document into uniform parts of every N pages.
                  </p>
                </button>
              </div>
            </div>

            {/* Mode-Specific Settings */}
            {splitMode === 'custom' && (
              <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-xs font-semibold text-slate-700 block">
                  Page Ranges
                </label>
                <input
                  type="text"
                  value={rangeInput}
                  onChange={(e) => {
                    setRangeInput(e.target.value);
                    updateSplitConfig('custom', e.target.value);
                  }}
                  placeholder="e.g. 1-3, 5, 8-10"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-mono text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Tip: Separate ranges with commas. You can also click checkboxes on the page thumbnails on the left!
                </p>
              </div>
            )}

            {splitMode === 'interval' && (
              <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-xs font-semibold text-slate-700 block">
                  Split Every (N) Pages
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, totalPages)}
                    value={intervalCount}
                    onChange={(e) => {
                      const count = Math.max(1, Number(e.target.value) || 1);
                      setIntervalCount(count);
                      updateSplitConfig('interval', undefined, count);
                    }}
                    className="w-24 h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:border-rose-500"
                  />
                  <span className="text-xs text-slate-500">pages per document</span>
                </div>
              </div>
            )}

            {/* Output Summary Card */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Output Summary
              </span>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Expected Files:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {parsedPartsCount} {parsedPartsCount === 1 ? 'PDF file' : 'PDF files (ZIP)'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Total Pages in Output:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {splitMode === 'custom' ? selectedPagesSet.size : totalPages} pages
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* BOTTOM ACTION BAR */}
      {currentDoc && (
        <footer className="h-16 px-4 sm:px-6 bg-white border-t border-slate-200 flex items-center justify-between shrink-0 z-20">
          {/* Status info */}
          <div className="flex items-center space-x-2 text-xs text-slate-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Ready to split <strong className="text-slate-800">{currentDoc.name}</strong> ({totalPages} pages) into{' '}
              <strong className="text-slate-800">{parsedPartsCount} output {parsedPartsCount === 1 ? 'document' : 'documents'}</strong>.
            </span>
          </div>

          {/* Primary Split Button */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              disabled={processingState.status === 'processing' || parsedPartsCount === 0}
              onClick={executeProcess}
              className="w-full sm:w-auto px-7 py-2.5 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              {processingState.status === 'processing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{processingState.message || 'Splitting Document...'}</span>
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4" />
                  <span>Split PDF</span>
                </>
              )}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default SplitWorkspace;
