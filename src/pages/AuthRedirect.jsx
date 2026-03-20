import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function AuthRedirect() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || `${window.location.origin}/Dashboard`;
    base44.auth.redirectToLogin(next);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto mb-3" />
        <h1 className="text-base font-bold mb-1">Redirigiendo al inicio de sesión…</h1>
        <p className="text-sm text-muted-foreground">Se abrirá la página de login y volverás después de autenticarte.</p>
      </div>
    </div>
  );
}