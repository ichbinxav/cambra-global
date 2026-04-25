import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import CompanyBlock from "@/components/onboarding/CompanyBlock";

export default function BrandProfile() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link to="/Onboarding" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Volver
          </Link>
          <h1 className="ml-auto text-base font-bold">Perfil de marca</h1>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-5 py-6 space-y-6">
        <div className="p-5 rounded-2xl border border-border/50 bg-card">
          <h2 className="text-xl font-black tracking-[-0.02em] mb-1">Cuéntanos sobre tu marca</h2>
          <p className="text-sm text-muted-foreground/70">Nombre, país, categoría y datos básicos para personalizar tu análisis.</p>
        </div>

        {/* Brand form */}
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <CompanyBlock />
        </div>
      </div>
    </div>
  );
}