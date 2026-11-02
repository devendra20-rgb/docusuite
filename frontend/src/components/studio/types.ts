import { ToolDefinition } from '@/types/api';

export type RotationAngle = 0 | 90 | 180 | 270;

export interface StudioPage {
  /** Unique stable ID e.g. "doc1_p1" */
  id: string;
  /** 1-based original page index in source document */
  originalPageNumber: number;
  /** Current display order (1-based) after user reordering */
  displayOrder: number;
  /** Cumulative rotation in degrees: 0, 90, 180, or 270 */
  rotation: RotationAngle;
  /** Whether this page is marked deleted/excluded */
  isDeleted: boolean;
  /** Page dimensions from PDF viewport if parsed */
  width?: number;
  height?: number;
  /** Cached rendered thumbnail data URL */
  thumbnailUrl?: string;
}

export interface StudioDocument {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  isPdf: boolean;
  isImage: boolean;
  isOffice: boolean;
  /** Object URL for rendering; automatically revoked upon document disposal */
  objectUrl: string;
  pageCount: number;
  pages: StudioPage[];
  loadState: 'loading' | 'loaded' | 'error';
  errorMessage?: string;
  isEncrypted?: boolean;
}

export type OperationType =
  | 'rotate'
  | 'reorder'
  | 'delete'
  | 'restore'
  | 'batch-rotate'
  | 'batch-delete';

export interface BaseOperation {
  id: string;
  type: OperationType;
  timestamp: number;
  description: string;
}

export interface RotateOperation extends BaseOperation {
  type: 'rotate';
  pageId: string;
  deltaAngle: 90 | -90 | 180;
  prevAngle: RotationAngle;
  newAngle: RotationAngle;
}

export interface ReorderOperation extends BaseOperation {
  type: 'reorder';
  fromIndex: number;
  toIndex: number;
}

export interface DeleteOperation extends BaseOperation {
  type: 'delete';
  pageId: string;
}

export interface RestoreOperation extends BaseOperation {
  type: 'restore';
  pageId: string;
}

export interface BatchRotateOperation extends BaseOperation {
  type: 'batch-rotate';
  pageIds: string[];
  deltaAngle: 90 | -90 | 180;
}

export interface BatchDeleteOperation extends BaseOperation {
  type: 'batch-delete';
  pageIds: string[];
}

export type StudioOperation =
  | RotateOperation
  | ReorderOperation
  | DeleteOperation
  | RestoreOperation
  | BatchRotateOperation
  | BatchDeleteOperation;

export type ViewMode = 'single' | 'grid';
export type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

export interface StudioProcessingState {
  status: 'idle' | 'preparing' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  error?: string;
}

export interface StudioOutputItem {
  filename: string;
  downloadUrl: string;
  mimeType?: string;
  size?: number;
  pageCount?: number;
  isPdf?: boolean;
  isImage?: boolean;
}

export interface StudioOutputResult {
  jobId: string;
  downloadUrl: string;
  outputFiles: StudioOutputItem[];
  primaryOutput: StudioOutputItem;
  createdAt: number;
}
