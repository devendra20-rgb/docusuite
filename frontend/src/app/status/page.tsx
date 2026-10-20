'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Server,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ArrowLeft
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/api-client';

interface HealthData {
  status: string;
  uptime?: number;
  timestamp?: string;
  checks?: Record<string, { status: string; latencyMs?: number }>;
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [ready, setReady] = useState<any | null>(null);
  const [capabilities, setCapabilities] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Health
      const healthRes = await fetch(`${API_BASE_URL}/health`, { cache: 'no-store' });
      const healthJson = await healthRes.json();
      setHealth(healthJson);

      // 2. Ready
      try {
        const readyRes = await fetch(`${API_BASE_URL}/ready`, { cache: 'no-store' });
        const readyJson = await readyRes.json();
        setReady(readyJson);
      } catch {
        setReady({ status: 'degraded', dependencies: {} });
      }

      // 3. Capabilities
      try {
        const capRes = await fetch(`${API_BASE_URL}/tools/convert/capabilities`, { cache: 'no-store' });
        const capJson = await capRes.json();
        setCapabilities(capJson);
      } catch {
        setCapabilities(null);
      }
    } catch {
      setError(`Cannot reach backend at ${API_BASE_URL}. Ensure server is running.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="py-12 md:py-20 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 mb-8 gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 tracking-tight">
                System & Engine Status
              </h1>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Live telemetry and dependency health for DocuSuite processing clusters.
            </p>
          </div>

          <button
            onClick={fetchStatus}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Probes</span>
          </button>
        </div>

        {error && (
          <div className="mb-8 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Connection Notice</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Probes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {/* Liveness */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-slate-900 text-sm">
                    API Liveness Probe
                  </h3>
                  <span className="text-[11px] text-slate-400">Endpoint: /api/health</span>
                </div>
              </div>
              <span className="flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {health?.status || (loading ? 'Probing...' : 'Offline')}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              The HTTP routing framework and middleware pipeline are operational.
            </p>
          </div>

          {/* Readiness */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-slate-900 text-sm">
                    Service Readiness
                  </h3>
                  <span className="text-[11px] text-slate-400">Endpoint: /api/ready</span>
                </div>
              </div>
              <span
                className={`flex items-center text-xs font-bold px-2 py-0.5 rounded-full border ${
                  ready?.status === 'ready'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-amber-700 bg-amber-50 border-amber-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {ready?.status === 'ready' ? 'Ready' : loading ? 'Probing...' : 'Degraded'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span>Database:</span>
                <span className="font-semibold capitalize text-emerald-600">
                  {ready?.dependencies?.database || 'disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Storage:</span>
                <span className="font-semibold capitalize text-emerald-600">
                  {ready?.dependencies?.storage || 'checking'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Redis Queue:</span>
                <span
                  className={`font-semibold capitalize ${
                    ready?.dependencies?.redis === 'connected'
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }`}
                >
                  {ready?.dependencies?.redis || 'disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>LibreOffice:</span>
                <span
                  className={`font-semibold capitalize ${
                    ready?.dependencies?.libreOffice?.includes('available') &&
                    !ready?.dependencies?.libreOffice?.includes('unavailable')
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {ready?.dependencies?.libreOffice?.includes('available') &&
                  !ready?.dependencies?.libreOffice?.includes('unavailable')
                    ? 'Active'
                    : 'Unavailable'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Engine Capabilities Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs mb-8">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-rose-600" />
              <h3 className="font-heading font-bold text-slate-900 text-base">
                Execution Engines & Adapters
              </h3>
            </div>
            <a
              href={`${API_BASE_URL}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-rose-600 hover:underline flex items-center space-x-1"
            >
              <span>Swagger UI</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-slate-400 uppercase font-bold text-[10px] block">
                Native PDF Engine
              </span>
              <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                pdf-lib 1.17 + Sharp
              </span>
              <span className="text-emerald-600 font-medium text-[11px] mt-1 block">
                ✓ Vector Lossless Active
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-slate-400 uppercase font-bold text-[10px] block">
                Native Converters
              </span>
              <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                Mammoth + ExcelJS + CSV
              </span>
              <span className="text-emerald-600 font-medium text-[11px] mt-1 block">
                ✓ DOCX-&gt;HTML, CSV ⇄ Excel
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
              <span className="text-slate-400 uppercase font-bold text-[10px] block">
                Headless LibreOffice
              </span>
              <span className="font-semibold text-slate-800 text-sm mt-0.5 block">
                Office Suite Adapter
              </span>
              <span
                className={`font-medium text-[11px] mt-1 block ${
                  (capabilities?.data || capabilities?.engines)?.find(
                    (e: any) => e.name === 'LibreOfficeHeadlessEngine'
                  )?.available
                    ? 'text-emerald-600'
                    : 'text-amber-600'
                }`}
              >
                {(capabilities?.data || capabilities?.engines)?.find(
                  (e: any) => e.name === 'LibreOfficeHeadlessEngine'
                )?.available
                  ? '✓ LibreOffice Active'
                  : '⚠ Host Fallback (Docker required)'}
              </span>
            </div>
          </div>
        </div>

        {/* API Contracts & Endpoints Reference */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <h3 className="font-heading font-bold text-slate-900 text-base mb-3">
            Local Service Configuration
          </h3>
          <div className="space-y-2 text-xs font-mono text-slate-600">
            <div className="p-2.5 rounded-lg bg-slate-50 flex items-center justify-between">
              <span>Frontend Dev Server:</span>
              <span className="text-rose-600 font-semibold">http://localhost:3000</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 flex items-center justify-between">
              <span>Backend API Server:</span>
              <span className="text-slate-900 font-semibold">{API_BASE_URL}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 flex items-center justify-between">
              <span>OpenAPI Specification:</span>
              <span className="text-slate-900 font-semibold">{API_BASE_URL}/docs.json</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
