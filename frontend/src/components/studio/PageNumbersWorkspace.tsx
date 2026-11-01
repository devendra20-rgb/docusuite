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
  UploadCloud,
  ArrowLeft,
  Download,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Plus,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Hash,
  Eye,
  LayoutGrid
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import {
  submitDocumentJob,
  triggerFileDownload,
  getFullApiUrl,
  saveSessionHistoryItem
} from '@/lib/api-client';
import {
  loadPdfDocument,
  renderPageToCanvas,
  generatePageThumbnail,
  ActiveRenderTask
} from './pdf-loader';
import { PdfOutputViewer } from './OutputPreview';

interface PageNumbersWorkspaceProps {
  tool: ToolDefinition;
}

interface PageNumbersOutputResult {
  jobId: string;
  downloadUrl: string;
  filename: string;
  size: number;
}

type NumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left';

type NumberFormat = 'page_of_total' | 'page_number' | 'number_only';
type FontFamily = 'helvetica' | 'helvetica-bold' | 'times' | 'courier';
type BackgroundStyle = 'none' | 'white' | 'dark';
type PageScope = 'all' | 'odd' | 'even' | 'custom';
type ZoomMode = 'fit-page' | 'fit-width' | 'custom';

const COLOR_PRESETS = [
  { label: 'Charcoal', value: '#1F2937' },
  { label: 'Black', value: '#000000' },
  { label: 'Navy', value: '#1E3A8A' },
  { label: 'Crimson', value: '#E11D48' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Emerald', value: '#059669' },
  { label: 'White', value: '#FFFFFF' }
];

export const PageNumbersWorkspace: React.FC<PageNumbersWorkspaceProps> = ({ tool }) => {
  // Document state
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [activePageIndex, setActivePageIndex] = useState<number>(1);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Viewer and auto-zoom state
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-page');
  const [zoom, setZoom] = useState<number>(1.0);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRenderTaskRef = useRef<ActiveRenderTask | null>(null);
  const renderSequenceRef = useRef<number>(0);
  const pageSizeRef = useRef<{ width: number; height: number }>({ width: 595, height: 842 });

  // Dimension state for rendered page in CSS display pixels
  const [renderedDimensions, setRenderedDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });

  // Settings state
  const [position, setPosition] = useState<NumberPosition>('bottom-center');
  const [format, setFormat] = useState<NumberFormat>('page_of_total');
  const [fontSize, setFontSize] = useState<number>(11);
  const [font, setFont] = useState<FontFamily>('helvetica');
  const [color, setColor] = useState<string>('#1F2937');
  const [background, setBackground] = useState<BackgroundStyle>('none');

  // Margin settings
  const [margin, setMargin] = useState<number>(20);
  const [useCustomMargins, setUseCustomMargins] = useState<boolean>(false);
  const [marginTop, setMarginTop] = useState<number>(20);
  const [marginBottom, setMarginBottom] = useState<number>(20);
  const [marginLeft, setMarginLeft] = useState<number>(20);
  const [marginRight, setMarginRight] = useState<number>(20);

  // Range and sequencing settings
  const [scope, setScope] = useState<PageScope>('all');
  const [customRange, setCustomRange] = useState<string>('');
  const [skipFirst, setSkipFirst] = useState<boolean>(false);
  const [startNumber, setStartNumber] = useState<number>(1);

  // Processing & Output state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [outputResult, setOutputResult] = useState<PageNumbersOutputResult | null>(null);

  // Parse page range into a list of 1-indexed numbers
  const targetPages = useMemo(() => {
    if (totalPages === 0) return [];
    let pages: number[] = [];

    if (scope === 'all') {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (scope === 'odd') {
      for (let i = 1; i <= totalPages; i += 2) pages.push(i);
    } else if (scope === 'even') {
      for (let i = 2; i <= totalPages; i += 2) pages.push(i);
    } else if (scope === 'custom') {
      const parts = customRange.split(',');
      const parsedSet = new Set<number>();
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (trimmed.includes('-')) {
          const [s, e] = trimmed.split('-').map(Number);
          if (!isNaN(s) && !isNaN(e)) {
            for (let i = Math.min(s, e); i <= Math.max(s, e); i++) {
              if (i >= 1 && i <= totalPages) parsedSet.add(i);
            }
          }
        } else {
          const num = Number(trimmed);
          if (!isNaN(num) && num >= 1 && num <= totalPages) {
            parsedSet.add(num);
          }
        }
      }
      pages = Array.from(parsedSet).sort((a, b) => a - b);
    }

    if (skipFirst) {
      pages = pages.filter((p) => p !== 1);
    }

    return pages;
  }, [totalPages, scope, customRange, skipFirst]);

  // Compute total count for "Page X of Y"
  const totalNumberedCount = useMemo(() => {
    if (targetPages.length === 0) return totalPages;
    return startNumber > 1 ? startNumber + targetPages.length - 1 : targetPages.length;
  }, [startNumber, targetPages.length, totalPages]);

  // Compute page number for a given page index
  const getPageNumberInfo = useCallback(
    (pageNum: number) => {
      const targetIndex = targetPages.indexOf(pageNum);
      const isIncluded = targetIndex !== -1;
      const isFirstSkipped = skipFirst && pageNum === 1;

      if (!isIncluded) {
        return { isIncluded: false, isFirstSkipped, text: '' };
      }

      const num = startNumber + targetIndex;
      let text = '';
      if (format === 'page_of_total') {
        text = `Page ${num} of ${totalNumberedCount}`;
      } else if (format === 'page_number') {
        text = `Page ${num}`;
      } else {
        text = `${num}`;
      }

      return { isIncluded: true, isFirstSkipped: false, text, num };
    },
    [targetPages, skipFirst, startNumber, format, totalNumberedCount]
  );

  // Auto-zoom calculation that fits the complete PDF page within the viewport without clipping
  const calculateAutoZoom = useCallback(
    (mode: 'fit-page' | 'fit-width', customWidth?: number, customHeight?: number): number => {
      const viewport = viewportRef.current || containerRef.current;
      if (!viewport) return 1.0;

      const pW = customWidth || pageSizeRef.current.width || 595;
      const pH = customHeight || pageSizeRef.current.height || 842;

      // Available dimensions excluding padding & margins
      const isSmall = viewport.clientWidth < 640;
      const padH = isSmall ? 28 : 48;
      const padV = isSmall ? 28 : 48;
      const availWidth = Math.max(100, viewport.clientWidth - padH);
      const availHeight = Math.max(100, viewport.clientHeight - padV);

      if (mode === 'fit-width') {
        const calculated = availWidth / pW;
        return Number(Math.min(Math.max(calculated, 0.2), 3.0).toFixed(3));
      }
      if (mode === 'fit-page') {
        const scaleW = availWidth / pW;
        const scaleH = availHeight / pH;
        // Limiting dimension ensures complete page fits without any clipping or aspect ratio distortion
        const calculated = Math.min(scaleW, scaleH);
        return Number(Math.min(Math.max(calculated, 0.2), 3.0).toFixed(3));
      }
      return 1.0;
    },
    []
  );

  // Load PDF file
  const loadPdf = useCallback(
    async (selectedFile: File) => {
      setIsLoadingPdf(true);
      setError(null);
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const doc = await loadPdfDocument(arrayBuffer);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setActivePageIndex(1);
        setFile(selectedFile);

        // Fetch page 1 dimensions to calculate initial fit-page auto zoom
        const firstPage = await doc.getPage(1);
        const unscaledViewport = firstPage.getViewport({
          scale: 1,
          rotation: firstPage.rotate || 0
        });
        pageSizeRef.current = { width: unscaledViewport.width, height: unscaledViewport.height };

        const initialZoom = calculateAutoZoom(
          'fit-page',
          unscaledViewport.width,
          unscaledViewport.height
        );
        setZoomMode('fit-page');
        setZoom(initialZoom);

        // Generate thumbnails asynchronously
        const newThumbs: Record<number, string> = {};
        const count = Math.min(doc.numPages, 12);
        for (let i = 1; i <= count; i++) {
          try {
            const thumbUrl = await generatePageThumbnail(doc, i, 140);
            newThumbs[i] = thumbUrl;
          } catch {
            // ignore individual thumbnail failure
          }
        }
        setThumbnails(newThumbs);
      } catch (err: any) {
        setError(err?.message || 'Failed to load PDF document. Please try another file.');
      } finally {
        setIsLoadingPdf(false);
      }
    },
    [calculateAutoZoom]
  );

  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      loadPdf(selected);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      loadPdf(droppedFile);
    }
  };

  // Render active page to canvas with exact scale and crisp resolution
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCancelled = false;
    const currentSeq = ++renderSequenceRef.current;
    setIsRenderingPage(true);

    (async () => {
      try {
        const page = await pdfDoc.getPage(activePageIndex);
        if (isCancelled) return;

        const unscaledViewport = page.getViewport({
          scale: 1,
          rotation: page.rotate || 0
        });
        pageSizeRef.current = { width: unscaledViewport.width, height: unscaledViewport.height };

        let targetZoom = zoom;
        if (zoomMode !== 'custom') {
          targetZoom = calculateAutoZoom(zoomMode, unscaledViewport.width, unscaledViewport.height);
          if (Math.abs(targetZoom - zoom) > 0.01) {
            setZoom(targetZoom);
          }
        }

        if (!canvasRef.current || isCancelled) return;
        const canvas = canvasRef.current;

        // Cancel previous render task
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
          activeRenderTaskRef.current = null;
        }

        const task = renderPageToCanvas(pdfDoc, activePageIndex, canvas, { scale: targetZoom });
        activeRenderTaskRef.current = task;
        await task.promise;

        if (!isCancelled && currentSeq === renderSequenceRef.current) {
          setIsRenderingPage(false);
          setRenderedDimensions({
            width: Math.floor(unscaledViewport.width * targetZoom),
            height: Math.floor(unscaledViewport.height * targetZoom)
          });
        }
      } catch (err: any) {
        if (!isCancelled && currentSeq === renderSequenceRef.current) {
          if (err?.name !== 'RenderingCancelledException') {
            setError(err?.message || 'Failed to render PDF page');
          }
          setIsRenderingPage(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, activePageIndex, zoom, zoomMode, calculateAutoZoom]);

  // Viewport resize observer to maintain fit-page or fit-width automatically
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || zoomMode === 'custom') return;

    const handleResize = () => {
      const newZoom = calculateAutoZoom(zoomMode);
      if (Math.abs(newZoom - zoom) > 0.02) {
        setZoom(newZoom);
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [zoomMode, calculateAutoZoom, zoom]);

  // Reset scroll position when page changes
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      viewportRef.current.scrollLeft = 0;
    }
  }, [activePageIndex]);

  // Toolbar zoom handlers
  const handleFitPage = () => {
    setZoomMode('fit-page');
    const autoScale = calculateAutoZoom('fit-page');
    setZoom(autoScale);
  };

  const handleFitWidth = () => {
    setZoomMode('fit-width');
    const autoScale = calculateAutoZoom('fit-width');
    setZoom(autoScale);
  };

  const handleZoomIn = () => {
    setZoomMode('custom');
    setZoom((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setZoom((z) => Math.max(0.2, Number((z - 0.15).toFixed(2))));
  };

  // Reset workspace
  const handleReset = () => {
    setFile(null);
    setPdfDoc(null);
    setTotalPages(0);
    setActivePageIndex(1);
    setThumbnails({});
    setOutputResult(null);
    setError(null);
    setIsProcessing(false);
  };

  // Submit and process
  const handleProcess = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingMessage('Configuring engine parameters...');
    setError(null);

    try {
      const payload: Record<string, any> = {
        format,
        position,
        fontSize,
        startNumber,
        skipFirst,
        font,
        color,
        background
      };

      if (useCustomMargins) {
        payload.marginTop = marginTop;
        payload.marginBottom = marginBottom;
        payload.marginLeft = marginLeft;
        payload.marginRight = marginRight;
      } else {
        payload.margin = margin;
      }

      if (scope !== 'all') {
        payload.pages = targetPages;
      }

      const res = await submitDocumentJob(tool.endpoint, [file], payload, {
        onProgress: (p, stage) => {
          setProcessingProgress(p);
          setProcessingMessage(stage || 'Adding page numbers...');
        }
      });

      if (res.success && res.downloadUrl) {
        const out: PageNumbersOutputResult = {
          jobId: res.jobId || '',
          downloadUrl: res.downloadUrl,
          filename: res.outputFiles?.[0]?.filename || `numbered-${file.name}`,
          size: res.outputFiles?.[0]?.size || file.size
        };

        saveSessionHistoryItem({
          jobId: res.jobId || '',
          toolId: tool.id,
          toolTitle: tool.title,
          inputFiles: [{ name: file.name, size: file.size }],
          outputFiles: [{ name: out.filename, downloadUrl: out.downloadUrl }],
          status: 'completed'
        });

        setOutputResult(out);
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
        throw new Error(
          (res as any).message || (res as any).error || 'Processing completed without output.'
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to add page numbers to PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate live preview badge positioning on canvas
  const effectiveMargin = useCustomMargins
    ? { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight }
    : { top: margin, bottom: margin, left: margin, right: margin };

  const activePageInfo = getPageNumberInfo(activePageIndex);

  // Position coordinates styling for preview badge directly on canvas
  const getBadgePositionStyle = (): React.CSSProperties => {
    const scaleFactor = zoom;
    const top = effectiveMargin.top * scaleFactor;
    const bottom = effectiveMargin.bottom * scaleFactor;
    const left = effectiveMargin.left * scaleFactor;
    const right = effectiveMargin.right * scaleFactor;

    switch (position) {
      case 'top-left':
        return { top: `${top}px`, left: `${left}px` };
      case 'top-center':
        return { top: `${top}px`, left: '50%', transform: 'translateX(-50%)' };
      case 'top-right':
        return { top: `${top}px`, right: `${right}px` };
      case 'bottom-left':
        return { bottom: `${bottom}px`, left: `${left}px` };
      case 'bottom-center':
        return { bottom: `${bottom}px`, left: '50%', transform: 'translateX(-50%)' };
      case 'bottom-right':
        return { bottom: `${bottom}px`, right: `${right}px` };
    }
  };

  const getFontFamilyClass = () => {
    switch (font) {
      case 'helvetica-bold':
        return 'font-sans font-bold';
      case 'times':
        return 'font-serif';
      case 'courier':
        return 'font-mono font-medium';
      case 'helvetica':
      default:
        return 'font-sans font-medium';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* Studio Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-2xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="p-2 -ml-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
              title="Back to Tools"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shadow-2xs">
                <ToolIcon name={tool.iconName} className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-heading font-bold text-base sm:text-lg text-slate-900 flex items-center space-x-2">
                  <span>{tool.title}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">
                    Live Studio
                  </span>
                </h1>
                <p className="text-xs text-slate-500 hidden sm:block">{tool.shortDesc}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {file && !outputResult && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Change File</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Output Screen */}
        {outputResult && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden transition-all duration-300">
            {/* Success Header */}
            <div className="p-6 sm:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/40">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shadow-xs shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="font-heading font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight">
                      Page Numbers Applied & Verified
                    </h2>
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      <Sparkles className="w-3 h-3" />
                      <span>Ready</span>
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    Numbered {targetPages.length} of {totalPages} pages with {tool.title}. Zero data
                    retention guarantee active.
                  </p>
                </div>
              </div>

              {/* Action Buttons: DocuSuite Primary Rose Button */}
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() =>
                    triggerFileDownload(outputResult.downloadUrl, outputResult.filename)
                  }
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Output</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Number Another</span>
                </button>
              </div>
            </div>

            {/* Verified Multi-page PDF Viewer */}
            <div className="p-6 sm:p-8 flex flex-col items-center justify-center min-h-[440px] bg-slate-50/70">
              <PdfOutputViewer
                downloadUrl={getFullApiUrl(outputResult.downloadUrl)}
                filename={outputResult.filename}
                size={outputResult.size}
                formatSize={(bytes) => {
                  if (typeof bytes !== 'number') return '';
                  return bytes < 1024 * 1024
                    ? `${(bytes / 1024).toFixed(1)} KB`
                    : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
                }}
              />
            </div>
          </div>
        )}

        {/* Upload Dropzone */}
        {!outputResult && !file && (
          <div className="space-y-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

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
                {isDragging ? 'Drop your PDF right here' : 'Select a PDF to add page numbers'}
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                Upload your document to customize pagination, preview placements in real time, and
                format headers or footers before processing.
              </p>

              <div className="mt-6">
                <span className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                  <Plus className="w-4 h-4" />
                  <span>Choose PDF Document</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Active Studio Workspace */}
        {!outputResult && file && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT: Clean, Bright PDF Document Viewer with Zero Dimming and Full Fit */}
            <div className="lg:col-span-8 space-y-4">
              {/* Viewer Container */}
              <div
                ref={containerRef}
                className="bg-slate-100 rounded-none sm:rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[560px] sm:h-[620px] select-none"
              >
                {/* Top Viewer Toolbar: Clean DocuSuite Bright Studio Bar */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 text-slate-700 text-xs shrink-0 z-10">
                  {/* Left: Page Navigator */}
                  <div className="flex items-center space-x-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setActivePageIndex((p) => Math.max(1, p - 1))}
                      disabled={activePageIndex <= 1}
                      className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <span className="font-mono text-slate-700 font-semibold px-1.5 text-xs">
                      Page {activePageIndex} of {totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setActivePageIndex((p) => Math.min(totalPages, p + 1))}
                      disabled={activePageIndex >= totalPages}
                      className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      title="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Center: Live Preview Indicator Badge */}
                  <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-medium">
                    <Eye className="w-3.5 h-3.5 text-rose-600" />
                    <span>Live Page Number Preview</span>
                  </div>

                  {/* Right: Zoom & Fit Controls */}
                  <div className="flex items-center space-x-1.5">
                    {/* Fit Page */}
                    <button
                      type="button"
                      onClick={handleFitPage}
                      className={`p-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        zoomMode === 'fit-page'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                      }`}
                      title="Fit to Page (Complete page visible)"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>

                    {/* Fit Width */}
                    <button
                      type="button"
                      onClick={handleFitWidth}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        zoomMode === 'fit-width'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
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
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>

                    {/* Zoom Percentage */}
                    <span className="font-mono text-xs text-slate-700 font-semibold w-12 text-center">
                      {Math.round(zoom * 100)}%
                    </span>

                    {/* Zoom In */}
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Viewport Area: Light Gray Canvas Background with m-auto to eliminate flex overflow clipping */}
                <div
                  ref={viewportRef}
                  className="flex-1 overflow-auto p-4 sm:p-6 flex relative bg-slate-100/90"
                >
                  {/* Non-intrusive loading overlay when loading or rendering */}
                  {(isRenderingPage || isLoadingPdf) && (
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-20 transition-opacity">
                      <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs shadow-lg">
                        <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                        <span>
                          {isLoadingPdf
                            ? 'Loading PDF document...'
                            : 'Rendering vector page...'}
                        </span>
                      </div>
                    </div>
                  )}

                  {!isLoadingPdf && (
                    /* The PDF page card: m-auto guarantees centered placement when fitting and zero clipping when scrolling */
                    <div
                      className="m-auto relative shadow-xl border border-slate-300/80 rounded-sm overflow-hidden bg-white transition-transform duration-100"
                      style={{
                        width: renderedDimensions.width > 0 ? `${renderedDimensions.width}px` : undefined,
                        height: renderedDimensions.height > 0 ? `${renderedDimensions.height}px` : undefined
                      }}
                    >
                      {/* PDF Canvas: Rendered in 100% natural colors and brightness */}
                      <canvas
                        ref={canvasRef}
                        className="block w-full h-full bg-white select-none pointer-events-none"
                      />

                      {/* LIVE PAGE NUMBER BADGE OVERLAY: Only this overlay sits on top of the document */}
                      {!isRenderingPage && activePageInfo.isIncluded && (
                        <div
                          style={{
                            ...getBadgePositionStyle(),
                            fontSize: `${Math.max(8, Math.round(fontSize * zoom))}px`,
                            color: color
                          }}
                          className={`absolute z-20 pointer-events-none select-none transition-all duration-150 ${getFontFamilyClass()} ${
                            background === 'white'
                              ? 'bg-white text-slate-900 border border-slate-300/80 shadow-md px-2 py-0.5 rounded-sm'
                              : background === 'dark'
                              ? 'bg-slate-900/90 text-white border border-slate-700 shadow-md px-2 py-0.5 rounded-sm'
                              : 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]'
                          }`}
                        >
                          {activePageInfo.text}
                        </div>
                      )}

                      {/* Visual indicator badge when current page is excluded from pagination */}
                      {!isRenderingPage && !activePageInfo.isIncluded && (
                        <div
                          style={getBadgePositionStyle()}
                          className="absolute z-20 pointer-events-none select-none px-2.5 py-1 rounded bg-amber-500/10 border border-dashed border-amber-500/60 text-[11px] text-amber-800 font-sans font-medium shadow-xs backdrop-blur-xs"
                        >
                          {activePageInfo.isFirstSkipped
                            ? 'Cover Page (Unnumbered)'
                            : 'Excluded from Page Range'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Page Thumbnails Bar */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                    <LayoutGrid className="w-3.5 h-3.5 text-rose-600" />
                    <span>Pages Preview ({totalPages})</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Numbered: {targetPages.length} pages
                  </span>
                </div>

                <div className="flex items-center space-x-3 overflow-x-auto py-1">
                  {Array.from({ length: totalPages }, (_, idx) => {
                    const pageNum = idx + 1;
                    const pageInfo = getPageNumberInfo(pageNum);
                    const isActive = pageNum === activePageIndex;

                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setActivePageIndex(pageNum)}
                        className={`group relative flex-shrink-0 w-20 h-28 rounded-lg border-2 overflow-hidden transition-all cursor-pointer ${
                          isActive
                            ? 'border-rose-600 ring-2 ring-rose-500/20 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                        }`}
                      >
                        {/* Thumbnail image or placeholder */}
                        {thumbnails[pageNum] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbnails[pageNum]}
                            alt={`Page ${pageNum}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
                            <FileText className="w-6 h-6" />
                          </div>
                        )}

                        {/* Top-left Page Index */}
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900/70 text-white backdrop-blur-xs">
                          {pageNum}
                        </span>

                        {/* Bottom Numbering Status Badge */}
                        <div className="absolute inset-x-0 bottom-0 py-0.5 px-1 bg-slate-900/80 text-[9px] font-mono text-center truncate backdrop-blur-xs">
                          {pageInfo.isIncluded ? (
                            <span className="text-emerald-300 font-bold">#{pageInfo.num}</span>
                          ) : (
                            <span className="text-slate-400 italic">Skip</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT: Engine Configuration Sidebar */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                {/* Header */}
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center space-x-2 text-slate-800">
                    <Sliders className="w-4 h-4 text-rose-600" />
                    <h3 className="font-heading font-bold text-slate-900 text-base">
                      Page Number Settings
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Live updates reflect directly on the preview canvas
                  </p>
                </div>

                {/* Section 1: Placement & Margins */}
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                    <span>1. Placement Position</span>
                    <span className="text-[10px] font-medium text-rose-600 capitalize">
                      {position.replace('-', ' ')}
                    </span>
                  </label>

                  {/* 2x3 Visual Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    {(
                      [
                        { id: 'top-left', label: 'Top Left' },
                        { id: 'top-center', label: 'Top Center' },
                        { id: 'top-right', label: 'Top Right' },
                        { id: 'bottom-left', label: 'Bottom Left' },
                        { id: 'bottom-center', label: 'Bottom Center' },
                        { id: 'bottom-right', label: 'Bottom Right' }
                      ] as const
                    ).map((pos) => {
                      const isSelected = position === pos.id;
                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setPosition(pos.id)}
                          className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {pos.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Margin Adjustment */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-700">Distance from Edge</span>
                      <span className="font-mono text-slate-500 font-semibold">{margin} pt</span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={80}
                      step={2}
                      value={margin}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMargin(val);
                        setMarginTop(val);
                        setMarginBottom(val);
                        setMarginLeft(val);
                        setMarginRight(val);
                      }}
                      className="w-full accent-rose-600 cursor-pointer"
                    />

                    {/* Expandable Custom Margins Toggle */}
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setUseCustomMargins((v) => !v)}
                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
                      >
                        {useCustomMargins ? '- Use Uniform Margin' : '+ Custom Edge Margins'}
                      </button>

                      {useCustomMargins && (
                        <div className="grid grid-cols-2 gap-2 mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Top (pt)</span>
                            <input
                              type="number"
                              min={0}
                              max={150}
                              value={marginTop}
                              onChange={(e) => setMarginTop(Number(e.target.value))}
                              className="w-full text-xs font-mono p-1 rounded border border-slate-200 bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Bottom (pt)</span>
                            <input
                              type="number"
                              min={0}
                              max={150}
                              value={marginBottom}
                              onChange={(e) => setMarginBottom(Number(e.target.value))}
                              className="w-full text-xs font-mono p-1 rounded border border-slate-200 bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Left (pt)</span>
                            <input
                              type="number"
                              min={0}
                              max={150}
                              value={marginLeft}
                              onChange={(e) => setMarginLeft(Number(e.target.value))}
                              className="w-full text-xs font-mono p-1 rounded border border-slate-200 bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Right (pt)</span>
                            <input
                              type="number"
                              min={0}
                              max={150}
                              value={marginRight}
                              onChange={(e) => setMarginRight(Number(e.target.value))}
                              className="w-full text-xs font-mono p-1 rounded border border-slate-200 bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 2: Format & Typography */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                    2. Format & Typography
                  </label>

                  {/* Format Template */}
                  <div>
                    <span className="text-xs text-slate-600 block mb-1">Numbering Template</span>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as NumberFormat)}
                      className="w-full text-xs font-medium p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 focus:outline-hidden transition-all cursor-pointer"
                    >
                      <option value="page_of_total">Page X of Y (e.g. Page 1 of 12)</option>
                      <option value="page_number">Page X (e.g. Page 1)</option>
                      <option value="number_only">Number Only (e.g. 1)</option>
                    </select>
                  </div>

                  {/* Font Family & Size Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-slate-600 block mb-1">Font</span>
                      <select
                        value={font}
                        onChange={(e) => setFont(e.target.value as FontFamily)}
                        className="w-full text-xs font-medium p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 focus:outline-hidden transition-all cursor-pointer"
                      >
                        <option value="helvetica">Helvetica</option>
                        <option value="helvetica-bold">Helvetica Bold</option>
                        <option value="times">Times Roman</option>
                        <option value="courier">Courier</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-xs text-slate-600 block mb-1">Font Size</span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min={8}
                          max={28}
                          value={fontSize}
                          onChange={(e) => setFontSize(Number(e.target.value))}
                          className="w-full text-xs font-mono font-medium p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 focus:outline-hidden"
                        />
                        <span className="text-xs text-slate-500">pt</span>
                      </div>
                    </div>
                  </div>

                  {/* Text Color Chips */}
                  <div>
                    <span className="text-xs text-slate-600 block mb-1.5">Text Color</span>
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                      {COLOR_PRESETS.map((preset) => {
                        const isSelected = color.toLowerCase() === preset.value.toLowerCase();
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setColor(preset.value)}
                            title={preset.label}
                            className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                              isSelected
                                ? 'scale-115 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                                : 'border-slate-300 hover:scale-105'
                            }`}
                            style={{ backgroundColor: preset.value }}
                          />
                        );
                      })}
                      {/* Native Color Picker */}
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-7 h-7 rounded-full border-0 p-0 cursor-pointer overflow-hidden"
                        title="Custom Color"
                      />
                    </div>
                  </div>

                  {/* Background Style */}
                  <div>
                    <span className="text-xs text-slate-600 block mb-1.5">Background Style</span>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: 'none', label: 'Transparent' },
                          { id: 'white', label: 'White Badge' },
                          { id: 'dark', label: 'Dark Badge' }
                        ] as const
                      ).map((bg) => {
                        const isSelected = background === bg.id;
                        return (
                          <button
                            key={bg.id}
                            type="button"
                            onClick={() => {
                              setBackground(bg.id);
                              if (bg.id === 'dark' && color === '#1F2937') {
                                setColor('#FFFFFF');
                              } else if (bg.id === 'white' && color === '#FFFFFF') {
                                setColor('#1F2937');
                              }
                            }}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold text-center transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-rose-50 text-rose-700 border-rose-500 shadow-2xs'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {bg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Section 3: Page Selection & Range */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                    3. Page Selection & Sequence
                  </label>

                  {/* Scope Selector */}
                  <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'odd', label: 'Odd' },
                        { id: 'even', label: 'Even' },
                        { id: 'custom', label: 'Custom' }
                      ] as const
                    ).map((item) => {
                      const isSelected = scope === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setScope(item.id)}
                          className={`py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-white text-rose-600 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Range Input if selected */}
                  {scope === 'custom' && (
                    <div>
                      <span className="text-[11px] text-slate-500 block mb-1">
                        Page Range (e.g. 1-3, 5, 8)
                      </span>
                      <input
                        type="text"
                        placeholder="e.g. 1-5, 8, 10-12"
                        value={customRange}
                        onChange={(e) => setCustomRange(e.target.value)}
                        className="w-full text-xs font-mono p-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-rose-500 focus:outline-hidden"
                      />
                    </div>
                  )}

                  {/* Skip Cover Page Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">
                        Skip Cover Page
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Omit numbering on page 1
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipFirst}
                        onChange={(e) => setSkipFirst(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                    </label>
                  </div>

                  {/* Starting Number Input */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">
                        Starting Number
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Begin numbering from
                      </span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={startNumber}
                      onChange={(e) => setStartNumber(Number(e.target.value))}
                      className="w-16 text-center text-xs font-mono font-semibold p-1.5 rounded-lg border border-slate-300 bg-white focus:border-rose-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Primary CTA Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleProcess}
                    disabled={isProcessing || targetPages.length === 0}
                    className="w-full py-3.5 px-4 rounded-xl font-heading font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{processingMessage || 'Processing...'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Apply & Number PDF</span>
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-slate-500 text-center mt-2">
                    Applies pagination to {targetPages.length}{' '}
                    {targetPages.length === 1 ? 'page' : 'pages'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PageNumbersWorkspace;
