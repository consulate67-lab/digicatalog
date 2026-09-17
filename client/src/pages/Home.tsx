import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  Plug,
  FileText,
  Eye,
  FolderTree,
  Image,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

/**
 * Landing sayfası — Full marketing page.
 *
 * Bölümler (tüm metin i18n):
 *   1. Hero (badge + title + subtitle + 2 CTA + trust line)
 *   2. Nasıl Çalışır (3 adım)
 *   3. Özellikler (6 kart)
 *   4. SSS (accordion, 5 soru)
 *   5. Footer CTA (gradient band)
 *
 * Faz 1: Marketing copy + i18n altyapısı. Faz 7'de PDF viewer'dan
 * screenshot'lar eklenebilir.
 */

const FEATURE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Plug,
  FileText,
  Eye,
  FolderTree,
  Image,
};

const Home = () => {
  const { t } = useTranslation();
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null);

  const hero = t('landing.hero', { returnObjects: true }) as {
    badge: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trustLine: string;
  };
  const howItWorks = t('landing.howItWorks', { returnObjects: true }) as {
    title: string;
    subtitle: string;
    steps: Array<{ number: string; title: string; description: string }>;
  };
  const features = t('landing.features', { returnObjects: true }) as {
    title: string;
    subtitle: string;
    items: Array<{ icon: string; title: string; description: string }>;
  };
  const faq = t('landing.faq', { returnObjects: true }) as {
    title: string;
    subtitle: string;
    items: Array<{ question: string; answer: string }>;
  };
  const footerCta = t('landing.footerCta', { returnObjects: true }) as {
    title: string;
    subtitle: string;
    button: string;
  };

  return (
    <div className="bg-white">
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-slate-50">
        {/* Decorative grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgb(203 213 225) 1px, transparent 0)',
            backgroundSize: '24px 24px',
            maskImage:
              'radial-gradient(ellipse 60% 60% at 50% 40%, black, transparent)',
            WebkitMaskImage:
              'radial-gradient(ellipse 60% 60% at 50% 40%, black, transparent)',
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-medium text-brand-700 shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              {hero.badge}
            </span>

            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              {hero.title}
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
              {hero.subtitle}
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register" className="btn-primary px-6 py-3 text-base">
                {hero.ctaPrimary}
              </Link>
              <Link to="/login" className="btn-secondary px-6 py-3 text-base">
                {hero.ctaSecondary}
              </Link>
            </div>

            <p className="mt-6 text-sm text-slate-500">{hero.trustLine}</p>
          </div>
        </div>
      </section>

      {/* ===== Nasıl Çalışır ===== */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            {howItWorks.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600">
            {howItWorks.subtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {howItWorks.steps.map((step) => (
            <div
              key={step.number}
              className="card relative overflow-hidden border-slate-200"
            >
              <span className="absolute right-4 top-4 text-5xl font-bold leading-none text-brand-100">
                {step.number}
              </span>
              <div className="relative">
                <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Özellikler ===== */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              {features.title}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600">
              {features.subtitle}
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.items.map((item) => {
              const Icon = FEATURE_ICONS[item.icon] ?? Shield;
              return (
                <div
                  key={item.title}
                  className="card border-slate-200 transition-shadow hover:shadow-md"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== SSS ===== */}
      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">
            {faq.title}
          </h2>
          <p className="mt-3 text-base text-slate-600">{faq.subtitle}</p>
        </div>

        <div className="mt-10 space-y-3">
          {faq.items.map((item, idx) => {
            const open = openFaqIdx === idx;
            return (
              <div
                key={item.question}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIdx(open ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                  aria-expanded={open}
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {open && (
                  <div className="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Footer CTA ===== */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-12 text-center shadow-xl sm:px-12 sm:py-16">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {footerCta.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-brand-100">
            {footerCta.subtitle}
          </p>
          <div className="mt-8">
            <Link
              to="/register"
              className="inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-base font-semibold text-brand-700 shadow-sm transition-transform hover:scale-[1.02] hover:bg-brand-50"
            >
              {footerCta.button}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
