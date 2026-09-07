// AccountFieldSection — Checkpoint H (2026-08-06).
//
// The repeated "labelled inputs that save on blur" block, extracted from
// /Account where it was duplicated twice inline (Brand and In-store payments).
// Save-on-blur behaviour and the update payload shape are unchanged.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n.jsx";
import { placeholderFor } from "./accountFields";

export default function AccountFieldSection({ fields, record, onSave }) {
  const { t } = useTranslation();
  const [errors, setErrors] = useState({});

  const saveField = async (field, value) => {
    const normalized = typeof value === "string" ? value.trim() : value;
    if (field.required && !normalized) {
      setErrors((current) => ({ ...current, [field.field]: t("account_required_field") }));
      return;
    }
    setErrors((current) => ({ ...current, [field.field]: "" }));
    try {
      await onSave(field.field, normalized);
    } catch {
      setErrors((current) => ({ ...current, [field.field]: t("res_err_msg") }));
    }
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.field} className="space-y-1.5">
          <Label htmlFor={`account-${f.field}`} className="text-xs font-semibold text-[#303A55]">
            {t(f.labelKey)}{f.required && <span className="ml-1 text-[#5B4CF5]" aria-hidden="true">*</span>}
          </Label>
          <Input
            id={`account-${f.field}`}
            defaultValue={record[f.field]}
            onBlur={(event) => saveField(f, event.target.value)}
            required={f.required}
            aria-required={f.required ? "true" : undefined}
            aria-invalid={errors[f.field] ? "true" : "false"}
            aria-describedby={errors[f.field] ? `account-${f.field}-error` : undefined}
            inputMode={f.inputMode}
            className="h-11 rounded-xl border-[#DCE0EA] bg-white px-3 text-sm text-[#11182D] placeholder:text-[#A2A8B7] focus-visible:ring-[#7567F8]/25"
            placeholder={placeholderFor(t, f)}
          />
          {errors[f.field] && <p id={`account-${f.field}-error`} role="alert" className="text-[11px] font-semibold text-[#B62D48]">{errors[f.field]}</p>}
        </div>
      ))}
    </div>
  );
}
