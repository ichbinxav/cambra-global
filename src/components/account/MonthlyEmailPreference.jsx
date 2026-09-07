import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n.jsx";

export default function MonthlyEmailPreference({ user, onUpdate }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(!!user?.monthly_email_summary);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const toggle = async (next) => {
    setSaving(true);
    setEnabled(next);
    try {
      await base44.auth.updateMe({ monthly_email_summary: next });
      toast.success(next ? t("account_monthly_enabled") : t("account_monthly_disabled"));
      onUpdate?.({ ...user, monthly_email_summary: next });
    } catch {
      setEnabled(!next);
      toast.error(t("account_preference_error"));
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
        toast.success(t("account_test_sent"));
      } else if (data?.results?.[0]?.status === "skipped_no_data") {
        toast.error(t("account_test_no_data"));
      } else {
        toast.error(data?.error || t("account_test_error"));
      }
    } catch {
      toast.error(t("account_test_error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 text-[#11182D]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold">{t("account_monthly_summary")}</p>
            {enabled && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-chart-2 bg-chart-2/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={9} /> {t("account_active")}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-[#6A738A]">
            {t("account_monthly_body")} <span className="font-semibold text-[#1D2742]">{user?.email}</span>.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#E5E7EE] pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={sendTest}
          disabled={sending}
          className="h-10 gap-1.5 rounded-xl border-[#D8DCE8] bg-white px-4 text-xs font-bold text-[#26304A]"
        >
          <Send size={11} />
          {sending ? t("account_sending") : t("account_test_email")}
        </Button>
        <p className="text-[11px] text-[#858CA0]">{t("account_test_hint")}</p>
      </div>
    </div>
  );
}
