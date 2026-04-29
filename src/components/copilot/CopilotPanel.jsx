import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCopilotState } from '@/lib/copilotEngine';

const STATUS_LABELS = {
  ready: 'Ready',
  action_needed: 'Action needed',
};

const JOURNEY_STYLES = {
  done: 'border-green-500/20 bg-green-500/[0.05] text-foreground',
  pending: 'border-border/60 bg-background text-muted-foreground',
  recommended: 'border-blue-500/20 bg-blue-500/[0.05] text-foreground',
  blocked: 'border-orange-500/20 bg-orange-500/[0.05] text-foreground',
};

function useCopilotPreference() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('cambra_copilot_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cambra_copilot_collapsed', String(collapsed));
    } catch {}
  }, [collapsed]);

  return [collapsed, setCollapsed];
}

function JourneyIcon({ status }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === 'blocked') return <AlertCircle className="h-4 w-4 text-orange-500" />;
  if (status === 'recommended') return <CircleDot className="h-4 w-4 text-blue-600" />;
  return <CircleDot className="h-4 w-4 text-muted-foreground/35" />;
}

export default function CopilotPanel() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useCopilotPreference();
  const [loading, setLoading] = useState(true);
  const [copilot, setCopilot] = useState(null);
  const [ask, setAsk] = useState('');
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getCopilotState({ pathname: location.pathname }).then((data) => {
      if (!mounted) return;
      setCopilot(data);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  const attentionNeeded = useMemo(() => {
    if (!copilot) return false;
    return copilot.blockers.length > 0 || copilot.missingData.length > 0 || copilot.guidance.status === 'action_needed';
  }, [copilot]);

  const handleAsk = () => {
    if (!copilot || !ask.trim()) return;
    const lower = ask.toLowerCase();
    if (lower.includes('psp')) {
      setAnswer('A PSP is your payment service provider. Cambra uses it to estimate your effective payment cost and benchmark your rate.');
      return;
    }
    if (lower.includes('savings')) {
      setAnswer('Savings are estimated from your current setup versus Cambra benchmark conditions. Cambra only shows structured outputs tied to real platform data.');
      return;
    }
    setAnswer(`${copilot.guidance.nextStep} ${copilot.guidance.why}`);
  };

  if (loading || !copilot) {
    return null;
  }

  return (
    <div className="fixed right-4 top-20 bottom-4 z-40 hidden lg:block xl:right-6 xl:top-6 xl:bottom-6">
      <AnimatePresence mode="wait">
        {collapsed ? (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18 }}
            onClick={() => setCollapsed(false)}
            className="flex h-full w-14 flex-col items-center justify-between rounded-[1.5rem] border border-border/60 bg-card/95 px-2 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.08)] backdrop-blur-xl"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-foreground text-background">
              <span className="text-sm font-black tracking-[0.1em]">C</span>
              {attentionNeeded && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-orange-500" />}
            </div>
            <div className="flex flex-col items-center gap-2">
              <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
              {attentionNeeded && <span className="h-8 w-1 rounded-full bg-orange-500/70 animate-pulse" />}
            </div>
          </motion.button>
        ) : (
          <motion.aside
            key="expanded"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="flex h-full w-[360px] flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <div>
                <p className="text-sm font-black tracking-tight">Cambra Copilot</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${copilot.guidance.status === 'action_needed' ? 'bg-orange-500' : 'bg-green-500'}`} />
                  {STATUS_LABELS[copilot.guidance.status]}
                </div>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition hover:text-foreground"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <section className="rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">You are here</p>
                <h3 className="mt-2 text-lg font-black tracking-tight">{copilot.page.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copilot.page.description}</p>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Journey progress</p>
                  <span className="text-[11px] text-muted-foreground">{copilot.journey.filter((item) => item.status === 'done').length}/{copilot.journey.length}</span>
                </div>
                <div className="space-y-2">
                  {copilot.journey.map((item) => (
                    <Link key={item.key} to={item.href} className={`flex items-center justify-between rounded-2xl border px-3 py-3 transition ${JOURNEY_STYLES[item.status]}`}>
                      <div className="flex items-center gap-3">
                        <JourneyIcon status={item.status} />
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border/60 bg-foreground p-4 text-background">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-background/10">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-background/45">Next best action</p>
                    <h3 className="mt-2 text-base font-black">{copilot.guidance.nextStep}</h3>
                    <p className="mt-2 text-sm leading-6 text-background/72">{copilot.guidance.why}</p>
                    <p className="mt-3 text-xs text-background/55">{copilot.guidance.unlocks}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                {copilot.guidance.ctas.map((item) => (
                  <Link key={item.label} to={item.href}>
                    <Button className="h-11 w-full justify-between rounded-full px-4 text-sm font-semibold">
                      {item.label}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ))}
              </section>

              {(copilot.missingData.length > 0 || copilot.blockers.length > 0) && (
                <section className="rounded-2xl border border-border/60 bg-background p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Missing data & blockers</p>
                  <div className="mt-3 space-y-2">
                    {copilot.missingData.map((item) => (
                      <div key={item} className="rounded-xl border border-border/50 px-3 py-2 text-sm text-muted-foreground">
                        Missing: {item}
                      </div>
                    ))}
                    {copilot.blockers.map((item) => (
                      <div key={item} className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] px-3 py-2 text-sm text-foreground">
                        Blocked: {item}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Smart nudges</p>
                <div className="mt-3 space-y-2">
                  {copilot.guidance.nudges.map((item) => (
                    <p key={item} className="text-sm leading-6 text-foreground">{item}</p>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-border/60 bg-background p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Platform context</p>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={ask}
                    onChange={(e) => setAsk(e.target.value)}
                    placeholder="What is a PSP?"
                    className="h-10 rounded-full border-border/60 bg-card"
                  />
                  <button
                    onClick={handleAsk}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4 rotate-180" />
                  </button>
                </div>
                {answer && <p className="mt-3 text-sm leading-6 text-muted-foreground">{answer}</p>}
              </section>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}