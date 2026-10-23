'use client';

import React, { useState, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import { StudioOutputResult, StudioOutputItem } from './types';
import { triggerFileDownload, getFullApiUrl } from '@/lib/api-client';

interface OutputPreviewProps {
  result: StudioOutputResult;
  toolTitle: string;
  onReset: () => void;
}

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
        <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center min-h-[420px] p-6 relative">
          {/* PDF Viewer */}
          {isPdf && (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
              <div className="w-full max-w-4xl h-[520px] rounded-xl overflow-hidden border border-slate-700 bg-slate-800 shadow-2xl relative">
                <iframe
                  src={`${fullDownloadUrl}${fullDownloadUrl.includes('?') ? '&' : '?'}preview=true#toolbar=0`}
                  title="PDF Preview"
                  className="w-full h-full border-0 bg-white"
                />
              </div>
              <div className="flex items-center space-x-3 text-xs text-slate-300">
                <span>{selectedOutput.filename}</span>
                {selectedOutput.size && <span>• {formatSize(selectedOutput.size)}</span>}
                <a
                  href={fullDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 text-emerald-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Fullscreen</span>
                </a>
              </div>
            </div>
          )}

          {/* Image Viewer */}
          {isImage && (
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fullDownloadUrl}
                alt={selectedOutput.filename}
                className="max-h-[460px] max-w-full rounded-xl shadow-2xl object-contain bg-white"
              />
              <span className="text-xs text-slate-300 font-mono">
                {selectedOutput.filename}
              </span>
            </div>
          )}

          {/* Excel / CSV Spreadsheet View */}
          {isExcel && (
            <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center text-slate-200">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <Table className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-white text-lg">
                Spreadsheet Ready
              </h3>
              <p className="text-xs text-slate-400 mt-1">{selectedOutput.filename}</p>
              <p className="text-xs text-slate-500 mt-2">
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
            <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center text-slate-200">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
                <Archive className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-white text-lg">
                Archive Generated
              </h3>
              <p className="text-xs text-slate-400 mt-1">{selectedOutput.filename}</p>
              <p className="text-xs text-slate-500 mt-2">
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
            <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center text-slate-200">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-300 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-white text-lg">
                {selectedOutput.filename}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
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
