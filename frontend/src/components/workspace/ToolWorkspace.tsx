'use client';

import React from 'react';
import { ToolDefinition } from '@/types/api';
import { StudioWorkspace } from '@/components/studio/StudioWorkspace';
import { MergeWorkspace } from '@/components/studio/MergeWorkspace';
import { SplitWorkspace } from '@/components/studio/SplitWorkspace';
import { CompressWorkspace } from '@/components/studio/CompressWorkspace';
import { RotateWorkspace } from '@/components/studio/RotateWorkspace';
import { PdfToJpgWorkspace } from '@/components/studio/PdfToJpgWorkspace';
import { CropWorkspace } from '@/components/studio/CropWorkspace';
import { PageNumbersWorkspace } from '@/components/studio/PageNumbersWorkspace';
import { WatermarkWorkspace } from '@/components/studio/WatermarkWorkspace';
import { ProtectWorkspace } from '@/components/studio/ProtectWorkspace';
import { WordToPdfWorkspace } from '@/components/studio/WordToPdfWorkspace';
import { ExcelToPdfWorkspace } from '@/components/studio/ExcelToPdfWorkspace';

export interface ToolWorkspaceProps {
  tool: ToolDefinition;
}

/**
 * ToolWorkspace delegates to the interactive Document Studio.
 * Dedicated full-screen workspaces are routed for Merge PDF, Split PDF, Compress PDF, Rotate PDF, PDF to JPG, Crop PDF, and Add Page Numbers,
 * while other tools use the standard studio workspace.
 */
export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ tool }) => {
  if (tool.slug === 'word-to-pdf' || tool.id === 'word-to-pdf') {
    return <WordToPdfWorkspace tool={tool} />;
  }
  if (tool.slug === 'excel-to-pdf' || tool.id === 'excel-to-pdf') {
    return <ExcelToPdfWorkspace tool={tool} />;
  }
  if (tool.slug === 'protect' || tool.id === 'protect-pdf') {
    return <ProtectWorkspace tool={tool} />;
  }
  if (tool.slug === 'add-watermark' || tool.id === 'add-watermark') {
    return <WatermarkWorkspace tool={tool} />;
  }
  if (tool.slug === 'add-page-numbers') {
    return <PageNumbersWorkspace tool={tool} />;
  }
  if (tool.slug === 'crop') {
    return <CropWorkspace tool={tool} />;
  }
  if (tool.slug === 'merge') {
    return <MergeWorkspace tool={tool} />;
  }
  if (tool.slug === 'split') {
    return <SplitWorkspace tool={tool} />;
  }
  if (tool.slug === 'compress') {
    return <CompressWorkspace tool={tool} />;
  }
  if (tool.slug === 'rotate') {
    return <RotateWorkspace tool={tool} />;
  }
  if (tool.slug === 'to-images') {
    return <PdfToJpgWorkspace tool={tool} />;
  }
  return <StudioWorkspace tool={tool} />;
};

export default ToolWorkspace;
