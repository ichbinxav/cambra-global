// AccountFieldSection — Checkpoint H (2026-08-06).
//
// The repeated "labelled inputs that save on blur" block, extracted from
// /Account where it was duplicated twice inline (Brand and In-store payments).
// Save-on-blur behaviour and the update payload shape are unchanged.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/lib/i18n.jsx";
import { placeholderFor } from "./accountFields";

export default function AccountFieldSection({ fields, record, onSave }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.field} className="space-y-1.5">
          <Label className="text-xs text-white/50">{t(f.labelKey)}</Label>
          <Input
            defaultValue={record[f.field]}
            onBlur={(e) => onSave(f.field, e.target.value)}
            className="h-9 text-sm bg-white/[0.04] border-white/10 text-white placeholder:text-white/30"
            placeholder={placeholderFor(t, f)}
          />
        </div>
      ))}
    </div>
  );
}