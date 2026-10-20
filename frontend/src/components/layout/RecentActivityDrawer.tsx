'use client';

import React, { useEffect, useState } from 'react';
import { X, Clock, Trash2, Download, FileCheck } from 'lucide-react';
import { clearSessionHistory, getSessionHistory, triggerFileDownload } from '@/lib/api-client';
import { HistoryItem } from '@/types/api';

interface RecentActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecentActivityDrawer: React.FC<RecentActivityDrawerProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = () => {
    setHistory(getSessionHistory());
  };

  useEffect(() => {
    loadHistory();
    const handleUpdate = () => loadHistory();
    window.addEventListener('docusuite-history-updated', handleUpdate);
    return () => window.removeEventListener('docusuite-history-updated', handleUpdate);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading font-semibold text-slate-900 text-lg">
                  Recent Activity
                </h3>
                <p className="text-xs text-slate-500">Session history stored locally</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {history.length > 0 && (
                <button
                  onClick={() => clearSessionHistory()}
                  className="text-xs text-slate-500 hover:text-red-600 font-medium px-2 py-1 rounded-md hover:bg-red-50 transition-colors flex items-center space-x-1"
                  title="Clear history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Activity list */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {history.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-6 h-6" />
                </div>
                <h4 className="font-medium text-slate-800 text-sm">No recent activity</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Files processed during this session will appear here for fast re-downloading.
                </p>
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-100">
                        {item.toolTitle}
                      </span>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <span className="flex items-center text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <FileCheck className="w-3 h-3 mr-1" />
                      Success
                    </span>
                  </div>

                  <div className="text-xs text-slate-700">
                    <p className="font-medium truncate text-slate-900">
                      {item.inputFiles.map((f) => f.name).join(', ')}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {item.inputFiles.length} file{item.inputFiles.length > 1 ? 's' : ''} processed
                    </p>
                  </div>

                  {item.outputFiles && item.outputFiles.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 truncate max-w-[200px]">
                        {item.outputFiles[0].name}
                      </span>
                      <button
                        onClick={() =>
                          triggerFileDownload(
                            item.outputFiles![0].downloadUrl,
                            item.outputFiles![0].name
                          )
                        }
                        className="inline-flex items-center space-x-1 text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 text-center">
            Zero-retention guarantee: Files on the backend are automatically purged.
          </div>
        </div>
      </div>
    </div>
  );
};
