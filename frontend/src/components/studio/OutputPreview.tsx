'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Table,
  Archive,
  Layers,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Loader2
} from 'lucide-react';
import { StudioOutputResult, StudioOutputItem } from './types';
import { triggerFileDownload, getFullApiUrl } from '@/lib/api-client';
import { loadPdfDocument, renderPageToCanvas } from './pdf-loader';

interface OutputPreviewProps {
  result: StudioOutputResult;
  toolTitle: string;
  onReset: () => void;
}

/**
 * Individual PDF Page Canvas inside the multi-page scrollable viewport
 */
const PdfPageCanvas: React.FC<{
  pdfDoc: any;
  pageNumber: number;
  scale: number;
  totalCount: number;
}> = ({ pdfDoc, pageNumber, scale, totalCount }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendering, setIsRendering] = useState<boolean>(true);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    setIsRendering(true);
    const canvas = canvasRef.current;
    const task = renderPageToCanvas(pdfDoc, pageNumber, canvas, { scale });

    task.promise
      .then(() => setIsRendering(false))
      .catch((err: any) => {
        if (err?.name !== 'RenderingCancelledException') {
          setIsRendering(false);
        }
      });

    return () => {
      task.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative shadow-md border border-slate-300/80 rounded-sm overflow-hidden bg-white">
        <canvas ref={canvasRef} className="block bg-white" />
        {isRendering && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
          </div>
        )}
      </div>
      {totalCount > 1 && (
        <span className="text-[11px] font-medium text-slate-500 mt-2 bg-white/90 px-2.5 py-0.5 rounded-full border border-slate-200 shadow-2xs">
          Page {pageNumber} of {totalCount}
        </span>
      )}
    </div>
  );
};

/**
 * PDF.js based light-theme multi-page scrollable previewer
 */
export const PdfOutputViewer: React.FC<{
  downloadUrl: string;
  filename: string;
  size?: number;
  formatSize: (bytes?: number) => string;
}> = ({ downloadUrl, filename, size, formatSize }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [baseWidth, setBaseWidth] = useState<number>(595);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [fitWidth, setFitWidth] = useState<boolean>(true);
  const fullUrl = getFullApiUrl(downloadUrl);

  // Load PDF document from binary data
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(fullUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (isCancelled) return;
        const loaded = await loadPdfDocument(buf);
        if (isCancelled) return;

        setPdfDoc(loaded);
        setPageCount(loaded.numPages || 1);

        try {
          const p1 = await loaded.getPage(1);
          const vp = p1.getViewport({ scale: 1 });
          if (!isCancelled && vp.width) {
            setBaseWidth(vp.width);
          }
        } catch {
          // fallback
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err?.message || 'Failed to load PDF preview');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [downloadUrl]);

  // Compute fit-width scale based on container width
  const calculateFitScale = useCallback(() => {
    if (!scrollContainerRef.current) return 1.0;
    const containerWidth = scrollContainerRef.current.clientWidth - 48; // padding
    const targetWidth = Math.max(containerWidth, 280);
    const calculated = targetWidth / baseWidth;
    return Math.min(Math.max(calculated, 0.4), 2.0);
  }, [baseWidth]);

  // Dynamically update scale when fitWidth is active or on container resize
  useEffect(() => {
    if (!fitWidth) return;
    const updateZoom = () => {
      const newScale = calculateFitScale();
      setZoom(newScale);
    };

    updateZoom();

    if (!scrollContainerRef.current) return;
    const observer = new ResizeObserver(updateZoom);
    observer.observe(scrollContainerRef.current);
    return () => observer.disconnect();
  }, [fitWidth, calculateFitScale]);

  const handleZoomIn = () => {
    setFitWidth(false);
    setZoom((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 2.2));
  };

  const handleZoomOut = () => {
    setFitWidth(false);
    setZoom((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.4));
  };

  const handleFitWidthToggle = () => {
    setFitWidth(true);
    const newScale = calculateFitScale();
    setZoom(newScale);
  };

  if (error) {
    return (
      <div className="w-full flex flex-col items-center space-y-4">
        <div className="w-full max-w-3xl h-[600px] rounded-xl overflow-hidden border border-slate-200 bg-white shadow-md relative">
          <iframe
            src={`${fullUrl}${fullUrl.includes('?') ? '&' : '?'}preview=true#toolbar=0&navpanes=0&view=FitH`}
            title="PDF Preview Fallback"
            className="w-full h-full border-0 bg-white"
          />
        </div>
        <div className="flex items-center space-x-3 text-xs text-slate-500">
          <span>{filename}</span>
          {size && <span>• {formatSize(size)}</span>}
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in New Tab</span>
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-3xl h-[520px] rounded-2xl border border-slate-200 bg-white flex flex-col items-center justify-center space-y-3 shadow-xs">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <span className="text-xs font-medium text-slate-600">
          Loading verified PDF preview...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl flex flex-col rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden">
      {/* Viewer Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-slate-700 text-xs shrink-0">
        {/* Left: File info & verified page badge */}
        <div className="flex items-center space-x-2.5 truncate max-w-xs sm:max-w-md">
          <span className="font-semibold text-slate-900 truncate" title={filename}>
            {filename}
          </span>
          {size && (
            <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
              {formatSize(size)}
            </span>
          )}
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{pageCount} {pageCount === 1 ? 'Page' : 'Pages'}</span>
          </span>
        </div>

        {/* Center / Right: Zoom & Navigation Controls */}
        <div className="flex items-center space-x-2">
          {/* Fit Width Button */}
          <button
            type="button"
            onClick={handleFitWidthToggle}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              fitWidth
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 border border-transparent'
            }`}
            title="Fit to Width"
          >
            Fit Width
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* Zoom Out */}
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-xs text-slate-700 font-semibold w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>

          {/* Zoom In */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* Open Fullscreen Link */}
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors"
            title="Open in New Tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fullscreen</span>
          </a>
        </div>
      </div>

      {/* Multi-Page Canvas Viewport with Smooth Native Scrolling */}
      <div
        ref={scrollContainerRef}
        className="w-full max-h-[640px] sm:max-h-[720px] overflow-y-auto p-4 sm:p-6 flex flex-col items-center space-y-6 bg-slate-100/90"
      >
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
          <PdfPageCanvas
            key={pageNum}
            pdfDoc={pdfDoc}
            pageNumber={pageNum}
            scale={zoom}
            totalCount={pageCount}
          />
        ))}
      </div>
    </div>
  );
};

export const OutputPreview: React.FC<OutputPreviewProps> = ({
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
  const isImage =
    selectedOutput.isImage ||
    /\.(jpe?g|png|webp|svg)$/i.test(selectedOutput.filename);
  const isExcel = /\.(xlsx?|csv)$/i.test(selectedOutput.filename);
  const isArchive = /\.zip$/i.test(selectedOutput.filename);
  const isWord = /\.(docx?|rtf|odt)$/i.test(selectedOutput.filename);

  return (
    <div className="bg-white rounded-3xl border border-emerald-200 shadow-xl overflow-hidden mb-8 animate-in fade-in duration-200">
      {/* Success Banner Header */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent px-6 sm:px-8 py-6 border-b border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight">
                Document Generated & Verified
              </h2>
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

        {/* Global actions */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() =>
              triggerFileDownload(selectedOutput.downloadUrl, selectedOutput.filename)
            }
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
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
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedOutput.downloadUrl === item.downloadUrl
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.filename}
              </button>
            ))}
          </div>
        )}

        {/* Output Viewport depending on file type */}
        <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col items-center justify-center min-h-[420px] p-4 sm:p-6 relative">
          {/* PDF Multi-Page Canvas Viewer */}
          {isPdf && (
            <PdfOutputViewer
              downloadUrl={fullDownloadUrl}
              filename={selectedOutput.filename}
              size={selectedOutput.size}
              formatSize={formatSize}
            />
          )}

          {/* Image Viewer */}
          {isImage && (
            <div className="flex flex-col items-center justify-center space-y-4 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fullDownloadUrl}
                alt={selectedOutput.filename}
                className="max-h-[460px] max-w-full rounded-xl shadow-md border border-slate-200 object-contain bg-white"
              />
              <span className="text-xs text-slate-500 font-mono">
                {selectedOutput.filename}
              </span>
            </div>
          )}

          {/* Excel / CSV Spreadsheet View */}
          {isExcel && (
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-800 shadow-md">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Table className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-slate-900 text-lg">
                Spreadsheet Ready
              </h3>
              <p className="text-xs text-slate-500 mt-1">{selectedOutput.filename}</p>
              <p className="text-xs text-slate-600 mt-2">
                Table extraction verified. Ready to open in Excel, Numbers, or Google Sheets.
              </p>
              <div className="mt-6">
                <button
                  onClick={() =>
                    triggerFileDownload(selectedOutput.downloadUrl, selectedOutput.filename)
                  }
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .xlsx File</span>
                </button>
              </div>
            </div>
          )}

          {/* Archive / ZIP View */}
          {isArchive && (
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-800 shadow-md">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
                <Archive className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-slate-900 text-lg">
                Archive Generated
              </h3>
              <p className="text-xs text-slate-500 mt-1">{selectedOutput.filename}</p>
              <p className="text-xs text-slate-600 mt-2">
                Contains all generated pages bundled into a single ZIP archive.
              </p>
              <div className="mt-6">
                <button
                  onClick={() =>
                    triggerFileDownload(selectedOutput.downloadUrl, selectedOutput.filename)
                  }
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-rose-600 hover:bg-rose-700 shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .zip Archive</span>
                </button>
              </div>
            </div>
          )}

          {/* Generic Document View */}
          {!isPdf && !isImage && !isExcel && !isArchive && (
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
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all flex items-center justify-center space-x-2"
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
