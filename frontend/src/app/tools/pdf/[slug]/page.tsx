import React from 'react';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getToolBySlug, ALL_TOOLS } from '@/lib/tools-registry';
import { ToolWorkspace } from '@/components/workspace/ToolWorkspace';

export function generateStaticParams() {
  return ALL_TOOLS.filter((t) => !t.isConversion).map((t) => ({
    slug: t.slug
  }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) return { title: 'Tool Not Found — DocuSuite' };
  return {
    title: `${tool.title} — DocuSuite Precision Studio`,
    description: tool.description
  };
}

export default async function PdfToolPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);

  if (!tool || tool.isConversion) {
    notFound();
  }

  return <ToolWorkspace tool={tool} />;
}
