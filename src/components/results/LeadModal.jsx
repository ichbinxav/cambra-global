import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function LeadModal() {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [benchmarkOptIn, setBenchmarkOptIn] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ email, whatsapp, benchmarkOptIn });
    alert("Thanks! We’ll contact you to unlock these rates.");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="lg" className="rounded-full px-8 text-sm font-bold bg-green-600 hover:bg-green-700">
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
          <div className="flex justify-end">
            <Button type="submit" className="px-6">Send</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}