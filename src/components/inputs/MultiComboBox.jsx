import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MultiComboBox({ label, placeholder = 'Select…', values = [], onChange, options = [], allowCustom = true }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const normalized = options.map(o => String(o));
  const valueSet = new Set((values || []).map(v => String(v)));
  const showCreate = allowCustom && query && !normalized.some(o => o.toLowerCase() === query.toLowerCase());

  const toggle = (v) => {
    const str = String(v);
    if (valueSet.has(str)) {
      onChange(values.filter(x => String(x) !== str));
    } else {
      onChange([...(values || []), str]);
    }
  };

  const remove = (v) => onChange((values || []).filter(x => String(x) !== String(v)));

  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs text-muted-foreground">{label}</div>}
      <div className="flex flex-wrap gap-1.5 mb-1">
        {(values || []).map(v => (
          <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-border/60 bg-card/70 backdrop-blur-sm">
            {v}
            <button className="opacity-60 hover:opacity-100" onClick={() => remove(v)} aria-label={`Remove ${v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'w-full justify-between h-10 rounded-xl',
              'bg-card/70 backdrop-blur-sm border border-border/60 hover:border-foreground/30',
              'ring-1 ring-white/10'
            )}
          >
            <span className={cn('truncate', (values || []).length ? 'text-foreground' : 'text-muted-foreground')}>
              {(values || []).length ? `${values.length} selected` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-lg">
          <Command>
            <CommandInput placeholder="Search…" onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {normalized.map((opt) => {
                  const selected = valueSet.has(opt);
                  return (
                    <CommandItem
                      key={opt}
                      value={opt}
                      onSelect={() => toggle(opt)}
                      className="cursor-pointer"
                    >
                      <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
                      {opt}
                    </CommandItem>
                  );
                })}
                {showCreate && (
                  <CommandItem onSelect={() => toggle(query)} className="cursor-pointer">
                    <Plus className="mr-2 h-4 w-4" />
                    Add “{query}”
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}