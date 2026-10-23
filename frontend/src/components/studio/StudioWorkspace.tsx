'use client';

import React, { useRef, useState, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import {
  UploadCloud,
  ArrowLeft,
  ArrowRight,
  Plus,
  FileText,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  Sparkles
} from 'lucide-react';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { useDocumentStudio } from './useDocumentStudio';
import { DocumentViewer } from './DocumentViewer';
import { PageManager } from './PageManager';
import { StudioControls } from './StudioControls';
import { OutputPreview } from './OutputPreview';

interface StudioWorkspaceProps {
  tool: ToolDefinition;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({ tool }) => {
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

  // Drag-and-drop handlers for dropzone
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

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
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

        {/* Tool Header Banner */}
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

        {/* ============================================================== */}
        {/* POST-PROCESSING OUTPUT PREVIEW */}
        {/* ============================================================== */}
        {outputResult && (
          <OutputPreview
            result={outputResult}
            toolTitle={tool.title}
            onReset={resetWorkspace}
          />
        )}

        {/* ============================================================== */}
        {/* ACTIVE WORKSPACE */}
        {/* ============================================================== */}
        {!outputResult && (
          <div className="space-y-6">
            {/* Stable file input for all upload triggers */}
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

            {/* If no files uploaded yet: show prominent dropzone */}
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

            {/* If files uploaded: show interactive split workspace */}
            {documents.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* LEFT / CENTER: Interactive Studio (Cols 8) */}
                <div className="lg:col-span-8 space-y-6">
                  {/* Multi-document File List & Switcher Bar */}
                  {tool.maxFiles > 1 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-2 overflow-x-auto py-1 max-w-full">
                        <span className="text-xs font-bold text-slate-500 flex items-center space-x-1 shrink-0 px-1">
                          <Layers className="w-3.5 h-3.5" />
                          <span>Documents ({documents.length}):</span>
                        </span>
                        {documents.map((doc, idx) => (
                          <div
                            key={doc.id}
                            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                              doc.id === activeDocId
                                ? 'bg-rose-50 text-rose-700 border border-rose-300 ring-1 ring-rose-300/40 shadow-xs'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDocId(doc.id);
                                setActivePageIndex(1);
                              }}
                              className="truncate max-w-[130px] sm:max-w-[180px] text-left cursor-pointer hover:underline"
                              title={`${doc.name} (${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'})`}
                            >
                              {doc.name}
                            </button>
                            <span className="text-[10px] text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200/50">
                              {doc.pageCount}p
                            </span>

                            {/* Reorder in merge queue if multiple files */}
                            {documents.length > 1 && (
                              <div className="flex items-center space-x-0.5 ml-1 border-l border-slate-200/70 pl-1">
                                {idx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => moveDocument(idx, idx - 1)}
                                    className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                                    title="Move earlier in merge order"
                                  >
                                    <ArrowLeft className="w-3 h-3" />
                                  </button>
                                )}
                                {idx < documents.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => moveDocument(idx, idx + 1)}
                                    className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                                    title="Move later in merge order"
                                  >
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => removeDocument(doc.id)}
                              className="text-slate-400 hover:text-red-600 p-0.5 rounded ml-0.5 transition-colors"
                              title="Remove document"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Prominent Add More PDFs Button */}
                      <div className="flex items-center space-x-2.5 shrink-0 ml-auto">
                        {documents.length < tool.minFiles && (
                          <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 hidden sm:inline-block">
                            Add at least {tool.minFiles - documents.length} more {tool.accept.includes('.pdf') ? 'PDF' : 'file'} to merge
                          </span>
                        )}

                        {documents.length < tool.maxFiles ? (
                          <button
                            type="button"
                            id="add-more-pdfs-btn"
                            data-testid="add-more-pdfs-btn"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-xs transition-colors shrink-0 cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>
                              {tool.accept.includes('.pdf')
                                ? 'Add More PDFs'
                                : tool.accept.some((a) => a.includes('jpg') || a.includes('png'))
                                ? 'Add More Images'
                                : 'Add More Files'}
                            </span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                            Max {tool.maxFiles} files reached
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Primary Canvas Document Viewer */}
                  <div className="h-[520px] sm:h-[580px] w-full">
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
                      canAddMore={documents.length < tool.maxFiles && tool.maxFiles > 1}
                      onAddMoreFiles={() => fileInputRef.current?.click()}
                    />
                  </div>

                  {/* Reusable Page Manager Thumbnail Bar */}
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

                {/* RIGHT SIDEBAR: Parameters & Execution (Cols 4) */}
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
