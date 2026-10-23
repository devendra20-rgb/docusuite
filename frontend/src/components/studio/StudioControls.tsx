'use client';

import React from 'react';
import {
  Loader2,
  AlertCircle,
  Info,
  CheckCircle2,
  FileText,
  Sliders,
  ShieldCheck
} from 'lucide-react';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { StudioProcessingState, StudioDocument, StudioPage } from './types';

interface StudioControlsProps {
  tool: ToolDefinition;
  documents: StudioDocument[];
  activeDocument: StudioDocument | null;
  parameters: Record<string, any>;
  processingState: StudioProcessingState;
  onParameterChange: (name: string, value: any) => void;
  onExecute: () => void;
  onDismissError: () => void;
}

export const StudioControls: React.FC<StudioControlsProps> = ({
  tool,
  documents,
  activeDocument,
  parameters,
  processingState,
  onParameterChange,
  onExecute,
  onDismissError
}) => {
  const isProcessing = processingState.status === 'processing';
  const hasError = processingState.status === 'error' && processingState.error;

  const validDocuments = documents.filter((d) => d.loadState === 'loaded');
  const validCount = validDocuments.length;
  const totalSize = documents.reduce((acc, d) => acc + d.size, 0);
  const totalPages = validDocuments.reduce((acc, d) => acc + d.pageCount, 0);
  const excludedPages =
    activeDocument?.pages.filter((p) => p.isDeleted).length || 0;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-2 text-slate-800">
          <Sliders className="w-4 h-4 text-rose-600" />
          <h3 className="font-heading font-bold text-slate-900 text-base">
            Engine Configuration
          </h3>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Review staged operations and options before processing
        </p>
      </div>

      {/* Document Overview Statistics */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Files</span>
          <span className="font-heading font-bold text-base text-slate-800">
            {documents.length}
          </span>
        </div>
        <div className="border-x border-slate-200">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Size</span>
          <span className="font-heading font-bold text-xs sm:text-sm text-slate-800">
            {formatSize(totalSize)}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Pages</span>
          <span className="font-heading font-bold text-base text-slate-800">
            {totalPages}
            {excludedPages > 0 && (
              <span className="text-[10px] text-red-500 block">(-{excludedPages} excl)</span>
            )}
          </span>
        </div>
      </div>

      {/* Tool-specific parameter inputs */}
      {tool.params && tool.params.length > 0 && (
        <div className="space-y-4 pt-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
            Parameters
          </span>

          {tool.params.map((param) => {
            const val = parameters[param.name] ?? param.defaultValue ?? '';

            if (param.type === 'select') {
              return (
                <div key={param.name} className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {param.label} {param.required && <span className="text-rose-600">*</span>}
                  </label>
                  <select
                    value={val}
                    onChange={(e) => onParameterChange(param.name, e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                  >
                    {param.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {param.description && (
                    <p className="text-[11px] text-slate-400 leading-tight">
                      {param.description}
                    </p>
                  )}
                </div>
              );
            }

            if (param.type === 'rotation') {
              return (
                <div key={param.name} className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {param.label}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {param.options?.map((opt) => {
                      const isSelected = Number(val) === Number(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onParameterChange(param.name, Number(opt.value))}
                          className={`py-2 px-1 text-xs font-semibold rounded-lg border transition-all ${
                            isSelected
                              ? 'bg-rose-50 border-rose-500 text-rose-700 ring-1 ring-rose-500'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (param.type === 'password') {
              return (
                <div key={param.name} className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {param.label} {param.required && <span className="text-rose-600">*</span>}
                  </label>
                  <input
                    type="password"
                    value={val}
                    placeholder={param.placeholder}
                    onChange={(e) => onParameterChange(param.name, e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                  />
                  {param.description && (
                    <p className="text-[11px] text-slate-400 leading-tight">
                      {param.description}
                    </p>
                  )}
                </div>
              );
            }

            return (
              <div key={param.name} className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {param.label} {param.required && <span className="text-rose-600">*</span>}
                </label>
                <input
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={val}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  placeholder={param.placeholder}
                  onChange={(e) =>
                    onParameterChange(
                      param.name,
                      param.type === 'number' ? Number(e.target.value) : e.target.value
                    )
                  }
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10"
                />
                {param.description && (
                  <p className="text-[11px] text-slate-400 leading-tight">
                    {param.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error Banner */}
      {hasError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start space-x-2.5 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-red-900 block">Processing Error</span>
            <p className="mt-0.5">{processingState.error}</p>
          </div>
          <button
            onClick={onDismissError}
            className="text-red-400 hover:text-red-800 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* In-progress bar */}
      {isProcessing && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center space-x-1.5 text-blue-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{processingState.message || 'Processing...'}</span>
            </span>
            <span>{processingState.progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-rose-600 transition-all duration-300 rounded-full"
              style={{ width: `${processingState.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Apply & Process Button */}
      <div>
        <button
          disabled={isProcessing || validCount < tool.minFiles}
          onClick={onExecute}
          className="w-full py-3.5 px-4 rounded-xl font-heading font-semibold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Applying & Generating...</span>
            </>
          ) : (
            <>
              <ToolIcon name={tool.iconName} className="w-4 h-4" />
              <span>
                {documents.length === 0
                  ? `Upload Document`
                  : validCount < tool.minFiles
                  ? `Requires ${tool.minFiles} Files`
                  : `Apply & Process ${tool.title}`}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Privacy guarantee */}
      <div className="flex items-center space-x-2 text-[11px] text-slate-400 justify-center">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Lossless vector manipulation • Zero data retention</span>
      </div>
    </div>
  );
};
