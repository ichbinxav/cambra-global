import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TrendingDown, Zap, Building2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function StepGrid({ onScrollToProfile }) {
  const steps = [
    {
      title: "Ejecuta el Analizador",
      desc: "Obtén tu potencial de ahorro en 2 minutos.",
      icon: TrendingDown,
      color: "text-cambra-lilac",
      bg: "bg-cambra-lilac-soft border-cambra-lilac",
      cta: (
        <Link to="/Analyzer">
          <Button className="h-8 text-xs rounded-full gap-1.5">
            Ir al Analizador <ArrowRight size={12} />
          </Button>
        </Link>
      ),
    },
    {
      title: "Conecta tus datos",
      desc: "Precisión y verificación automática.",
      icon: Zap,
      color: "text-cambra-mint",
      bg: "bg-cambra-mint-soft border-cambra-mint",
      cta: (
        <Link to="/ConnectTools">
          <Button variant="outline" className="h-8 text-xs rounded-full gap-1.5">
            Conectar herramientas <ArrowRight size={12} />
          </Button>
        </Link>
      ),
    },
    {
      title: "Perfil de marca",
      desc: "Cuéntanos lo básico de tu negocio.",
      icon: Building2,
      color: "text-cambra-plum",
      bg: "bg-cambra-plum-soft border-cambra-plum",
      cta: (
        <Button onClick={onScrollToProfile} variant="ghost" className="h-8 text-xs rounded-full gap-1.5">
          Completar perfil <ArrowRight size={12} />
        </Button>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {steps.map((s, i) => (
        <motion.div
          key={s.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: i * 0.08 }}
          className={`p-5 rounded-xl border ${s.bg}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <s.icon size={14} className={s.color} />
            <p className="text-sm font-semibold">{s.title}</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{s.desc}</p>
          {s.cta}
        </motion.div>
      ))}
    </div>
  );
}