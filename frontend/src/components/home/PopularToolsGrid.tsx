'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { ALL_TOOLS, CATEGORIES } from '@/lib/tools-registry';
import { ToolIcon } from '@/components/ui/ToolIcon';

export const PopularToolsGrid: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filteredTools =
    activeCategory === 'All'
      ? ALL_TOOLS
      : ALL_TOOLS.filter((t) => t.category === activeCategory);

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center space-x-2 text-rose-600 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4" />
              <span>Complete Tool Directory</span>
            </div>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl text-slate-900 tracking-tight">
              Engineered for absolute document control.
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-2 max-w-xl">
              Choose from 27+ optimized modules. Every file is processed losslessly using dedicated vector and layout engines.
            </p>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredTools.length} of {ALL_TOOLS.length} total tools
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-4 scrollbar-none mb-8">
          <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-xl">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-rose-600 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredTools.map((tool) => {
            const toolHref = tool.isConversion
              ? `/convert/${tool.slug}`
              : `/tools/pdf/${tool.slug}`;

            return (
              <Link
                key={tool.id}
                href={toolHref}
                className="group relative flex flex-col justify-between p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-xs hover:shadow-lg hover:shadow-rose-500/5 transition-all duration-200"
              >
                <div>
                  {/* Top row: Icon & Badge */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-700 group-hover:bg-rose-50 group-hover:text-rose-600 flex items-center justify-center transition-colors">
                      <ToolIcon name={tool.iconName} className="w-6 h-6" />
                    </div>

                    <div className="flex items-center space-x-1">
                      {tool.badge && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                          {tool.badge}
                        </span>
                      )}
                      {tool.isConversion && tool.fromFormat && tool.toFormat && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-700">
                          {tool.fromFormat} → {tool.toFormat}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="font-heading font-semibold text-base text-slate-900 group-hover:text-rose-600 transition-colors">
                    {tool.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {tool.shortDesc}
                  </p>
                </div>

                {/* Bottom row: Category & Action */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-medium text-slate-400">
                    {tool.category}
                  </span>
                  <span className="inline-flex items-center space-x-1 text-slate-400 group-hover:text-rose-600 font-semibold group-hover:translate-x-0.5 transition-all">
                    <span>Open</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};
