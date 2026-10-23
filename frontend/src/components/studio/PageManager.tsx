'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  RotateCw,
  RotateCcw,
  Trash2,
  Undo2,
  CheckSquare,
  Square,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Check,
  Undo,
  Redo
} from 'lucide-react';
import { StudioPage } from './types';
import { generatePageThumbnail } from './pdf-loader';

interface PageManagerProps {
  pages: StudioPage[];
  activePdfDoc: any;
  activePageIndex: number;
  selectedPageIds: Set<string>;
  canUndo: boolean;
  canRedo: boolean;
  onPageSelect: (pageIndex: number) => void;
  onToggleSelection: (pageId: string, multi?: boolean) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectRange: (range: string) => void;
  onRotatePage: (pageId: string, delta?: 90 | -90) => void;
  onRotateSelected: (delta?: 90 | -90) => void;
  onToggleDeletePage: (pageId: string) => void;
  onDeleteSelected: () => void;
  onReorderPage: (fromIndex: number, toIndex: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const PageManager: React.FC<PageManagerProps> = ({
  pages,
  activePdfDoc,
  activePageIndex,
  selectedPageIds,
  canUndo,
  canRedo,
  onPageSelect,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onSelectRange,
  onRotatePage,
  onRotateSelected,
  onToggleDeletePage,
  onDeleteSelected,
  onReorderPage,
  onUndo,
  onRedo
}) => {
  // Thumbnail cache keyed by page.id
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [rangeInput, setRangeInput] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Lazy render thumbnails when PDF doc is loaded
  useEffect(() => {
    if (!activePdfDoc || pages.length === 0) return;

    let isCancelled = false;

    const renderThumbnails = async () => {
      for (const page of pages) {
        if (isCancelled || !mountedRef.current) break;
        if (!thumbnails[page.id]) {
          try {
            const dataUrl = await generatePageThumbnail(
              activePdfDoc,
              page.originalPageNumber,
              140
            );
            if (!isCancelled && mountedRef.current) {
              setThumbnails((prev) => ({
                ...prev,
                [page.id]: dataUrl
              }));
            }
          } catch {
            // ignore render thumbnail failure
          }
        }
      }
    };

    renderThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [activePdfDoc, pages, thumbnails]);

  // Handle Drag & Drop
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      onReorderPage(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
  };

  const handleRangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rangeInput.trim()) {
      onSelectRange(rangeInput.trim());
    }
  };

  const selectedCount = selectedPageIds.size;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col space-y-4">
      {/* Top Manager Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 text-xs">
        {/* Left: Section title & Selection tools */}
        <div className="flex items-center space-x-2">
          <span className="font-heading font-bold text-slate-800 text-sm">
            Pages ({pages.length})
          </span>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <button
            onClick={selectedCount === pages.length ? onClearSelection : onSelectAll}
            className="inline-flex items-center space-x-1 font-semibold text-slate-600 hover:text-rose-600 transition-colors cursor-pointer"
          >
            {selectedCount === pages.length ? (
              <CheckSquare className="w-3.5 h-3.5 text-rose-600" />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{selectedCount === pages.length ? 'Deselect All' : 'Select All'}</span>
          </button>

          {/* Quick Range Selector */}
          <form onSubmit={handleRangeSubmit} className="hidden sm:flex items-center space-x-1 pl-2">
            <input
              type="text"
              placeholder="e.g. 1-3, 5"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              className="w-24 h-7 px-2 text-[11px] rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <button
              type="submit"
              className="h-7 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
            >
              Select
            </button>
          </form>
        </div>

        {/* Right: Batch Actions & Undo / Redo */}
        <div className="flex items-center space-x-2">
          {/* Batch operations if pages selected */}
          {selectedCount > 0 && (
            <div className="flex items-center space-x-1 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 text-rose-700 animate-in fade-in duration-150">
              <span className="font-bold text-[11px] mr-1">{selectedCount} selected:</span>
              <button
                onClick={() => onRotateSelected(90)}
                className="p-1 rounded hover:bg-rose-100 transition-colors"
                title="Rotate Selected (+90°)"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDeleteSelected}
                className="p-1 rounded hover:bg-rose-100 text-red-600 transition-colors"
                title="Exclude Selected"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Undo / Redo */}
          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg">
            <button
              disabled={!canUndo}
              onClick={onUndo}
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Undo last change"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={!canRedo}
              onClick={onRedo}
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Redo change"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Pages Carousel / Horizontal Thumbnails Strip */}
      <div className="overflow-x-auto pb-2 flex items-stretch space-x-3.5 scrollbar-thin">
        {pages.map((page, index) => {
          const isActive = page.displayOrder === activePageIndex;
          const isSelected = selectedPageIds.has(page.id);
          const thumbUrl = thumbnails[page.id];

          return (
            <div
              key={page.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => onPageSelect(page.displayOrder)}
              className={`group relative flex flex-col justify-between w-36 shrink-0 rounded-xl border p-2 bg-slate-50/70 transition-all cursor-pointer ${
                isActive
                  ? 'border-rose-500 ring-2 ring-rose-500/20 bg-white shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-white'
              } ${page.isDeleted ? 'opacity-50 grayscale' : ''}`}
            >
              {/* Header: Page Badge & Selection Checkbox */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                  #{page.displayOrder}
                  {page.originalPageNumber !== page.displayOrder && (
                    <span className="text-[9px] text-slate-400 ml-1">
                      (orig {page.originalPageNumber})
                    </span>
                  )}
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection(page.id, true);
                  }}
                  className="text-slate-400 hover:text-rose-600 transition-colors"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-rose-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Thumbnail Display Canvas / Image */}
              <div className="relative aspect-[3/4] w-full rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center shadow-xs">
                {thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl}
                    alt={`Page ${page.displayOrder}`}
                    style={{
                      transform: `rotate(${page.rotation}deg)`,
                      transition: 'transform 0.15s ease'
                    }}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="text-[11px] text-slate-400 font-medium">Loading...</div>
                )}

                {/* Rotation angle badge */}
                {page.rotation !== 0 && (
                  <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded text-[9px] font-bold bg-slate-900/80 text-white">
                    {page.rotation}°
                  </span>
                )}

                {/* Excluded overlay */}
                {page.isDeleted && (
                  <div className="absolute inset-0 bg-red-950/70 backdrop-blur-[1px] flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-wider">
                    Excluded
                  </div>
                )}
              </div>

              {/* Page Quick Actions Toolbar (visible on hover or active) */}
              <div className="mt-2 flex items-center justify-between text-slate-500 pt-1 border-t border-slate-100">
                {/* Move Left */}
                <button
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorderPage(index, index - 1);
                  }}
                  className="p-1 rounded hover:bg-slate-200/60 disabled:opacity-20 disabled:pointer-events-none"
                  title="Move Left"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>

                {/* Rotate Page (+90°) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotatePage(page.id, 90);
                  }}
                  className="p-1 rounded hover:bg-slate-200/60 text-slate-600 hover:text-slate-900"
                  title="Rotate +90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                {/* Exclude / Restore Page */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDeletePage(page.id);
                  }}
                  className={`p-1 rounded hover:bg-slate-200/60 ${
                    page.isDeleted
                      ? 'text-emerald-600 hover:text-emerald-700'
                      : 'text-slate-500 hover:text-red-600'
                  }`}
                  title={page.isDeleted ? 'Restore Page' : 'Exclude Page'}
                >
                  {page.isDeleted ? (
                    <Undo2 className="w-3.5 h-3.5" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Move Right */}
                <button
                  disabled={index === pages.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorderPage(index, index + 1);
                  }}
                  className="p-1 rounded hover:bg-slate-200/60 disabled:opacity-20 disabled:pointer-events-none"
                  title="Move Right"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
