'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  DragEvent,
  ChangeEvent,
  PointerEvent as ReactPointerEvent
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
  Eye,
  RotateCw,
  Type,
  Image as ImageIcon,
  Move,
  Grid3X3,
  Trash2,
  Stamp
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

interface WatermarkWorkspaceProps {
  tool: ToolDefinition;
}

interface WatermarkOutputResult {
  jobId: string;
  downloadUrl: string;
  filename: string;
  size: number;
}

type WatermarkType = 'text' | 'image';
type WatermarkStyle = 'diagonal' | 'horizontal' | 'tiled';
type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'custom';

type FontFamily = 'helvetica' | 'times' | 'courier';
type BackgroundStyle = 'none' | 'white' | 'dark' | 'highlight';
type PageScope = 'all' | 'current' | 'selected' | 'odd' | 'even' | 'custom';
type ZoomMode = 'fit-page' | 'fit-width' | 'custom';

const COLOR_PRESETS = [
  { label: 'Crimson', value: '#E11D48' },
  { label: 'Charcoal', value: '#1F2937' },
  { label: 'Gray', value: '#6B7280' },
  { label: 'Blue', value: '#2563EB' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Purple', value: '#7C3AED' },
  { label: 'Black', value: '#000000' }
];

export const WatermarkWorkspace: React.FC<WatermarkWorkspaceProps> = ({ tool }) => {
  // Document state
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [activePageIndex, setActivePageIndex] = useState<number>(1);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Viewer & auto-zoom state
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-page');
  const [zoom, setZoom] = useState<number>(1.0);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activeRenderTaskRef = useRef<ActiveRenderTask | null>(null);
  const renderSequenceRef = useRef<number>(0);
  const pageSizeRef = useRef<{ width: number; height: number }>({ width: 595, height: 842 });

  // Rendered page display dimensions in CSS pixels
  const [renderedDimensions, setRenderedDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });

  // Watermark type & style
  const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');
  const [style, setStyle] = useState<WatermarkStyle>('diagonal');
  const [opacity, setOpacity] = useState<number>(0.3);
  const [rotationDegrees, setRotationDegrees] = useState<number>(45);

  // Text watermark settings
  const [text, setText] = useState<string>('CONFIDENTIAL');
  const [font, setFont] = useState<FontFamily>('helvetica');
  const [isBold, setIsBold] = useState<boolean>(true);
  const [isItalic, setIsItalic] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(48);
  const [color, setColor] = useState<string>('#E11D48');
  const [background, setBackground] = useState<BackgroundStyle>('none');

  // Image watermark settings
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/png');
  const [imageScalePercent, setImageScalePercent] = useState<number>(40);

  // Positioning state
  const [position, setPosition] = useState<WatermarkPosition>('center');
  const [customXRatio, setCustomXRatio] = useState<number>(0.5);
  const [customYRatio, setCustomYRatio] = useState<number>(0.5);
  const [isDraggingWatermark, setIsDraggingWatermark] = useState<boolean>(false);

  // Page Scope
  const [scope, setScope] = useState<PageScope>('all');
  const [customRange, setCustomRange] = useState<string>('');

  // Processing & Output state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [outputResult, setOutputResult] = useState<WatermarkOutputResult | null>(null);

  // Parse page selection
  const targetPages = useMemo(() => {
    if (totalPages === 0) return [];
    let pages: number[] = [];

    if (scope === 'all') {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (scope === 'current') {
      pages = [activePageIndex];
    } else if (scope === 'selected') {
      pages = Array.from(selectedPages).sort((a, b) => a - b);
      if (pages.length === 0) pages = [activePageIndex];
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

    return pages;
  }, [totalPages, scope, customRange, activePageIndex, selectedPages]);

  // Is current page included in watermark targets
  const isCurrentPageTargeted = useMemo(() => {
    return targetPages.includes(activePageIndex);
  }, [targetPages, activePageIndex]);

  // Effective rotation angle
  const effectiveAngle = useMemo(() => {
    if (style === 'horizontal') return 0;
    if (style === 'diagonal' && rotationDegrees === 0) return 45;
    return rotationDegrees;
  }, [style, rotationDegrees]);

  // Auto-zoom calculator
  const calculateAutoZoom = useCallback(
    (mode: 'fit-page' | 'fit-width', customWidth?: number, customHeight?: number): number => {
      const viewport = viewportRef.current || containerRef.current;
      if (!viewport) return 1.0;

      const pW = customWidth || pageSizeRef.current.width || 595;
      const pH = customHeight || pageSizeRef.current.height || 842;

      const isSmall = viewport.clientWidth < 640;
      const padH = isSmall ? 28 : 48;
      const padV = isSmall ? 28 : 48;
      const availWidth = Math.max(100, viewport.clientWidth - padH);
      const availHeight = Math.max(100, viewport.clientHeight - padV);

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

  // Load and initialize uploaded PDF via ArrayBuffer
  const loadPdf = useCallback(
    async (selectedFile: File) => {
      setIsLoadingPdf(true);
      setError(null);
      setOutputResult(null);

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const loadedPdf = await loadPdfDocument(arrayBuffer);

        setPdfDoc(loadedPdf);
        setTotalPages(loadedPdf.numPages);
        setActivePageIndex(1);
        setFile(selectedFile);
        setPageRotations({});
        setSelectedPages(new Set([1]));

        // Fetch page 1 dimensions to set initial aspect ratio & auto-zoom
        const firstPage = await loadedPdf.getPage(1);
        const rot = firstPage.rotate || 0;
        const isSideways = rot === 90 || rot === 270;
        const pWidth = isSideways ? firstPage.view[3] : firstPage.view[2];
        const pHeight = isSideways ? firstPage.view[2] : firstPage.view[3];
        pageSizeRef.current = { width: pWidth, height: pHeight };

        // Auto zoom calculation
        const initialZoom = calculateAutoZoom('fit-page', pWidth, pHeight);
        setZoom(initialZoom);
        setZoomMode('fit-page');

        // Asynchronously generate thumbnails for page switcher
        const thumbs: Record<number, string> = {};
        for (let i = 1; i <= Math.min(loadedPdf.numPages, 30); i++) {
          try {
            const thumb = await generatePageThumbnail(loadedPdf, i, 120);
            thumbs[i] = thumb;
          } catch {
            // fallback gracefully
          }
        }
        setThumbnails(thumbs);
        setIsLoadingPdf(false);
      } catch (err: any) {
        setIsLoadingPdf(false);
        setError(err?.message || 'Failed to parse PDF document.');
      }
    },
    [calculateAutoZoom]
  );

  // File input change handler
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      loadPdf(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Open file picker to change / replace file
  const handleChangeFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Handle image upload for image watermark
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const img = files[0];
    setImageFile(img);
    setImageMimeType(img.type || 'image/png');

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImageDataUrl(event.target.result as string);
        setWatermarkType('image');
      }
    };
    reader.readAsDataURL(img);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Render active page to canvas
  useEffect(() => {
    if (!pdfDoc || totalPages === 0 || !canvasRef.current) return;

    let isCancelled = false;
    const currentSeq = ++renderSequenceRef.current;

    (async () => {
      try {
        setIsRenderingPage(true);
        if (activeRenderTaskRef.current) {
          activeRenderTaskRef.current.cancel();
        }

        const effectiveZoom = zoomMode === 'custom' ? zoom : calculateAutoZoom(zoomMode);
        const manualRot = pageRotations[activePageIndex] || 0;

        const task = renderPageToCanvas(
          pdfDoc,
          activePageIndex,
          canvasRef.current!,
          {
            scale: effectiveZoom,
            rotation: manualRot
          }
        );
        activeRenderTaskRef.current = task;
        await task.promise;

        if (!isCancelled && currentSeq === renderSequenceRef.current && canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          setRenderedDimensions({
            width: rect.width,
            height: rect.height
          });
          setIsRenderingPage(false);
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
  }, [
    pdfDoc,
    activePageIndex,
    zoom,
    zoomMode,
    pageRotations,
    calculateAutoZoom,
    totalPages
  ]);

  // Window resize observer
  useEffect(() => {
    if (!viewportRef.current || zoomMode === 'custom') return;
    const handleResize = () => {
      const newZoom = calculateAutoZoom(zoomMode);
      if (Math.abs(newZoom - zoom) > 0.02) {
        setZoom(newZoom);
      }
    };
    const observer = new ResizeObserver(handleResize);
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [zoomMode, calculateAutoZoom, zoom]);

  // Rotate active page
  const handleRotatePage = (pageNum: number) => {
    setPageRotations((prev) => {
      const cur = prev[pageNum] || 0;
      return { ...prev, [pageNum]: (cur + 90) % 360 };
    });
  };

  // Drag-and-drop on watermark overlay
  const handleWatermarkPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingWatermark(true);
    setPosition('custom');
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleOverlayPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDraggingWatermark || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;

    const relX = Math.max(0.05, Math.min(0.95, (e.clientX - canvasRect.left) / canvasRect.width));
    const relY = Math.max(0.05, Math.min(0.95, (e.clientY - canvasRect.top) / canvasRect.height));

    setCustomXRatio(Number(relX.toFixed(3)));
    setCustomYRatio(Number(relY.toFixed(3)));
  };

  const handleWatermarkPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isDraggingWatermark) {
      setIsDraggingWatermark(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore capture release errors
      }
    }
  };

  // Calculate live visual coordinates for single watermark
  const getWatermarkVisualCoords = useCallback(
    (pos: WatermarkPosition) => {
      if (pos === 'top-left') return { x: 25, y: 20 };
      if (pos === 'top-center') return { x: 50, y: 15 };
      if (pos === 'top-right') return { x: 75, y: 20 };
      if (pos === 'bottom-left') return { x: 25, y: 80 };
      if (pos === 'bottom-center') return { x: 50, y: 85 };
      if (pos === 'bottom-right') return { x: 75, y: 80 };
      if (pos === 'custom') return { x: customXRatio * 100, y: customYRatio * 100 };
      return { x: 50, y: 50 }; // center
    },
    [customXRatio, customYRatio]
  );

  // Execute processing
  const handleExecute = async () => {
    if (!file) {
      setError('Please choose a PDF document to watermark.');
      return;
    }

    if (watermarkType === 'text' && (!text || text.trim().length === 0)) {
      setError('Please enter a watermark text string.');
      return;
    }

    if (watermarkType === 'image' && !imageDataUrl) {
      setError('Please upload an image or logo to use as watermark.');
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingMessage('Preparing document and watermark payload...');
    setError(null);

    try {
      const payload: Record<string, any> = {
        opacity,
        rotationDegrees: effectiveAngle,
        style,
        position,
        background,
        pages: JSON.stringify(targetPages),
        pageRotations: JSON.stringify(pageRotations),
        ...(position === 'custom'
          ? {
              customXRatio,
              customYRatio
            }
          : {})
      };

      if (watermarkType === 'text') {
        payload.text = text;
        payload.font = font;
        payload.fontSize = fontSize;
        payload.color = color;
        payload.isBold = isBold;
        payload.isItalic = isItalic;
      } else if (watermarkType === 'image' && imageDataUrl) {
        payload.imageBase64 = imageDataUrl;
        payload.imageMimeType = imageMimeType;
        const baseWidth = (pageSizeRef.current?.width || 595) * (imageScalePercent / 100);
        payload.imageWidth = Math.round(baseWidth);
      }

      setProcessingProgress(45);
      setProcessingMessage('Applying vector watermark across pages...');

      const res = await submitDocumentJob(
        tool.endpoint,
        [file],
        payload,
        {
          onProgress: (p, msg) => {
            setProcessingProgress(Math.min(90, Math.max(15, p)));
            if (msg) setProcessingMessage(msg);
          }
        }
      );

      if (res.success && (res.downloadUrl || res.outputFiles?.[0]?.downloadUrl)) {
        const dlUrl = res.downloadUrl || res.outputFiles?.[0]?.downloadUrl || '';

        setProcessingProgress(92);
        setProcessingMessage('Verifying generated output...');

        const fullUrl = getFullApiUrl(dlUrl);
        const verifyRes = await fetch(fullUrl);
        if (!verifyRes.ok) {
          throw new Error(`Failed to retrieve generated PDF (HTTP ${verifyRes.status})`);
        }
        const blob = await verifyRes.blob();

        const outResult: WatermarkOutputResult = {
          jobId: res.jobId || 'job_sync',
          downloadUrl: fullUrl,
          filename: `watermarked-${file.name}`,
          size: blob.size
        };

        setOutputResult(outResult);
        setIsProcessing(false);

        // Confetti celebration
        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6 }
          });
        } catch {
          // ignore confetti errors
        }

        saveSessionHistoryItem({
          jobId: res.jobId || 'job_sync',
          toolId: tool.id,
          toolTitle: tool.title,
          inputFiles: [{ name: file.name, size: file.size }],
          outputFiles: [{ name: outResult.filename, downloadUrl: dlUrl }],
          status: 'completed'
        });
      } else {
        throw new Error(res.error?.message || 'Failed to process watermark.');
      }
    } catch (err: any) {
      setIsProcessing(false);
      setError(err?.message || 'An error occurred during watermark processing.');
    }
  };

  // Drag-and-drop handlers for dropzone
  const handleDropOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDropLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.type === 'application/pdf' || dropped.name.toLowerCase().endsWith('.pdf')) {
        loadPdf(dropped);
      } else {
        setError('Please drop a valid .pdf file.');
      }
    }
  };

  // Reset workspace
  const handleReset = () => {
    setFile(null);
    setPdfDoc(null);
    setTotalPages(0);
    setActivePageIndex(1);
    setThumbnails({});
    setPageRotations({});
    setSelectedPages(new Set());
    setOutputResult(null);
    setError(null);
    setImageFile(null);
    setImageDataUrl(null);
    setIsProcessing(false);
    setProcessingProgress(0);
    setProcessingMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Render watermark elements for live preview overlay
  const renderPreviewWatermarkElements = () => {
    if (!isCurrentPageTargeted) return null;

    const visualCoords = getWatermarkVisualCoords(position);
    const textStyle = {
      fontFamily:
        font === 'times'
          ? 'Times New Roman, serif'
          : font === 'courier'
          ? 'Courier New, monospace'
          : 'Helvetica, Arial, sans-serif',
      fontWeight: isBold ? 700 : 400,
      fontStyle: isItalic ? 'italic' : 'normal',
      fontSize: `${Math.max(12, Math.round(fontSize * zoom))}px`,
      color,
      opacity
    };

    const getBgClass = () => {
      if (background === 'white') {
        return 'bg-white/90 border border-slate-300 px-3 py-1 rounded shadow-xs';
      }
      if (background === 'dark') {
        return 'bg-slate-900/90 text-slate-100 border border-slate-700 px-3 py-1 rounded shadow-xs';
      }
      if (background === 'highlight') {
        return 'bg-amber-200/80 border border-amber-400 px-3 py-1 rounded shadow-xs';
      }
      return '';
    };

    if (style === 'tiled') {
      const items = [];
      const cols = 3;
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const leftPct = ((c + 0.5) / cols) * 100;
          const topPct = ((r + 0.5) / rows) * 100;
          items.push(
            <div
              key={`tiled_${r}_${c}`}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform: `translate(-50%, -50%) rotate(${effectiveAngle}deg)`,
                pointerEvents: 'none',
                userSelect: 'none'
              }}
              className="whitespace-nowrap transition-transform"
            >
              {watermarkType === 'text' ? (
                <span style={textStyle} className={`inline-block ${getBgClass()}`}>
                  {text || 'CONFIDENTIAL'}
                </span>
              ) : imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageDataUrl}
                  alt="Watermark preview"
                  style={{
                    width: `${Math.round(((renderedDimensions.width || 500) * 0.25))}px`,
                    opacity
                  }}
                  className="object-contain"
                />
              ) : null}
            </div>
          );
        }
      }
      return <div className="absolute inset-0 overflow-hidden pointer-events-none">{items}</div>;
    }

    // Single watermark (centered, preset, or dragged custom position)
    return (
      <div
        onPointerDown={handleWatermarkPointerDown}
        style={{
          position: 'absolute',
          left: `${visualCoords.x}%`,
          top: `${visualCoords.y}%`,
          transform: `translate(-50%, -50%) rotate(${effectiveAngle}deg)`,
          cursor: isDraggingWatermark ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none'
        }}
        className={`whitespace-nowrap transition-shadow rounded-sm ${
          isDraggingWatermark
            ? 'ring-2 ring-rose-500 ring-offset-2 shadow-2xl'
            : 'hover:ring-1 hover:ring-rose-400/80 hover:bg-rose-50/10'
        }`}
        title="Click and drag to position anywhere on the page"
      >
        {watermarkType === 'text' ? (
          <span style={textStyle} className={`inline-block select-none ${getBgClass()}`}>
            {text || 'CONFIDENTIAL'}
          </span>
        ) : imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageDataUrl}
            alt="Watermark preview"
            style={{
              width: `${Math.round(
                (renderedDimensions.width || 500) * (imageScalePercent / 100)
              )}px`,
              opacity
            }}
            className="object-contain select-none pointer-events-none"
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
              title="Return to all tools"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shadow-xs">
              <ToolIcon name={tool.iconName} className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 leading-tight">
                {tool.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Overlay custom text, logos or stamps across every page with live preview.
              </p>
            </div>
          </div>

          {file && !outputResult && (
            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleChangeFile}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/70 border border-rose-200 rounded-xl shadow-xs transition-colors cursor-pointer"
                title="Select a different PDF file"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Replace PDF</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          )}
        </div>

        {/* Output Screen */}
        {outputResult ? (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="font-heading font-bold text-2xl text-slate-900">
                Watermark Applied Successfully!
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Your watermarked PDF is ready for immediate download.
              </p>

              <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-left">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-9 h-9 rounded-xl bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <span className="block text-xs font-bold text-slate-800 truncate">
                      {outputResult.filename}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {(outputResult.size / (1024 * 1024)).toFixed(2)} MB • {totalPages} pages
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100/60 px-2.5 py-1 rounded-full shrink-0">
                  Ready
                </span>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => triggerFileDownload(outputResult.downloadUrl, outputResult.filename)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Watermarked PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Process Another File
                </button>
              </div>
            </div>

            {/* Output preview canvas */}
            <div className="max-w-4xl mx-auto">
              <PdfOutputViewer
                downloadUrl={outputResult.downloadUrl}
                filename={outputResult.filename}
                size={outputResult.size}
                formatSize={(bytes) => (bytes ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : '')}
              />
            </div>
          </div>
        ) : (
          <div>
            {/* Upload Dropzone */}
            {!file && (
              <div
                onDragOver={handleDropOver}
                onDragLeave={handleDropLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-3xl p-12 sm:p-16 text-center transition-all duration-200 border-2 border-dashed ${
                  isDragging
                    ? 'bg-rose-50/70 border-rose-500 scale-[1.005]'
                    : 'bg-white border-slate-300 hover:border-slate-400 hover:bg-slate-50/50 shadow-xs'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-xs">
                  {isLoadingPdf ? (
                    <Loader2 className="w-8 h-8 animate-spin" />
                  ) : (
                    <UploadCloud className="w-8 h-8" />
                  )}
                </div>

                <h3 className="font-heading font-bold text-xl sm:text-2xl text-slate-900">
                  {isDragging ? 'Drop your PDF right here' : 'Select a PDF document to watermark'}
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                  Supports PDF up to 50MB. Preview watermark position, font, opacity, and rotation in real time before processing.
                </p>

                <div className="mt-6">
                  <span className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                    <Plus className="w-4 h-4" />
                    <span>Choose PDF File</span>
                  </span>
                </div>
              </div>
            )}

            {/* Hidden persistent inputs */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,application/pdf"
              className="hidden"
            />

            <input
              type="file"
              ref={imageInputRef}
              onChange={handleImageUpload}
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
            />

            {/* Main Interactive Studio */}
            {file && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* LEFT / CENTER: Document Viewer Canvas (Cols 8) */}
                <div className="lg:col-span-8 space-y-6">
                  <div
                    ref={containerRef}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs flex flex-col h-[600px] sm:h-[640px]"
                  >
                    {/* Viewer Header Toolbar */}
                    <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                      {/* Page Switcher */}
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setActivePageIndex((p) => Math.max(1, p - 1))}
                          disabled={activePageIndex <= 1}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          title="Previous page"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center space-x-1.5 font-semibold text-slate-700">
                          <span>Page</span>
                          <span className="font-bold text-rose-600">{activePageIndex}</span>
                          <span className="text-slate-400">of</span>
                          <span>{totalPages}</span>
                        </div>

                        <button
                          onClick={() => setActivePageIndex((p) => Math.min(totalPages, p + 1))}
                          disabled={activePageIndex >= totalPages}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          title="Next page"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Targeted Status Tag */}
                      <div className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border">
                        {isCurrentPageTargeted ? (
                          <span className="text-emerald-700 bg-emerald-50 border-emerald-200 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />
                            <span>Watermark Active on this Page</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 border-amber-200 flex items-center space-x-1">
                            <Eye className="w-3 h-3 text-amber-600 inline" />
                            <span>Omitted by Page Filter</span>
                          </span>
                        )}
                      </div>

                      {/* Zoom & Page Actions */}
                      <div className="flex items-center space-x-1 ml-auto">
                        <button
                          onClick={() => handleRotatePage(activePageIndex)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Rotate this page 90° clockwise"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>

                        <div className="h-4 w-px bg-slate-200 mx-1" />

                        <button
                          onClick={() => {
                            setZoomMode('custom');
                            setZoom((z) => Math.max(0.3, z - 0.15));
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Zoom out"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </button>

                        <span className="font-mono text-xs text-slate-700 font-semibold w-12 text-center">
                          {Math.round(zoom * 100)}%
                        </span>

                        <button
                          onClick={() => {
                            setZoomMode('custom');
                            setZoom((z) => Math.min(2.5, z + 0.15));
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Zoom in"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setZoomMode('fit-width');
                            setZoom(calculateAutoZoom('fit-width'));
                          }}
                          className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                            zoomMode === 'fit-width'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                          title="Fit width"
                        >
                          Width
                        </button>

                        <button
                          onClick={() => {
                            setZoomMode('fit-page');
                            setZoom(calculateAutoZoom('fit-page'));
                          }}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            zoomMode === 'fit-page'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                          }`}
                          title="Fit whole page"
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Canvas & Overlay Viewport */}
                    <div
                      ref={viewportRef}
                      onPointerMove={handleOverlayPointerMove}
                      onPointerUp={handleWatermarkPointerUp}
                      className="flex-1 overflow-auto p-4 sm:p-6 flex relative bg-slate-100/90 select-none"
                    >
                      {/* Loading spinner */}
                      {isRenderingPage && (
                        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-20">
                          <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs shadow-lg">
                            <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                            <span>Rendering vector page...</span>
                          </div>
                        </div>
                      )}

                      {/* Render Container with Canvas and Watermark Overlay */}
                      <div className="m-auto relative shadow-xl border border-slate-300/80 rounded-sm overflow-hidden bg-white">
                        <canvas ref={canvasRef} className="block bg-white" />

                        {/* Interactive Watermark Overlay Layer */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-auto">
                          {renderPreviewWatermarkElements()}
                        </div>

                        {/* Subtle banner if page is omitted */}
                        {!isCurrentPageTargeted && (
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-slate-900/80 text-white text-[11px] font-semibold backdrop-blur-xs flex items-center space-x-1.5 shadow-md pointer-events-none">
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span>Watermark will not appear on Page {activePageIndex}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Page Thumbnails Bar */}
                  {totalPages > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                          <Eye className="w-3.5 h-3.5" />
                          <span>Pages ({targetPages.length} of {totalPages} targeted)</span>
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i + 1)));
                              setScope('all');
                            }}
                            className="text-[11px] font-semibold text-rose-600 hover:underline"
                          >
                            Target All
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 overflow-x-auto py-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                          const isActive = activePageIndex === pageNum;
                          const isTargeted = targetPages.includes(pageNum);
                          const rot = pageRotations[pageNum] || 0;

                          return (
                            <div
                              key={pageNum}
                              onClick={() => setActivePageIndex(pageNum)}
                              className={`relative group shrink-0 rounded-xl border-2 p-1 cursor-pointer transition-all ${
                                isActive
                                  ? 'border-rose-500 bg-rose-50/50 shadow-xs'
                                  : isTargeted
                                  ? 'border-slate-200 hover:border-slate-300 bg-white'
                                  : 'border-dashed border-slate-200 opacity-60 bg-slate-50'
                              }`}
                            >
                              <div className="w-16 h-20 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center relative">
                                {thumbnails[pageNum] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumbnails[pageNum]}
                                    alt={`Page ${pageNum}`}
                                    style={{
                                      transform: `rotate(${rot}deg)`,
                                      transition: 'transform 0.2s'
                                    }}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-mono font-bold">
                                    P.{pageNum}
                                  </span>
                                )}

                                {/* Target status indicator dot */}
                                {isTargeted && (
                                  <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white" />
                                )}
                              </div>

                              <div className="mt-1 flex items-center justify-between text-[10px]">
                                <span className={`font-bold ${isActive ? 'text-rose-600' : 'text-slate-600'}`}>
                                  #{pageNum}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRotatePage(pageNum);
                                  }}
                                  className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                                  title="Rotate page 90°"
                                >
                                  <RotateCw className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT SIDEBAR: Parameter Settings & Action (Cols 4) */}
                <div className="lg:col-span-4 sticky top-24 space-y-5">
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
                    {/* Mode Toggle: Text Watermark vs Image Watermark */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                        Watermark Type
                      </label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setWatermarkType('text')}
                          className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            watermarkType === 'text'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Type className="w-3.5 h-3.5 text-rose-600" />
                          <span>Text</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWatermarkType('image');
                            if (!imageDataUrl) {
                              imageInputRef.current?.click();
                            }
                          }}
                          className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            watermarkType === 'image'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-rose-600" />
                          <span>Image / Logo</span>
                        </button>
                      </div>
                    </div>

                    {/* TEXT WATERMARK SETTINGS */}
                    {watermarkType === 'text' && (
                      <div className="space-y-4 pt-1 border-t border-slate-100">
                        {/* Text String Input */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 block">
                            Watermark Text <span className="text-rose-600">*</span>
                          </label>
                          <input
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="e.g. CONFIDENTIAL, DRAFT, INTERNAL USE"
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10 font-medium"
                          />
                        </div>

                        {/* Font Family & Styles (Bold / Italic) */}
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-7 space-y-1">
                            <label className="text-xs font-semibold text-slate-700 block">Font</label>
                            <select
                              value={font}
                              onChange={(e) => setFont(e.target.value as FontFamily)}
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-rose-500"
                            >
                              <option value="helvetica">Helvetica</option>
                              <option value="times">Times New Roman</option>
                              <option value="courier">Courier</option>
                            </select>
                          </div>

                          <div className="col-span-5 space-y-1">
                            <label className="text-xs font-semibold text-slate-700 block">Style</label>
                            <div className="flex items-center space-x-1 h-9">
                              <button
                                type="button"
                                onClick={() => setIsBold((b) => !b)}
                                className={`flex-1 h-full rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                  isBold
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-400'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                                title="Toggle Bold"
                              >
                                B
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsItalic((i) => !i)}
                                className={`flex-1 h-full rounded-lg text-xs font-serif italic border transition-colors cursor-pointer ${
                                  isItalic
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-400'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                                title="Toggle Italic"
                              >
                                I
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Font Size Slider */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <label className="font-semibold text-slate-700">Font Size</label>
                            <span className="font-mono text-slate-500">{fontSize} pt</span>
                          </div>
                          <input
                            type="range"
                            min="14"
                            max="120"
                            step="2"
                            value={fontSize}
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-full accent-rose-600 cursor-pointer"
                          />
                        </div>

                        {/* Color Picker & Presets */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <label className="font-semibold text-slate-700">Color</label>
                            <span className="font-mono text-slate-500 uppercase">{color}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                            {COLOR_PRESETS.map((preset) => (
                              <button
                                key={preset.value}
                                type="button"
                                onClick={() => setColor(preset.value)}
                                style={{ backgroundColor: preset.value }}
                                className={`w-6 h-6 rounded-full border transition-transform cursor-pointer ${
                                  color.toLowerCase() === preset.value.toLowerCase()
                                    ? 'ring-2 ring-rose-500 ring-offset-2 scale-110'
                                    : 'border-slate-300 hover:scale-105'
                                }`}
                                title={preset.label}
                              />
                            ))}
                            <input
                              type="color"
                              value={color}
                              onChange={(e) => setColor(e.target.value)}
                              className="w-6 h-6 p-0 border border-slate-300 rounded-full cursor-pointer bg-transparent"
                              title="Custom Color"
                            />
                          </div>
                        </div>

                        {/* Background Banner Style */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700 block">
                            Background Style
                          </label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { label: 'None', val: 'none' },
                              { label: 'White', val: 'white' },
                              { label: 'Dark', val: 'dark' },
                              { label: 'Highlight', val: 'highlight' }
                            ].map((b) => (
                              <button
                                key={b.val}
                                type="button"
                                onClick={() => setBackground(b.val as BackgroundStyle)}
                                className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                  background === b.val
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-400'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {b.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* IMAGE WATERMARK SETTINGS */}
                    {watermarkType === 'image' && (
                      <div className="space-y-4 pt-1 border-t border-slate-100">
                        {imageDataUrl ? (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-700 truncate max-w-[160px]">
                                {imageFile?.name || 'Uploaded Logo'}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setImageFile(null);
                                  setImageDataUrl(null);
                                }}
                                className="text-red-500 hover:text-red-700 p-1"
                                title="Remove Image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="h-20 bg-white rounded-lg border border-slate-200 flex items-center justify-center p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={imageDataUrl}
                                alt="Watermark stamp preview"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              className="w-full text-center text-[11px] font-semibold text-rose-600 hover:underline pt-1"
                            >
                              Replace Logo / Image
                            </button>
                          </div>
                        ) : (
                          <div
                            onClick={() => imageInputRef.current?.click()}
                            className="p-6 border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-xl text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors"
                          >
                            <ImageIcon className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                            <span className="text-xs font-bold text-slate-800 block">
                              Upload Logo or Stamp
                            </span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              PNG (with transparency) or JPG
                            </span>
                          </div>
                        )}

                        {/* Image Scale Slider */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <label className="font-semibold text-slate-700">Image Scale</label>
                            <span className="font-mono text-slate-500">{imageScalePercent}% of page</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="90"
                            step="5"
                            value={imageScalePercent}
                            onChange={(e) => setImageScalePercent(Number(e.target.value))}
                            className="w-full accent-rose-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {/* GENERAL WATERMARK APPEARANCE (STYLE, OPACITY, ROTATION, POSITION) */}
                    <div className="space-y-4 pt-1 border-t border-slate-100">
                      {/* Watermark Layout Style */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700 block">Layout Style</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { label: 'Diagonal', val: 'diagonal', icon: Stamp },
                            { label: 'Horizontal', val: 'horizontal', icon: Move },
                            { label: 'Tiled Grid', val: 'tiled', icon: Grid3X3 }
                          ].map((s) => (
                            <button
                              key={s.val}
                              type="button"
                              onClick={() => {
                                setStyle(s.val as WatermarkStyle);
                                if (s.val === 'horizontal') setRotationDegrees(0);
                                else if (s.val === 'diagonal' && rotationDegrees === 0) setRotationDegrees(45);
                              }}
                              className={`py-2 px-1 rounded-lg text-xs font-semibold border flex flex-col items-center justify-center space-y-1 transition-all cursor-pointer ${
                                style === s.val
                                  ? 'bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-400'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <s.icon className="w-3.5 h-3.5 text-rose-600" />
                              <span className="text-[11px]">{s.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Opacity Slider */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-semibold text-slate-700">Opacity / Transparency</label>
                          <span className="font-mono text-slate-500">{Math.round(opacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="1.0"
                          step="0.05"
                          value={opacity}
                          onChange={(e) => setOpacity(Number(e.target.value))}
                          className="w-full accent-rose-600 cursor-pointer"
                        />
                      </div>

                      {/* Rotation Slider (if not horizontal) */}
                      {style !== 'horizontal' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <label className="font-semibold text-slate-700">Rotation Angle</label>
                            <span className="font-mono text-slate-500">{rotationDegrees}°</span>
                          </div>
                          <input
                            type="range"
                            min="-90"
                            max="90"
                            step="5"
                            value={rotationDegrees}
                            onChange={(e) => setRotationDegrees(Number(e.target.value))}
                            className="w-full accent-rose-600 cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Placement Position */}
                      {style !== 'tiled' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-700">Position</label>
                            <span className="text-[10px] text-rose-600 font-medium">
                              {position === 'custom' ? 'Custom Dragged' : 'Preset'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-center">
                            {[
                              { label: 'Top-L', val: 'top-left' },
                              { label: 'Top-C', val: 'top-center' },
                              { label: 'Top-R', val: 'top-right' },
                              { label: 'Center', val: 'center' },
                              { label: 'Bot-L', val: 'bottom-left' },
                              { label: 'Bot-C', val: 'bottom-center' },
                              { label: 'Bot-R', val: 'bottom-right' },
                              { label: 'Custom', val: 'custom' }
                            ].map((p) => (
                              <button
                                key={p.val}
                                type="button"
                                onClick={() => {
                                  setPosition(p.val as WatermarkPosition);
                                  if (p.val === 'center') {
                                    setCustomXRatio(0.5);
                                    setCustomYRatio(0.5);
                                  }
                                }}
                                className={`py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                                  position === p.val
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-400'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[11px] text-slate-400 pt-1 leading-tight">
                            Tip: You can also drag the watermark directly on the PDF preview.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* PAGE SELECTION SECTION */}
                    <div className="space-y-3 pt-1 border-t border-slate-100">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                        Apply To Pages
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: 'All Pages', val: 'all' },
                          { label: 'Current', val: 'current' },
                          { label: 'Selected', val: 'selected' },
                          { label: 'Odd Pages', val: 'odd' },
                          { label: 'Even Pages', val: 'even' },
                          { label: 'Custom', val: 'custom' }
                        ].map((sc) => (
                          <button
                            key={sc.val}
                            type="button"
                            onClick={() => setScope(sc.val as PageScope)}
                            className={`py-1.5 px-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                              scope === sc.val
                                ? 'bg-rose-50 border-rose-300 text-rose-700 ring-1 ring-rose-400'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {sc.label}
                          </button>
                        ))}
                      </div>

                      {scope === 'custom' && (
                        <div className="space-y-1">
                          <input
                            type="text"
                            placeholder="e.g. 1-3, 5, 8"
                            value={customRange}
                            onChange={(e) => setCustomRange(e.target.value)}
                            className="w-full h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-rose-500"
                          />
                          <p className="text-[10px] text-slate-400">
                            Comma-separated numbers or page ranges.
                          </p>
                        </div>
                      )}

                      <span className="text-[11px] text-slate-500 block">
                        Targeting <span className="font-bold text-slate-800">{targetPages.length}</span> of {totalPages} pages
                      </span>
                    </div>

                    {/* ERROR BANNER */}
                    {error && (
                      <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start space-x-2.5 text-xs animate-in fade-in">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-bold text-red-900 block">Processing Error</span>
                          <p className="mt-0.5">{error}</p>
                        </div>
                        <button
                          onClick={() => setError(null)}
                          className="text-red-400 hover:text-red-800 font-semibold cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {/* PROGRESS BAR */}
                    {isProcessing && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                          <span className="flex items-center space-x-1.5 text-rose-600">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{processingMessage || 'Processing watermark...'}</span>
                          </span>
                          <span>{processingProgress}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-rose-600 transition-all duration-300 rounded-full"
                            style={{ width: `${processingProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* EXECUTE ACTION BUTTON */}
                    <button
                      type="button"
                      id="apply-watermark-btn"
                      data-testid="apply-watermark-btn"
                      disabled={isProcessing || !file || (watermarkType === 'text' && !text) || (watermarkType === 'image' && !imageDataUrl)}
                      onClick={handleExecute}
                      className="w-full py-3.5 px-4 rounded-xl font-heading font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Applying Watermark...</span>
                        </>
                      ) : (
                        <>
                          <Stamp className="w-4 h-4" />
                          <span>Apply & Process Watermark</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WatermarkWorkspace;
