'use client';

import React from 'react';
import { ToolDefinition } from '@/types/api';
import { StudioWorkspace } from '@/components/studio/StudioWorkspace';
import { MergeWorkspace } from '@/components/studio/MergeWorkspace';
import { SplitWorkspace } from '@/components/studio/SplitWorkspace';
import { CompressWorkspace } from '@/components/studio/CompressWorkspace';
import { RotateWorkspace } from '@/components/studio/RotateWorkspace';

export interface ToolWorkspaceProps {
  tool: ToolDefinition;
}

/**
 * ToolWorkspace delegates to the interactive Document Studio.
 * Dedicated full-screen workspaces are routed for Merge PDF, Split PDF, Compress PDF, and Rotate PDF,
 * while other tools use the standard studio workspace.
 */
export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ tool }) => {
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
  return <StudioWorkspace tool={tool} />;
};

export default ToolWorkspace;
