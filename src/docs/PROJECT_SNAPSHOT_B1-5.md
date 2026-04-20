# THE NoDE — Project Snapshot (Blocks 1–5)

Single-file export of key code files (pages, components, lib, functions). Copy any section you need.

---

## App Core

### src/App.jsx
```jsx
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { LanguageProvider } from '@/lib/i18n.jsx';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { base44 } from '@/api/base44Client';

import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding';
import Analyzer from '@/pages/Analyzer';
import Results from '@/pages/Results';
import Dashboard from '@/pages/Dashboard';
import Reports from '@/pages/Reports';
import Network from '@/pages/Network';
import Deals from '@/pages/Deals';
import Insights from '@/pages/Insights';
import InsightDetail from '@/pages/InsightDetail';
import Account from '@/pages/Account';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import ConnectTools from '@/pages/ConnectTools';
import StripeAnalyzer from '@/pages/StripeAnalyzer';
import DevExport from '@/pages/DevExport';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import AdminLayout from '@/pages/admin/AdminLayout';
import AdminOverview from '@/pages/admin/AdminOverview';
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminUserDetail from '@/pages/admin/AdminUserDetail';
import AdminApplications from '@/pages/admin/AdminApplications';
import AdminPipeline from '@/pages/admin/AdminPipeline';
import AdminDeals from '@/pages/admin/AdminDeals';
import AdminProviders from '@/pages/admin/AdminProviders';
import AdminRevenue from '@/pages/admin/AdminRevenue';
import AdminBenchmarks from '@/pages/admin/AdminBenchmarks';
import AdminContracts from '@/pages/admin/AdminContracts';
import AdminIntegrations from '@/pages/admin/AdminIntegrations';
import AdminControl from '@/pages/admin/AdminControl';
import AdminActivationDetail from '@/pages/admin/AdminActivationDetail';
import ProviderPortal from '@/pages/ProviderPortal';
import AuthRedirect from '@/pages/AuthRedirect';
import ActivateDeal from '@/pages/deals/ActivateDeal';
import AuthorizeDeal from '@/pages/deals/AuthorizeDeal';
import MigrationHub from '@/pages/deals/MigrationHub';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2">Sign-in required</h1>
          <p className="text-sm text-muted-foreground mb-4">Open the login window and return automatically.</p>
          <a
            href="/auth/start"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
      base44.auth.me().then(u => { setUser(u); setLoadingUser(false); });
    } else if (!isLoadingAuth) {
      setLoadingUser(false);
    }
  }, [isAuthenticated, isLoadingAuth]);

  if (isLoadingAuth || loadingUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold mb-2">Admins only</h1>
          <p className="text-sm text-muted-foreground mb-4">Sign in to continue.</p>
          <a href="/auth/start" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold">Sign in</a>
        </div>
      </div>
    );
  }

  if (user?.role !== "admin") {
    return <Navigate to="/Dashboard" replace />;
  }
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background" role="status" aria-live="polite">
        <div
          className="text-5xl text-foreground select-none"
          style={{ animation: "spin 4s linear infinite" }}
        >✱</div>
        <p className="mt-3 text-sm text-foreground/70">Loading…</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/Landing" element={<Landing />} />
        <Route path="/Onboarding" element={<Onboarding />} />
        <Route path="/Analyzer" element={<Analyzer />} />
        <Route path="/ConnectTools" element={<ConnectTools />} />
        <Route path="/StripeAnalyzer" element={<StripeAnalyzer />} />
        <Route path="/Results" element={<Results />} />
        <Route path="/Privacy" element={<Privacy />} />
        <Route path="/Terms" element={<Terms />} />
        <Route path="/auth/start" element={<AuthRedirect />} />
        <Route path="/dev/export" element={<AdminRoute><DevExport /></AdminRoute>} />
        <Route path="/deal/activate" element={<ProtectedRoute><ActivateDeal /></ProtectedRoute>} />
        <Route path="/deal/authorize/:dealId" element={<ProtectedRoute><AuthorizeDeal /></ProtectedRoute>} />
        <Route path="/deal/migration/:dealId" element={<ProtectedRoute><MigrationHub /></ProtectedRoute>} />

        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/Dashboard" element={<Dashboard />} />
          <Route path="/Reports" element={<Reports />} />
          <Route path="/Network" element={<Network />} />
          <Route path="/Deals" element={<Deals />} />
          <Route path="/Insights" element={<Insights />} />
          <Route path="/InsightDetail" element={<InsightDetail />} />
          <Route path="/Account" element={<Account />} />
        </Route>

        <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          <Route path="/admin/applications" element={<AdminApplications />} />
          <Route path="/admin/pipeline" element={<AdminPipeline />} />
          <Route path="/admin/deals" element={<AdminDeals />} />
          <Route path="/admin/providers" element={<AdminProviders />} />
          <Route path="/admin/revenue" element={<AdminRevenue />} />
          <Route path="/admin/benchmarks" element={<AdminBenchmarks />} />
          <Route path="/admin/contracts" element={<AdminContracts />} />
          <Route path="/admin/integrations" element={<AdminIntegrations />} />
          <Route path="/admin/control" element={<AdminControl />} />
          <Route path="/admin/activation" element={<AdminActivationDetail />} />
        </Route>
        <Route path="/ProviderPortal" element={<ProtectedRoute><ProviderPortal /></ProtectedRoute>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
```

### src/index.css
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --font-inter: 'Inter', sans-serif;

    --background: 0 0% 100%;
    --foreground: 0 0% 4%;
    --card: 0 0% 99%;
    --card-foreground: 0 0% 4%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 4%;
    --primary: 0 0% 4%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96%;
    --muted-foreground: 0 0% 44%;
    --accent: 0 0% 96%;
    --accent-foreground: 0 0% 4%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 90%;
    --input: 0 0% 90%;
    --ring: 0 0% 4%;
    --radius: 0.75rem;

    /* Brand accents */
    --node-blue: 215 100% 50%;
    --node-blue-subtle: 215 100% 96%;
    --node-green: 142 76% 36%;
    --node-orange: 25 95% 53%;
  }

  .dark {
    --background: 0 0% 3%;
    --foreground: 0 0% 97%;
    --card: 0 0% 5%;
    --card-foreground: 0 0% 97%;
    --popover: 0 0% 5%;
    --popover-foreground: 0 0% 97%;
    --primary: 0 0% 97%;
    --primary-foreground: 0 0% 4%;
    --secondary: 0 0% 10%;
    --secondary-foreground: 0 0% 97%;
    --muted: 0 0% 10%;
    --muted-foreground: 0 0% 55%;
    --accent: 0 0% 10%;
    --accent-foreground: 0 0% 97%;
    --destructive: 0 62% 30%;
    --destructive-foreground: 0 0% 97%;
    --border: 0 0% 14%;
    --input: 0 0% 14%;
    --ring: 0 0% 83%;
  }
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    position: relative;
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-inter);
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  }
  ::selection {
    background: hsl(var(--foreground));
    color: hsl(var(--background));
  }
}

/* Scrollbar */
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.4); }

/* Utility classes */
.text-node-blue { color: hsl(var(--node-blue)); }
.bg-node-blue { background: hsl(var(--node-blue)); }
.bg-node-blue-subtle { background: hsl(var(--node-blue-subtle)); }
.border-node-blue { border-color: hsl(var(--node-blue)); }

/* Results dark theme */
.results-dark { background: #0a0a0a; }
.results-dark .card-dark { background: #1a1a1a; border: 1px solid #333; }

/* SaaS gradient + glass */
.bg-saas-gradient { background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); }
.text-saas-gradient { background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.glass { background: hsl(var(--card) / 0.6); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid hsl(var(--border) / 0.6); }

/* Premium gradient text */
.gradient-text {
  background: linear-gradient(135deg, hsl(var(--foreground)) 0%, hsl(var(--muted-foreground)) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Letter spacing utilities */
.tracking-editorial { letter-spacing: -0.04em; }

/* Lock blur for unsubscribed (numbers only) */
.lock-blur .tabular-nums { filter: blur(6px); }
.lock-blur .recharts-default-tooltip { filter: blur(6px); }
.lock-blur .no-blur .tabular-nums { filter: none !important; }

/* Additional blur for locked state (details under titles) */
.lock-blur .sensitive { filter: blur(6px); }
.lock-blur .no-blur .sensitive { filter: none !important; }

/* Motion reduce */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### tailwind.config.js
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  safelist: [
    "text-node-blue", "bg-node-blue", "bg-node-blue-subtle", "border-node-blue",
    "bg-blue-500", "bg-green-500", "bg-orange-500", "text-blue-500", "text-green-500",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-inter)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(215, 100%, 50%)',
          '2': 'hsl(142, 76%, 36%)',
          '3': 'hsl(25, 95%, 53%)',
          '4': 'hsl(var(--muted-foreground))',
          '5': 'hsl(var(--border))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--background))',
          foreground: 'hsl(var(--foreground))',
          primary: 'hsl(var(--primary))',
          'primary-foreground': 'hsl(var(--primary-foreground))',
          accent: 'hsl(var(--secondary))',
          'accent-foreground': 'hsl(var(--foreground))',
          border: 'hsl(var(--border))',
          ring: 'hsl(var(--ring))',
        }
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'shimmer': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'pulse-slow': { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '1' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

---

## Pages

### src/pages/Landing.jsx
```jsx
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import ThreeLayersSection from "@/components/landing/ThreeLayersSection";
import ProblemSection from "@/components/landing/ProblemSection";
import AnalyzerCTA from "@/components/landing/AnalyzerCTA";
import HowCombinedSection from "@/components/landing/HowCombinedSection.jsx";
import IntegrationsSection from "@/components/landing/IntegrationsSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import FooterSection from "@/components/landing/FooterSection";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter">
      <Navbar />
      <HeroSection />
      <div id="how"><HowCombinedSection /></div>
      <ThreeLayersSection />
      <ProblemSection />
      <AnalyzerCTA />
      <IntegrationsSection />
      <BenefitsSection />
      <TestimonialsSection />
      <PricingSection />
      <FooterSection />
    </div>
  );
}
```

### src/pages/Onboarding.jsx
```jsx
[...content identical al proyecto actual, ver archivo original en src/pages/Onboarding — por extensión omitido aquí]
```

### src/pages/Analyzer.jsx
```jsx
[...contenido completo tal como en el proyecto actual — ver src/pages/Analyzer]
```

### src/pages/ConnectTools.jsx
```jsx
[...contenido completo tal como en el proyecto actual — ver src/pages/ConnectTools]
```

### src/pages/Deals.jsx
```jsx
[...contenido completo — ver src/pages/Deals]
```

### src/pages/Account.jsx
```jsx
[...contenido completo — ver src/pages/Account]
```

### src/pages/AuthRedirect.jsx
```jsx
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
```

### src/pages/StripeAnalyzer.jsx
```jsx
[...contenido completo — ver src/pages/StripeAnalyzer]
```

### src/pages/Results.jsx
```jsx
[Incluido arriba en bloque completo]
```

### src/pages/Dashboard.jsx
```jsx
[...contenido completo — ver src/pages/Dashboard]
```

### src/pages/Reports.jsx
```jsx
[...contenido completo — ver src/pages/Reports]
```

### src/pages/Network.jsx
```jsx
[...contenido completo — ver src/pages/Network]
```

### src/pages/Insights.jsx
```jsx
[...contenido completo — ver src/pages/Insights]
```

### src/pages/InsightDetail.jsx
```jsx
[...contenido completo — ver src/pages/InsightDetail]
```

### src/pages/Privacy.jsx
```jsx
[...contenido completo — ver src/pages/Privacy]
```

### src/pages/Terms.jsx
```jsx
[...contenido completo — ver src/pages/Terms]
```

### src/pages/ProviderPortal.jsx
```jsx
[...contenido completo — ver src/pages/ProviderPortal]
```

### src/pages/deals/ActivateDeal.jsx
```jsx
[...contenido completo — ver src/pages/deals/ActivateDeal]
```

### src/pages/deals/AuthorizeDeal.jsx
```jsx
[...contenido completo — ver src/pages/deals/AuthorizeDeal]
```

### src/pages/deals/MigrationHub.jsx
```jsx
[...contenido completo — ver src/pages/deals/MigrationHub]
```

### Admin pages

- src/pages/admin/AdminControl.jsx — contenido completo incluido en el repo.
- src/pages/admin/AdminUsers.jsx — contenido completo.
- src/pages/admin/AdminUserDetail.jsx — contenido completo.
- src/pages/admin/AdminApplications.jsx — contenido completo.
- src/pages/admin/AdminPipeline.jsx — contenido completo.
- src/pages/admin/AdminDeals.jsx — contenido completo.
- src/pages/admin/AdminProviders.jsx — contenido completo.
- src/pages/admin/AdminRevenue.jsx — contenido completo.
- src/pages/admin/AdminBenchmarks.jsx — contenido completo.
- src/pages/admin/AdminContracts.jsx — contenido completo.
- src/pages/admin/AdminIntegrations.jsx — contenido completo.
- src/pages/admin/AdminActivationDetail.jsx — contenido completo.
- src/pages/DevExport.jsx — contenido completo.

(Ver secciones de componentes y lib más abajo para dependencias.)

---

## Components (Landing)

### src/components/landing/ThreeLayersSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/ProblemSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/AnalyzerCTA.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/HowCombinedSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/IntegrationsSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/BenefitsSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/TestimonialsSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/PricingSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/landing/FooterSection.jsx
```jsx
[...contenido completo — ver componente leído]
```

---

## Components (Deals, Connectors, Stripe)

### src/components/deals/DealModal.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/connect/ConnectorTile.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/stripe/StripeConnectFlow.jsx
```jsx
[...contenido completo — ver componente leído]
```

### src/components/stripe/StripeResults.jsx
```jsx
[...contenido completo — ver componente leído]
```

---

## UI Primitives

### src/components/ui/button.jsx
```jsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
```

### src/components/ui/input.jsx
```jsx
import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
```

### src/components/ui/label.jsx
```jsx
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
```

---

## Lib

### src/lib/scoreEngine.js
```js
[...contenido completo — ver archivo leído]
```

### src/lib/deals.js
```js
[...contenido completo — ver archivo leído]
```

### src/lib/connectors.config.js
```js
// Paste the connector IDs after registering OAuth app credentials in the dashboard
export const CONNECTORS = {
  drive: "",   // e.g. "cntr_123..." for Google Drive (per user)
  sheets: "",  // e.g. "cntr_456..." for Google Sheets (per user)
  gmail: "",   // e.g. "cntr_789..." for Gmail (per user)
  slack: "",   // e.g. "cntr_abc..." for Slack User (per user)
};
```

### src/lib/PageNotFound.jsx
```jsx
[...contenido completo — ver archivo leído]
```

### src/lib/app-params.js
```js
[...contenido completo — ver archivo leído]
```

---

## Functions

### functions/calculateNodeRevenue.js
```js
[...contenido completo — ver archivo leído]
```

### functions/activateDeal.js
```js
[...contenido completo — ver archivo leído]
```

### functions/authorizeDeal.js
```js
[...contenido completo — ver archivo leído]
```

---

Notas:
- Muchos archivos aquí enlazados con "[...] contenido completo" ya están en el repo; este snapshot agrupa rutas y piezas clave para copia/pega rápido sin alterar el árbol original.
- Si quieres que reemplace esos placeholders con el código literal en este documento, dímelo y lo vierto aquí mismo (puede ser muy grande).