import React from 'react';
import { UploadCloud, Sliders, Download, CheckCircle2 } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      step: '01',
      title: 'Select & Upload',
      description: 'Drag and drop your PDFs, Word documents, Excel workbooks, or images directly into the secure upload tray.',
      icon: UploadCloud,
      subPoints: ['Fast multi-file batch upload', 'Client-side magic bytes validation', 'Up to 50MB per document']
    },
    {
      step: '02',
      title: 'Configure & Process',
      description: 'Rearrange pages, specify compression levels, assign passwords, or choose target formats with real-time feedback.',
      icon: Sliders,
      subPoints: ['Visual reordering previews', 'Granular control over margins and angles', 'High-throughput async job queues']
    },
    {
      step: '03',
      title: 'Download & Done',
      description: 'Obtain your cleanly processed file instantly. All temporary data is automatically expunged from the server.',
      icon: Download,
      subPoints: ['Direct high-speed browser download', 'Lossless vector output preservation', 'Zero-retention auto-purge']
    }
  ];

  return (
    <section className="py-20 bg-slate-50 border-y border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-100">
            Frictionless Flow
          </span>
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-slate-900 tracking-tight mt-3">
            How DocuSuite Works
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2">
            Engineered for swift, predictable execution in three simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((item, _idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="relative bg-white rounded-2xl p-8 border border-slate-200 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="font-heading font-extrabold text-3xl text-slate-200">
                      {item.step}
                    </span>
                  </div>

                  <h3 className="font-heading font-bold text-lg text-slate-900 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-6">
                    {item.description}
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-100">
                  {item.subPoints.map((point) => (
                    <div key={point} className="flex items-center space-x-2 text-xs text-slate-600">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
