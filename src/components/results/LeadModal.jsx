import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/shared/Toast.jsx";

export default function LeadModal() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState('form');
  const [open, setOpen] = useState(false);
  const [createdId, setCreatedId] = useState(null);
  const [optedIn, setOptedIn] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !consent) return;
    setSubmitting(true);
    const cta_variant = 'unlock_rates';
    try {
      const rec = await base44.entities.LeadCapture.create({
        email,
        whatsapp,
        consent: !!consent,
        source_page: 'results',
        first_submitted_at: new Date().toISOString(),
      });
      setCreatedId(rec.id);
      base44.analytics.track({ eventName: 'lead_submit', properties: { cta_variant, has_whatsapp: !!whatsapp } });

      await base44.integrations.Core.SendEmail({
        to: email,
        subject: 'CAMBRA — Request received',
        body: 'Thanks! We\'ll email your benchmark summary shortly.\n\n— The CAMBRA Team'
      });

      setStep('thanks');
    } catch (err) {
      console.error('Lead submit error', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOptIn = async () => {
    setSubmitting(true);
    try {
      if (createdId) {
        await base44.entities.LeadCapture.update(createdId, { opted_in_benchmark: !!optedIn });
      }
      base44.analytics.track({ eventName: 'lead_benchmark_choice', properties: { opted_in: !!optedIn } });
      if (optedIn && email) {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject: 'CAMBRA — Detailed benchmark',
          body: 'We will send you the detailed sector benchmark shortly.\n\n— The CAMBRA Team'
        });
      }
      setOpen(false);
      setStep('form');
      setEmail(''); setWhatsapp(''); setConsent(false); setOptedIn(true); setCreatedId(null);
    } catch (e) {
      console.error('Lead opt-in error', e);
      toast.error('Could not save your preference.');
    } finally {
      setSubmitting(false);
    }
  };

   return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="rounded-full px-8 text-sm font-bold bg-green-600 hover:bg-green-700" onClick={() => { setOpen(true); base44.analytics.track({ eventName: 'lead_modal_open' })}}>
          Unlock these rates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle>Unlock CAMBRA network rates</DialogTitle>
              <DialogDescription>
                Leave your email or WhatsApp and we’ll help you activate these rates.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wa">WhatsApp</Label>
                <Input id="wa" placeholder="+34 600 000 000" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox id="consent" checked={consent} onCheckedChange={v => setConsent(!!v)} />
                <Label htmlFor="consent">I agree to be contacted and accept the <a href="/Privacy" className="underline">Privacy Policy</a>.</Label>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!email || !consent || submitting} className="px-6">{submitting ? 'Sending…' : 'Continue'}</Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Thank you</DialogTitle>
              <DialogDescription>We’ll email your benchmark summary shortly.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm">
                <Checkbox id="optin" checked={optedIn} onCheckedChange={v => setOptedIn(!!v)} />
                <Label htmlFor="optin">Also send me the detailed sector benchmark to {email || 'my email'}.</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { base44.analytics.track({ eventName: 'lead_benchmark_skip' }); setOpen(false); setStep('form'); setEmail(''); setWhatsapp(''); setConsent(false); }}>No thanks</Button>
                <Button onClick={handleOptIn} disabled={submitting}>{submitting ? 'Saving…' : 'Finish'}</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}