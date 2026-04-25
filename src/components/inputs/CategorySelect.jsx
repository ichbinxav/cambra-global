import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check, Tag } from 'lucide-react';

const CATEGORIES = [
  { value: 'fashion', label: 'Fashion' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'food_bev', label: 'Food & Beverage' },
  { value: 'home', label: 'Home' },
  { value: 'tech', label: 'Tech' },
  { value: 'other', label: 'Other' },
];

export default function CategorySelect({ value, onChange, placeholder = 'Select category…' }) {
  const [open, setOpen] = React.useState(false);

  const selected = CATEGORIES.find(c => c.value === value) || null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10"
        >
          <div className="flex items-center gap-2 text-left truncate">
            <Tag className="h-4 w-4 text-muted-foreground/70" />
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]">
        <Command>
          <CommandInput placeholder="Search category..." />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              {CATEGORIES.map((c) => (
                <CommandItem
                  key={c.value}
                  value={c.label}
                  onSelect={() => { onChange(c.value); setOpen(false); }}
                  className="cursor-pointer"
                >
                  <Check className={`mr-2 h-4 w-4 ${selected?.value === c.value ? 'opacity-100' : 'opacity-0'}`} />
                  {c.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}