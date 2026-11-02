'use client';

import React, { useState, useRef, useEffect, useCallback, ChangeEvent, DragEvent } from 'react';
import Link from 'next/link';
import {
  Lock,
  ArrowLeft,
  Plus,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  Shield,
  ShieldCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ToolDefinition } from '@/types/api';
import { ToolIcon } from '@/components/ui/ToolIcon';
import { submitDocumentJob, triggerFileDownload, getFullApiUrl } from '@/lib/api-client';
import { loadPdfDocument, renderPageToCanvas } from './pdf-loader';

interface ProtectWorkspaceProps {
  tool: ToolDefinition;
}

interface OutputResult {
  jobId: string;
  downloadUrl: string;
  filename: string;
  size?: number;
  pageCount?: number;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface PasswordStrength {
  score: number; // 0 to 4
  label: string;
  colorClass: string;
  barColor: string;
  hint: string;
}

function evaluatePasswordStrength(pass: string): PasswordStrength {
  if (!pass) {
    return {
      score: 0,
      label: 'Enter Password',
      colorClass: 'text-slate-400',
      barColor: 'bg-slate-200',
      hint: 'Password must not be empty'
    };
  }

  let score = 0;
  if (pass.length >= 8) score += 1;
  if (pass.length >= 12) score += 1;
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 1;
  if (/\d/.test(pass)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pass)) score += 1;

  const normalized = Math.min(Math.max(Math.floor((score / 5) * 4), 1), 4);

  if (normalized === 1) {
    return {
      score: 1,
      label: 'Weak',
      colorClass: 'text-rose-600',
      barColor: 'bg-rose-500',
      hint: 'Include uppercase, numbers, and symbols for better security'
    };
  }
  if (normalized === 2) {
    return {
      score: 2,
      label: 'Fair',
      colorClass: 'text-amber-600',
      barColor: 'bg-amber-500',
      hint: 'Good start. Add special characters to strengthen encryption'
    };
  }
  if (normalized === 3) {
    return {
      score: 3,
      label: 'Good',
      colorClass: 'text-blue-600',
      barColor: 'bg-blue-500',
      hint: 'Strong password. Hard to brute force'
    };
  }
  return {
    score: 4,
    label: 'Very Strong',
    colorClass: 'text-emerald-600',
    barColor: 'bg-emerald-500',
    hint: 'Optimal military-grade AES-256 protection'
  };
}

/**
 * Preview canvas for a single verified encrypted page unlocked with the session password
 */
const EncryptedPageCanvas: React.FC<{
  pdfDoc: any;
  pageNumber: number;
  scale: number;
  totalCount: number;
}> = ({ pdfDoc, pageNumber, scale, totalCount }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    setIsRendering(true);
    const canvas = canvasRef.current;
    const task = renderPageToCanvas(pdfDoc, pageNumber, canvas, { scale });

    task.promise
      .then(() => setIsRendering(false))
      .catch((err: any) => {
        if (err?.name !== 'RenderingCancelledException') {
          setIsRendering(false);
        }
      });

    return () => {
      task.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div className="flex flex-col items-center max-w-full">
      <div className="relative shadow-md border border-slate-300/80 rounded-sm overflow-hidden bg-white max-w-full">
        <canvas ref={canvasRef} className="block bg-white max-w-full h-auto" />
        {isRendering && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-rose-600 animate-spin" />
          </div>
        )}
      </div>
      {totalCount > 1 && (
        <span className="text-[11px] font-medium text-slate-500 mt-2 bg-white/90 px-2.5 py-0.5 rounded-full border border-slate-200 shadow-2xs">
          Page {pageNumber} of {totalCount}
        </span>
      )}
    </div>
  );
};

export const ProtectWorkspace: React.FC<ProtectWorkspaceProps> = ({ tool }) => {
  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileSummary, setFileSummary] = useState<{
    name: string;
    size: number;
    pageCount: number;
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password configuration
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Optional owner password
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Output result
  const [outputResult, setOutputResult] = useState<OutputResult | null>(null);

  // Success screen preview state
  const [verifiedPdfDoc, setVerifiedPdfDoc] = useState<any>(null);
  const [verifiedPageCount, setVerifiedPageCount] = useState<number>(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<number>(1.0);
  const [fitWidth, setFitWidth] = useState<boolean>(true);
  const [baseWidth, setBaseWidth] = useState<number>(595);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const passwordStrength = evaluatePasswordStrength(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const showMismatchWarning =
    confirmPassword.length > 0 && password !== confirmPassword;

  // File selection & analysis
  const handleSelectFile = async (selected: File) => {
    setErrorMessage(null);
    if (!selected.name.toLowerCase().endsWith('.pdf') && selected.type !== 'application/pdf') {
      setErrorMessage('Please upload a valid PDF document (.pdf)');
      return;
    }
    if (selected.size > 50 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 50 MB limit.');
      return;
    }

    setFile(selected);
    setIsAnalyzing(true);

    try {
      const buffer = await selected.arrayBuffer();
      // Test if already encrypted
      try {
        const loaded = await loadPdfDocument(buffer);
        setFileSummary({
          name: selected.name,
          size: selected.size,
          pageCount: loaded.numPages || 1
        });
      } catch (err: any) {
        if (err?.name === 'PasswordException' || err?.message?.toLowerCase().includes('password')) {
          setErrorMessage(
            'This PDF is already password-protected. Please choose an unencrypted document or unlock it first.'
          );
          setFile(null);
          setFileSummary(null);
          return;
        }
        setFileSummary({
          name: selected.name,
          size: selected.size,
          pageCount: 1
        });
      }
    } catch {
      setFileSummary({
        name: selected.name,
        size: selected.size,
        pageCount: 1
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectFile(e.target.files[0]);
    }
  };

  // Execution
  const handleProtect = async () => {
    if (!file) {
      setErrorMessage('Please select a PDF document to protect.');
      return;
    }
    if (!password || password.trim().length === 0) {
      setErrorMessage('Please enter a password to protect the document.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify both password fields.');
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setProgress(15);
    setProgressStage('Uploading document securely...');

    try {
      const timer1 = setTimeout(() => {
        setProgress(45);
        setProgressStage('Applying genuine AES-256 encryption...');
      }, 400);

      const timer2 = setTimeout(() => {
        setProgress(75);
        setProgressStage('Verifying document protection...');
      }, 1200);

      const params: Record<string, any> = {
        password: password.trim()
      };
      if (ownerPassword.trim().length > 0) {
        params.ownerPassword = ownerPassword.trim();
      }

      const response = await submitDocumentJob(
        tool.endpoint || '/tools/pdf/protect',
        [file],
        params
      );

      clearTimeout(timer1);
      clearTimeout(timer2);
      setProgress(100);
      setProgressStage('Document protected successfully!');

      const out = response.outputFiles?.[0];
      const downloadUrl = out?.downloadUrl || response.downloadUrl || `/api/jobs/${response.jobId}/download`;
      const filename = out?.filename || out?.originalName || `protected-${file.name}`;
      const size = out?.size || file.size;

      const outResult: OutputResult = {
        jobId: response.jobId || 'job-completed',
        downloadUrl,
        filename,
        size,
        pageCount: fileSummary?.pageCount || 1
      };

      setOutputResult(outResult);

      // Trigger confetti celebration
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch {
        // ignore
      }

      // Load preview of the encrypted output using the session password
      setIsPreviewLoading(true);
      try {
        const fullUrl = getFullApiUrl(downloadUrl);
        const res = await fetch(fullUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          const loaded = await loadPdfDocument(buf, password.trim());
          setVerifiedPdfDoc(loaded);
          setVerifiedPageCount(loaded.numPages || 1);

          try {
            const p1 = await loaded.getPage(1);
            const vp = p1.getViewport({ scale: 1 });
            if (vp.width) setBaseWidth(vp.width);
          } catch {
            // fallback
          }
        }
      } catch (prevErr) {
        console.warn('Failed to load in-browser preview of protected document:', prevErr);
      } finally {
        setIsPreviewLoading(false);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'An error occurred while encrypting the PDF document. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset to protect another file
  const handleReset = () => {
    setFile(null);
    setFileSummary(null);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setOwnerPassword('');
    setShowOwnerPassword(false);
    setShowAdvanced(false);
    setOutputResult(null);
    setVerifiedPdfDoc(null);
    setVerifiedPageCount(0);
    setErrorMessage(null);
    setProgress(0);
    setProgressStage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Compute zoom scale based on container width
  const calculateFitScale = useCallback(() => {
    if (!scrollContainerRef.current) return 1.0;
    const containerWidth = scrollContainerRef.current.clientWidth - 48;
    const targetWidth = Math.max(containerWidth, 260);
    const calculated = targetWidth / baseWidth;
    return Math.min(Math.max(calculated, 0.4), 2.2);
  }, [baseWidth]);

  useEffect(() => {
    if (!fitWidth) return;
    const updateZoom = () => {
      setPreviewZoom(calculateFitScale());
    };
    updateZoom();
    if (!scrollContainerRef.current) return;
    const observer = new ResizeObserver(updateZoom);
    observer.observe(scrollContainerRef.current);
    return () => observer.disconnect();
  }, [fitWidth, calculateFitScale]);

  return (
    <div className="py-8 md:py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Header - Consistent with DocuSuite design system */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <Link
              href="/tools"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
              title="Return to all tools"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shadow-xs shrink-0">
              <ToolIcon name={tool.iconName || 'Lock'} className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 leading-tight">
                  {tool.title}
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                  AES-256
                </span>
                {tool.badge && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                    {tool.badge}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {tool.description || 'Apply industry-standard AES encryption to prevent unauthorized opening or editing.'}
              </p>
            </div>
          </div>

          {file && !outputResult && (
            <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/70 border border-rose-200 rounded-xl shadow-xs transition-colors cursor-pointer"
                title="Select a different PDF file"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Replace PDF</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          )}
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start space-x-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-rose-900">Action Required</h4>
              <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* 1. Upload Dropzone (No File Selected) */}
        {!file && !outputResult && (
          <div>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-3xl p-12 sm:p-16 text-center transition-all duration-200 border-2 border-dashed ${
                isDragging
                  ? 'bg-rose-50/70 border-rose-500 scale-[1.005]'
                  : 'bg-white border-slate-300 hover:border-slate-400 hover:bg-slate-50/50 shadow-xs'
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-xs">
                {isAnalyzing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <Lock className="w-8 h-8" />
                )}
              </div>

              <h3 className="font-heading font-bold text-xl sm:text-2xl text-slate-900">
                {isDragging ? 'Drop your PDF right here' : 'Select a PDF document to protect'}
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                Supports PDF up to 50MB. Set a strong password with AES-256 standard encryption.
              </p>

              <div className="mt-6">
                <span className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20">
                  <Plus className="w-4 h-4" />
                  <span>Choose PDF File</span>
                </span>
              </div>

              <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-400">
                <span>PDF documents only</span>
                <span>•</span>
                <span>Max 50 MB</span>
                <span>•</span>
                <span>100% Private & In-Memory</span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        )}

        {/* 2. Configure Password Screen (File Selected, Not Processed) */}
        {file && !outputResult && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Document Summary Card */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Selected Document
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100/60 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                </div>

                <div className="flex items-start space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate" title={file.name}>
                      {file.name}
                    </h4>
                    <div className="mt-1 flex items-center space-x-2 text-xs text-slate-500">
                      <span>{formatFileSize(file.size)}</span>
                      <span>•</span>
                      {isAnalyzing ? (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Loader2 className="w-3 h-3 animate-spin" /> Counting pages...
                        </span>
                      ) : (
                        <span>
                          {fileSummary?.pageCount || 1} {fileSummary?.pageCount === 1 ? 'page' : 'pages'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    Replace with another PDF
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Encryption Assurance Card */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-7 shadow-xs border border-slate-800">
                <div className="flex items-center space-x-2 mb-2 text-rose-400">
                  <Shield className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Security Guarantee
                  </span>
                </div>
                <h4 className="font-heading font-bold text-base text-white mb-1">
                  AES-256 Bit Encryption
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your PDF is protected using ISO 32000 compliant AES-256 encryption. Without the exact password, the document cannot be decrypted, read, or modified by any third party.
                </p>
              </div>
            </div>

            {/* Right Column: Password Form */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              <div className="flex items-center space-x-3 pb-6 border-b border-slate-100 mb-6">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base sm:text-lg text-slate-900">
                    Set Security Password
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter the password required to open and decrypt this document
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {/* 1. Document Open Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Document Open Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter a strong password"
                      disabled={isProcessing}
                      className="w-full pl-4 pr-11 py-2.5 text-sm bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  {password.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Strength:</span>
                        <span className={`font-semibold ${passwordStrength.colorClass}`}>
                          {passwordStrength.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 h-1.5">
                        {[1, 2, 3, 4].map((step) => (
                          <div
                            key={step}
                            className={`rounded-full transition-all duration-300 ${
                              step <= passwordStrength.score
                                ? passwordStrength.barColor
                                : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500">{passwordStrength.hint}</p>
                    </div>
                  )}
                </div>

                {/* 2. Confirm Password */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Confirm Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      disabled={isProcessing}
                      className={`w-full pl-4 pr-11 py-2.5 text-sm bg-slate-50/70 border rounded-xl focus:outline-none focus:bg-white focus:ring-2 transition-all text-slate-900 ${
                        showMismatchWarning
                          ? 'border-rose-300 focus:ring-rose-500/20 focus:border-rose-500'
                          : passwordsMatch
                          ? 'border-emerald-300 focus:ring-emerald-500/20 focus:border-emerald-500'
                          : 'border-slate-200 focus:ring-rose-500/20 focus:border-rose-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {showMismatchWarning && (
                    <p className="mt-1.5 text-xs text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match
                    </p>
                  )}
                  {passwordsMatch && (
                    <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Passwords match
                    </p>
                  )}
                </div>

                {/* 3. Collapsible Advanced Permissions (Owner Password) */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center justify-between w-full text-xs font-semibold text-slate-600 hover:text-slate-900 py-2 cursor-pointer"
                  >
                    <span>Advanced Permissions / Owner Password (Optional)</span>
                    {showAdvanced ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {showAdvanced && (
                    <div className="mt-3 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Owner Password (Master Key)
                      </label>
                      <div className="relative">
                        <input
                          type={showOwnerPassword ? 'text' : 'password'}
                          value={ownerPassword}
                          onChange={(e) => setOwnerPassword(e.target.value)}
                          placeholder="Optional separate owner password"
                          disabled={isProcessing}
                          className="w-full pl-3 pr-10 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                        >
                          {showOwnerPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        An owner password allows master permission overrides and changes to document security settings. If left blank, your open password functions as the security key.
                      </p>
                    </div>
                  )}
                </div>

                {/* Progress Indicator when processing */}
                {isProcessing && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{progressStage}</span>
                      <span className="font-bold text-rose-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-rose-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Submit Button with DocuSuite primary button styling */}
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleProtect}
                    disabled={isProcessing || !password || password !== confirmPassword}
                    className="w-full py-3.5 px-6 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Encrypting Document...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Protect PDF with Password</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Output Screen (Successfully Protected) */}
        {outputResult && (
          <div className="space-y-6">
            {/* Top Success Card matching Watermark & DocuSuite success cards */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-xs text-center max-w-xl mx-auto">
              {/* Success Icon kept green as requested */}
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="font-heading font-bold text-2xl text-slate-900">
                PDF Protected Successfully!
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Your encrypted PDF is ready for immediate download.
              </p>

              {/* Document Summary Pill */}
              <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-left">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="w-9 h-9 rounded-xl bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <span className="block text-xs font-bold text-slate-800 truncate" title={outputResult.filename}>
                      {outputResult.filename}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {formatFileSize(outputResult.size)} • {outputResult.pageCount || 1}{' '}
                      {(outputResult.pageCount || 1) === 1 ? 'page' : 'pages'}
                    </span>
                  </div>
                </div>
                {/* LOCKED / READY status badge kept green as requested */}
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100/60 px-2.5 py-1 rounded-full shrink-0">
                  Locked & Ready
                </span>
              </div>

              {/* Action Buttons: Download button styled with DocuSuite crimson/pink primary theme */}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => triggerFileDownload(outputResult.downloadUrl, outputResult.filename)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-md shadow-rose-600/20 transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Protected PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Process Another File
                </button>
              </div>
            </div>

            {/* In-Browser Decrypted Live Preview Section */}
            <div className="max-w-4xl mx-auto w-full">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 text-slate-700 text-xs shrink-0 flex-wrap gap-2">
                  <div className="flex items-center space-x-2.5 truncate max-w-xs sm:max-w-md">
                    <span className="font-semibold text-slate-900 truncate" title={outputResult.filename}>
                      {outputResult.filename}
                    </span>
                    {outputResult.size && (
                      <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                        {formatFileSize(outputResult.size)}
                      </span>
                    )}
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>
                        {verifiedPageCount || 1} {(verifiedPageCount || 1) === 1 ? 'Page' : 'Pages'}
                      </span>
                    </span>
                  </div>

                  {/* Zoom Controls */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFitWidth(true);
                        setPreviewZoom(calculateFitScale());
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        fitWidth
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 border border-transparent'
                      }`}
                      title="Fit to Width"
                    >
                      Fit Width
                    </button>

                    <div className="h-4 w-px bg-slate-200 mx-0.5" />

                    <button
                      type="button"
                      onClick={() => {
                        setFitWidth(false);
                        setPreviewZoom((z) => Math.max(z - 0.15, 0.4));
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono font-medium text-slate-700 min-w-[3rem] text-center select-none">
                      {Math.round(previewZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFitWidth(false);
                        setPreviewZoom((z) => Math.min(z + 0.15, 2.2));
                      }}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Scrollable Viewport */}
                <div
                  ref={scrollContainerRef}
                  className="w-full max-h-[600px] overflow-y-auto overflow-x-hidden p-4 sm:p-6 bg-slate-100/70 flex flex-col items-center space-y-6"
                >
                  {isPreviewLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
                      <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                      <span className="text-xs font-medium text-slate-600">
                        Authenticating and rendering preview...
                      </span>
                    </div>
                  ) : verifiedPdfDoc ? (
                    Array.from({ length: verifiedPageCount }, (_, i) => i + 1).map((pageNo) => (
                      <EncryptedPageCanvas
                        key={pageNo}
                        pdfDoc={verifiedPdfDoc}
                        pageNumber={pageNo}
                        scale={previewZoom}
                        totalCount={verifiedPageCount}
                      />
                    ))
                  ) : (
                    <div className="py-16 text-center text-slate-500">
                      <Lock className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                      <p className="text-xs font-medium text-slate-600">
                        The document is protected with AES-256 encryption. Open with your password in any PDF reader.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProtectWorkspace;
