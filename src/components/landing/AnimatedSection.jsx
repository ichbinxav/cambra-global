export default function AnimatedSection({ children, className = "" }) {
  return (
    <section className={`${className} animate-fade-up`}>
      {children}
    </section>
  );
}