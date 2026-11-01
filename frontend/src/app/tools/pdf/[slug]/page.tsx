import React, { Suspense } from 'react';
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

async function PdfToolContent({
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

export default function PdfToolPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PdfToolContent params={params} />
    </Suspense>
  );
}
