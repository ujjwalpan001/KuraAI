import React from 'react';
import HeroSection from '../components/landing/HeroSection';
import VideoShowcaseSection from '../components/landing/VideoShowcaseSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import FinalCTASection from '../components/landing/FinalCTASection';

export default function Landing({ onLoginClick }) {
  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-brand selection:text-canvas">
      {/* Navbar can be part of Hero or Global, placing in Hero for transparency effects */}
      <HeroSection onLoginClick={onLoginClick} />
      <VideoShowcaseSection />
      <HowItWorksSection onLoginClick={onLoginClick} />
      <FinalCTASection onLoginClick={onLoginClick} />
    </div>
  );
}
