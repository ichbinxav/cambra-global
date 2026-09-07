// BrandBlock — "About your brand" block for the anonymous PaymentsAnalyzer.
//
// Three fields, minimal by design:
// Business name, website and sector are required before choosing a data source.
// They define the comparison cohort and keep every later report identifiable.
//
// Design contract:
//   - This block does NOT change any engine input. It is metadata attached
//     to the session (input_snapshot) so lead intelligence and future
//     benchmarks can join on it.
//   - Server-side re-validates every field (see submitPaymentsAnalysis).
//   - Microcopy makes the value exchange honest: "helps us benchmark you,
//     still anonymous, no account".
//
// Sectors reuse the same 7 categories we've always used across the product
// (see Brand entity's `category` enum + the marketing copy on Landing).
// Kept as a plain <select> — one-shot input, low frequency, no need for a
// custom control.

const SECTOR_OPTIONS = [
  { value: "fashion" },
  { value: "beauty" },
  { value: "food_beverage" },
  { value: "home_living" },
  { value: "electronics" },
  { value: "health_wellness" },
  { value: "other" },
];

const BRAND_COPY = {
  en: {
    about: "About your brand",
    compare: "Compare with your sector",
    help: "Required to build the right comparison group for your business.",
    brandPlaceholder: "e.g. Aime Studio",
    website: "Website",
    sector: "Sector",
    optional: "optional",
    selectSector: "Select a sector...",
    sectors: {
      fashion: "Fashion",
      beauty: "Beauty",
      food_beverage: "Food & Beverage",
      home_living: "Home & Living",
      electronics: "Electronics",
      health_wellness: "Health & Wellness",
      other: "Other",
    },
  },
  fr: {
    about: "À propos de votre marque",
    compare: "Comparer à votre secteur",
    help: "Requis pour créer le bon groupe de comparaison pour votre entreprise.",
    brandPlaceholder: "ex. Aime Studio",
    website: "Site web",
    sector: "Secteur",
    optional: "facultatif",
    selectSector: "Sélectionnez un secteur...",
    sectors: {
      fashion: "Mode",
      beauty: "Beauté",
      food_beverage: "Alimentation et boissons",
      home_living: "Maison et décoration",
      electronics: "Électronique",
      health_wellness: "Santé et bien-être",
      other: "Autre",
    },
  },
  es: {
    about: "Sobre tu marca",
    compare: "Compara con tu sector",
    help: "Es obligatorio para crear el grupo de comparación adecuado para tu negocio.",
    brandPlaceholder: "p. ej., Aime Studio",
    website: "Sitio web",
    sector: "Sector",
    optional: "opcional",
    selectSector: "Selecciona un sector...",
    sectors: {
      fashion: "Moda",
      beauty: "Belleza",
      food_beverage: "Alimentación y bebidas",
      home_living: "Hogar y decoración",
      electronics: "Electrónica",
      health_wellness: "Salud y bienestar",
      other: "Otro",
    },
  },
  de: { about: "Über Ihr Unternehmen", compare: "Mit Ihrer Branche vergleichen", help: "Erforderlich, um die passende Vergleichsgruppe für Ihr Unternehmen zu bilden.", brandPlaceholder: "z. B. Aime Studio", website: "Website", sector: "Branche", optional: "optional", selectSector: "Branche auswählen...", sectors: { fashion: "Mode", beauty: "Kosmetik", food_beverage: "Lebensmittel & Getränke", home_living: "Wohnen & Leben", electronics: "Elektronik", health_wellness: "Gesundheit & Wellness", other: "Sonstiges" } },
  it: { about: "La tua attività", compare: "Confronta con il tuo settore", help: "Obbligatorio per creare il gruppo di confronto giusto per la tua attività.", brandPlaceholder: "es. Aime Studio", website: "Sito web", sector: "Settore", optional: "facoltativo", selectSector: "Seleziona un settore...", sectors: { fashion: "Moda", beauty: "Bellezza", food_beverage: "Alimentari e bevande", home_living: "Casa e lifestyle", electronics: "Elettronica", health_wellness: "Salute e benessere", other: "Altro" } },
  pl: { about: "O Twojej firmie", compare: "Porównaj ze swoją branżą", help: "Wymagane, aby utworzyć właściwą grupę porównawczą dla Twojej firmy.", brandPlaceholder: "np. Aime Studio", website: "Strona internetowa", sector: "Branża", optional: "opcjonalnie", selectSector: "Wybierz branżę...", sectors: { fashion: "Moda", beauty: "Uroda", food_beverage: "Żywność i napoje", home_living: "Dom i wnętrza", electronics: "Elektronika", health_wellness: "Zdrowie i wellness", other: "Inne" } },
  pt: { about: "Sobre a sua empresa", compare: "Compare com o seu setor", help: "Obrigatório para criar o grupo de comparação certo para a sua empresa.", brandPlaceholder: "ex. Aime Studio", website: "Website", sector: "Setor", optional: "opcional", selectSector: "Selecione um setor...", sectors: { fashion: "Moda", beauty: "Beleza", food_beverage: "Alimentação e bebidas", home_living: "Casa e decoração", electronics: "Eletrónica", health_wellness: "Saúde e bem-estar", other: "Outro" } },
  el: { about: "Σχετικά με την επιχείρησή σας", compare: "Σύγκριση με τον κλάδο σας", help: "Απαιτείται για να δημιουργηθεί η σωστή ομάδα σύγκρισης για την επιχείρησή σας.", brandPlaceholder: "π.χ. Aime Studio", website: "Ιστότοπος", sector: "Κλάδος", optional: "προαιρετικό", selectSector: "Επιλέξτε κλάδο...", sectors: { fashion: "Μόδα", beauty: "Ομορφιά", food_beverage: "Τρόφιμα και ποτά", home_living: "Σπίτι και διαβίωση", electronics: "Ηλεκτρονικά", health_wellness: "Υγεία και ευεξία", other: "Άλλο" } },
  sv: { about: "Om ditt företag", compare: "Jämför med din bransch", help: "Obligatoriskt för att skapa rätt jämförelsegrupp för ditt företag.", brandPlaceholder: "t.ex. Aime Studio", website: "Webbplats", sector: "Bransch", optional: "valfritt", selectSector: "Välj en bransch...", sectors: { fashion: "Mode", beauty: "Skönhet", food_beverage: "Mat och dryck", home_living: "Hem och inredning", electronics: "Elektronik", health_wellness: "Hälsa och välmående", other: "Annat" } },
  da: { about: "Om din virksomhed", compare: "Sammenlign med din branche", help: "Påkrævet for at oprette den rigtige sammenligningsgruppe for din virksomhed.", brandPlaceholder: "f.eks. Aime Studio", website: "Websted", sector: "Branche", optional: "valgfrit", selectSector: "Vælg en branche...", sectors: { fashion: "Mode", beauty: "Skønhed", food_beverage: "Mad og drikke", home_living: "Bolig og livsstil", electronics: "Elektronik", health_wellness: "Sundhed og velvære", other: "Andet" } },
  fi: { about: "Tietoja yrityksestäsi", compare: "Vertaa toimialaasi", help: "Pakollinen, jotta yrityksellesi voidaan muodostaa oikea vertailuryhmä.", brandPlaceholder: "esim. Aime Studio", website: "Verkkosivusto", sector: "Toimiala", optional: "valinnainen", selectSector: "Valitse toimiala...", sectors: { fashion: "Muoti", beauty: "Kauneus", food_beverage: "Ruoka ja juoma", home_living: "Koti ja sisustus", electronics: "Elektroniikka", health_wellness: "Terveys ja hyvinvointi", other: "Muu" } },
  cs: { about: "O vaší firmě", compare: "Porovnat s vaším odvětvím", help: "Povinné pro vytvoření správné srovnávací skupiny pro vaši firmu.", brandPlaceholder: "např. Aime Studio", website: "Web", sector: "Odvětví", optional: "volitelné", selectSector: "Vyberte odvětví...", sectors: { fashion: "Móda", beauty: "Krása", food_beverage: "Jídlo a nápoje", home_living: "Domov a bydlení", electronics: "Elektronika", health_wellness: "Zdraví a wellness", other: "Jiné" } },
  ro: { about: "Despre afacerea dvs.", compare: "Comparați cu sectorul dvs.", help: "Obligatoriu pentru a crea grupul de comparație potrivit pentru afacerea dvs.", brandPlaceholder: "de ex. Aime Studio", website: "Site web", sector: "Sector", optional: "opțional", selectSector: "Selectați un sector...", sectors: { fashion: "Modă", beauty: "Frumusețe", food_beverage: "Alimente și băuturi", home_living: "Casă și stil de viață", electronics: "Electronice", health_wellness: "Sănătate și wellness", other: "Altul" } },
  hu: { about: "A vállalkozásáról", compare: "Összehasonlítás az ágazatával", help: "Kötelező a vállalkozásának megfelelő összehasonlítási csoport létrehozásához.", brandPlaceholder: "pl. Aime Studio", website: "Webhely", sector: "Ágazat", optional: "nem kötelező", selectSector: "Válasszon ágazatot...", sectors: { fashion: "Divat", beauty: "Szépségápolás", food_beverage: "Élelmiszer és ital", home_living: "Otthon és életmód", electronics: "Elektronika", health_wellness: "Egészség és wellness", other: "Egyéb" } },
  bg: { about: "За вашия бизнес", compare: "Сравнете с вашия сектор", help: "Задължително за създаване на подходяща група за сравнение за вашия бизнес.", brandPlaceholder: "напр. Aime Studio", website: "Уебсайт", sector: "Сектор", optional: "по избор", selectSector: "Изберете сектор...", sectors: { fashion: "Мода", beauty: "Красота", food_beverage: "Храни и напитки", home_living: "Дом и начин на живот", electronics: "Електроника", health_wellness: "Здраве и уелнес", other: "Друго" } },
  hr: { about: "O vašem poslovanju", compare: "Usporedite sa svojim sektorom", help: "Obavezno za stvaranje odgovarajuće usporedne skupine za vaše poslovanje.", brandPlaceholder: "npr. Aime Studio", website: "Web-stranica", sector: "Sektor", optional: "neobavezno", selectSector: "Odaberite sektor...", sectors: { fashion: "Moda", beauty: "Ljepota", food_beverage: "Hrana i piće", home_living: "Dom i životni stil", electronics: "Elektronika", health_wellness: "Zdravlje i wellness", other: "Ostalo" } },
  et: { about: "Teie ettevõttest", compare: "Võrdle oma tegevusalaga", help: "Kohustuslik, et luua teie ettevõttele õige võrdlusrühm.", brandPlaceholder: "nt Aime Studio", website: "Veebisait", sector: "Tegevusala", optional: "valikuline", selectSector: "Valige tegevusala...", sectors: { fashion: "Mood", beauty: "Ilu", food_beverage: "Toit ja jook", home_living: "Kodu ja elustiil", electronics: "Elektroonika", health_wellness: "Tervis ja heaolu", other: "Muu" } },
  lv: { about: "Par jūsu uzņēmumu", compare: "Salīdziniet ar savu nozari", help: "Obligāti, lai izveidotu jūsu uzņēmumam atbilstošu salīdzināšanas grupu.", brandPlaceholder: "piem., Aime Studio", website: "Tīmekļa vietne", sector: "Nozare", optional: "neobligāti", selectSector: "Izvēlieties nozari...", sectors: { fashion: "Mode", beauty: "Skaistumkopšana", food_beverage: "Pārtika un dzērieni", home_living: "Māja un dzīvesveids", electronics: "Elektronika", health_wellness: "Veselība un labsajūta", other: "Cits" } },
  lt: { about: "Apie jūsų verslą", compare: "Palyginkite su savo sektoriumi", help: "Privaloma, kad jūsų verslui būtų sukurta tinkama palyginimo grupė.", brandPlaceholder: "pvz., Aime Studio", website: "Svetainė", sector: "Sektorius", optional: "neprivaloma", selectSector: "Pasirinkite sektorių...", sectors: { fashion: "Mada", beauty: "Grožis", food_beverage: "Maistas ir gėrimai", home_living: "Namai ir gyvenimo būdas", electronics: "Elektronika", health_wellness: "Sveikata ir gerovė", other: "Kita" } },
  sk: { about: "O vašej firme", compare: "Porovnajte so svojím odvetvím", help: "Povinné na vytvorenie správnej porovnávacej skupiny pre vašu firmu.", brandPlaceholder: "napr. Aime Studio", website: "Web", sector: "Odvetvie", optional: "voliteľné", selectSector: "Vyberte odvetvie...", sectors: { fashion: "Móda", beauty: "Krása", food_beverage: "Jedlo a nápoje", home_living: "Domov a bývanie", electronics: "Elektronika", health_wellness: "Zdravie a wellness", other: "Iné" } },
  sl: { about: "O vašem podjetju", compare: "Primerjajte s svojo panogo", help: "Obvezno za oblikovanje ustrezne primerjalne skupine za vaše podjetje.", brandPlaceholder: "npr. Aime Studio", website: "Spletna stran", sector: "Panoga", optional: "neobvezno", selectSector: "Izberite panogo...", sectors: { fashion: "Moda", beauty: "Lepota", food_beverage: "Hrana in pijača", home_living: "Dom in življenjski slog", electronics: "Elektronika", health_wellness: "Zdravje in dobro počutje", other: "Drugo" } },
  nb: { about: "Om bedriften din", compare: "Sammenlign med bransjen din", help: "Påkrevd for å opprette riktig sammenligningsgruppe for bedriften din.", brandPlaceholder: "f.eks. Aime Studio", website: "Nettsted", sector: "Bransje", optional: "valgfritt", selectSector: "Velg en bransje...", sectors: { fashion: "Mote", beauty: "Skjønnhet", food_beverage: "Mat og drikke", home_living: "Hjem og livsstil", electronics: "Elektronikk", health_wellness: "Helse og velvære", other: "Annet" } },
  is: { about: "Um fyrirtækið þitt", compare: "Berðu saman við þinn geira", help: "Nauðsynlegt til að mynda réttan samanburðarhóp fyrir fyrirtækið þitt.", brandPlaceholder: "t.d. Aime Studio", website: "Vefsíða", sector: "Geiri", optional: "valfrjálst", selectSector: "Veldu geira...", sectors: { fashion: "Tíska", beauty: "Fegurð", food_beverage: "Matur og drykkur", home_living: "Heimili og lífsstíll", electronics: "Raftæki", health_wellness: "Heilsa og vellíðan", other: "Annað" } },
};

// Exported so the parent (and tests) can reuse the enum without drift.
export const BRAND_SECTOR_SLUGS = SECTOR_OPTIONS.map((s) => s.value);

import { useTranslation } from "@/lib/i18n.jsx";

export default function BrandBlock({
  brandName,
  onBrandNameChange,
  website,
  onWebsiteChange,
  sector,
  onSectorChange,
}) {
  const { t, lang } = useTranslation();
  const copy = BRAND_COPY[lang] || BRAND_COPY.en;
  const businessNameLabel = String(t("brand_name_optional")).replace(/\s*\([^)]*\)\s*$/, "");
  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--az-label, rgba(255,255,255,0.85))" }}>
          {copy.about}
        </span>
        <span className="text-[10px]" style={{ color: "var(--az-subtle, rgba(255,255,255,0.5))" }}>{copy.compare}</span>
      </div>
      <p className="text-[11.5px] leading-relaxed -mt-1" style={{ color: "var(--az-muted, rgba(255,255,255,0.7))" }}>
        {copy.help}
      </p>

      {/* All profile fields are required before the user chooses a source. */}
      <div className="space-y-1.5">
        <label
          htmlFor="brand-name-input"
          className="text-[11px] font-medium"
          style={{ color: "var(--az-label, rgba(255,255,255,0.75))" }}
        >
          {businessNameLabel} <span aria-hidden="true">*</span>
        </label>
        <input
          id="brand-name-input"
          type="text"
          inputMode="text"
          autoComplete="organization"
          maxLength={80}
          required
          value={brandName}
          onChange={(e) => onBrandNameChange(e.target.value)}
          placeholder={copy.brandPlaceholder}
          className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
          style={{
            color: "var(--az-text, #ffffff)",
            background: "var(--az-input, rgba(255,255,255,0.06))",
            border: "1px solid var(--az-border, rgba(255,255,255,0.14))",
          }}
        />
      </div>

      {/* Website + sector — paired on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="brand-website-input"
            className="text-[11px] font-medium"
            style={{ color: "var(--az-label, rgba(255,255,255,0.75))" }}
          >
            {t("acc_website")} <span aria-hidden="true">*</span>
          </label>
          <input
            id="brand-website-input"
            type="url"
            inputMode="url"
            autoComplete="url"
            maxLength={200}
            required
            value={website}
            onChange={(e) => onWebsiteChange(e.target.value)}
            placeholder="aimestudio.com"
            className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
            style={{
              color: "var(--az-text, #ffffff)",
              background: "var(--az-input, rgba(255,255,255,0.06))",
              border: "1px solid var(--az-border, rgba(255,255,255,0.14))",
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="brand-sector-input"
            className="text-[11px] font-medium"
            style={{ color: "var(--az-label, rgba(255,255,255,0.75))" }}
          >
            {t("cb_category")} <span aria-hidden="true">*</span>
          </label>
          <select
            id="brand-sector-input"
            value={sector}
            required
            onChange={(e) => onSectorChange(e.target.value)}
            className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
            style={{
              color: "var(--az-text, #ffffff)",
              background: "var(--az-input, rgba(30,26,60,0.9))",
              border: "1px solid var(--az-border, rgba(255,255,255,0.14))",
              colorScheme: "var(--az-color-scheme, dark)",
            }}
          >
            <option value="">
              {copy.selectSector}
            </option>
            {SECTOR_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {copy.sectors[s.value] || BRAND_COPY.en.sectors[s.value]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
