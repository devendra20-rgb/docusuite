'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  ArrowRight,
  Layers,
  Minimize2,
  FileText,
  FileImage,
  Lock,
  Sparkles
} from 'lucide-react';
import { ALL_TOOLS } from '@/lib/tools-registry';
import { ToolIcon } from '@/components/ui/ToolIcon';

export const Hero: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredTools = searchQuery.trim()
    ? ALL_TOOLS.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.shortDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.fromFormat?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.toFormat?.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const quickChips = [
    { label: 'Merge PDF', slug: '/tools/pdf/merge', icon: Layers },
    { label: 'Compress PDF', slug: '/tools/pdf/compress', icon: Minimize2 },
    { label: 'PDF to Word', slug: '/convert/pdf-to-word', icon: FileText },
    { label: 'JPG to PDF', slug: '/tools/pdf/images-to-pdf', icon: FileImage },
    { label: 'Protect PDF', slug: '/tools/pdf/protect', icon: Lock }
  ];

  return (
    <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 bg-gradient-to-b from-slate-50/70 via-white to-white overflow-hidden">
      {/* Decorative background grid and glow */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-70 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-rose-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200/80 text-rose-700 text-xs font-semibold tracking-wide uppercase shadow-xs mb-6">
          <Sparkles className="w-3.5 h-3.5 text-rose-600" />
          <span>Precision Document Studio • 27+ Tools</span>
        </div>

        {/* Main Headline */}
        <h1 className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl text-slate-900 tracking-tight leading-[1.12]">
          Surgical precision for your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-rose-800">
            documents.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed">
          Merge, convert, compress, protect, and reorganize PDFs and office files instantly. Lossless fidelity, 100% private, and zero data retention.
        </p>

        {/* Interactive Search Bar */}
        <div ref={containerRef} className="mt-8 max-w-2xl mx-auto relative">
          <div
            className={`relative flex items-center bg-white rounded-2xl border transition-all duration-200 ${
              isFocused
                ? 'border-rose-500 ring-4 ring-rose-500/10 shadow-lg'
                : 'border-slate-300 shadow-md hover:border-slate-400'
            }`}
          >
            <div className="pl-4 text-slate-400">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <input
              type="text"
              id="hero-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder="What do you want to do with your file? (e.g. merge, compress, protect...)"
              className="w-full py-4 px-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none rounded-2xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="pr-4 text-xs text-slate-400 hover:text-slate-600 font-medium"
              >
                Clear
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isFocused && searchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-30 text-left">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Matching Tools ({filteredTools.length})</span>
                <span>Press Enter to select</span>
              </div>
              {filteredTools.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  No matching tools found for &quot;{searchQuery}&quot;. Try &quot;merge&quot;, &quot;word&quot;, or &quot;protect&quot;.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredTools.map((tool) => {
                    const toolHref = tool.isConversion
                      ? `/convert/${tool.slug}`
                      : `/tools/pdf/${tool.slug}`;
                    return (
                      <Link
                        key={tool.id}
                        href={toolHref}
                        onClick={() => setIsFocused(false)}
                        className="flex items-center justify-between px-4 py-3 hover:bg-rose-50/60 transition-colors group"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                            <ToolIcon name={tool.iconName} className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-slate-900 group-hover:text-rose-600">
                                {tool.title}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                {tool.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate max-w-md">
                              {tool.shortDesc}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-1 transition-all" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Access Tool Chips */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1">Popular:</span>
          {quickChips.map((chip) => {
            const Icon = chip.icon;
            return (
              <Link
                key={chip.label}
                href={chip.slug}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-slate-700 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 shadow-xs hover:shadow-sm transition-all"
              >
                <Icon className="w-3.5 h-3.5 text-rose-500" />
                <span>{chip.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};
