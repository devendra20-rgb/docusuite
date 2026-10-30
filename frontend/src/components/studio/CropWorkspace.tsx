'use client';

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  DragEvent,
  ChangeEvent,
  PointerEvent as ReactPointerEvent
} from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  ArrowLeft,
  Plus,
  RotateCw,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Download,
  RefreshCw,
  Layers,
  Eye,
  Crop as CropIcon
} from 'lucide-react';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { triggerFileDownload, getFullApiUrl } from '@/lib/api-client';
import { useDocumentStudio } from './useDocumentStudio';
import { PageManager } from './PageManager';
import { StudioControls } from './StudioControls';
import { PdfOutputViewer } from './OutputPreview';
import { renderPageToCanvas, loadPdfDocument } from './pdf-loader';
import { ZoomMode, StudioOutputResult, StudioOutputItem } from './types';

interface CropWorkspaceProps {
  tool: ToolDefinition;
}

type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'w' | 'e';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Interactive Crop Document Viewer:
 * Replaces the static preview inside DocumentViewer for Crop PDF only.
 * Preserves the exact original DocumentViewer layout, top toolbar, styling, zoom, and page switcher,
 * while overlaying an interactive draggable & resizable crop box with dimmed surroundings.
 */
interface CropDocumentViewerProps {
  document: any;
  activePdfDoc: any;
  activePage: any;
  activePageIndex: number;
  totalPages: number;
  zoom: number;
  zoomMode: ZoomMode;
  parameters: Record<string, any>;
  onPageChange: (newPage: number) => void;
  onZoomChange: (newZoom: number) => void;
  onZoomModeChange: (mode: ZoomMode) => void;
  onRotatePage: (pageId: string) => void;
  onToggleDeletePage: (pageId: string) => void;
  onMarginChange: (margins: { top: number; bottom: number; left: number; right: number }) => void;
}

const CropDocumentViewer: React.FC<CropDocumentViewerProps> = ({
  document,
  activePdfDoc,
  activePage,
  activePageIndex,
  totalPages,
  zoom,
  zoomMode,
  parameters,
  onPageChange,
  onZoomChange,
  onZoomModeChange,
  onRotatePage,
  onToggleDeletePage,
  onMarginChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({
    width: 595,
    height: 842
  });
  const pageSizeRef = useRef<{ width: number; height: number }>({
    width: 595,
    height: 842
  });

  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pageInputVal, setPageInputVal] = useState<string>(String(activePageIndex));
  const [internalPdfDoc, setInternalPdfDoc] = useState<any>(null);

  // Toggle between interactive crop editing frame and isolated final cropped preview
  const [isPreviewCropped, setIsPreviewCropped] = useState<boolean>(false);

  // Canvas visual display dimensions in pixels
  const [displayDimensions, setDisplayDimensions] = useState<{ width: number; height: number }>({
    width: 595,
    height: 842
  });

  // Drag interaction state
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'resize' | 'draw'>('none');
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);

  // Current margins in points (synced with parameters)
  const topPt = Number(parameters.top) >= 0 ? Number(parameters.top) : 20;
  const bottomPt = Number(parameters.bottom) >= 0 ? Number(parameters.bottom) : 20;
  const leftPt = Number(parameters.left) >= 0 ? Number(parameters.left) : 20;
  const rightPt = Number(parameters.right) >= 0 ? Number(parameters.right) : 20;

  // Sync page input
  useEffect(() => {
    setPageInputVal(String(activePageIndex));
  }, [activePageIndex]);

  // Load PDF if not already loaded
  useEffect(() => {
    if (activePdfDoc) {
      setInternalPdfDoc(activePdfDoc);
      return;
    }
    if (!document || !document.isPdf) {
      setInternalPdfDoc(null);
      return;
    }

    let isCancelled = false;
    (async () => {
      try {
        const source = document.objectUrl || (await document.file.arrayBuffer());
        const loaded = await loadPdfDocument(source);
        if (!isCancelled) {
          setInternalPdfDoc(loaded);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setRenderError(err?.message || 'Failed to load PDF document');
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [document, activePdfDoc]);

  const effectivePdfDoc = activePdfDoc || internalPdfDoc;

  // Auto zoom calculation
  const calculateAutoZoom = useCallback(
    (mode: ZoomMode, customWidth?: number, customHeight?: number): number => {
      const viewport = viewportRef.current || containerRef.current;
      if (!viewport) return 1.0;

      const pW = customWidth || pageSizeRef.current.width || 595;
      const pH = customHeight || pageSizeRef.current.height || 842;

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
        const calculated = Math.min(scaleW, scaleH);
        return Number(Math.min(Math.max(calculated, 0.25), 2.5).toFixed(3));
      }
      return 1.0;
    },
    []
  );

  // Render PDF page to canvas
  useEffect(() => {
    if (!document || !document.isPdf || !effectivePdfDoc || !canvasRef.current) {
      return;
    }

    let isCancelled = false;
    setIsRendering(true);
    setRenderError(null);

    const canvas = canvasRef.current;

    (async () => {
      try {
        const pageNum = Math.max(1, Math.min(activePageIndex, totalPages || 1));
        const page = await effectivePdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const baseRot = page.rotate || 0;
        const extraRot = activePage?.rotation || 0;
        const totalRot = (baseRot + extraRot) % 360;

        const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRot });
        pageSizeRef.current = {
          width: unscaledViewport.width,
          height: unscaledViewport.height
        };
        setPageSize({
          width: unscaledViewport.width,
          height: unscaledViewport.height
        });

        let effectiveZoom = zoom;
        if (zoomMode === 'fit-page' || zoomMode === 'fit-width') {
          effectiveZoom = calculateAutoZoom(
            zoomMode,
            unscaledViewport.width,
            unscaledViewport.height
          );
        }

        const task = renderPageToCanvas(effectivePdfDoc, pageNum, canvas, {
          scale: effectiveZoom,
          rotation: extraRot
        });

        await task.promise;
        if (!isCancelled) {
          setIsRendering(false);
          const dispW = Math.floor(unscaledViewport.width * effectiveZoom);
          const dispH = Math.floor(unscaledViewport.height * effectiveZoom);
          setDisplayDimensions({ width: dispW, height: dispH });
        }
      } catch (err: any) {
        if (!isCancelled && err?.name !== 'RenderingCancelledException') {
          setIsRendering(false);
          setRenderError(err?.message || 'Failed to render PDF page');
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    document,
    effectivePdfDoc,
    activePageIndex,
    activePage?.rotation,
    totalPages,
    zoom,
    zoomMode,
    calculateAutoZoom
  ]);

  // Page input submission
  const handlePageInputSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = parseInt(pageInputVal, 10);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      onPageChange(val);
    } else {
      setPageInputVal(String(activePageIndex));
    }
  };

  // Zoom buttons
  const handleZoomIn = () => {
    onZoomModeChange('custom');
    onZoomChange(Math.min(Number((zoom + 0.15).toFixed(2)), 3.0));
  };

  const handleZoomOut = () => {
    onZoomModeChange('custom');
    onZoomChange(Math.max(Number((zoom - 0.15).toFixed(2)), 0.25));
  };

  const handleFitWidth = () => {
    onZoomModeChange('fit-width');
    const autoScale = calculateAutoZoom('fit-width', pageSize.width, pageSize.height);
    onZoomChange(autoScale);
  };

  const handleFitPage = () => {
    onZoomModeChange('fit-page');
    const autoScale = calculateAutoZoom('fit-page', pageSize.width, pageSize.height);
    onZoomChange(autoScale);
  };

  // =========================================================================
  // INTERACTIVE CROP DRAGGING & RESIZING
  // =========================================================================
  const unscaledW = pageSize.width;
  const unscaledH = pageSize.height;

  // Normalized crop rectangle: [0..1]
  const cropNorm = {
    x: clamp(leftPt / unscaledW, 0, 0.95),
    y: clamp(topPt / unscaledH, 0, 0.95),
    width: clamp((unscaledW - leftPt - rightPt) / unscaledW, 0.05, 1),
    height: clamp((unscaledH - topPt - bottomPt) / unscaledH, 0.05, 1)
  };

  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startRight: number;
    startTop: number;
    startBottom: number;
  }>({
    startX: 0,
    startY: 0,
    startLeft: leftPt,
    startRight: rightPt,
    startTop: topPt,
    startBottom: bottomPt
  });

  const getPointerPosNorm = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    return { x, y };
  };

  // Move handle
  const handleMovePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (overlayRef.current) {
      overlayRef.current.setPointerCapture(e.pointerId);
    }
    const pt = getPointerPosNorm(e);
    setDragMode('move');
    dragStartRef.current = {
      startX: pt.x,
      startY: pt.y,
      startLeft: leftPt,
      startRight: rightPt,
      startTop: topPt,
      startBottom: bottomPt
    };
  };

  // Resize handle
  const handleResizePointerDown = (handle: ResizeHandle, e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (overlayRef.current) {
      overlayRef.current.setPointerCapture(e.pointerId);
    }
    const pt = getPointerPosNorm(e);
    setDragMode('resize');
    setActiveHandle(handle);
    dragStartRef.current = {
      startX: pt.x,
      startY: pt.y,
      startLeft: leftPt,
      startRight: rightPt,
      startTop: topPt,
      startBottom: bottomPt
    };
  };

  // Draw new box on backdrop click & drag
  const handleBackdropPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (overlayRef.current) {
      overlayRef.current.setPointerCapture(e.pointerId);
    }
    const pt = getPointerPosNorm(e);
    setDragMode('draw');
    dragStartRef.current = {
      startX: pt.x,
      startY: pt.y,
      startLeft: leftPt,
      startRight: rightPt,
      startTop: topPt,
      startBottom: bottomPt
    };
  };

  // Dragging movement (Smooth continuous real-time update)
  const handleOverlayPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragMode === 'none') return;
    const pt = getPointerPosNorm(e);
    const { startX, startY, startLeft, startRight, startTop, startBottom } = dragStartRef.current;
    const dxPt = (pt.x - startX) * unscaledW;
    const dyPt = (pt.y - startY) * unscaledH;

    const cropW = unscaledW - startLeft - startRight;
    const cropH = unscaledH - startTop - startBottom;

    if (dragMode === 'move') {
      const newLeft = clamp(startLeft + dxPt, 0, unscaledW - cropW);
      const newTop = clamp(startTop + dyPt, 0, unscaledH - cropH);
      const newRight = unscaledW - newLeft - cropW;
      const newBottom = unscaledH - newTop - cropH;

      onMarginChange({
        top: Math.max(0, Math.round(newTop)),
        bottom: Math.max(0, Math.round(newBottom)),
        left: Math.max(0, Math.round(newLeft)),
        right: Math.max(0, Math.round(newRight))
      });
    } else if (dragMode === 'resize' && activeHandle) {
      let curL = startLeft;
      let curR = startRight;
      let curT = startTop;
      let curB = startBottom;

      if (activeHandle.includes('w')) {
        curL = clamp(startLeft + dxPt, 0, unscaledW - curR - 20);
      }
      if (activeHandle.includes('e')) {
        curR = clamp(startRight - dxPt, 0, unscaledW - curL - 20);
      }
      if (activeHandle.includes('n')) {
        curT = clamp(startTop + dyPt, 0, unscaledH - curB - 20);
      }
      if (activeHandle.includes('s')) {
        curB = clamp(startBottom - dyPt, 0, unscaledH - curT - 20);
      }

      onMarginChange({
        top: Math.max(0, Math.round(curT)),
        bottom: Math.max(0, Math.round(curB)),
        left: Math.max(0, Math.round(curL)),
        right: Math.max(0, Math.round(curR))
      });
    } else if (dragMode === 'draw') {
      const dist = Math.hypot((pt.x - startX) * unscaledW, (pt.y - startY) * unscaledH);
      // Require at least 8pt drag distance to avoid collapsing on accidental tap
      if (dist > 8) {
        const minX = Math.min(startX, pt.x);
        const maxX = Math.max(startX, pt.x);
        const minY = Math.min(startY, pt.y);
        const maxY = Math.max(startY, pt.y);

        const wPt = Math.max(20, (maxX - minX) * unscaledW);
        const hPt = Math.max(20, (maxY - minY) * unscaledH);

        const newLeft = clamp(Math.round(minX * unscaledW), 0, unscaledW - 20);
        const newTop = clamp(Math.round(minY * unscaledH), 0, unscaledH - 20);
        const newRight = clamp(Math.round(unscaledW - newLeft - wPt), 0, unscaledW - newLeft - 20);
        const newBottom = clamp(Math.round(unscaledH - newTop - hPt), 0, unscaledH - newTop - 20);

        onMarginChange({
          top: newTop,
          bottom: newBottom,
          left: newLeft,
          right: newRight
        });
      }
    }
  };

  // Dragging completion
  const handleOverlayPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragMode === 'none') return;
    try {
      if (overlayRef.current) {
        overlayRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    setDragMode('none');
    setActiveHandle(null);
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
          Upload or select a document to inspect pages and configure crop margins.
        </p>
      </div>
    );
  }

  // Active crop dimensions in points
  const activeCropW = Math.max(0, Math.round(unscaledW - leftPt - rightPt));
  const activeCropH = Math.max(0, Math.round(unscaledH - topPt - bottomPt));

  // Current effective zoom factor
  const effectiveZoom = zoom;

  // Cropped pixel dimensions for isolated crop preview
  const cropPxLeft = Math.round(leftPt * effectiveZoom);
  const cropPxTop = Math.round(topPt * effectiveZoom);
  const cropPxWidth = Math.max(20, Math.round(activeCropW * effectiveZoom));
  const cropPxHeight = Math.max(20, Math.round(activeCropH * effectiveZoom));

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-slate-100 rounded-none sm:rounded-2xl overflow-hidden border border-slate-200 shadow-xs relative select-none"
    >
      {/* Studio Top Control Toolbar (Identical to original DocuSuite UI) */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 text-slate-700 text-xs shrink-0 z-10">
        {/* Left: Document info & Live Preview badge & Cropped View Toggle */}
        <div className="flex items-center space-x-2.5 truncate max-w-xs sm:max-w-md">
          <span className="font-semibold text-slate-900 truncate">{document.name}</span>
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
            <Sparkles className="w-3 h-3" />
            <span>Live Preview</span>
          </span>

          {/* Toggle between Interactive Crop Frame and Cropped Output Preview */}
          <button
            type="button"
            onClick={() => setIsPreviewCropped((prev) => !prev)}
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isPreviewCropped
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
            title={isPreviewCropped ? 'Return to Crop Selection Frame' : 'Preview Final Cropped PDF'}
          >
            {isPreviewCropped ? <CropIcon className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {isPreviewCropped ? 'Crop Frame' : 'Cropped View'}
            </span>
          </button>
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
          {activePage && (
            <button
              onClick={() => onRotatePage(activePage.id)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Rotate Page (+90°)"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}

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

          <div className="h-4 w-px bg-slate-200 mx-1" />

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

      {/* Main Canvas Viewport */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-auto p-4 sm:p-6 flex relative bg-slate-100/90"
      >
        {/* Loading Spinner */}
        {(isRendering || (!effectivePdfDoc && document.isPdf)) && (
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

        {/* MODE A: CROPPED RESULT PREVIEW (Users immediately see what final output looks like) */}
        {document.isPdf && isPreviewCropped && (
          <div className="m-auto flex flex-col items-center animate-in fade-in duration-150">
            <div
              className="relative shadow-2xl border border-slate-300 rounded-sm overflow-hidden bg-white"
              style={{
                width: `${cropPxWidth}px`,
                height: `${cropPxHeight}px`
              }}
            >
              {/* Canvas shifted to isolate and preview the exact cropped region */}
              <div
                style={{
                  position: 'absolute',
                  left: `-${cropPxLeft}px`,
                  top: `-${cropPxTop}px`,
                  width: `${displayDimensions.width}px`,
                  height: `${displayDimensions.height}px`
                }}
              >
                <canvas ref={canvasRef} className="block w-full h-full pointer-events-none" />
              </div>
            </div>

            <div className="mt-3 flex items-center space-x-2 bg-white/95 px-3 py-1.5 rounded-full border border-slate-200 shadow-xs text-[11px] font-medium text-slate-600">
              <span className="font-bold text-slate-900">Cropped PDF Preview:</span>
              <span className="font-mono">{activeCropW} × {activeCropH} pt</span>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => setIsPreviewCropped(false)}
                className="text-rose-600 hover:text-rose-700 font-semibold cursor-pointer underline"
              >
                Adjust Crop Selection
              </button>
            </div>
          </div>
        )}

        {/* MODE B: INTERACTIVE CROP BOX EDITOR WITH DIMMED SURROUNDINGS */}
        {document.isPdf && !isPreviewCropped && (
          <div
            className="m-auto relative shadow-xl border border-slate-300/80 rounded-sm overflow-hidden transition-transform duration-150 bg-white"
            style={{
              width: `${displayDimensions.width}px`,
              height: `${displayDimensions.height}px`
            }}
          >
            <canvas ref={canvasRef} className="block w-full h-full pointer-events-none" />

            {/* INTERACTIVE CROP OVERLAY */}
            <div
              ref={overlayRef}
              onPointerMove={handleOverlayPointerMove}
              onPointerUp={handleOverlayPointerUp}
              className="absolute inset-0 z-20 touch-none select-none"
            >
              {/* 4 Dimmed Backdrop Rectangles outside crop area */}
              {/* Top Backdrop */}
              <div
                onPointerDown={handleBackdropPointerDown}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: `${cropNorm.y * 100}%`
                }}
                className="bg-slate-950/50 cursor-crosshair hover:bg-slate-950/55 transition-colors"
                title="Click and drag to draw a new crop frame"
              />

              {/* Bottom Backdrop */}
              <div
                onPointerDown={handleBackdropPointerDown}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: `${(cropNorm.y + cropNorm.height) * 100}%`,
                  width: '100%',
                  bottom: 0
                }}
                className="bg-slate-950/50 cursor-crosshair hover:bg-slate-950/55 transition-colors"
                title="Click and drag to draw a new crop frame"
              />

              {/* Left Backdrop */}
              <div
                onPointerDown={handleBackdropPointerDown}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: `${cropNorm.y * 100}%`,
                  width: `${cropNorm.x * 100}%`,
                  height: `${cropNorm.height * 100}%`
                }}
                className="bg-slate-950/50 cursor-crosshair hover:bg-slate-950/55 transition-colors"
                title="Click and drag to draw a new crop frame"
              />

              {/* Right Backdrop */}
              <div
                onPointerDown={handleBackdropPointerDown}
                style={{
                  position: 'absolute',
                  left: `${(cropNorm.x + cropNorm.width) * 100}%`,
                  top: `${cropNorm.y * 100}%`,
                  right: 0,
                  height: `${cropNorm.height * 100}%`
                }}
                className="bg-slate-950/50 cursor-crosshair hover:bg-slate-950/55 transition-colors"
                title="Click and drag to draw a new crop frame"
              />

              {/* The Visible Crop Box */}
              <div
                style={{
                  position: 'absolute',
                  left: `${cropNorm.x * 100}%`,
                  top: `${cropNorm.y * 100}%`,
                  width: `${cropNorm.width * 100}%`,
                  height: `${cropNorm.height * 100}%`
                }}
                className="border-2 border-rose-500 shadow-sm pointer-events-auto"
              >
                {/* Center Drag to Reposition */}
                <div
                  onPointerDown={handleMovePointerDown}
                  className="w-full h-full cursor-move relative flex items-center justify-center bg-transparent group"
                  title="Drag inside to reposition crop box"
                >
                  {/* Rule of thirds grid */}
                  <div className="absolute inset-0 pointer-events-none opacity-40 group-hover:opacity-75 transition-opacity">
                    <div className="absolute left-0 right-0 top-1/3 border-t border-dashed border-white/70" />
                    <div className="absolute left-0 right-0 top-2/3 border-t border-dashed border-white/70" />
                    <div className="absolute top-0 bottom-0 left-1/3 border-l border-dashed border-white/70" />
                    <div className="absolute top-0 bottom-0 left-2/3 border-l border-dashed border-white/70" />
                  </div>

                  {/* Dimension Tag */}
                  <div className="absolute top-1.5 left-1.5 pointer-events-none bg-slate-900/90 text-white text-[10px] font-mono font-semibold px-2 py-0.5 rounded shadow-sm border border-slate-700/80 flex items-center space-x-1 backdrop-blur-[2px]">
                    <span>
                      {activeCropW} × {activeCropH} pt
                    </span>
                  </div>
                </div>

                {/* 8 Resize Handles */}
                {/* Top-Left */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('nw', e)}
                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-nwse-resize z-30"
                  title="Resize Top-Left"
                />
                {/* Top-Right */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('ne', e)}
                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-nesw-resize z-30"
                  title="Resize Top-Right"
                />
                {/* Bottom-Right */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('se', e)}
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-nwse-resize z-30"
                  title="Resize Bottom-Right"
                />
                {/* Bottom-Left */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('sw', e)}
                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-nesw-resize z-30"
                  title="Resize Bottom-Left"
                />

                {/* Top Center */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('n', e)}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-ns-resize z-30"
                  title="Resize Top"
                />
                {/* Bottom Center */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('s', e)}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-ns-resize z-30"
                  title="Resize Bottom"
                />
                {/* Left Center */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('w', e)}
                  className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-ew-resize z-30"
                  title="Resize Left"
                />
                {/* Right Center */}
                <div
                  onPointerDown={(e) => handleResizePointerDown('e', e)}
                  className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-rose-600 rounded-xs shadow-xs cursor-ew-resize z-30"
                  title="Resize Right"
                />
              </div>
            </div>

            {/* Excluded Page Overlay if active page is marked deleted */}
            {activePage?.isDeleted && (
              <div className="absolute inset-0 bg-red-950/75 backdrop-blur-[1px] flex flex-col items-center justify-center text-center p-6 text-white border-2 border-red-500 z-30">
                <Trash2 className="w-10 h-10 text-red-400 mb-2" />
                <span className="font-heading font-bold text-lg">Page Excluded</span>
                <p className="text-xs text-red-200 max-w-xs mt-1">
                  This page is marked for deletion and will be omitted from the output.
                </p>
                <button
                  type="button"
                  onClick={() => onToggleDeletePage(activePage.id)}
                  className="mt-4 px-4 py-2 rounded-lg bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 flex items-center space-x-1.5 shadow-md cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Restore Page</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface CropOutputPreviewProps {
  result: StudioOutputResult;
  toolTitle: string;
  onReset: () => void;
}

/**
 * Dedicated CropOutputPreview:
 * Scoped strictly to Crop PDF.
 * Preserves the exact layout, green verified badges, and green status indicators,
 * while styling the primary "Download Output" button with DocuSuite's crimson/rose theme.
 */
const CropOutputPreview: React.FC<CropOutputPreviewProps> = ({
  result,
  toolTitle,
  onReset
}) => {
  const [selectedOutput, setSelectedOutput] = useState<StudioOutputItem>(
    result.primaryOutput || result.outputFiles[0]
  );

  const fullDownloadUrl = getFullApiUrl(selectedOutput.downloadUrl);

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isPdf = selectedOutput.isPdf || selectedOutput.filename.endsWith('.pdf');

  return (
    <div className="bg-white rounded-3xl border border-emerald-200 shadow-xl overflow-hidden mb-8 animate-in fade-in duration-200">
      {/* Success Banner Header */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent px-6 sm:px-8 py-6 border-b border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          {/* Success Indicator Badge (Kept Green) */}
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight">
                Document Generated & Verified
              </h2>
              {/* Ready Status Badge (Kept Green) */}
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                <Sparkles className="w-3 h-3" />
                <span>Ready</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Processed with {toolTitle}. Zero data retention guarantee active.
            </p>
          </div>
        </div>

        {/* Action Buttons: Primary Download Output styled with crimson/rose DocuSuite theme */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() =>
              triggerFileDownload(selectedOutput.downloadUrl, selectedOutput.filename)
            }
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download Output</span>
          </button>

          <button
            onClick={onReset}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Process Another</span>
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="p-6 sm:p-8 space-y-6">
        {/* Output File Switcher if multiple generated files */}
        {result.outputFiles.length > 1 && (
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center space-x-2 overflow-x-auto">
            <span className="text-xs font-bold text-slate-500 shrink-0 mr-1 flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Outputs ({result.outputFiles.length}):</span>
            </span>
            {result.outputFiles.map((item, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedOutput(item)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedOutput.downloadUrl === item.downloadUrl
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.filename}
              </button>
            ))}
          </div>
        )}

        {/* Output Viewport */}
        <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center justify-center min-h-[420px] p-4 sm:p-6 relative">
          {isPdf ? (
            <PdfOutputViewer
              downloadUrl={fullDownloadUrl}
              filename={selectedOutput.filename}
              size={selectedOutput.size}
              formatSize={formatSize}
            />
          ) : (
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-800 shadow-md">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4 border border-slate-200">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-slate-900 text-lg">
                {selectedOutput.filename}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Output ready for immediate download.
              </p>
              <div className="mt-6">
                <button
                  onClick={() =>
                    triggerFileDownload(selectedOutput.downloadUrl, selectedOutput.filename)
                  }
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Output File</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Main CropWorkspace component:
 * Restores 100% of the original DocuSuite Crop PDF page layout, header,
 * breadcrumbs, 8/4 grid, sidebar, page thumbnails, and output preview,
 * while seamlessly incorporating interactive cropping, page scope selection,
 * and live cropped preview.
 */
export const CropWorkspace: React.FC<CropWorkspaceProps> = ({ tool }) => {
  const {
    documents,
    activeDocument,
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
    setActivePageIndex,
    rotatePage,
    rotateSelected,
    toggleDeletePage,
    deleteSelected,
    reorderPage,
    togglePageSelection,
    selectAllPages,
    clearSelection,
    selectRange,
    undo,
    redo,
    setZoom,
    setZoomMode,
    setParameter,
    executeProcess,
    resetWorkspace,
    dismissError
  } = useDocumentStudio({ tool });

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-page custom crops memory when pages are customized individually
  const [pageCrops, setPageCrops] = useState<Record<number, { top: number; bottom: number; left: number; right: number }>>({});

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
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Synchronize margins from visual crop dragging to studio parameters
  const handleMarginChange = useCallback(
    (margins: { top: number; bottom: number; left: number; right: number }) => {
      setParameter('top', margins.top);
      setParameter('bottom', margins.bottom);
      setParameter('left', margins.left);
      setParameter('right', margins.right);

      const scope = parameters.scope || 'all';
      if (scope !== 'all') {
        setPageCrops((prev) => {
          const updated = { ...prev, [activePageIndex]: margins };
          setParameter('pageCrops', updated);
          return updated;
        });
      }
    },
    [activePageIndex, parameters.scope, setParameter]
  );

  // Load custom crop for active page if exists
  useEffect(() => {
    const scope = parameters.scope || 'all';
    if (scope !== 'all' && pageCrops[activePageIndex]) {
      const pCrop = pageCrops[activePageIndex];
      setParameter('top', pCrop.top);
      setParameter('bottom', pCrop.bottom);
      setParameter('left', pCrop.left);
      setParameter('right', pCrop.right);
    }
  }, [activePageIndex, parameters.scope, pageCrops, setParameter]);

  const activeScope = parameters.scope || 'all';

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb (Identical to original DocuSuite UI) */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={tool.isConversion ? '/convert' : '/tools'}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to {tool.isConversion ? 'Conversions' : 'PDF Tools'}</span>
          </Link>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
              {tool.category}
            </span>
          </div>
        </div>

        {/* Tool Header Banner (Identical to original DocuSuite UI) */}
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
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                    <Sparkles className="w-3 h-3 text-rose-500" />
                    <span>Interactive Studio</span>
                  </span>
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

            {/* Capacity & Format badges */}
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

        {/* Post-Processing Output Preview with DocuSuite primary button styling */}
        {outputResult && (
          <CropOutputPreview
            result={outputResult}
            toolTitle={tool.title}
            onReset={resetWorkspace}
          />
        )}

        {/* Active Workspace */}
        {!outputResult && (
          <div className="space-y-6">
            <input
              ref={fileInputRef}
              type="file"
              id="studio-file-input"
              data-testid="studio-file-input"
              multiple={tool.maxFiles > 1}
              accept={tool.accept.join(',')}
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Dropzone State (Identical to original DocuSuite UI) */}
            {documents.length === 0 && (
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
                  {isDragging ? 'Drop your documents right here' : 'Select documents to preview and edit'}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                  Supports {tool.accept.join(', ')} up to 50MB per file. Inspect pages, reorder,
                  and rotate in real time before processing.
                </p>

                <div className="mt-6">
                  <span className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                    <Plus className="w-4 h-4" />
                    <span>Choose from Device</span>
                  </span>
                </div>
              </div>
            )}

            {/* If files uploaded: Interactive 2-Column Workspace (Cols 8 / Cols 4) */}
            {documents.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* LEFT: Document Viewer with Live Interactive Crop Overlay & PageManager */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Scope Selector Bar directly above viewer */}
                  {activePages.length > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                          <Layers className="w-4 h-4 text-rose-600" />
                          <span>Apply Crop To:</span>
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setParameter('scope', 'all')}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            activeScope === 'all'
                              ? 'bg-white text-rose-600 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          All Pages ({activePages.length})
                        </button>

                        <button
                          type="button"
                          onClick={() => setParameter('scope', 'current')}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            activeScope === 'current'
                              ? 'bg-white text-rose-600 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Current Page ({activePageIndex})
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setParameter('scope', 'selected');
                            if (selectedPageIds.size === 0 && activePage) {
                              togglePageSelection(activePage.id);
                            }
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            activeScope === 'selected'
                              ? 'bg-white text-rose-600 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Selected Pages ({selectedPageIds.size})
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="h-[520px] sm:h-[580px] w-full">
                    <CropDocumentViewer
                      document={activeDocument}
                      activePdfDoc={activePdfDoc}
                      activePage={activePage}
                      activePageIndex={activePageIndex}
                      totalPages={activePages.length}
                      zoom={zoom}
                      zoomMode={zoomMode}
                      parameters={parameters}
                      onPageChange={setActivePageIndex}
                      onZoomChange={setZoom}
                      onZoomModeChange={setZoomMode}
                      onRotatePage={rotatePage}
                      onToggleDeletePage={toggleDeletePage}
                      onMarginChange={handleMarginChange}
                    />
                  </div>

                  {/* Standard PageManager Thumbnail Strip below Viewer */}
                  {activeDocument && activeDocument.isPdf && activePages.length > 0 && (
                    <PageManager
                      pages={activePages}
                      activePdfDoc={activePdfDoc}
                      activePageIndex={activePageIndex}
                      selectedPageIds={selectedPageIds}
                      canUndo={canUndo}
                      canRedo={canRedo}
                      onPageSelect={setActivePageIndex}
                      onToggleSelection={togglePageSelection}
                      onSelectAll={selectAllPages}
                      onClearSelection={clearSelection}
                      onSelectRange={selectRange}
                      onRotatePage={rotatePage}
                      onRotateSelected={rotateSelected}
                      onToggleDeletePage={toggleDeletePage}
                      onDeleteSelected={deleteSelected}
                      onReorderPage={reorderPage}
                      onUndo={undo}
                      onRedo={redo}
                    />
                  )}
                </div>

                {/* RIGHT: Original StudioControls Sidebar (Cols 4 sticky) */}
                <div className="lg:col-span-4 sticky top-24">
                  <StudioControls
                    tool={tool}
                    documents={documents}
                    activeDocument={activeDocument}
                    parameters={parameters}
                    processingState={processingState}
                    onParameterChange={setParameter}
                    onExecute={executeProcess}
                    onDismissError={dismissError}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CropWorkspace;