'use client';

import React from 'react';
import { ToolDefinition } from '@/types/api';
import { StudioWorkspace } from '@/components/studio/StudioWorkspace';
import { MergeWorkspace } from '@/components/studio/MergeWorkspace';

export interface ToolWorkspaceProps {
  tool: ToolDefinition;
}

/**
 * ToolWorkspace delegates to the interactive Document Studio.
 * Routes Merge PDF to the dedicated full-screen workspace,
 * while other tools use the standard studio workspace.
 */
export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ tool }) => {
  if (tool.slug === 'merge') {
    return <MergeWorkspace tool={tool} />;
  }
  return <StudioWorkspace tool={tool} />;
};

export default ToolWorkspace;
