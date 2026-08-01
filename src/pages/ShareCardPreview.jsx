// TEMPORARY — visual preview of the GROWTH-1 share card so the founder can
// see it directly in the app. Safe to delete once reviewed.
import { useEffect, useState } from "react";
import { renderShareCard } from "@/lib/shareCard";

export default function ShareCardPreview() {
  const [img, setImg] = useState("");

  useEffect(() => {
    renderShareCard({
      score: 63,
      reductionPct: 24,
      brandName: "Aime Studio",
      strings: {
        eyebrow: "AUDITORÍA DE PAGOS",
        scoreLabel: "Puntuación de eficiencia",
        reductionPrefix: "hasta un",
        reductionSuffix: "menos en comisiones",
        cta: "Haz tu auditoría gratis",
        site: "cambra.global",
      },
    }).then((c) => setImg(c.toDataURL("image/png")));
  }, []);

  return (
    <div
      style={{
        background: "#05050c",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 16,
      }}
    >
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>
        Vista previa de la tarjeta compartible (datos de ejemplo)
      </p>
      {img ? (
        <img
          src={img}
          alt="Tarjeta compartible CAMBRA"
          style={{ width: "min(560px, 92vw)", borderRadius: 20, boxShadow: "0 30px 80px -30px rgba(91,76,245,0.5)" }}
        />
      ) : (
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Generando…</p>
      )}
    </div>
  );
}