import { ApiResponse, CapabilitiesResponse, HistoryItem, JobStatusResponse } from '@/types/api';

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
).replace(/\/$/, '');

/**
 * Normalizes an API path into an absolute URL
 */
export function getFullApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.startsWith('/api/')) {
    const origin = API_BASE_URL.replace(/\/api$/, '');
    return `${origin}${cleanPath}`;
  }
  return `${API_BASE_URL}${cleanPath}`;
}

/**
 * Check backend health
 */
export async function checkBackendHealth(): Promise<{ healthy: boolean; details?: any }> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!res.ok) return { healthy: false };
    const data = await res.json();
    return { healthy: data.status === 'ok' || data.success === true, details: data };
  } catch (err) {
    return { healthy: false, details: err };
  }
}

/**
 * Fetch supported conversion engine capabilities
 */
export async function getConversionCapabilities(): Promise<CapabilitiesResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/tools/convert/capabilities`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Submits a document tool request with files and parameters.
 * Automatically handles synchronous responses or polls asynchronous BullMQ jobs.
 */
export async function submitDocumentJob(
  endpoint: string,
  files: File[],
  parameters: Record<string, any> = {},
  options?: {
    isAsync?: boolean;
    onProgress?: (progress: number, stage: string) => void;
  }
): Promise<ApiResponse> {
  const formData = new FormData();

  // Attach all uploaded files under 'files'
  files.forEach((file) => {
    formData.append('files', file);
  });

  // Attach parameters
  Object.entries(parameters).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      if (typeof val === 'object') {
        formData.append(key, JSON.stringify(val));
      } else {
        formData.append(key, String(val));
      }
    }
  });

  if (options?.isAsync) {
    formData.append('async', 'true');
  }

  const targetUrl = getFullApiUrl(endpoint);
  options?.onProgress?.(15, 'Uploading files to server...');

  let initialResponse: Response;
  try {
    initialResponse = await fetch(targetUrl, {
      method: 'POST',
      body: formData
    });
  } catch (networkErr: any) {
    throw new Error(
      `Network error connecting to backend: ${networkErr?.message || 'Failed to fetch'}. Please ensure backend is running at ${API_BASE_URL}.`
    );
  }

  let resultData: ApiResponse;
  try {
    resultData = await initialResponse.json();
  } catch {
    throw new Error(`Server returned invalid response (status ${initialResponse.status})`);
  }

  if (!initialResponse.ok || resultData.success === false) {
    const errorMsg =
      resultData.error?.message ||
      (typeof resultData.error === 'string' ? resultData.error : null) ||
      `Processing failed with status ${initialResponse.status}`;
    throw new Error(errorMsg);
  }

  // If synchronous execution finished immediately
  if (resultData.status === 'completed' || (!resultData.status && resultData.outputFiles)) {
    options?.onProgress?.(100, 'Processing completed successfully');
    return {
      ...resultData,
      status: 'completed'
    };
  }

  // If job was queued asynchronously, poll job status
  if (resultData.jobId && (resultData.status === 'queued' || resultData.status === 'processing')) {
    options?.onProgress?.(30, 'Document queued for processing...');
    return await pollJobUntilFinished(resultData.jobId, options?.onProgress);
  }

  return resultData;
}

/**
 * Polls job status until it resolves to completed or failed
 */
export async function pollJobUntilFinished(
  jobId: string,
  onProgress?: (progress: number, stage: string) => void,
  maxWaitMs = 120000,
  intervalMs = 1200
): Promise<ApiResponse> {
  const startTime = Date.now();
  const pollUrl = `${API_BASE_URL}/jobs/${jobId}`;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    try {
      const res = await fetch(pollUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });

      if (!res.ok) {
        continue;
      }

      const job: JobStatusResponse = await res.json();
      const jobStatus = job.status || (job as any).data?.status;
      const progress = job.progress ?? (job as any).data?.progress ?? 50;

      if (jobStatus === 'processing') {
        onProgress?.(Math.max(40, progress), 'Processing document...');
      } else if (jobStatus === 'completed') {
        onProgress?.(100, 'Document ready for download');
        const outputFiles = job.outputFiles || (job as any).data?.outputFiles;
        const downloadUrl = job.downloadUrl || (job as any).data?.downloadUrl || `/api/jobs/${jobId}/download`;

        return {
          success: true,
          jobId,
          status: 'completed',
          outputFiles,
          downloadUrl
        };
      } else if (jobStatus === 'failed') {
        const errorText =
          typeof job.error === 'string'
            ? job.error
            : job.error?.message || (job as any).data?.error || 'Document processing failed on server';
        throw new Error(errorText);
      }
    } catch (err: any) {
      if (err.message && !err.message.includes('fetch')) {
        throw err;
      }
    }
  }

  throw new Error('Operation timed out. Processing took longer than expected.');
}

/**
 * Downloads a completed file directly via browser
 */
export async function triggerFileDownload(downloadUrl: string, suggestedFilename?: string): Promise<void> {
  const fullUrl = getFullApiUrl(downloadUrl);

  try {
    const res = await fetch(fullUrl);
    if (!res.ok) {
      throw new Error(`Failed to download file (HTTP ${res.status})`);
    }

    // Try to extract filename from Content-Disposition header if not provided
    let finalFilename = suggestedFilename;
    const disposition = res.headers.get('content-disposition');
    if (!finalFilename && disposition) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        finalFilename = match[1].replace(/['"]/g, '');
      }
    }
    if (!finalFilename) {
      finalFilename = 'docusuite_processed_file';
    }

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: direct window location
    window.open(fullUrl, '_blank');
  }
}

// ---------------------------------------------------------------------------
// LocalStorage Session History
// ---------------------------------------------------------------------------
const HISTORY_STORAGE_KEY = 'docusuite_recent_activity_v1';

export function getSessionHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSessionHistoryItem(item: Omit<HistoryItem, 'id' | 'createdAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getSessionHistory();
    const newItem: HistoryItem = {
      ...item,
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString()
    };
    const updated = [newItem, ...history].slice(0, 30); // keep last 30
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('docusuite-history-updated'));
  } catch (err) {
    console.error('Failed to save to history', err);
  }
}

export function clearSessionHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    window.dispatchEvent(new Event('docusuite-history-updated'));
  } catch (err) {
    console.error('Failed to clear history', err);
  }
}
