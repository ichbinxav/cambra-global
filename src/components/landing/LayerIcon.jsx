import { CreditCard, Package, LayoutGrid, Landmark, ArrowLeftRight, Store, ShieldCheck, Phone } from "lucide-react";

/**
 * LayerIcon — single source of truth for the 8 cost-layer pictograms.
 * No emojis. Just clean Lucide icons.
 */
const ICONS = {
  psp: CreditCard,
  ship: Package,
  saas: LayoutGrid,
  bank: Landmark,
  fx: ArrowLeftRight,
  tpe: Store,
  ins: ShieldCheck,
  tel: Phone,
};

export const LAYER_META = {
  psp:  { id: "psp",  label: "Payments",  short: "PSP"      },
  ship: { id: "ship", label: "Shipping",  short: "Shipping" },
  saas: { id: "saas", label: "SaaS",      short: "SaaS"     },
  bank: { id: "bank", label: "Banking",   short: "Bank"     },
  fx:   { id: "fx",   label: "FX",        short: "FX"       },
  tpe:  { id: "tpe",  label: "In-store",  short: "TPE"      },
  ins:  { id: "ins",  label: "Insurance", short: "Ins"      },
  tel:  { id: "tel",  label: "Telecom",   short: "Telecom"  },
};

export default function LayerIcon({ id, className = "h-4 w-4", strokeWidth = 1.8 }) {
  const Icon = ICONS[id];
  if (!Icon) return null;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}