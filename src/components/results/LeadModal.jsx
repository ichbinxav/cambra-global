import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";

export default function LeadModal() {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [benchmarkOptIn, setBenchmarkOptIn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !consent) return;
    setSubmitting(true);
    const cta_variant = 'unlock_rates';
    try {
      await base44.entities.Lead.create({
        email,
        whatsapp,
        benchmark_opt_in: benchmarkOptIn,
        consent: !!consent,
        source_page: 'results',
      });

      base44.analytics.track({ eventName: 'lead_submit', properties: { cta_variant, has_whatsapp: !!whatsapp, benchmark_opt_in: !!benchmarkOptIn } });

      await base44.integrations.Core.SendEmail({
        to: email,
        subject: 'THE NoDE — Rates request received',
        body: 'Thanks! We\'ll get back to you shortly with the steps to unlock the network rates.\n\n— THE NoDE Team'
      });

      alert("Thanks! We’ll contact you to unlock these rates.");
      setEmail(""); setWhatsapp(""); setBenchmarkOptIn(false); setConsent(false);
    } catch (err) {
      console.error('Lead submit error', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg" className="rounded-full px-8 text-sm font-bold bg-green-600 hover:bg-green-700" onClick={() => base44.analytics.track({ eventName: 'lead_modal_open' })}>
          Unlock these rates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock THE NoDE rates</DialogTitle>
          <DialogDescription>
            Leave your email or WhatsApp and we’ll help you activate these rates.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa">WhatsApp</Label>
            <Input id="wa" placeholder="+34 600 000 000" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="opt" checked={benchmarkOptIn} onCheckedChange={v => setBenchmarkOptIn(!!v)} />
            <Label htmlFor="opt" className="text-sm">I want to receive the detailed benchmark for my sector</Label>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox id="consent" checked={consent} onCheckedChange={v => setConsent(!!v)} />
            <Label htmlFor="consent">I agree to be contacted and accept the <a href="/Privacy" className="underline">Privacy Policy</a>.</Label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!email || !consent || submitting} className="px-6">{submitting ? 'Sending…' : 'Send'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}