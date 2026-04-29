import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, ChevronRight, CircleDot, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCopilotState } from '@/lib/copilotEngine';
import { base44 } from '@/api/base44Client';

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

function useCopilotPreference(defaultValue = false) {
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('cambra_copilot_open');
      return saved === null ? defaultValue : saved === 'true';
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('cambra_copilot_open', String(open));
    } catch {}
  }, [open]);

  return [open, setOpen];
}

function JourneyIcon({ status }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === 'blocked') return <AlertCircle className="h-4 w-4 text-orange-500" />;
  if (status === 'recommended') return <CircleDot className="h-4 w-4 text-blue-600" />;
  return <CircleDot className="h-4 w-4 text-muted-foreground/35" />;
}

function FloatingPill({ open, setOpen, attentionNeeded }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      onClick={() => setOpen(!open)}
      className="fixed bottom-24 left-3 z-[90] inline-flex h-12 items-center gap-2 rounded-full border border-border/70 bg-card/95 px-4 text-sm font-semibold text-foreground shadow-[0_18px_50px_rgba(0,0,0,0.14)] backdrop-blur-xl hover:bg-card sm:bottom-5 sm:left-5"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background text-[11px] font-black">
        C
      </span>
      <span>Copilot</span>
      {attentionNeeded && <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />}
    </motion.button>
  );
}

export default function CopilotPanel() {
  const location = useLocation();
  const [open, setOpen] = useCopilotPreference(false);
  const [loading, setLoading] = useState(true);
  const [copilot, setCopilot] = useState(null);
  const [ask, setAsk] = useState('');
  const [answer, setAnswer] = useState('');
  const [pageIntro, setPageIntro] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getCopilotState({ pathname: location.pathname }).then((data) => {
      if (!mounted) return;
      setCopilot(data);
      setPageIntro(`You are on ${data.page.title}. ${data.page.description} The main thing to do here is: ${data.guidance.nextStep}`);
      setAnswer('');
      setAsk('');
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [location.pathname, location.search]);

  const attentionNeeded = useMemo(() => {
    if (!copilot) return false;
    return copilot.blockers.length > 0 || copilot.missingData.length > 0 || copilot.guidance.status === 'action_needed';
  }, [copilot]);

  const handleAsk = async () => {
    const question = ask.trim();
    if (!copilot || !question || sending) return;
    setSending(true);
    setErrorMessage('');
    setAnswer('');
    const currentQuestion = question;
    setAsk('');

    try {
      const response = await base44.functions.invoke('copilotChat', {
        question: currentQuestion,
        pageTitle: copilot.page.title,
        pageDescription: copilot.page.description,
        nextStep: copilot.guidance.nextStep,
      });
      setAnswer(response?.data?.answer || copilot.page.description);
    } catch (error) {
      setErrorMessage(error?.message || 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  };

  if (loading || !copilot) {
    return null;
  }

  return (
    <>
      <FloatingPill open={open} setOpen={setOpen} attentionNeeded={attentionNeeded} />

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-[2px]"
            />

            <motion.aside
              initial={{ opacity: 0, x: -24, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -24, y: 8 }}
              transition={{ duration: 0.22 }}
              className="fixed bottom-28 left-4 z-[80] flex max-h-[72vh] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 shadow-[0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:bottom-24 sm:left-5 sm:max-h-[78vh]"
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
                  onClick={() => setOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-4">
                  <section className="rounded-2xl border border-border/60 bg-background p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Cambra Copilot</p>
                        <p className="mt-2 text-sm leading-6 text-foreground">{pageIntro}</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copilot.guidance.why}</p>
                      </div>
                    </div>
                  </section>

                  {sending && (
                    <section className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                      <p className="text-sm leading-6 text-foreground">Thinking…</p>
                    </section>
                  )}

                  {answer && !sending && (
                    <section className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                      <p className="text-sm leading-6 text-foreground">{answer}</p>
                    </section>
                  )}

                  {errorMessage && !sending && (
                    <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4">
                      <p className="text-sm leading-6 text-red-600">{errorMessage}</p>
                    </section>
                  )}

                  <section className="rounded-2xl border border-border/60 bg-background p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Chat</p>
                    <form
                      className="mt-3 flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAsk();
                      }}
                    >
                      <Input
                        value={ask}
                        onChange={(e) => setAsk(e.target.value)}
                        placeholder="Ask anything. Best next step: Analyzer or Connect tools."
                        className="h-11 rounded-full border-border/60 bg-card pr-3 text-base md:text-sm"
                      />
                      <button
                        type="button"
                        aria-label="Send message"
                        disabled={sending}
                        onClick={handleAsk}
                        className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card text-foreground active:scale-95 disabled:opacity-50"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </form>
                  </section>

                  <section className="flex flex-wrap gap-2 pb-2 sm:pb-0">
                    {copilot.guidance.ctas.slice(0, 2).map((item) => (
                      <Link key={item.label} to={item.href} onClick={() => setOpen(false)}>
                        <Button variant="outline" className="h-10 rounded-full px-4 text-sm font-medium">
                          {item.label}
                        </Button>
                      </Link>
                    ))}
                  </section>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}