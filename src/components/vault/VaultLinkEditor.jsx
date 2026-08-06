// VaultLinkEditor — Checkpoint H (2026-08-06).
//
// Extracted verbatim from src/pages/Vault.jsx (where it lived as a second
// component in the same file) and translated. Behaviour is unchanged: same
// linkDocument / unlinkDocument payloads, same fields, same disabled rule.
//
// Target types stay raw — see the note in vaultLabels.js.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n.jsx";
import { LINK_TARGET_TYPES } from "./vaultLabels";

export default function VaultLinkEditor({ doc, onAdd, onRemove }) {
  const { t } = useTranslation();
  const [type, setType] = useState("brand");
  const [id, setId] = useState("");
  const [primary, setPrimary] = useState(false);

  const submit = () => {
    onAdd(doc, { target_type: type, target_id: id, is_primary: primary });
    setId("");
    setPrimary(false);
  };

  const links = doc.links || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("vlt_link_type_ph")} /></SelectTrigger>
          <SelectContent>
            {LINK_TARGET_TYPES.map((tt) => (<SelectItem key={tt} value={tt}>{tt}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input
          placeholder={t("vlt_link_id_ph")}
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="flex-1 min-w-[140px]"
        />
        <Button onClick={submit} disabled={!id}>{t("vlt_add")}</Button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={primary}
          onChange={(e) => setPrimary(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border accent-foreground cursor-pointer"
        />
        <span>{t("vlt_primary_hint")}</span>
      </label>

      <div className="text-xs text-muted-foreground">{t("vlt_current")}</div>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.id} className="flex items-center justify-between border rounded-md px-2 py-1 text-xs">
            <span>{l.target_type} · {l.target_id} {l.is_primary ? `· ${t("vlt_primary_tag")}` : ""}</span>
            <Button size="sm" variant="ghost" onClick={() => onRemove(l.id)}>{t("vlt_remove")}</Button>
          </li>
        ))}
        {links.length === 0 && <li className="text-xs text-muted-foreground">{t("vlt_no_links")}</li>}
      </ul>
    </div>
  );
}