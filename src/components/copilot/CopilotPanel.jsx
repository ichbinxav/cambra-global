import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCopilotState } from '@/lib/copilotEngine';
import { base44 } from '@/api/base44Client';

const STATUS_LABELS = {
  ready: 'Ready',
  action_needed: 'Action needed',
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

function FloatingPill({ open, setOpen }) {
  return (
    <button
      onClick={() => setOpen(!open)}
      aria-label="Open Cambra Copilot"
      style={{
        opacity: 1,
        transform: "scale(1)",
        transition: "opacity 0.25s, transform 0.25s, border-color 0.2s, box-shadow 0.2s",
      }}
      className="group fixed bottom-5 right-5 z-[90] flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card/95 text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.10)] backdrop-blur-xl hover:border-foreground/30 hover:shadow-[0_12px_32px_rgba(0,0,0,0.14)]"
    >
      <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-background">
        <img
          src="https://media.base44.com/images/public/69b8bcd2986e2cf428289270/411e1f39a_cambra_c_logo_white_background.png"
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-card" />
    </button>
  );
}

export default function CopilotPanel() {
  const location = useLocation();
  const [open, setOpen] = useCopilotPreference(false);
  const [loading, setLoading] = useState(true);
  const [copilot, setCopilot] = useState(null);
  const [ask, setAsk] = useState('');
  const [messages, setMessages] = useState([]);
  const [pageIntro, setPageIntro] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [brandCtx, setBrandCtx] = useState(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getCopilotState({ pathname: location.pathname }).then((data) => {
      if (!mounted) return;
      setCopilot(data);
      setPageIntro(`You are on ${data.page.title}. ${data.page.description} The main thing to do here is: ${data.guidance.nextStep}`);
      setMessages([]);
      setAsk('');
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [location.pathname, location.search]);

  // Load brand context once — non-fatal if it fails.
  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me().catch(() => null);
        if (!me) return;
        const brands = await base44.entities.Brand
          .filter({ created_by: me.email }, "-created_date", 1)
          .catch(() => []);
        const b = brands[0];
        if (!b) return;
        const results = await base44.entities.AnalyzerResult
          .filter({ brand_id: b.id }, "-created_date", 1)
          .catch(() => []);
        const r = results[0];
        setBrandCtx({
          brandName: b.name,
          country: b.country,
          category: b.category,
          website: b.website,
          totalSavings: r?.total_savings || 0,
           dataSource: r?.benchmark_source || "manual",
          lastAnalysis: r?.created_date || null,
        });
      } catch { /* non-fatal */ }
    })();
  }, []);

  const playReceiveSound = () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const context = audioContextRef.current || new AudioCtx();
    audioContextRef.current = context;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  };

  const handleAsk = async () => {
    const question = ask.trim();
    if (!copilot || !question || sending) return;
    setSending(true);
    setErrorMessage('');
    const currentQuestion = question;
    setMessages((prev) => [...prev, { role: 'user', content: currentQuestion }]);
    setAsk('');

    try {
      const response = await base44.functions.invoke('copilotChat', {
        question: currentQuestion,
        pageTitle: copilot.page.title,
        pageDescription: copilot.page.description,
        nextStep: copilot.guidance.nextStep,
        brandContext: brandCtx,
      });
      const nextAnswer = response?.data?.answer || copilot.page.description;
      setMessages((prev) => [...prev, { role: 'assistant', content: nextAnswer }]);
      playReceiveSound();
    } catch (error) {
      setErrorMessage(error?.message || 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    return () => {
      audioContextRef.current?.close?.();
    };
  }, []);

  if (loading || !copilot) {
    return null;
  }

  return (
    <>
      <FloatingPill open={open} setOpen={setOpen} />

      {open && (
        <>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close Copilot"
            className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-[2px]"
            style={{ opacity: 1, transition: "opacity 0.2s" }}
          />

          <aside
            style={{
              opacity: 1,
              transform: "translate3d(0,0,0)",
              transition: "opacity 0.22s ease, transform 0.22s ease",
            }}
            className="fixed bottom-24 right-4 z-[80] flex max-h-[72vh] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 shadow-[0_24px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:bottom-24 sm:right-5 sm:max-h-[78vh]"
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
                    </div>
                  </div>
                </section>

                {messages.map((message, index) => (
                  <section
                    key={`${message.role}-${index}`}
                    className={`rounded-2xl border p-4 ${message.role === 'user' ? 'border-border/60 bg-card' : 'border-border/60 bg-secondary/40'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-background shrink-0">
                        <img
                          src="https://media.base44.com/images/public/69b8bcd2986e2cf428289270/411e1f39a_cambra_c_logo_white_background.png"
                          alt="CAMBRA"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">{message.role === 'user' ? 'You' : 'Cambra Copilot'}</p>
                        <p className="mt-2 text-sm leading-6 text-foreground">{message.content}</p>
                      </div>
                    </div>
                  </section>
                ))}

                {sending && (
                  <section className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-background shrink-0">
                        <img
                          src="https://media.base44.com/images/public/69b8bcd2986e2cf428289270/411e1f39a_cambra_c_logo_white_background.png"
                          alt="CAMBRA"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Cambra Copilot</p>
                        <p className="mt-2 text-sm leading-6 text-foreground">Thinking…</p>
                      </div>
                    </div>
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
          </aside>
        </>
      )}
    </>
  );
}