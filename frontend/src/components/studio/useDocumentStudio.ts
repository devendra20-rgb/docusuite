'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { ToolDefinition } from '@/types/api';
import {
  StudioDocument,
  StudioPage,
  StudioOperation,
  StudioProcessingState,
  StudioOutputResult,
  RotationAngle,
  ZoomMode,
  ViewMode
} from './types';
import { loadPdfDocument } from './pdf-loader';
import {
  applyOperationToPages,
  calculateNormalizedRotation,
  compileOrganizeOperations,
  invertOperation
} from './operations';
import { submitDocumentJob, saveSessionHistoryItem, getFullApiUrl } from '@/lib/api-client';

interface UseDocumentStudioProps {
  tool: ToolDefinition;
}

export function useDocumentStudio({ tool }: UseDocumentStudioProps) {
  const [documents, setDocuments] = useState<StudioDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(1);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [pdfDocsVersion, setPdfDocsVersion] = useState<number>(0);

  // Zoom & View configuration
  const [zoom, setZoom] = useState<number>(1.0);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-page');
  const [viewMode, setViewMode] = useState<ViewMode>('single');

  // Tool parameter form state
  const [parameters, setParameters] = useState<Record<string, any>>(() => {
    const initial: Record<string, any> = {};
    tool.params?.forEach((p) => {
      if (p.defaultValue !== undefined) {
        initial[p.name] = p.defaultValue;
      }
    });
    return initial;
  });

  // Undo / Redo history
  const [history, setHistory] = useState<{
    past: StudioOperation[];
    future: StudioOperation[];
  }>({ past: [], future: [] });

  // Processing & Output state
  const [processingState, setProcessingState] = useState<StudioProcessingState>({
    status: 'idle',
    progress: 0,
    message: ''
  });
  const [outputResult, setOutputResult] = useState<StudioOutputResult | null>(null);

  // Cached PDF.js document instances (keyed by document.id)
  const pdfDocsRef = useRef<Map<string, any>>(new Map());

  // Active document helper
  const activeDocument = documents.find((d) => d.id === activeDocId) || documents[0] || null;

  // Active page helper
  const activePages = activeDocument ? activeDocument.pages : [];
  const activePage =
    activePages.find((p) => p.displayOrder === activePageIndex) || activePages[0] || null;

  // Active PDF.js instance
  const activePdfDoc = useMemo(() => {
    if (!activeDocument) return null;
    return pdfDocsRef.current.get(activeDocument.id) || null;
  }, [activeDocument, pdfDocsVersion]);

  // Ensure active PDF document instance is loaded and cached
  useEffect(() => {
    if (!activeDocument || !activeDocument.isPdf) return;
    if (pdfDocsRef.current.has(activeDocument.id)) return;

    let isCancelled = false;
    (async () => {
      try {
        const source = activeDocument.objectUrl || (await activeDocument.file.arrayBuffer());
        const doc = await loadPdfDocument(source);
        if (!isCancelled) {
          pdfDocsRef.current.set(activeDocument.id, doc);
          setPdfDocsVersion((v) => v + 1);
        }
      } catch (err) {
        console.error('Failed to load PDF doc for active document:', err);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [activeDocument]);

  // Synchronize activePageIndex within document page count bounds
  useEffect(() => {
    if (activePages.length > 0) {
      if (activePageIndex < 1) {
        setActivePageIndex(1);
      } else if (activePageIndex > activePages.length) {
        setActivePageIndex(activePages.length);
      }
    }
  }, [activePages.length, activePageIndex]);

  // Keep ref to documents for cleanup on unmount only
  const documentsRef = useRef<StudioDocument[]>(documents);
  documentsRef.current = documents;

  // Cleanup object URLs on unmount or file removal
  const cleanupDocumentUrls = useCallback((docsToClean: StudioDocument[]) => {
    docsToClean.forEach((doc) => {
      if (doc.objectUrl) {
        try {
          URL.revokeObjectURL(doc.objectUrl);
        } catch {
          // ignore
        }
      }
      pdfDocsRef.current.delete(doc.id);
    });
  }, []);

  // Cleanup all on component unmount ONLY
  useEffect(() => {
    return () => {
      cleanupDocumentUrls(documentsRef.current);
      setDocuments([]);
      setActiveDocId(null);
      setActivePageIndex(1);
      setSelectedPageIds(new Set());
      setHistory({ past: [], future: [] });
      setOutputResult(null);
      setProcessingState({ status: 'idle', progress: 0, message: '' });
    };
  }, [cleanupDocumentUrls]);

  // Load a single file into a StudioDocument
  const loadStudioDocument = async (file: File): Promise<StudioDocument> => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isPdf = ext === '.pdf' || file.type === 'application/pdf';
    const isImage = /\.(jpe?g|png|webp|bmp|svg)$/i.test(file.name);
    const isOffice = /\.(docx?|xlsx?|pptx?|odt|ods|odp)$/i.test(file.name);

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const objectUrl = URL.createObjectURL(file);

    let pageCount = 1;
    const pages: StudioPage[] = [];

    if (isPdf) {
      try {
        const pdfDoc = await loadPdfDocument(objectUrl);
        pdfDocsRef.current.set(docId, pdfDoc);
        setPdfDocsVersion((v) => v + 1);
        pageCount = pdfDoc.numPages;

        for (let i = 1; i <= pageCount; i++) {
          pages.push({
            id: `${docId}_p${i}`,
            originalPageNumber: i,
            displayOrder: i,
            rotation: 0,
            isDeleted: false
          });
        }

        return {
          id: docId,
          file,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/pdf',
          isPdf,
          isImage,
          isOffice,
          objectUrl,
          pageCount,
          pages,
          loadState: 'loaded'
        };
      } catch (err: any) {
        return {
          id: docId,
          file,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/pdf',
          isPdf,
          isImage,
          isOffice,
          objectUrl,
          pageCount: 1,
          pages: [
            {
              id: `${docId}_p1`,
              originalPageNumber: 1,
              displayOrder: 1,
              rotation: 0,
              isDeleted: false
            }
          ],
          loadState: 'error',
          errorMessage: err?.message || 'Failed to read PDF pages'
        };
      }
    } else {
      // Non-PDF (Image or Office doc)
      pages.push({
        id: `${docId}_p1`,
        originalPageNumber: 1,
        displayOrder: 1,
        rotation: 0,
        isDeleted: false
      });

      return {
        id: docId,
        file,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        isPdf,
        isImage,
        isOffice,
        objectUrl,
        pageCount: 1,
        pages,
        loadState: 'loaded'
      };
    }
  };

  // Add files to workspace
  const addFiles = async (incomingFiles: FileList | File[]) => {
    const fileList = Array.from(incomingFiles);
    if (fileList.length === 0) return;

    if (tool.maxFiles > 1 && documents.length >= tool.maxFiles) {
      setProcessingState({
        status: 'error',
        progress: 0,
        message: '',
        error: `Maximum limit of ${tool.maxFiles} files reached for this tool.`
      });
      return;
    }

    setProcessingState({ status: 'preparing', progress: 10, message: 'Inspecting document pages...' });
    const newDocs: StudioDocument[] = [];
    const duplicates: string[] = [];
    const unsupported: string[] = [];
    let limitReached = false;

    for (const file of fileList) {
      if (tool.maxFiles === 1) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const isAccepted = tool.accept.length === 0 || tool.accept.some((a) => a.toLowerCase() === ext);
        if (!isAccepted) {
          unsupported.push(file.name);
          break;
        }
        const studioDoc = await loadStudioDocument(file);
        newDocs.push(studioDoc);
        break;
      }

      if (documents.length + newDocs.length >= tool.maxFiles) {
        limitReached = true;
        break;
      }

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      const isAccepted = tool.accept.length === 0 || tool.accept.some((a) => a.toLowerCase() === ext);
      if (!isAccepted) {
        unsupported.push(file.name);
        continue;
      }

      const isDuplicate =
        documents.some((d) => d.name === file.name && d.size === file.size) ||
        newDocs.some((d) => d.name === file.name && d.size === file.size);

      if (isDuplicate) {
        duplicates.push(file.name);
        continue;
      }

      const studioDoc = await loadStudioDocument(file);
      newDocs.push(studioDoc);
    }

    if (newDocs.length > 0) {
      if (tool.maxFiles === 1) {
        cleanupDocumentUrls(documents);
        setDocuments(newDocs.slice(0, 1));
        setActiveDocId(newDocs[0].id);
        setActivePageIndex(1);
      } else {
        setDocuments((prev) => [...prev, ...newDocs]);
        if (!activeDocId) {
          setActiveDocId(newDocs[0].id);
          setActivePageIndex(1);
          setZoomMode('fit-page');
        }
      }
    }

    if (unsupported.length > 0) {
      setProcessingState({
        status: 'error',
        progress: 0,
        message: '',
        error: `Unsupported file type: ${unsupported.join(', ')}. Please upload: ${tool.accept.join(', ')}`
      });
    } else if (duplicates.length > 0) {
      setProcessingState({
        status: 'error',
        progress: 0,
        message: '',
        error:
          duplicates.length === 1
            ? `File "${duplicates[0]}" has already been added.`
            : `Duplicate files ignored: ${duplicates.join(', ')}`
      });
    } else if (limitReached) {
      setProcessingState({
        status: 'error',
        progress: 0,
        message: '',
        error: `Maximum limit of ${tool.maxFiles} files reached.`
      });
    } else {
      setProcessingState({ status: 'idle', progress: 0, message: '' });
    }
  };

  // Remove a document
  const removeDocument = (docId: string) => {
    const docToRemove = documents.find((d) => d.id === docId);
    if (docToRemove) {
      cleanupDocumentUrls([docToRemove]);
    }
    setDocuments((prev) => {
      const next = prev.filter((d) => d.id !== docId);
      if (activeDocId === docId) {
        setActiveDocId(next[0]?.id || null);
        setActivePageIndex(1);
      }
      return next;
    });
    setSelectedPageIds(new Set());
  };

  // Move document in multi-document tools (e.g. merge)
  const moveDocument = (fromIndex: number, toIndex: number) => {
    setDocuments((prev) => {
      const next = [...prev];
      if (fromIndex < 0 || fromIndex >= next.length || toIndex < 0 || toIndex >= next.length) {
        return prev;
      }
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  // Execute an operation and append to history
  const executeOperation = useCallback(
    (op: StudioOperation, docId?: string) => {
      const targetDocId = docId || activeDocId;
      if (!targetDocId) return;

      setDocuments((prevDocs) => {
        return prevDocs.map((doc) => {
          if (doc.id !== targetDocId) return doc;
          const updatedPages = applyOperationToPages(doc.pages, op);
          return {
            ...doc,
            pages: updatedPages
          };
        });
      });

      const opWithDoc = { ...op, docId: targetDocId };

      setHistory((prev) => ({
        past: [...prev.past, opWithDoc as any],
        future: [] // clear redo stack on new action
      }));
    },
    [activeDocId]
  );

  // Rotate a specific page
  const rotatePage = (pageId: string, deltaAngle: 90 | -90 | 180 = 90) => {
    if (!activeDocument) return;
    const targetPage = activeDocument.pages.find((p) => p.id === pageId);
    if (!targetPage) return;

    const newAngle = calculateNormalizedRotation(targetPage.rotation, deltaAngle);
    const op: StudioOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'rotate',
      pageId,
      deltaAngle,
      prevAngle: targetPage.rotation,
      newAngle,
      timestamp: Date.now(),
      description: `Rotate page ${targetPage.displayOrder} by ${deltaAngle}°`
    };
    executeOperation(op);
  };

  // Rotate all currently selected pages
  const rotateSelected = (deltaAngle: 90 | -90 | 180 = 90) => {
    if (!activeDocument || selectedPageIds.size === 0) return;
    const op: StudioOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'batch-rotate',
      pageIds: Array.from(selectedPageIds),
      deltaAngle,
      timestamp: Date.now(),
      description: `Rotate ${selectedPageIds.size} selected pages by ${deltaAngle}°`
    };
    executeOperation(op);
  };

  // Toggle deletion / exclusion of a page
  const toggleDeletePage = (pageId: string, docId?: string) => {
    let targetDoc = docId ? documents.find((d) => d.id === docId) : activeDocument;
    let target = targetDoc?.pages.find((p) => p.id === pageId);

    // Fallback if args were swapped: docId might be pageId and pageId might be docId
    if (!target) {
      const swappedDoc = documents.find((d) => d.id === pageId);
      if (swappedDoc) {
        const swappedTarget = swappedDoc.pages.find((p) => p.id === docId);
        if (swappedTarget) {
          targetDoc = swappedDoc;
          target = swappedTarget;
        }
      }
    }

    // Fallback: search all documents for pageId
    if (!target) {
      for (const d of documents) {
        const found = d.pages.find((p) => p.id === pageId || p.id === docId);
        if (found) {
          targetDoc = d;
          target = found;
          break;
        }
      }
    }

    if (!target || !targetDoc) return;

    const op: StudioOperation = target.isDeleted
      ? {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'restore',
          pageId: target.id,
          timestamp: Date.now(),
          description: `Restore page ${target.displayOrder}`
        }
      : {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'delete',
          pageId: target.id,
          timestamp: Date.now(),
          description: `Exclude page ${target.displayOrder}`
        };

    executeOperation(op, targetDoc.id);
  };

  // Delete all selected pages
  const deleteSelected = () => {
    if (!activeDocument || selectedPageIds.size === 0) return;
    const op: StudioOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'batch-delete',
      pageIds: Array.from(selectedPageIds),
      timestamp: Date.now(),
      description: `Exclude ${selectedPageIds.size} selected pages`
    };
    executeOperation(op);
  };

  // Reorder page from one index to another
  const reorderPage = (fromIndex: number, toIndex: number) => {
    if (!activeDocument || fromIndex === toIndex) return;
    const op: StudioOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'reorder',
      fromIndex,
      toIndex,
      timestamp: Date.now(),
      description: `Reorder page ${fromIndex + 1} to position ${toIndex + 1}`
    };
    executeOperation(op);
  };

  // Selection controls
  const togglePageSelection = (pageId: string, multi = false) => {
    setSelectedPageIds((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const selectAllPages = () => {
    if (!activeDocument) return;
    setSelectedPageIds(new Set(activeDocument.pages.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedPageIds(new Set());
  };

  // Select pages via range string (e.g. "1-3, 5")
  const selectRange = (rangeStr: string) => {
    if (!activeDocument) return;
    const pageNumSet = new Set<number>();
    const parts = rangeStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            pageNumSet.add(i);
          }
        }
      } else {
        const num = Number(trimmed);
        if (!isNaN(num)) pageNumSet.add(num);
      }
    }

    const newSelection = new Set<string>();
    activeDocument.pages.forEach((p) => {
      if (pageNumSet.has(p.displayOrder) || pageNumSet.has(p.originalPageNumber)) {
        newSelection.add(p.id);
      }
    });
    setSelectedPageIds(newSelection);
  };

  // Undo / Redo
  const undo = () => {
    if (history.past.length === 0) return;
    const lastOp = history.past[history.past.length - 1];
    const targetDocId = (lastOp as any).docId || activeDocId;
    if (!targetDocId) return;
    const inverted = invertOperation(lastOp);

    if (inverted) {
      setDocuments((prevDocs) => {
        return prevDocs.map((doc) => {
          if (doc.id !== targetDocId) return doc;
          return {
            ...doc,
            pages: applyOperationToPages(doc.pages, inverted)
          };
        });
      });
    }

    setHistory((prev) => ({
      past: prev.past.slice(0, -1),
      future: [lastOp, ...prev.future]
    }));
  };

  const redo = () => {
    if (history.future.length === 0) return;
    const nextOp = history.future[0];
    const targetDocId = (nextOp as any).docId || activeDocId;
    if (!targetDocId) return;

    setDocuments((prevDocs) => {
      return prevDocs.map((doc) => {
        if (doc.id !== targetDocId) return doc;
        return {
          ...doc,
          pages: applyOperationToPages(doc.pages, nextOp)
        };
      });
    });

    setHistory((prev) => ({
      past: [...prev.past, nextOp],
      future: prev.future.slice(1)
    }));
  };

  // Parameter update
  const setParameter = (name: string, value: any) => {
    setParameters((prev) => ({ ...prev, [name]: value }));
  };

  // Submit and process job
  const executeProcess = async () => {
    const validDocs = documents.filter((d) => d.loadState === 'loaded');
    if (validDocs.length < tool.minFiles) {
      setProcessingState({
        status: 'error',
        progress: 0,
        message: '',
        error:
          tool.minFiles > 1
            ? `Please upload at least ${tool.minFiles} valid documents to continue.`
            : `Please upload a valid document to continue.`
      });
      return;
    }

    // Required parameter check
    if (tool.params) {
      for (const p of tool.params) {
        if (p.required && (parameters[p.name] === undefined || parameters[p.name] === '')) {
          setProcessingState({
            status: 'error',
            progress: 0,
            message: '',
            error: `Please provide a value for "${p.label}".`
          });
          return;
        }
      }
    }

    setProcessingState({
      status: 'processing',
      progress: 15,
      message: 'Preparing files and operations for engine...'
    });
    setOutputResult(null);

    try {
      // Build effective parameters based on interactive tool state
      const effectiveParams: Record<string, any> = { ...parameters };

      // If tool is merge: validate remaining pages and compile fileOperations for all valid docs
      if (tool.slug === 'merge') {
        const totalRemaining = validDocs.reduce(
          (acc, d) => acc + d.pages.filter((p) => !p.isDeleted).length,
          0
        );
        if (totalRemaining === 0) {
          setProcessingState({
            status: 'error',
            progress: 0,
            message: '',
            error: 'Cannot merge documents: all pages have been excluded. Please restore at least one page.'
          });
          return;
        }
        effectiveParams.fileOperations = validDocs.map((doc) =>
          compileOrganizeOperations(doc.pages)
        );
      }

      if (activeDocument) {
        // If tool is organize: compile operations array
        if (tool.slug === 'organize') {
          effectiveParams.operations = compileOrganizeOperations(activeDocument.pages);
        }

        // If tool is rotate: ensure rotation is synced
        if (tool.slug === 'rotate') {
          const pageRotationsMap: Record<number, number> = {};
          let hasNonZero = false;
          activeDocument.pages.forEach((p) => {
            if (p.rotation !== 0) {
              pageRotationsMap[p.originalPageNumber] = p.rotation;
              hasNonZero = true;
            }
          });

          if (hasNonZero) {
            effectiveParams.pageRotations = pageRotationsMap;
            const rotatedPages = Object.keys(pageRotationsMap).map(Number);
            if (!effectiveParams.pages) {
              effectiveParams.pages = rotatedPages;
            }
          } else {
            // Net 0 rotation across all pages
            effectiveParams.rotation = 0;
            effectiveParams.pageRotations = {};
          }
        }

        // If tool is reorder: compile pageOrder array
        if (tool.slug === 'reorder') {
          effectiveParams.pageOrder = activeDocument.pages.map((p) => p.originalPageNumber);
        }

        // If tool is delete: compile deleted pages
        if (tool.slug === 'delete') {
          const deleted = activeDocument.pages
            .filter((p) => p.isDeleted)
            .map((p) => p.originalPageNumber);
          if (deleted.length > 0) {
            effectiveParams.pages = deleted;
          }
        }

        // If tool is extract: compile selected pages
        if (tool.slug === 'extract') {
          const selectedNums = activeDocument.pages
            .filter((p) => selectedPageIds.has(p.id))
            .map((p) => p.originalPageNumber);
          if (selectedNums.length > 0) {
            effectiveParams.pages = selectedNums;
          }
        }
      }

      // Gather raw files (only valid loaded documents)
      const rawFiles = validDocs.map((d) => d.file);

      const res = await submitDocumentJob(
        tool.endpoint,
        rawFiles,
        effectiveParams,
        {
          onProgress: (p, stage) => {
            setProcessingState({
              status: 'processing',
              progress: p,
              message: stage
            });
          }
        }
      );

      if (res.success && (res.downloadUrl || res.outputFiles)) {
        const primaryDl = res.downloadUrl || res.outputFiles?.[0]?.downloadUrl || '';

        // Validate output PDF if it's a PDF tool and extract verified page count
        let verifiedPageCount: number | undefined;
        let verifiedSizeBytes: number | undefined;

        if (primaryDl) {
          try {
            setProcessingState({
              status: 'processing',
              progress: 92,
              message: 'Verifying generated output...'
            });
            const fullUrl = getFullApiUrl(primaryDl);
            const verifyRes = await fetch(fullUrl);
            if (!verifyRes.ok) {
              throw new Error(`Failed to fetch generated output (HTTP ${verifyRes.status})`);
            }
            const buf = await verifyRes.arrayBuffer();
            verifiedSizeBytes = buf.byteLength;

            const filename = (res.outputFiles?.[0]?.filename || res.outputFiles?.[0]?.originalName || primaryDl).toLowerCase();
            const mimeType = (res.outputFiles?.[0]?.mimeType || '').toLowerCase();
            const isPdf = filename.endsWith('.pdf') || mimeType === 'application/pdf';

            if (isPdf) {
              const pdfDoc = await loadPdfDocument(buf);
              verifiedPageCount = pdfDoc.numPages;
              if (verifiedPageCount <= 0) {
                throw new Error('Generated PDF contains 0 pages');
              }
            }
          } catch (vErr: any) {
            throw new Error(`Output verification failed: ${vErr?.message || 'Invalid output file'}`);
          }
        }

        const outputList = (res.outputFiles || [
          {
            filename: `${tool.slug}_output.pdf`,
            downloadUrl: primaryDl,
            mimeType: 'application/pdf',
            size: verifiedSizeBytes
          }
        ]).map((o: any) => {
          const fn = o.filename || `${tool.slug}_output.pdf`;
          const isPdf = fn.endsWith('.pdf');
          const isImg = /\.(jpe?g|png|webp|svg)$/i.test(fn);
          return {
            filename: fn,
            downloadUrl: o.downloadUrl,
            mimeType: o.mimeType,
            size: verifiedSizeBytes || o.size,
            pageCount: verifiedPageCount,
            isPdf,
            isImage: isImg
          };
        });

        const result: StudioOutputResult = {
          jobId: res.jobId || 'completed',
          downloadUrl: primaryDl,
          outputFiles: outputList,
          primaryOutput: outputList[0],
          createdAt: Date.now()
        };

        setOutputResult(result);
        setProcessingState({
          status: 'completed',
          progress: 100,
          message: 'Output generated and verified.'
        });

        // Trigger celebratory confetti
        try {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 }
          });
        } catch {
          // ignore if canvas confetti not supported in environment
        }

        // Record to local session history
        saveSessionHistoryItem({
          jobId: res.jobId || 'completed',
          toolId: tool.id,
          toolTitle: tool.title,
          inputFiles: documents.map((d) => ({ name: d.name, size: d.size })),
          outputFiles: outputList.map((o) => ({ name: o.filename, downloadUrl: o.downloadUrl })),
          status: 'completed'
        });
      } else {
        throw new Error(res.error?.message || 'Document processing produced unexpected output format');
      }
    } catch (err: any) {
      setProcessingState({
        status: 'error',
        progress: 0,
        message: '',
        error: err?.message || 'Processing failed. Please try again.'
      });
    }
  };

  // Reset workspace
  const dismissOutput = () => {
    setOutputResult(null);
    setProcessingState({ status: 'idle', progress: 0, message: '' });
  };

  const getPdfDoc = useCallback((docId: string) => {
    return pdfDocsRef.current.get(docId) || null;
  }, []);

  const selectDocumentAndPage = useCallback((docId: string, pageIndex = 1) => {
    setActiveDocId(docId);
    setActivePageIndex(pageIndex);
    // When switching documents, return to fit-page to prevent retaining unexpectedly high zoom
    setZoomMode('fit-page');
  }, []);

  const resetWorkspace = () => {
    cleanupDocumentUrls(documents);
    setDocuments([]);
    setActiveDocId(null);
    setActivePageIndex(1);
    setZoomMode('fit-page');
    setZoom(1.0);
    setSelectedPageIds(new Set());
    setHistory({ past: [], future: [] });
    const initialParams: Record<string, any> = {};
    tool.params?.forEach((p) => {
      if (p.defaultValue !== undefined) {
        initialParams[p.name] = p.defaultValue;
      }
    });
    setParameters(initialParams);
    setOutputResult(null);
    setProcessingState({ status: 'idle', progress: 0, message: '' });
  };

  return {
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
    viewMode,
    parameters,
    processingState,
    outputResult,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    addFiles,
    removeDocument,
    moveDocument,
    setActiveDocId,
    setActivePageIndex,
    selectDocumentAndPage,
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
    setViewMode,
    setParameter,
    executeProcess,
    resetWorkspace,
    dismissOutput,
    getPdfDoc,
    dismissError: () =>
      setProcessingState((prev) => ({ ...prev, status: 'idle', error: undefined }))
  };
}
