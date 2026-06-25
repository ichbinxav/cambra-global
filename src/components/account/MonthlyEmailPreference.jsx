import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function MonthlyEmailPreference({ user, onUpdate }) {
  const [enabled, setEnabled] = useState(!!user?.monthly_email_summary);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const toggle = async (next) => {
    setSaving(true);
    setEnabled(next);
    try {
      await base44.auth.updateMe({ monthly_email_summary: next });
      toast.success(next ? "Monthly summary enabled" : "Monthly summary disabled");
      onUpdate?.({ ...user, monthly_email_summary: next });
    } catch (e) {
      setEnabled(!next);
      toast.error("Could not save preference");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    try {
      const res = await base44.functions.invoke("sendMonthlySavingsSummary", { userEmail: user.email });
      const data = res?.data;
      if (data?.sent > 0) {
        toast.success("Test email sent — check your inbox");
      } else if (data?.results?.[0]?.status === "skipped_no_data") {
        toast.error("Run an analysis first to generate a summary");
      } else {
        toast.error(data?.error || "Could not send test email");
      }
    } catch (e) {
      toast.error("Could not send test email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold">Monthly savings summary</p>
            {enabled && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-chart-2 bg-chart-2/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={9} /> Active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            Get a clean recap of your identified savings, infra score and category breakdown
            delivered to <span className="font-semibold text-foreground">{user?.email}</span> on the 1st of every month.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/30">
        <Button
          variant="outline"
          size="sm"
          onClick={sendTest}
          disabled={sending}
          className="h-9 rounded-full px-4 text-xs gap-1.5 border-border/60"
        >
          <Send size={11} />
          {sending ? "Sending..." : "Send a test email now"}
        </Button>
        <p className="text-[11px] text-muted-foreground/50">
          Delivered straight to your Gmail inbox.
        </p>
      </div>
    </div>
  );
}