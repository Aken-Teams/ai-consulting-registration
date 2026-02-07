import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { PainPoints } from './components/PainPoints';
import { HowItWorks } from './components/HowItWorks';
import { ValueProps } from './components/ValueProps';
import { UseCases } from './components/UseCases';
import { VoiceIntake } from './components/VoiceIntake';
import { RegistrationForm } from './components/RegistrationForm';
import { Footer } from './components/Footer';
import './styles/global.css';
import './styles/animations.css';

interface IntakeResult {
  background: string;
  currentState: string;
  painPoints: string;
  expectedOutcome: string;
}

export function App() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [abVariant] = useState<'A' | 'B'>(() => {
    const stored = sessionStorage.getItem('ab_variant');
    if (stored === 'A' || stored === 'B') return stored;
    const variant = Math.random() < 0.5 ? 'A' : 'B';
    sessionStorage.setItem('ab_variant', variant);
    return variant as 'A' | 'B';
  });

  useEffect(() => {
    // Scroll-reveal observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    // Scroll progress
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? scrollTop / docHeight : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // Track page view with A/B variant
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: window.location.pathname, variant: abVariant }),
    }).catch(() => {});

    // Section visibility tracking
    const tracked = new Set<string>();
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = entry.target.getAttribute('id');
            if (sectionId && !tracked.has(sectionId)) {
              tracked.add(sectionId);
              fetch('/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: `/#${sectionId}` }),
              }).catch(() => {});
            }
          }
        });
      },
      { threshold: 0.3 }
    );
    document.querySelectorAll('section[id]').forEach((el) => sectionObserver.observe(el));

    return () => {
      observer.disconnect();
      sectionObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handleIntakeComplete = useCallback((data: IntakeResult) => {
    setIntakeResult(data);
  }, []);

  return (
    <>
      <div className="scroll-progress">
        <div
          className="scroll-progress-bar"
          style={{ transform: `scaleX(${scrollProgress})` }}
        />
      </div>
      <Header />
      <main>
        <Hero variant={abVariant} />
        <PainPoints />
        <VoiceIntake onComplete={handleIntakeComplete} />
        <HowItWorks />
        <ValueProps />
        <UseCases />
        <RegistrationForm abVariant={abVariant} intakeData={intakeResult} />
      </main>
      <Footer />
    </>
  );
}
