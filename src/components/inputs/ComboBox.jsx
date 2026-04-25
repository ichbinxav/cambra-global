import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ComboBox({ label, placeholder = 'Select…', value, onChange, options = [], allowCustom = true }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const normalized = options.map(o => String(o));
  const showCreate = allowCustom && query && !normalized.some(o => o.toLowerCase() === query.toLowerCase());

  const selectedLabel = value || '';

  return (
    <div className="space-y-1.5">
      {label && <div className="text-xs text-muted-foreground">{label}</div>}
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
            <span className={cn('truncate', selectedLabel ? 'text-foreground' : 'text-muted-foreground')}>{selectedLabel || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-lg">
          <Command>
            <CommandInput placeholder="Search…" onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {normalized.map((opt) => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => { onChange(opt); setOpen(false); }}
                    className="cursor-pointer"
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === opt ? 'opacity-100' : 'opacity-0')} />
                    {opt}
                  </CommandItem>
                ))}
                {showCreate && (
                  <CommandItem onSelect={() => { onChange(query); setOpen(false); }} className="cursor-pointer">
                    <Plus className="mr-2 h-4 w-4" />
                    Create “{query}”
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