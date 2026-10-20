'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      question: 'Are my uploaded files safe and kept private?',
      answer:
        'Yes, absolutely. DocuSuite operates on a zero-retention model. Files uploaded to the system are processed in isolated memory streams or ephemeral temporary storage, strictly protected with TLS 1.3 encryption, and immediately purged upon task completion. We never read, store, or train AI on your documents.'
    },
    {
      question: 'What is the maximum file size limit?',
      answer:
        'The backend currently supports document uploads up to 50MB per individual file and batches of up to 20 files per merge or conversion operation.'
    },
    {
      question: 'Which office document conversions are supported?',
      answer:
        'We support two-way conversions between PDF and Microsoft Office formats (Word DOCX, Excel XLSX, PowerPoint PPTX), as well as plain text (TXT to PDF), HTML (HTML to PDF, Word to HTML), CSV (CSV to Excel, Excel to CSV), and Rich Text (RTF to PDF). Backend engine capabilities can be checked live on the System Status page.'
    },
    {
      question: 'How does PDF compression work without losing quality?',
      answer:
        'Our PDF compression engine parses internal object structures, strips redundant embedded font subsets, re-compresses embedded raster graphics, and optimizes cross-reference streams. The visual geometry and vector sharpness of your typography remain intact.'
    },
    {
      question: 'Can I reorder or delete pages before merging?',
      answer:
        'Yes. In the tool workspace, you can visually drag to reorder uploaded documents, delete unwanted items, and review total document and estimated page counts before initiating processing.'
    },
    {
      question: 'Is there a REST API for automated batch processing?',
      answer:
        'Yes. DocuSuite provides a documented OpenAPI 3.0 REST API at /api/docs with support for synchronous and asynchronous BullMQ job queues, multipart uploads, and automated webhook or poll-based downloads.'
    }
  ];

  return (
    <section className="py-20 bg-slate-50 border-t border-slate-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold uppercase tracking-wider mb-3">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Got Questions?</span>
          </div>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-slate-900 tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Everything you need to know about DocuSuite features, security, and processing.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={faq.question}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs transition-all"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full py-4 px-6 text-left flex items-center justify-between font-heading font-semibold text-slate-900 text-sm sm:text-base hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-rose-600' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
