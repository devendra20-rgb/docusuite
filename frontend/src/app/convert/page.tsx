'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileType,
  ArrowRight,
  Cpu,
  Layers
} from 'lucide-react';
import { ALL_TOOLS } from '@/lib/tools-registry';
import { getConversionCapabilities } from '@/lib/api-client';
import { CapabilitiesResponse } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';

export default function ConvertDirectoryPage() {
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    getConversionCapabilities().then((res) => {
      setCapabilities(res);
      setLoading(false);
    });
  }, []);

  const conversionTools = ALL_TOOLS.filter((t) => t.isConversion);

  const enginesList = capabilities?.data || capabilities?.engines || [];
  const libreOfficeActive = Boolean(
    enginesList.find((e) => e.name === 'LibreOfficeHeadlessEngine')?.available
  );

  return (
    <div className="py-12 md:py-20 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold uppercase tracking-wider mb-4">
            <FileType className="w-3.5 h-3.5" />
            <span>Phase 2 Office & Document Converters</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-5xl text-slate-900 tracking-tight">
            Universal Document Conversions
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600">
            Convert two-way between PDF, Microsoft Office (Word, Excel, PowerPoint), HTML, CSV, and plain text.
          </p>
        </div>

        {/* Backend Engine Capabilities Banner */}
        <div className="max-w-4xl mx-auto mb-12 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  libreOfficeActive
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-heading font-semibold text-slate-900 text-base">
                    Document Conversion Engines
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      libreOfficeActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {libreOfficeActive ? 'LibreOffice Active' : 'Native Engines Ready'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Native engines (Sharp, Mammoth, CSV, PDFKit) operational.{' '}
                  {libreOfficeActive
                    ? 'Headless LibreOffice adapter is active for DOCX/XLSX/PPTX.'
                    : 'LibreOffice adapter operates in fallback / docker mode for Office files.'}
                </p>
              </div>
            </div>

            <Link
              href="/status"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline shrink-0 flex items-center space-x-1"
            >
              <span>View Capabilities Report</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Dedicated Batch Conversion Banner */}
        <div className="max-w-4xl mx-auto mb-12 bg-gradient-to-r from-rose-500 to-rose-700 rounded-2xl p-6 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-heading font-bold text-lg text-white">
                  Batch Multi-File Conversion
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                  Up to 20 Files
                </span>
              </div>
              <p className="text-xs text-rose-100 mt-1 max-w-lg">
                Convert collections of mixed documents (Word, Excel, PowerPoint, CSV, HTML, RTF, plain text) to PDF or Office formats in a single operation.
              </p>
            </div>
          </div>
          <Link
            href="/convert/batch"
            className="px-4 py-2.5 rounded-xl bg-white text-rose-700 hover:bg-rose-50 font-semibold text-xs transition-colors shrink-0 flex items-center space-x-1.5 shadow-sm"
          >
            <span>Open Batch Studio</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Format Matrix Table Preview */}
        <div className="mb-12">
          <h2 className="font-heading font-bold text-xl text-slate-900 mb-4">
            Supported Format Conversion Matrix
          </h2>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">From Format</th>
                    <th className="py-3 px-4">To Format</th>
                    <th className="py-3 px-4">Primary Engine</th>
                    <th className="py-3 px-4">Fidelity Expectations</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {conversionTools.map((tool) => (
                    <tr key={tool.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                          {tool.fromFormat}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-rose-600">
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[11px] border border-rose-100">
                          {tool.toFormat}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {tool.requiresLibreOffice ? 'LibreOffice Adapter' : 'Native Engine (High Speed)'}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                        {tool.shortDesc}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/convert/${tool.slug}`}
                          className="inline-flex items-center space-x-1 text-rose-600 hover:text-rose-700 font-semibold"
                        >
                          <span>Convert</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Conversion Cards Grid */}
        <h2 className="font-heading font-bold text-xl text-slate-900 mb-6">
          All Conversion Tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {conversionTools.map((tool) => (
            <Link
              key={tool.id}
              href={`/convert/${tool.slug}`}
              className="group flex flex-col justify-between p-6 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-xs hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-200"
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <ToolIcon name={tool.iconName} className="w-6 h-6" />
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-700">
                    {tool.fromFormat} → {tool.toFormat}
                  </span>
                </div>

                <h3 className="font-heading font-semibold text-lg text-slate-900 group-hover:text-rose-600 transition-colors">
                  {tool.title}
                </h3>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-500 line-clamp-2 leading-relaxed">
                  {tool.shortDesc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] font-medium text-slate-400">
                  {tool.accept.join(', ')}
                </span>
                <span className="inline-flex items-center space-x-1 text-slate-400 group-hover:text-rose-600 font-semibold group-hover:translate-x-0.5 transition-all">
                  <span>Start</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
