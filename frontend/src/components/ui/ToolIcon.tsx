import React from 'react';
import {
  Layers,
  Scissors,
  Minimize2,
  RotateCw,
  Image as ImageIcon,
  FileImage,
  ArrowUpDown,
  ExternalLink,
  Trash2,
  Grid,
  Crop,
  Hash,
  Stamp,
  Lock,
  Unlock,
  FileText,
  FileType,
  Table,
  Sheet,
  Presentation,
  Airplay,
  Code,
  FileCode,
  FileSpreadsheet,
  FileBarChart2,
  AlignLeft,
  FileCheck,
  File,
  LucideProps
} from 'lucide-react';

interface ToolIconProps extends LucideProps {
  name: string;
}

const ICON_MAP: Record<string, React.FC<LucideProps>> = {
  Layers,
  Scissors,
  Minimize2,
  RotateCw,
  Image: ImageIcon,
  FileImage,
  ArrowUpDown,
  ExternalLink,
  Trash2,
  Grid,
  Crop,
  Hash,
  Stamp,
  Lock,
  Unlock,
  FileText,
  FileType,
  Table,
  Sheet,
  Presentation,
  Airplay,
  Code,
  FileCode,
  FileSpreadsheet,
  FileBarChart2,
  AlignLeft,
  FileCheck,
  File
};

export const ToolIcon: React.FC<ToolIconProps> = ({ name, ...props }) => {
  const Component = ICON_MAP[name] || File;
  return <Component {...props} />;
};
