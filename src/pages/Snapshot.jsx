import React from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import snapshot from "../../docs/PROJECT_SNAPSHOT_B1-5.md?raw";

export default function Snapshot() {
  const handleScrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-background/70 bg-background/90 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold tracking-tight">Project Snapshot</h1>
            <p className="text-[11px] text-muted-foreground">Copia y pega desde aquí · docs/PROJECT_SNAPSHOT_B1-5.md</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleScrollTop}>Arriba</Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="text-xs leading-relaxed whitespace-pre-wrap break-words">
          <ReactMarkdown
            components={{
              code({inline, className, children, ...props}) {
                return inline ? (
                  <code className="px-1 py-0.5 rounded bg-secondary text-foreground/90" {...props}>{children}</code>
                ) : (
                  <pre className="overflow-auto rounded-lg border border-border bg-card p-3 my-3 text-[11px]">
                    <code className={className} {...props}>{children}</code>
                  </pre>
                );
              },
              h1: ({children}) => <h1 className="text-xl font-black mt-6 mb-3">{children}</h1>,
              h2: ({children}) => <h2 className="text-lg font-bold mt-5 mb-2">{children}</h2>,
              h3: ({children}) => <h3 className="text-base font-semibold mt-4 mb-2">{children}</h3>,
              p: ({children}) => <p className="my-2">{children}</p>,
              ul: ({children}) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
              a: ({children, ...props}) => <a className="underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>,
            }}
          >
            {snapshot}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}