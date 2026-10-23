'use client';

import React, { useState, useRef, useEffect, useCallback, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Layers,
  Download,
  RefreshCw,
  Undo2,
  Redo2,
  FileText,
  Check,
  RotateCw,
  ExternalLink,
  X,
  HardDrive
} from 'lucide-react';
import { ToolDefinition } from '@/types/api';
import { StudioDocument, StudioPage } from './types';
import { useDocumentStudio } from './useDocumentStudio';
import { DocumentViewer } from './DocumentViewer';
import { generatePageThumbnail } from './pdf-loader';
import { triggerFileDownload, getFullApiUrl } from '@/lib/api-client';

interface MergeWorkspaceProps {
  tool: ToolDefinition;
}

interface SidebarDocItemProps {
  doc: StudioDocument;
  docIdx: number;
  totalDocs: number;
  isActive: boolean;
  activePageIndex: number;
  pdfDoc: any;
  thumbnails: Record<string, string>;
  onSelectDoc: () => void;
  onSelectPage: (pageIndex: number) => void;
  onToggleDeletePage: (docId: string, pageId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, index: number) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, index: number) => void;
  isDragTarget: boolean;
}

const SidebarDocItem: React.FC<SidebarDocItemProps> = ({
  doc,
  docIdx,
  totalDocs,
  isActive,
  activePageIndex,
  pdfDoc,
  thumbnails,
  onSelectDoc,
  onSelectPage,
  onToggleDeletePage,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget
}) => {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      data-doc-item="true"
      draggable
      onDragStart={(e) => onDragStart(e, docIdx)}
      onDragOver={(e) => onDragOver(e, docIdx)}
      onDrop={(e) => onDrop(e, docIdx)}
      className={`rounded-xl border transition-all duration-150 overflow-hidden ${
        isDragTarget
          ? 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-50/40'
          : isActive
          ? 'border-rose-400 bg-white ring-1 ring-rose-400/50 shadow-xs'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
      }`}
    >
      {/* File Header Card */}
      <div className="p-2.5 flex items-center justify-between gap-1.5 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          <div
            className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 transition-colors"
            title="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 shrink-0">
            #{docIdx + 1}
          </span>
          <button
            type="button"
            onClick={onSelectDoc}
            className="font-semibold text-xs text-slate-800 hover:text-rose-600 truncate text-left cursor-pointer transition-colors"
            title={`${doc.name} (${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}, ${formatSize(doc.size)})`}
          >
            {doc.name}
          </button>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <span className="text-[10px] font-medium text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
            {doc.pageCount}p
          </span>

          {/* Reorder Accessible Buttons */}
          {totalDocs > 1 && (
            <div className="flex items-center space-x-0.5 border-l border-slate-200 pl-1 ml-0.5">
              <button
                type="button"
                disabled={docIdx === 0}
                onClick={onMoveUp}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent transition-colors cursor-pointer"
                title="Move earlier in merge queue"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                disabled={docIdx === totalDocs - 1}
                onClick={onMoveDown}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent transition-colors cursor-pointer"
                title="Move later in merge queue"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Remove Document */}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            title="Remove file from merge"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Actual Page Thumbnails Grid */}
      <div className="p-2.5 bg-slate-50/30">
        <div className="grid grid-cols-3 gap-2">
          {doc.pages.map((page) => {
            const isPageActive = isActive && activePageIndex === page.displayOrder;
            const thumbUrl = thumbnails[page.id];

            return (
              <button
                key={page.id}
                type="button"
                onClick={() => onSelectPage(page.displayOrder)}
                className={`relative aspect-[3/4] rounded-lg border overflow-hidden transition-all text-left group cursor-pointer ${
                  isPageActive
                    ? 'border-rose-500 ring-2 ring-rose-500/50 shadow-xs bg-white'
                    : 'border-slate-200 bg-white hover:border-slate-400 hover:shadow-xs'
                }`}
                title={`Page ${page.displayOrder} of ${doc.name}`}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={`Page ${page.displayOrder}`}
                    className={`w-full h-full object-contain ${
                      page.isDeleted ? 'opacity-30 grayscale' : ''
                    }`}
                    style={{
                      transform: `rotate(${page.rotation}deg)`
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 animate-pulse text-[10px] text-slate-400 font-mono">
                    <FileText className="w-4 h-4 mb-1 text-slate-300" />
                    <span>p.{page.displayOrder}</span>
                  </div>
                )}

                {/* Page Number Overlay */}
                <div
                  className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold leading-none ${
                    isPageActive
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-900/70 text-white backdrop-blur-xs'
                  }`}
                >
                  {page.displayOrder}
                </div>

                {/* Rotation Indicator */}
                {page.rotation !== 0 && (
                  <div className="absolute top-1 left-1 px-1 py-0.5 rounded text-[8px] font-bold bg-amber-500 text-white flex items-center space-x-0.5 shadow-xs">
                    <RotateCw className="w-2.5 h-2.5" />
                    <span>{page.rotation}°</span>
                  </div>
                )}

                {/* Deleted Indicator */}
                {page.isDeleted && (
                  <div className="absolute inset-0 bg-red-950/40 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                    <span className="text-[9px] font-bold uppercase text-white bg-red-600 px-1 py-0.5 rounded shadow-xs">
                      Excluded
                    </span>
                  </div>
                )}

                {/* Exclude / Restore Action Button on Thumbnail */}
                <span
                  role="button"
                  tabIndex={0}
                  data-action={page.isDeleted ? 'restore-page' : 'exclude-page'}
                  data-page-id={page.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDeletePage(doc.id, page.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onToggleDeletePage(doc.id, page.id);
                    }
                  }}
                  className={`absolute top-1 right-1 z-10 p-1 rounded-md transition-all cursor-pointer ${
                    page.isDeleted
                      ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 opacity-100'
                      : 'bg-slate-900/60 text-white hover:bg-red-600 opacity-0 group-hover:opacity-100 hover:opacity-100'
                  }`}
                  title={page.isDeleted ? 'Restore page to merge' : 'Exclude page from merge'}
                >
                  {page.isDeleted ? (
                    <Undo2 className="w-3 h-3" />
                  ) : (
                    <X className="w-3 h-3" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const MergeWorkspace: React.FC<MergeWorkspaceProps> = ({ tool }) => {
  const {
    documents,
    activeDocument,
    activeDocId,
    activePageIndex,
    activePages,
    activePage,
    activePdfDoc,
    selectedPageIds,
    zoom,
    zoomMode,
    parameters,
    processingState,
    outputResult,
    canUndo,
    canRedo,
    addFiles,
    removeDocument,
    moveDocument,
    setActiveDocId,
    setActivePageIndex,
    selectDocumentAndPage,
    rotatePage,
    toggleDeletePage,
    undo,
    redo,
    setZoom,
    setZoomMode,
    executeProcess,
    resetWorkspace,
    dismissOutput,
    getPdfDoc,
    dismissError
  } = useDocumentStudio({ tool });

  const [isDraggingDropzone, setIsDraggingDropzone] = useState(false);
  const [draggedDocIdx, setDraggedDocIdx] = useState<number | null>(null);
  const [dragTargetIdx, setDragTargetIdx] = useState<number | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Compute aggregate totals (omitting deleted pages)
  const totalPageCount = documents.reduce(
    (acc, d) => acc + d.pages.filter((p) => !p.isDeleted).length,
    0
  );
  const totalExcludedCount = documents.reduce(
    (acc, d) => acc + d.pages.filter((p) => p.isDeleted).length,
    0
  );
  const totalSizeBytes = documents.reduce((acc, d) => acc + (d.size || 0), 0);

  const downloadedJobIdsRef = useRef<Set<string>>(new Set());
  const [hasDownloaded, setHasDownloaded] = useState(false);

  // Auto-download once when output result arrives
  useEffect(() => {
    if (!outputResult) {
      setHasDownloaded(false);
      return;
    }
    const output = outputResult.primaryOutput || outputResult.outputFiles[0];
    if (output && !downloadedJobIdsRef.current.has(outputResult.jobId)) {
      downloadedJobIdsRef.current.add(outputResult.jobId);
      triggerFileDownload(output.downloadUrl, output.filename);
      setHasDownloaded(true);
    }
  }, [outputResult]);

  const handleStartNewMerge = () => {
    setThumbnails({});
    setHasDownloaded(false);
    resetWorkspace();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Generate page thumbnails for all loaded documents in background
  useEffect(() => {
    if (documents.length === 0) return;

    let isCancelled = false;

    const renderAllThumbnails = async () => {
      for (const doc of documents) {
        if (isCancelled || !isMountedRef.current) break;
        const pdfDoc = getPdfDoc(doc.id);
        if (!pdfDoc) continue;

        for (const page of doc.pages) {
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
              // ignore rendering errors
            }
          }
        }
      }
    };

    renderAllThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [documents, getPdfDoc, thumbnails]);

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

  // Reordering documents in sidebar via drag-and-drop
  const handleDocDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    setDraggedDocIdx(index);
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDocDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (dragTargetIdx !== index) {
      setDragTargetIdx(index);
    }
  };

  const handleDocDrop = (e: DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedDocIdx !== null && draggedDocIdx !== targetIndex) {
      moveDocument(draggedDocIdx, targetIndex);
    }
    setDraggedDocIdx(null);
    setDragTargetIdx(null);
  };

  // =========================================================================
  // VIEW: Output Preview State
  // =========================================================================
  // =========================================================================
  // VIEW: Polished Completion Page
  // =========================================================================
  if (outputResult) {
    const selectedOutput =
      outputResult.primaryOutput ||
      outputResult.outputFiles?.[0] || {
        filename: 'merged.pdf',
        downloadUrl: outputResult.downloadUrl || '',
        size: totalSizeBytes,
        pageCount: totalPageCount
      };

    const fullDownloadUrl = getFullApiUrl(selectedOutput.downloadUrl);

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
            <span className="text-xs font-semibold text-slate-600">Merge PDF</span>
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
        <main className="flex-1 overflow-y-auto p-4 sm:p-8 flex items-center justify-center">
          <div className="max-w-2xl w-full bg-white rounded-3xl border border-slate-200/80 shadow-xl p-8 sm:p-10 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            {/* Success Icon Badge */}
            <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-5">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            {/* Heading */}
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
              Your PDF has been downloaded
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
              Your documents have been merged into a single verified PDF with your page selections, rotations, and ordering applied.
            </p>

            {/* Verified Metrics Card */}
            <div className="mt-8 w-full bg-slate-50/90 border border-slate-200 rounded-2xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {/* Filename */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filename</div>
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

              {/* Final Verified Page Count */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200/70 shadow-xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified Pages</div>
                  <div className="text-xs sm:text-sm font-bold text-emerald-700 truncate font-mono">
                    {selectedOutput.pageCount ? `${selectedOutput.pageCount} pages` : 'Verified'}
                  </div>
                </div>
              </div>
            </div>

            {/* Merged Document Live Preview */}
            <div className="mt-6 w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center p-3 sm:p-4 relative">
              <div className="w-full h-[360px] sm:h-[420px] rounded-xl overflow-hidden border border-slate-700 bg-white shadow-md relative">
                <iframe
                  id="merged-pdf-preview-frame"
                  src={`${fullDownloadUrl}${fullDownloadUrl.includes('?') ? '&' : '?'}preview=true#toolbar=0`}
                  title="Merged PDF Preview"
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

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                id="btn-back-to-studio"
                data-testid="back-to-studio"
                onClick={dismissOutput}
                className="w-full sm:w-auto px-5 py-3 rounded-xl font-heading font-semibold text-xs sm:text-sm text-slate-700 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer"
                title="Return to Document Studio workspace with files and page thumbnails"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
                <span>Back to Studio</span>
              </button>

              <button
                type="button"
                id="btn-start-new-merge"
                data-testid="start-new-merge"
                onClick={handleStartNewMerge}
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                title="Reset workspace and start a fresh merge"
              >
                <Plus className="w-4 h-4" />
                <span>New Merge</span>
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
                <span>{hasDownloaded ? 'Download Again' : 'Download PDF'}</span>
              </button>
            </div>

            {/* Optional Back to PDF Tools Link */}
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
  // VIEW: Interactive Full-Screen Merge Workspace
  // =========================================================================
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* Hidden file input for all upload triggers */}
      <input
        ref={fileInputRef}
        type="file"
        id="studio-file-input"
        data-testid="studio-file-input"
        multiple
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
              <Layers className="w-4 h-4" />
            </div>
            <h1 className="font-heading font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
              Merge PDF
            </h1>
            <span className="hidden sm:inline-flex items-center space-x-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
              Studio
            </span>
          </div>

          {documents.length > 0 && (
            <div className="hidden md:flex items-center space-x-1.5 ml-2 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/60">
              <span>{documents.length} Files</span>
              <span>•</span>
              <span>{totalPageCount} Pages</span>
              <span>•</span>
              <span>{formatSize(totalSizeBytes)}</span>
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

        {/* Right: Add PDFs & Clear Workspace */}
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            id="add-more-pdfs-btn"
            data-testid="add-more-pdfs-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={documents.length >= 20}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add PDFs</span>
          </button>

          {documents.length > 0 && (
            <button
              type="button"
              onClick={resetWorkspace}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              title="Clear all uploaded documents"
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
      {documents.length === 0 ? (
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
              <Layers className="w-8 h-8" />
            </div>

            <h2 className="font-heading font-extrabold text-2xl text-slate-900 tracking-tight">
              {isDraggingDropzone ? 'Drop your PDFs right here' : 'Combine & Merge PDF Documents'}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              Upload 2 or more PDF files. Inspect real page thumbnails, reorder merge sequence,
              and preview combined pages in real time.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <span className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                <Plus className="w-4 h-4" />
                <span>Choose PDFs from Device</span>
              </span>
            </div>

            <p className="mt-4 text-[11px] text-slate-400">
              Supports PDF files up to 50MB • Up to 20 files • Zero retention
            </p>
          </div>
        </main>
      ) : (
        /* ACTIVE WORKSPACE: SIDEBAR + CENTER CANVAS */
        <div className="flex-1 flex overflow-hidden relative">
          {/* LEFT SIDEBAR: File & Page Thumbnails */}
          <aside className="w-72 sm:w-80 lg:w-96 h-full bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden z-10">
            {/* Sidebar Title */}
            <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between text-xs shrink-0">
              <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Merge Sequence ({documents.length})</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Order: Top to Bottom</span>
            </div>

            {/* Scrollable File & Page Cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {documents.map((doc, idx) => (
                <SidebarDocItem
                  key={doc.id}
                  doc={doc}
                  docIdx={idx}
                  totalDocs={documents.length}
                  isActive={doc.id === (activeDocId || documents[0]?.id)}
                  activePageIndex={activePageIndex}
                  pdfDoc={getPdfDoc(doc.id)}
                  thumbnails={thumbnails}
                  onSelectDoc={() => selectDocumentAndPage(doc.id, 1)}
                  onSelectPage={(pageIdx) => selectDocumentAndPage(doc.id, pageIdx)}
                  onToggleDeletePage={toggleDeletePage}
                  onMoveUp={() => moveDocument(idx, idx - 1)}
                  onMoveDown={() => moveDocument(idx, idx + 1)}
                  onRemove={() => removeDocument(doc.id)}
                  onDragStart={handleDocDragStart}
                  onDragOver={handleDocDragOver}
                  onDrop={handleDocDrop}
                  isDragTarget={dragTargetIdx === idx}
                />
              ))}

              {/* Sidebar Quick Add */}
              {documents.length < 20 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-rose-400 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50/40 flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Another PDF</span>
                </button>
              )}
            </div>
          </aside>

          {/* CENTER: Large Canvas Document Preview */}
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
              canAddMore={documents.length < 20}
              onAddMoreFiles={() => fileInputRef.current?.click()}
            />
          </main>
        </div>
      )}

      {/* BOTTOM ACTION BAR */}
      {documents.length > 0 && (
        <footer className="h-16 px-4 sm:px-6 bg-white border-t border-slate-200 flex items-center justify-between shrink-0 z-20">
          {/* Status info */}
          <div className="flex items-center space-x-2">
            {documents.length < 2 ? (
              <div className="flex items-center space-x-2 text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Add at least {2 - documents.length} more PDF to enable merge (requires minimum 2 PDFs)
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-xs text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Ready to merge <strong className="text-slate-800">{documents.length} PDFs</strong>{' '}
                  into 1 document (<strong className="text-slate-800">{totalPageCount} pages</strong>
                  {totalExcludedCount > 0 ? `, ${totalExcludedCount} excluded` : ''},{' '}
                  {formatSize(totalSizeBytes)}).
                </span>
              </div>
            )}
          </div>

          {/* Merge PDFs Button */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              disabled={documents.length < 2 || processingState.status === 'processing'}
              onClick={executeProcess}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-heading font-bold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              {processingState.status === 'processing' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{processingState.message || 'Merging Documents...'}</span>
                </>
              ) : (
                <>
                  <Layers className="w-4 h-4" />
                  <span>Merge {documents.length > 0 ? `${documents.length} PDFs` : 'PDFs'}</span>
                </>
              )}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};

export default MergeWorkspace;
