'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Layers, ArrowRight } from 'lucide-react';
import { ALL_TOOLS, CATEGORIES } from '@/lib/tools-registry';
import { ToolIcon } from '@/components/ui/ToolIcon';

export default function ToolsDirectoryPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const pdfTools = ALL_TOOLS.filter((t) => !t.isConversion);

  const filtered = pdfTools.filter((tool) => {
    const matchesCategory =
      activeCategory === 'All' || tool.category === activeCategory;
    const matchesSearch =
      tool.title.toLowerCase().includes(search.toLowerCase()) ||
      tool.shortDesc.toLowerCase().includes(search.toLowerCase()) ||
      tool.category.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="py-12 md:py-20 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold uppercase tracking-wider mb-4">
            <Layers className="w-3.5 h-3.5" />
            <span>Essential PDF Engine</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-5xl text-slate-900 tracking-tight">
            Complete PDF Tools Directory
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600">
            Split, merge, compress, protect, reorder, and stamp your PDF files with loss-free precision.
          </p>

          {/* Search box */}
          <div className="mt-8 max-w-xl mx-auto relative">
            <div className="relative flex items-center bg-white rounded-2xl border border-slate-300 shadow-sm focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/10">
              <div className="pl-4 text-slate-400">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PDF tools (e.g. merge, compress, rotate, page numbers...)"
                className="w-full py-3.5 px-3 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none rounded-2xl"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="pr-4 text-xs text-slate-400 hover:text-slate-600 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center justify-center space-x-2 overflow-x-auto pb-4 mb-8">
          <div className="flex items-center space-x-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-xs">
            {CATEGORIES.filter((c) => c !== 'Convert').map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((tool) => (
            <Link
              key={tool.id}
              href={`/tools/pdf/${tool.slug}`}
              className="group flex flex-col justify-between p-6 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-xs hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-200"
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <ToolIcon name={tool.iconName} className="w-6 h-6" />
                  </div>
                  {tool.badge && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                      {tool.badge}
                    </span>
                  )}
                </div>

                <h2 className="font-heading font-semibold text-lg text-slate-900 group-hover:text-rose-600 transition-colors">
                  {tool.title}
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-500 line-clamp-2 leading-relaxed">
                  {tool.shortDesc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] font-medium text-slate-400">
                  {tool.category}
                </span>
                <span className="inline-flex items-center space-x-1 text-slate-400 group-hover:text-rose-600 font-semibold group-hover:translate-x-0.5 transition-all">
                  <span>Open Tool</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8">
            <p className="text-sm text-slate-600 font-medium">No PDF tools found matching &quot;{search}&quot;.</p>
            <button
              onClick={() => {
                setSearch('');
                setActiveCategory('All');
              }}
              className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
