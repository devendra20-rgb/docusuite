export type ToolCategory =
  | 'Organize & Manage'
  | 'Optimize & Edit'
  | 'Security & Protection'
  | 'Convert';

export type ToolParamType = 'text' | 'number' | 'password' | 'select' | 'rotation' | 'pages';

export interface ToolParamConfig {
  name: string;
  label: string;
  type: ToolParamType;
  description?: string;
  defaultValue?: any;
  options?: { label: string; value: string | number }[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}

export interface ToolDefinition {
  id: string;
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  category: ToolCategory;
  iconName: string;
  badge?: string;
  isPopular?: boolean;
  endpoint: string;
  accept: string[]; // e.g. ['.pdf']
  acceptMimeTypes?: string[];
  minFiles: number;
  maxFiles: number;
  params?: ToolParamConfig[];
  features?: string[];
  limitations?: string;
  isConversion?: boolean;
  fromFormat?: string;
  toFormat?: string;
  requiresLibreOffice?: boolean;
}

export interface OutputFile {
  fileId: string;
  filename: string;
  originalName?: string;
  mimeType: string;
  size?: number;
  downloadUrl: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  jobId?: string;
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  outputFiles?: OutputFile[];
  downloadUrl?: string;
  checkStatusUrl?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface JobStatusResponse {
  success: boolean;
  jobId: string;
  tool: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  outputFiles?: OutputFile[];
  error?: string | { message: string };
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  downloadUrl?: string;
}

export interface EngineCapability {
  name: string;
  available: boolean;
  supportedConversions: string[];
}

export interface CapabilitiesResponse {
  success: boolean;
  data?: EngineCapability[];
  engines?: EngineCapability[];
}

export interface HistoryItem {
  id: string;
  jobId: string;
  toolId: string;
  toolTitle: string;
  inputFiles: { name: string; size: number }[];
  outputFiles?: { name: string; downloadUrl: string }[];
  status: 'completed' | 'failed';
  createdAt: string;
}
