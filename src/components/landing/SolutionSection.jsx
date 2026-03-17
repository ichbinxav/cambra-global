import RevealOnScroll from "@/components/shared/RevealOnScroll";

export default function SolutionSection() {
  return (
    <section className="py-24 px-6 bg-foreground text-background">
      <div className="max-w-4xl mx-auto text-center">
        <RevealOnScroll>
          <p className="text-xs tracking-[0.3em] uppercase opacity-40 mb-6">The Solution</p>
        </RevealOnScroll>
        <RevealOnScroll delay={0.1}>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tighter leading-[0.95] mb-8">
            THE N✱DE is the economic layer
            <br />
            <span className="opacity-40">behind independent brands.</span>
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.2}>
          <p className="max-w-2xl mx-auto text-lg opacity-60 leading-relaxed mb-16">
            We connect independent brands into a unified network to unlock better infrastructure, 
            better economics, and collective leverage. When you join THE N✱DE, you don't just get 
            a tool — you get the power of a network.
          </p>
        </RevealOnScroll>
      </div>
    </section>
  );
}