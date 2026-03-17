export default function SectionDivider() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-px w-16 bg-border" />
      <span className="mx-4 text-xs text-muted-foreground select-none">✱</span>
      <div className="h-px w-16 bg-border" />
    </div>
  );
}