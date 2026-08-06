// VaultDocumentDrawer — Checkpoint H (2026-08-06).
//
// The document detail/edit drawer, extracted from src/pages/Vault.jsx and
// translated. Persistence is unchanged: each field still saves on blur through
// updateDocumentMeta with exactly the same patch shape.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n.jsx";
import VaultLinkEditor from "./VaultLinkEditor";

export default function VaultDocumentDrawer({ doc, onClose, onSaveMeta, onAddLink, onRemoveLink }) {
  const { t } = useTranslation();
  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="absolute right-0 top-0 h-full w-full sm:w-[440px] border-l border-white/10 p-4 overflow-auto text-white"
        style={{ background: "linear-gradient(180deg, #0b1020 0%, #08090f 100%)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">{t("vlt_edit_title")}</h2>
          <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10" onClick={onClose}>
            {t("vlt_close")}
          </Button>
        </div>

        <div className="space-y-3">
          <label className="text-xs text-white/50">{t("vlt_f_title")}</label>
          <Input
            className="bg-white/[0.04] border-white/10 text-white"
            defaultValue={doc.title || ""}
            onBlur={(e) => onSaveMeta(doc, { title: e.target.value })}
          />

          <label className="text-xs text-white/50">{t("vlt_f_tags")}</label>
          <Input
            className="bg-white/[0.04] border-white/10 text-white"
            defaultValue={(doc.tags || []).join(", ")}
            onBlur={(e) =>
              onSaveMeta(doc, { tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
            }
          />

          <label className="text-xs text-white/50">{t("vlt_f_notes")}</label>
          <Input
            className="bg-white/[0.04] border-white/10 text-white"
            defaultValue={doc.notes || ""}
            onBlur={(e) => onSaveMeta(doc, { notes: e.target.value })}
          />

          <div className="flex items-center justify-between">
            <a
              className="text-cambra-cyan underline text-sm"
              href={doc.file_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("vlt_open_file")}
            </a>
            <span className="text-[11px] text-white/50">v{doc.version || 1}</span>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">{t("vlt_links")}</h3>
            <VaultLinkEditor doc={doc} onAdd={onAddLink} onRemove={onRemoveLink} />
          </div>
        </div>
      </div>
    </div>
  );
}