import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Plus } from "lucide-react";

export default function KeyValueListInput({ label, entries = {}, onChange, keyPlaceholder = "Tool", valuePlaceholder = "Value", helper }) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");

  const add = () => {
    const key = k.trim();
    if (!key) return;
    const val = v.trim();
    onChange({ ...(entries || {}), [key]: val });
    setK("");
    setV("");
  };

  const remove = (key) => {
    const clone = { ...(entries || {}) };
    delete clone[key];
    onChange(clone);
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
      <div className="space-y-1">
        {Object.entries(entries || {}).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input value={key} readOnly className="h-9" />
              <Input value={val} readOnly className="h-9" />
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => remove(key)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input value={k} onChange={(e) => setK(e.target.value)} placeholder={keyPlaceholder} className="h-9" />
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={valuePlaceholder} className="h-9" />
        <Button type="button" onClick={add} className="gap-1 h-9">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}