import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export default function TagChipsInput({ label, values = [], onChange, placeholder = "Add and press Enter", suggestions = [] }) {
  const [draft, setDraft] = useState("");

  const add = (v) => {
    const val = (v ?? draft).trim();
    if (!val) return;
    if (values.includes(val)) { setDraft(""); return; }
    onChange([...(values || []), val]);
    setDraft("");
  };

  const remove = (val) => {
    onChange((values || []).filter((x) => x !== val));
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {(values || []).map((v) => (
          <Badge key={v} variant="secondary" className="flex items-center gap-1">
            {v}
            <button type="button" className="ml-1 opacity-70 hover:opacity-100" onClick={() => remove(v)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-10"
        />
        <Button type="button" onClick={() => add()} className="shrink-0">Add</Button>
      </div>
      {suggestions?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <Button
              type="button"
              key={s}
              variant={(values || []).includes(s) ? "secondary" : "outline"}
              size="sm"
              onClick={() => ((values || []).includes(s) ? remove(s) : add(s))}
              className="h-7 px-2 text-xs"
            >
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}