import React from 'react';
import { Hero } from '@/components/home/Hero';
import { PopularToolsGrid } from '@/components/home/PopularToolsGrid';
import { HowItWorks } from '@/components/home/HowItWorks';
import { PrivacyGuarantee } from '@/components/home/PrivacyGuarantee';
import { FaqSection } from '@/components/home/FaqSection';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <Hero />
      <PopularToolsGrid />
      <HowItWorks />
      <PrivacyGuarantee />
      <FaqSection />
    </div>
  );
}
