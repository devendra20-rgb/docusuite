'use client';

import React from 'react';
import Link from 'next/link';
import { Layers, ShieldCheck, Lock, Cpu, FileCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      {/* Privacy Guarantee Banner */}
      <div className="border-b border-slate-800 bg-slate-950/60 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">
                  Zero-Retention Ephemeral Processing
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Your documents are strictly encrypted via TLS 1.3, processed in isolated worker sandboxes, and permanently expunged immediately after download.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-xs text-slate-400">
              <span className="flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>AES-256 Storage</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>No User Data Selling</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          {/* Brand info */}
          <div className="col-span-2">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white">
                <Layers className="w-4 h-4" />
              </div>
              <span className="font-heading font-bold text-lg text-white">DocuSuite</span>
            </div>
            <p className="text-xs text-slate-400 mt-3 max-w-sm leading-relaxed">
              Precision Document Studio for individuals, researchers, and enterprises. Lossless manipulation, high-fidelity office conversions, and uncompromising privacy.
            </p>
            <div className="mt-4 flex items-center space-x-2 text-xs text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-rose-500" />
              <span>Powered by pdf-lib, LibreOffice & BullMQ</span>
            </div>
          </div>

          {/* Column 1: PDF Tools */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              PDF Tools
            </h4>
            <ul className="mt-4 space-y-2 text-xs text-slate-400">
              <li>
                <Link href="/tools/pdf/merge" className="hover:text-white transition-colors">
                  Merge PDF
                </Link>
              </li>
              <li>
                <Link href="/tools/pdf/split" className="hover:text-white transition-colors">
                  Split PDF
                </Link>
              </li>
              <li>
                <Link href="/tools/pdf/compress" className="hover:text-white transition-colors">
                  Compress PDF
                </Link>
              </li>
              <li>
                <Link href="/tools/pdf/rotate" className="hover:text-white transition-colors">
                  Rotate PDF
                </Link>
              </li>
              <li>
                <Link href="/tools/pdf/add-page-numbers" className="hover:text-white transition-colors">
                  Add Page Numbers
                </Link>
              </li>
              <li>
                <Link href="/tools/pdf/add-watermark" className="hover:text-white transition-colors">
                  Add Watermark
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Conversions */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Office Conversion
            </h4>
            <ul className="mt-4 space-y-2 text-xs text-slate-400">
              <li>
                <Link href="/convert/pdf-to-word" className="hover:text-white transition-colors">
                  PDF to Word (DOCX)
                </Link>
              </li>
              <li>
                <Link href="/convert/word-to-pdf" className="hover:text-white transition-colors">
                  Word to PDF
                </Link>
              </li>
              <li>
                <Link href="/convert/pdf-to-excel" className="hover:text-white transition-colors">
                  PDF to Excel (XLSX)
                </Link>
              </li>
              <li>
                <Link href="/convert/excel-to-pdf" className="hover:text-white transition-colors">
                  Excel to PDF
                </Link>
              </li>
              <li>
                <Link href="/convert/csv-to-excel" className="hover:text-white transition-colors">
                  CSV to Excel
                </Link>
              </li>
              <li>
                <Link href="/convert/txt-to-pdf" className="hover:text-white transition-colors">
                  TXT to PDF
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Security & Platform */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Security & API
            </h4>
            <ul className="mt-4 space-y-2 text-xs text-slate-400">
              <li>
                <Link href="/tools/pdf/protect" className="hover:text-white transition-colors">
                  Protect PDF
                </Link>
              </li>
              <li>
                <Link href="/tools/pdf/unlock" className="hover:text-white transition-colors">
                  Unlock PDF
                </Link>
              </li>
              <li>
                <Link href="/status" className="hover:text-white transition-colors">
                  Engine Readiness
                </Link>
              </li>
              <li>
                <a
                  href="http://localhost:4000/api/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Swagger OpenAPI 3.0
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom line */}
        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© 2026 DocuSuite. Precision Document Studio. All rights reserved.</p>
          <div className="flex items-center space-x-6">
            <span className="hover:text-slate-300 transition-colors">Privacy Policy</span>
            <span className="hover:text-slate-300 transition-colors">Terms of Service</span>
            <span className="hover:text-slate-300 transition-colors">System Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
