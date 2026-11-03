'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Trash2,
  Undo2,
  FileText,
  AlertCircle,
  Lock,
  Loader2,
  Sparkles,
  Plus
} from 'lucide-react';
import { StudioDocument, StudioPage, ZoomMode } from './types';
import { renderPageToCanvas, ActiveRenderTask, loadPdfDocument } from './pdf-loader';

interface DocumentViewerProps {
  document: StudioDocument | null;
  activePdfDoc: any;
  activePage: StudioPage | null;
  activePageIndex: number;
  totalPages: number;
  zoom: number;
  zoomMode: ZoomMode;
  onPageChange: (newPage: number) => void;
  onZoomChange: (newZoom: number) => void;
  onZoomModeChange: (mode: ZoomMode) => void;
  onRotatePage: (pageId: string) => void;
  onToggleDeletePage: (pageId: string) => void;
  onAddMoreFiles?: () => void;
  canAddMore?: boolean;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  activePdfDoc,
  activePage,
  activePageIndex,
  totalPages,
  zoom,
  zoomMode,
  onPageChange,
  onZoomChange,
  onZoomModeChange,
  onRotatePage,
  onToggleDeletePage,
  onAddMoreFiles,
  canAddMore
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRenderTaskRef = useRef<ActiveRenderTask | null>(null);
  const renderSequenceRef = useRef<number>(0);
  const pageSizeRef = useRef<{ width: number; height: number }>({ width: 595, height: 842 });

  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pageInputVal, setPageInputVal] = useState<string>(String(activePageIndex));
  const [internalPdfDoc, setInternalPdfDoc] = useState<any>(null);


  // Sync page input when activePageIndex changes
  useEffect(() => {
    setPageInputVal(String(activePageIndex));
  }, [activePageIndex]);

  // Ensure active PDF instance is loaded even if external map had a cache miss
  useEffect(() => {
    if (activePdfDoc) {
      setInternalPdfDoc(activePdfDoc);
      setRenderError(null);
      return;
    }
    if (!document || !document.isPdf) {
      setInternalPdfDoc(null);
      return;
    }

    let isCancelled = false;
    (async () => {
      try {
        if (document.isEncrypted && !activePdfDoc) {
          return;
        }
        const source = document.objectUrl || (await document.file.arrayBuffer());
        const loaded = await loadPdfDocument(source);
        if (!isCancelled) {
          setInternalPdfDoc(loaded);
          setRenderError(null);
        }
      } catch (err: any) {
        if (!isCancelled) {
          const isPwdErr = err?.name === 'PasswordException' || err?.message?.toLowerCase().includes('password');
          if (!isPwdErr) {
            setRenderError(err?.message || 'Failed to load PDF document');
          } else {
            setRenderError(null);
          }
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [document, activePdfDoc]);

  const effectivePdfDoc = activePdfDoc || internalPdfDoc;

  // Calculate zoom based on inner viewport width/height and actual page dimensions
  const calculateAutoZoom = useCallback(
    (mode: ZoomMode, customWidth?: number, customHeight?: number): number => {
      const viewport = viewportRef.current || containerRef.current;
      if (!viewport) return 1.0;

      const pW = customWidth || pageSizeRef.current.width || 595;
      const pH = customHeight || pageSizeRef.current.height || 842;

      // Inner viewport available dimensions excluding padding & border margin
      // p-4 / p-6 gives 32px or 48px padding; subtract 56px to guarantee clearance for borders/shadows
      const isSmall = viewport.clientWidth < 640;
      const pad = isSmall ? 36 : 56;
      const availWidth = Math.max(100, viewport.clientWidth - pad);
      const availHeight = Math.max(100, viewport.clientHeight - pad);

      if (mode === 'fit-width') {
        const calculated = availWidth / pW;
        return Number(Math.min(Math.max(calculated, 0.25), 2.5).toFixed(3));
      }
      if (mode === 'fit-page') {
        const scaleW = availWidth / pW;
        const scaleH = availHeight / pH;
        // Limiting dimension ensures complete page fits without clipping or distortion
        const calculated = Math.min(scaleW, scaleH);
        return Number(Math.min(Math.max(calculated, 0.25), 2.5).toFixed(3));
      }
      return 1.0;
    },
    []
  );

  // Render current PDF page with sequence counter to prevent stale renders
  useEffect(() => {
    if (!document || !document.isPdf) {
      return;
    }

    if (!effectivePdfDoc || !activePage) {
      return;
    }

    if (!canvasRef.current) return;

    let isCancelled = false;
    const currentSeq = ++renderSequenceRef.current;

    (async () => {
      try {
        const pageNumber = activePage.originalPageNumber;
        const page = await effectivePdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const baseRotation = page.rotate || 0;
        const extraRotation = activePage.rotation || 0;
        const totalRotation = (baseRotation + extraRotation) % 360;

        // Query actual unscaled page dimensions taking rotation into account
        const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });
        const pWidth = unscaledViewport.width;
        const pHeight = unscaledViewport.height;
        pageSizeRef.current = { width: pWidth, height: pHeight };

        let targetScale = zoom;
        if (zoomMode !== 'custom') {
          targetScale = calculateAutoZoom(zoomMode, pWidth, pHeight);
          if (Math.abs(targetScale - zoom) > 0.01) {
            onZoomChange(targetScale);
          }
        }

        if (!canvasRef.current || isCancelled) return;
        const canvas = canvasRef.current;

        // Cancel any in-flight rendering task
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
          activeRenderTaskRef.current = null;
        }

        setIsRendering(true);
        setRenderError(null);

        // Clear canvas immediately to avoid lingering stale graphics
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        const task = renderPageToCanvas(effectivePdfDoc, pageNumber, canvas, {
          scale: targetScale,
          rotation: activePage.rotation
        });

        activeRenderTaskRef.current = task;
        await task.promise;
        if (!isCancelled && currentSeq === renderSequenceRef.current) {
          setIsRendering(false);
        }
      } catch (err: any) {
        if (!isCancelled && currentSeq === renderSequenceRef.current) {
          if (err?.name !== 'RenderingCancelledException') {
            setRenderError(err?.message || 'Failed to render PDF page');
          }
          setIsRendering(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, [
    document,
    effectivePdfDoc,
    activePage,
    activePage?.originalPageNumber,
    activePage?.rotation,
    zoom,
    zoomMode,
    calculateAutoZoom,
    onZoomChange
  ]);

  // Reset scroll position to top when document or page changes, or when fit-page is active
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      viewportRef.current.scrollLeft = 0;
    }
  }, [document?.id, activePageIndex, zoomMode]);

  // Window/viewport resize observer to update fit-width / fit-page dynamically
  useEffect(() => {
    const targetEl = viewportRef.current || containerRef.current;
    if (!targetEl || zoomMode === 'custom') return;

    const handleResize = () => {
      const newZoom = calculateAutoZoom(zoomMode);
      if (Math.abs(newZoom - zoom) > 0.02) {
        onZoomChange(newZoom);
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(targetEl);
    return () => observer.disconnect();
  }, [zoomMode, calculateAutoZoom, onZoomChange, zoom]);

  // Page input jump submit
  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(pageInputVal, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num);
    } else {
      setPageInputVal(String(activePageIndex));
    }
  };

  // Zoom helpers
  const handleZoomIn = () => {
    onZoomModeChange('custom');
    onZoomChange(Number(Math.min(zoom + 0.15, 3.0).toFixed(2)));
  };

  const handleZoomOut = () => {
    onZoomModeChange('custom');
    onZoomChange(Number(Math.max(zoom - 0.15, 0.25).toFixed(2)));
  };

  const handleFitWidth = () => {
    onZoomModeChange('fit-width');
    const autoScale = calculateAutoZoom('fit-width');
    onZoomChange(autoScale);
  };

  const handleFitPage = () => {
    onZoomModeChange('fit-page');
    const autoScale = calculateAutoZoom('fit-page');
    onZoomChange(autoScale);
  };

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[420px] bg-slate-100/60 rounded-2xl border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white text-slate-400 flex items-center justify-center shadow-xs mb-3 border border-slate-200">
          <FileText className="w-8 h-8" />
        </div>
        <h4 className="font-heading font-semibold text-slate-800 text-base">
          No Document Selected
        </h4>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Upload or select a document to inspect pages and configure operations.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-slate-100 rounded-none sm:rounded-2xl overflow-hidden border border-slate-200 shadow-xs relative select-none"
    >
      {/* Studio Top Control Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 text-slate-700 text-xs shrink-0 z-10">
        {/* Left: Document info & Live Preview badge */}
        <div className="flex items-center space-x-2.5 truncate max-w-xs sm:max-w-md">
          <span className="font-semibold text-slate-900 truncate">{document.name}</span>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
            <Sparkles className="w-3 h-3" />
            <span>Live Preview</span>
          </span>
          {canAddMore && onAddMoreFiles && (
            <button
              type="button"
              onClick={onAddMoreFiles}
              className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer shrink-0"
              title="Add another document"
            >
              <Plus className="w-3 h-3 text-rose-600" />
              <span>Add PDF</span>
            </button>
          )}
        </div>

        {/* Center: Page Navigation Controls */}
        {totalPages > 1 && (
          <div className="flex items-center space-x-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
            <button
              disabled={activePageIndex <= 1}
              onClick={() => onPageChange(activePageIndex - 1)}
              className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <form onSubmit={handlePageInputSubmit} className="flex items-center space-x-1">
              <input
                type="text"
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value)}
                onBlur={handlePageInputSubmit}
                className="w-9 h-6 text-center rounded bg-white text-slate-800 font-mono text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <span className="text-slate-500 font-mono text-xs">/ {totalPages}</span>
            </form>

            <button
              disabled={activePageIndex >= totalPages}
              onClick={() => onPageChange(activePageIndex + 1)}
              className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Right: Zoom & Orientation Controls */}
        <div className="flex items-center space-x-1.5">
          {/* Rotate Active Page Button */}
          {activePage && (
            <button
              onClick={() => onRotatePage(activePage.id)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Rotate Page (+90°)"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}

          {/* Delete / Exclude Active Page Button */}
          {activePage && (
            <button
              onClick={() => onToggleDeletePage(activePage.id)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                activePage.isDeleted
                  ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                  : 'text-slate-500 hover:text-red-600 hover:bg-red-50'
              }`}
              title={activePage.isDeleted ? 'Restore Page' : 'Exclude Page'}
            >
              {activePage.isDeleted ? <Undo2 className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}

          {activePage && <div className="h-4 w-px bg-slate-200 mx-1" />}

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Zoom % */}
          <span className="font-mono text-xs text-slate-700 font-semibold w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Fit Width */}
          <button
            onClick={handleFitWidth}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
              zoomMode === 'fit-width'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Fit to Width"
          >
            Width
          </button>

          {/* Fit Page */}
          <button
            onClick={handleFitPage}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              zoomMode === 'fit-page'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Fit to Page"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Canvas / Content Viewport */}
      
      <div
        ref={viewportRef}
        className="flex-1 overflow-auto p-4 sm:p-6 flex relative bg-slate-100/90"
      >
        {/* Loading Spinner */}
        {(isRendering || (!effectivePdfDoc && document.isPdf && !document.isEncrypted)) && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-20 transition-opacity">
            <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
              <span>Rendering high-resolution vector page...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {renderError && (
          <div className="m-auto p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2 max-w-md">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span>{renderError}</span>
          </div>
        )}

                {/* Password Protected Locked Document Banner */}
        {document.isEncrypted && !effectivePdfDoc && (
          <div className="m-auto p-8 rounded-2xl bg-white border border-slate-200 shadow-xs text-center max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 border border-rose-100 shadow-xs">
              <Lock className="w-7 h-7" />
            </div>
            <h4 className="font-heading font-bold text-slate-900 text-base">
              Password-Protected PDF
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              This document is encrypted. Enter the current password in the configuration panel on the right to preview and unlock it.
            </p>
            {document.errorMessage && document.errorMessage.toLowerCase().includes('incorrect') && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{document.errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* PDF Render Canvas */}
        {document.isPdf && (
          <div className="m-auto relative shadow-xl border border-slate-300/80 rounded-sm overflow-hidden transition-transform duration-150">
            <canvas ref={canvasRef} className="block bg-white shadow-md" />

            {/* Excluded / Deleted Page Overlay */}
            {activePage?.isDeleted && (
              <div className="absolute inset-0 bg-red-950/75 backdrop-blur-[1px] flex flex-col items-center justify-center text-center p-6 text-white border-2 border-red-500">
                <Trash2 className="w-10 h-10 text-red-400 mb-2" />
                <span className="font-heading font-bold text-lg">Page Excluded</span>
                <p className="text-xs text-red-200 max-w-xs mt-1">
                  This page is marked for deletion and will be omitted from the output.
                </p>
                <button
                  onClick={() => onToggleDeletePage(activePage.id)}
                  className="mt-4 px-4 py-2 rounded-lg bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 flex items-center space-x-1.5 shadow-md"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Restore Page</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Image Source File Preview */}
        {document.isImage && (
          <div className="m-auto relative max-w-full max-h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={document.objectUrl}
              alt={document.name}
              style={{
                transform: `rotate(${activePage?.rotation || 0}deg) scale(${zoom})`,
                transition: 'transform 0.2s ease-in-out'
              }}
              className="max-h-[70vh] object-contain rounded-lg shadow-2xl bg-white"
            />
          </div>
        )}

        {/* Office / Non-Renderable Document Inspect Card */}
        {document.isOffice && (
          <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl text-slate-300">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 text-rose-400 border border-slate-800 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="font-heading font-bold text-white text-lg truncate">
              {document.name}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {(document.size / (1024 * 1024)).toFixed(2)} MB • {document.mimeType || 'Document'}
            </p>
            <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
              This document will be converted to PDF using DocuSuite&apos;s server-side engine. Click
              Execute to process.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
