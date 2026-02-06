import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { PainPoints } from './components/PainPoints';
import { HowItWorks } from './components/HowItWorks';
import { ValueProps } from './components/ValueProps';
import { UseCases } from './components/UseCases';
import { RegistrationForm } from './components/RegistrationForm';
import { Footer } from './components/Footer';
import './styles/global.css';
import './styles/animations.css';

export function App() {
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

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Header />
      <main>
        <Hero />
        <PainPoints />
        <HowItWorks />
        <ValueProps />
        <UseCases />
        <RegistrationForm />
      </main>
      <Footer />
    </>
  );
}
