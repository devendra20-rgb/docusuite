import React from 'react';
import { ShieldCheck, Lock, Trash2, EyeOff, Server } from 'lucide-react';

export const PrivacyGuarantee: React.FC = () => {
  const points = [
    {
      title: 'Zero-Retention Guarantee',
      description: 'Files are processed in isolated memory or ephemeral temporary folders, then purged immediately upon completion or expiration.',
      icon: Trash2
    },
    {
      title: 'End-to-End TLS 1.3 Encryption',
      description: 'All document traffic between your browser and our backend is encrypted using high-grade cipher suites.',
      icon: Lock
    },
    {
      title: 'No Data Extraction or AI Training',
      description: 'We do not inspect, index, or feed your documents into any artificial intelligence models or advertising trackers.',
      icon: EyeOff
    },
    {
      title: 'Hermetic Processing Sandboxes',
      description: 'PDF manipulations and LibreOffice office conversions execute inside secure, resource-capped container processes.',
      icon: Server
    }
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-3xl p-8 sm:p-12 lg:p-16 text-white relative overflow-hidden shadow-xl">
          {/* Subtle glow background */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl mb-12">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4">
              <ShieldCheck className="w-4 h-4" />
              <span>Uncompromising Privacy</span>
            </div>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl text-white tracking-tight">
              Your confidential documents remain exclusively yours.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              DocuSuite was designed from day one with architectural privacy. We treat financial records, contracts, and personal papers with the highest security standards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 relative z-10">
            {points.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="flex items-start space-x-4 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base">{p.title}</h3>
                    <p className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {p.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
