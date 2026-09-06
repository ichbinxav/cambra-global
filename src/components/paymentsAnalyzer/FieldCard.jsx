export default function FieldCard({ children, className = "" }) {
  return (
    <section className={`analyzer-field-card ${className}`}>{children}</section>
  );
}
