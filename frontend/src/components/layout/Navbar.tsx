'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Clock,
  Menu,
  X,
  Layers,
  ArrowRight
} from 'lucide-react';
import { checkBackendHealth, getSessionHistory } from '@/lib/api-client';
import { RecentActivityDrawer } from './RecentActivityDrawer';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    // Sync history count with current session
    setHistoryCount(getSessionHistory().length);
    const updateCount = () => setHistoryCount(getSessionHistory().length);
    window.addEventListener('docusuite-history-updated', updateCount);

    // Check backend health
    checkBackendHealth().then((res) => setIsHealthy(res.healthy));

    return () => window.removeEventListener('docusuite-history-updated', updateCount);
  }, []);

  const navLinks = [
    { label: 'PDF Tools', href: '/tools' },
    { label: 'File Conversion', href: '/convert' },
    { label: 'System Status', href: '/status' },
    { label: 'API Docs', href: 'http://localhost:4000/api/docs', external: true }
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center space-x-3 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center text-white shadow-sm shadow-rose-500/20 group-hover:scale-105 transition-transform">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-heading font-bold text-xl text-slate-900 tracking-tight">
                      DocuSuite
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100">
                      Studio
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal leading-tight hidden sm:block">
                    Precision Document Studio
                  </p>
                </div>
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center space-x-1">
                {navLinks.map((link) => {
                  const isActive = !link.external && pathname === link.href;
                  return link.external ? (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.label}
                      href={link.href}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'text-rose-600 bg-rose-50/80 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right actions */}
            <div className="flex items-center space-x-3">
              {/* Backend indicator */}
              <Link
                href="/status"
                className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-medium border bg-slate-50 hover:bg-slate-100 transition-colors"
                title={isHealthy ? 'Backend API connected' : 'Backend API disconnected'}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isHealthy === true
                      ? 'bg-emerald-500 animate-pulse'
                      : isHealthy === false
                      ? 'bg-rose-500'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="text-slate-600">
                  {isHealthy === true ? 'API Online' : isHealthy === false ? 'API Offline' : 'Connecting'}
                </span>
              </Link>

              {/* Recent Activity Toggle */}
              <button
                onClick={() => setIsActivityOpen(true)}
                className="relative flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                title="Recent Activity"
              >
                <Clock className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline">Recent Activity</span>
                {historyCount > 0 && (
                  <span className="ml-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {historyCount}
                  </span>
                )}
              </button>

              {/* Primary Call to Action */}
              <Link
                href="/tools"
                className="hidden sm:inline-flex items-center space-x-1 px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-sm shadow-rose-600/20 transition-colors"
              >
                <span>Explore Tools</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              {/* Mobile menu trigger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-slate-100 flex flex-col space-y-2">
              <Link
                href="/tools"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700"
              >
                Explore All 27+ Tools
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Slide-over Recent Activity Drawer */}
      <RecentActivityDrawer isOpen={isActivityOpen} onClose={() => setIsActivityOpen(false)} />
    </>
  );
};
