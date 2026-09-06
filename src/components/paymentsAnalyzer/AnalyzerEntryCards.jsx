import { Zap, FileUp, Edit3, ArrowUpRight, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "@/lib/i18n.jsx";

const CARD_DEFINITIONS = [
  { id: "connect", icon: Zap, featured: true },
  { id: "upload", icon: FileUp },
  { id: "manual", icon: Edit3 },
];

function EntryCard({ card, selected, onSelect, index }) {
  const Icon = card.icon;
  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(card.id)}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`analyzer-entry-card ${card.featured ? "is-featured" : ""} ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
    >
      <span className="analyzer-entry-card__top">
        <span className="analyzer-entry-card__icon"><Icon size={18} strokeWidth={1.9} /></span>
        <span className="analyzer-entry-card__badge">{selected && <Check size={11} strokeWidth={3} />}{card.badge}</span>
      </span>
      <span className="analyzer-entry-card__copy">
        <strong>{card.title}</strong>
        <small>{card.subtitle}</small>
        <span>{card.body}</span>
      </span>
      <span className="analyzer-entry-card__cta">{card.cta}<ArrowUpRight size={14} /></span>
    </motion.button>
  );
}

export default function AnalyzerEntryCards({ selected = "manual", onSelect }) {
  const { t } = useTranslation();
  const cards = CARD_DEFINITIONS.map((card) => ({
    ...card,
    title: t(`az_entry_${card.id}_title`),
    subtitle: t(`az_entry_${card.id}_subtitle`),
    body: t(`az_entry_${card.id}_body`),
    badge: t(`az_entry_${card.id}_badge`),
    cta: t(`az_entry_${card.id}_cta`),
  }));

  return (
    <div className="analyzer-entry-grid" role="group" aria-label={t("az_entry_label")}>
      {cards.map((card, index) => (
        <EntryCard key={card.id} card={card} selected={selected === card.id} onSelect={onSelect} index={index} />
      ))}
    </div>
  );
}
