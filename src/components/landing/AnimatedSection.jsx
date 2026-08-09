export default function AnimatedSection({ children, className = "", delay = 0 }) {
  return (
    <section className={`${className} animate-fade-up`} style={delay ? { animationDelay: `${delay}s` } : undefined}>
      {children}
    </section>
  );
}