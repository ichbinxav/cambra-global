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
      <div className="absolute right-0 top-0 h-full w-full overflow-auto border-l border-[#E0E3EB] bg-[#FBFBFD] p-5 text-[#11182D] shadow-[-24px_0_70px_-36px_rgba(11,21,48,.55)] sm:w-[480px]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-[#11182D]">{t("vlt_edit_title")}</h2>
          <Button variant="ghost" className="text-[#606A80] hover:bg-[#EFEDFF] hover:text-[#4D3DF1]" onClick={onClose}>
            {t("vlt_close")}
          </Button>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-semibold text-[#667087]">{t("vlt_f_title")}</label>
          <Input
            className="border-[#DCE0E9] bg-white text-[#11182D]"
            defaultValue={doc.title || ""}
            onBlur={(e) => onSaveMeta(doc, { title: e.target.value })}
          />

          <label className="text-xs font-semibold text-[#667087]">{t("vlt_f_tags")}</label>
          <Input
            className="border-[#DCE0E9] bg-white text-[#11182D]"
            defaultValue={(doc.tags || []).join(", ")}
            onBlur={(e) =>
              onSaveMeta(doc, { tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
            }
          />

          <label className="text-xs font-semibold text-[#667087]">{t("vlt_f_notes")}</label>
          <Input
            className="border-[#DCE0E9] bg-white text-[#11182D]"
            defaultValue={doc.notes || ""}
            onBlur={(e) => onSaveMeta(doc, { notes: e.target.value })}
          />

          <div className="flex items-center justify-between">
            <a
              className="text-sm font-bold text-[#4D3DF1] underline"
              href={doc.file_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("vlt_open_file")}
            </a>
            <span className="text-[11px] text-[#7A8295]">v{doc.version || 1}</span>
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
