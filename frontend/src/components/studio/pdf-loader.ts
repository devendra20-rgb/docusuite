'use client';

// Dynamically import pdfjs to ensure it only runs in the browser
let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function getPdfjs() {
  if (typeof window === 'undefined') {
    throw new Error('PDF.js can only be loaded in the browser environment.');
  }

  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((pdfjs) => {
      // Configure local worker served from public/
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return pdfjs;
    });
  }

  return pdfjsLibPromise;
}

export interface RenderPageOptions {
  scale?: number;
  rotation?: number; // additional rotation in degrees (0, 90, 180, 270)
  targetWidth?: number;
  targetHeight?: number;
}

export interface ActiveRenderTask {
  cancel: () => void;
  promise: Promise<void>;
}

/**
 * Loads a PDF document from a Blob URL or ArrayBuffer
 */
export async function loadPdfDocument(source: string | ArrayBuffer, password?: string) {
  const pdfjs = await getPdfjs();
  const options: any = typeof source === 'string' ? { url: source } : { data: source };
  if (password) options.password = password;
  const loadingTask = pdfjs.getDocument(options);
  return await loadingTask.promise;
}

/**
 * Renders a specific 1-based PDF page to a HTML5 <canvas> element.
 * Accounts for devicePixelRatio for ultra-sharp typography on Retina/High-DPI screens.
 */
export function renderPageToCanvas(
  pdfDoc: any,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: RenderPageOptions = {}
): ActiveRenderTask {
  let isCancelled = false;
  let pdfRenderTask: any = null;

  const promise = (async () => {
    try {
      // Cancel and detach any currently running render task on this canvas element
      if ((canvas as any)._currentPdfRenderTask) {
        try {
          (canvas as any)._currentPdfRenderTask.cancel();
        } catch {
          // ignore
        }
        (canvas as any)._currentPdfRenderTask = null;
      }

      if (!pdfDoc || typeof pdfDoc.getPage !== 'function') {
        throw new Error('Invalid PDF document instance');
      }

      const clampedPage = Math.max(1, Math.min(pageNumber, pdfDoc.numPages || 1));
      const page = await pdfDoc.getPage(clampedPage);
      if (isCancelled) return;

      const baseRotation = page.rotate || 0;
      const extraRotation = options.rotation || 0;
      const totalRotation = (baseRotation + extraRotation) % 360;

      // Initial unscaled viewport to determine base dimensions
      const unscaledViewport = page.getViewport({ scale: 1, rotation: totalRotation });

      let scale = options.scale || 1.0;

      // If targetWidth or targetHeight provided, calculate appropriate scale
      if (options.targetWidth && !options.scale) {
        scale = options.targetWidth / unscaledViewport.width;
      } else if (options.targetHeight && !options.scale) {
        scale = options.targetHeight / unscaledViewport.height;
      }

      const viewport = page.getViewport({ scale, rotation: totalRotation });
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

      // Set actual pixel dimensions based on DPI
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // Set CSS display dimensions
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Failed to acquire 2D context from canvas');
      }

      // Fill white background before rendering
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Scale context to match devicePixelRatio
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderContext = {
        canvasContext: ctx,
        viewport
      };

      try {
        pdfRenderTask = page.render(renderContext);
        (canvas as any)._currentPdfRenderTask = pdfRenderTask;
        await pdfRenderTask.promise;
      } catch (err: any) {
        if (err?.message?.includes('Cannot use the same canvas') && !isCancelled) {
          // Microtask yield and retry if previous render tear-down was slightly lagging
          await new Promise((r) => setTimeout(r, 40));
          if (isCancelled) return;
          pdfRenderTask = page.render(renderContext);
          (canvas as any)._currentPdfRenderTask = pdfRenderTask;
          await pdfRenderTask.promise;
        } else {
          throw err;
        }
      } finally {
        if ((canvas as any)._currentPdfRenderTask === pdfRenderTask) {
          (canvas as any)._currentPdfRenderTask = null;
        }
      }
    } catch (err: any) {
      if (err?.name === 'RenderingCancelledException' || isCancelled) {
        // Normal cancellation when switching pages or zoom quickly
        return;
      }
      throw err;
    }
  })();

  return {
    cancel: () => {
      isCancelled = true;
      if (pdfRenderTask && typeof pdfRenderTask.cancel === 'function') {
        try {
          pdfRenderTask.cancel();
        } catch {
          // ignore already completed/cancelled
        }
      }
      if ((canvas as any)._currentPdfRenderTask === pdfRenderTask) {
        (canvas as any)._currentPdfRenderTask = null;
      }
    },
    promise
  };
}

/**
 * Generates a thumbnail data URL for a given PDF page
 */
export async function generatePageThumbnail(
  pdfDoc: any,
  pageNumber: number,
  targetWidth = 180
): Promise<string> {
  const canvas = document.createElement('canvas');
  const task = renderPageToCanvas(pdfDoc, pageNumber, canvas, { targetWidth });
  await task.promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  // Free canvas memory
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}
