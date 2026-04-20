import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sterile Decant Process | 100% Authentic Guarantee",
  description: "Learn how Valore Parfums ensures sterile decanting and authentic perfume sourcing in Bangladesh.",
  alternates: { canonical: "/sterile-decant-process" },
};

export default function SterileDecantProcessPage() {
  return (
    <main className="px-4 sm:px-6 md:px-[5%] py-8 sm:py-10 max-w-4xl mx-auto">
      <h1 className="font-serif text-3xl md:text-4xl font-light leading-tight">Sterile Decant Process</h1>
      <p className="mt-4 text-sm md:text-base text-[var(--text-secondary)] leading-relaxed">
        We use sanitized tools, sealed atomizers, and documented handling steps to deliver 100% authentic perfume decants.
      </p>

      <section className="mt-7 sm:mt-8 space-y-4 text-sm md:text-base text-[var(--text-secondary)] leading-relaxed max-w-[72ch]">
        <h2 className="font-serif text-2xl font-light">100% Authentic Guarantee</h2>
        <p>Every decant is sourced from original branded bottles. We do not use inspired oil blends or unverified bulk juice.</p>
        <h2 className="font-serif text-2xl font-light">Hygiene Workflow</h2>
        <p>Each transfer uses cleaned equipment and fresh atomizers. Bottles are capped immediately and stored away from heat and direct light.</p>
        <h2 className="font-serif text-2xl font-light">Packaging Transparency</h2>
        <p>We use real packaging images and provide product-level decant/full-bottle options on one canonical page for clear buying decisions.</p>
      </section>
    </main>
  );
}
