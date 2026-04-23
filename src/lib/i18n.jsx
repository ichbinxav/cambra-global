import { useState, useEffect, createContext, useContext } from "react";

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "da", label: "Dansk", flag: "🇩🇰" },
];

export const translations = {
  hero: {
    tag: {
      en: "For Lifestyle Commerce", fr: "Pour les marques lifestyle", es: "Para marcas de lifestyle",
      de: "Für Lifestyle-Marken", it: "Per brand lifestyle", nl: "Voor lifestylemerken",
      pt: "Para marcas lifestyle", pl: "Dla marek lifestyle", sv: "För livsstilsvarumärken", da: "For livsstilsbrands",
    },
    urgency: {
      en: "Most brands operate below optimal infrastructure rates — and don't realize it.",
      fr: "La plupart des marques opèrent en dessous de leurs conditions optimales — sans même s'en rendre compte.",
      es: "La mayoría de las marcas operan por debajo de sus condiciones óptimas — sin siquiera saberlo.",
      de: "Die meisten Marken arbeiten unter ihren optimalen Konditionen — ohne es zu merken.",
      it: "La maggior parte dei brand opera al di sotto delle condizioni ottimali — senza rendersene conto.",
      nl: "De meeste merken opereren onder hun optimale voorwaarden — zonder het te beseffen.",
      pt: "A maioria das marcas opera abaixo das condições ideais — sem perceber.",
      pl: "Większość marek działa poniżej optymalnych warunków — nawet o tym nie wiedząc.",
      sv: "De flesta varumärken arbetar under sina optimala villkor — utan att inse det.",
      da: "De fleste brands opererer under deres optimale vilkår — uden at vide det.",
    },
    headline: {
      en: "Turn your infrastructure\ninto an advantage.", fr: "Faites de votre infrastructure\nun avantage.",
      es: "Convierte tu infraestructura\nen una ventaja.", de: "Mach deine Infrastruktur\nzu deinem Vorteil.",
      it: "Trasforma la tua infrastruttura\nin un vantaggio.", nl: "Maak van je infrastructuur\neen voordeel.",
      pt: "Transforme a sua infraestrutura\nnum vantagem.", pl: "Zamień swoją infrastrukturę\nw przewagę.",
      sv: "Gör din infrastruktur\ntill en fördel.", da: "Gør din infrastruktur\ntil en fordel.",
    },
    sub: {
      en: "Unlock the rates your scale should give you.",
      fr: "Accédez aux conditions que votre échelle devrait déjà vous offrir.",
      es: "Accede a las condiciones que tu escala ya debería darte.",
      de: "Erhalte die Konditionen, die deine Größe ermöglichen sollte.",
      it: "Accedi alle condizioni che la tua scala dovrebbe garantire.",
      nl: "Ontgrendel de tarieven die jouw schaal zou moeten opleveren.",
      pt: "Desbloqueie as condições que o seu tamanho já deveria garantir.",
      pl: "Uzyskaj warunki, które Twoja skala powinna zapewniać.",
      sv: "Få tillgång till de villkor din storlek borde ge dig.",
      da: "Få adgang til de vilkår din størrelse burde give dig.",
    },
    desc: {
      en: "We aggregate independent brands into a single leverage bloc. You unlock better rates on payments, shipping, and SaaS — instantly. Our analyzer identifies exactly where value is left unoptimized, then you access the deals.",
      fr: "Nous regroupons des marques indépendantes en un seul bloc de levier. Vous accédez immédiatement à de meilleures conditions sur les paiements, la livraison et le SaaS.",
      es: "Agrupamos marcas independientes en un único bloque de negociación. Accedes a mejores condiciones en pagos, envíos y SaaS — al instante.",
      de: "Wir bündeln unabhängige Marken zu einem einzigen Verhandlungsblock. Du erhältst sofort bessere Konditionen bei Zahlungen, Versand und SaaS.",
      it: "Aggreghiamo brand indipendenti in un unico blocco negoziale. Ottieni subito condizioni migliori su pagamenti, spedizioni e SaaS.",
      nl: "We bundelen onafhankelijke merken in één onderhandelingsblok. Je ontgrendelt direct betere tarieven op betalingen, verzending en SaaS.",
      pt: "Agregamos marcas independentes num único bloco de negociação. Obtém condições melhores em pagamentos, envios e SaaS — instantaneamente.",
      pl: "Łączymy niezależne marki w jeden blok negocjacyjny. Natychmiast odblokowujesz lepsze warunki na płatności, wysyłkę i SaaS.",
      sv: "Vi samlar oberoende varumärken i ett enda förhandlingsblock. Du låser upp bättre villkor för betalningar, frakt och SaaS — omedelbart.",
      da: "Vi samler uafhængige brands i én forhandlingsblok. Du låser op for bedre vilkår på betalinger, forsendelse og SaaS — øjeblikkeligt.",
    },
    pricingFree: {
      en: "Free", fr: "Gratuit", es: "Gratis", de: "Kostenlos", it: "Gratis",
      nl: "Gratis", pt: "Grátis", pl: "Bezpłatnie", sv: "Gratis", da: "Gratis",
    },
    pricingPartners: {
      en: "Early partners only", fr: "Partenaires fondateurs uniquement", es: "Solo socios fundadores",
      de: "Nur für frühe Partner", it: "Solo per i partner fondatori", nl: "Alleen vroege partners",
      pt: "Apenas parceiros iniciais", pl: "Tylko pierwsi partnerzy", sv: "Endast tidiga partners", da: "Kun tidlige partnere",
    },
    pricingNote: {
      en: "You only pay when your economics improve.", fr: "Vous ne payez que lorsque vos coûts s'améliorent.",
      es: "Solo pagas cuando tus costes mejoran.", de: "Du zahlst nur, wenn sich deine Kosten verbessern.",
      it: "Paghi solo quando i tuoi costi migliorano.", nl: "Je betaalt alleen als je kosten verbeteren.",
      pt: "Só paga quando os seus custos melhorarem.", pl: "Płacisz tylko wtedy, gdy Twoje koszty się poprawiają.",
      sv: "Du betalar bara när dina kostnader förbättras.", da: "Du betaler kun, når dine omkostninger forbedres.",
    },
    bullets: {
      en: ["Access rates you can't unlock on your own", "Instantly see where you're overpaying", "Reduce infrastructure costs across your stack", "Turn collective scale into economic leverage"],
      fr: ["Accédez à des conditions impossibles à obtenir seul", "Identifiez instantanément où vous payez trop", "Réduisez les coûts d'infrastructure sur l'ensemble de votre stack", "Transformez l'échelle collective en levier économique"],
      es: ["Accede a condiciones que no puedes conseguir solo", "Detecta al instante dónde estás pagando de más", "Reduce los costes de infraestructura en todo tu stack", "Convierte la escala colectiva en ventaja económica"],
      de: ["Zugang zu Konditionen, die du allein nicht erreichst", "Erkenne sofort, wo du zu viel zahlst", "Reduziere Infrastrukturkosten in deinem gesamten Stack", "Wandle kollektive Größe in wirtschaftlichen Vorteil um"],
      it: ["Accedi a condizioni che non puoi ottenere da solo", "Individua subito dove stai pagando troppo", "Riduci i costi infrastrutturali su tutto il tuo stack", "Trasforma la scala collettiva in leva economica"],
      nl: ["Krijg toegang tot tarieven die je zelf niet kunt bereiken", "Zie direct waar je te veel betaalt", "Verlaag infrastructuurkosten in je hele stack", "Maak van collectieve schaal economisch voordeel"],
      pt: ["Aceda a condições que não conseguiria sozinho", "Veja instantaneamente onde está a pagar a mais", "Reduza custos de infraestrutura em toda a sua stack", "Transforme escala coletiva em alavancagem económica"],
      pl: ["Uzyskaj warunki niedostępne samodzielnie", "Natychmiast zobacz, gdzie przepłacasz", "Obniż koszty infrastruktury w całym swoim stosie", "Zamień zbiorową skalę w dźwignię ekonomiczną"],
      sv: ["Få tillgång till villkor du inte når själv", "Se direkt var du betalar för mycket", "Minska infrastrukturkostnader i hela din stack", "Förvandla kollektiv skala till ekonomisk hävstång"],
      da: ["Få adgang til vilkår du ikke kan opnå alene", "Se med det samme hvor du betaler for meget", "Reducer infrastrukturomkostninger på tværs af din stack", "Gør kollektiv skala til økonomisk løftestang"],
    },
    ctaPrimary: {
      en: "Calculate your savings", fr: "Calculez vos économies", es: "Calcula tu ahorro",
      de: "Berechne deine Einsparungen", it: "Calcola il tuo risparmio", nl: "Bereken je besparingen",
      pt: "Calcule sua economia", pl: "Oblicz swoje oszczędności", sv: "Beräkna dina besparingar", da: "Beregn dine besparelser",
    },
    ctaSecondary: {
      en: "See your optimization potential", fr: "Découvrez votre potentiel d'optimisation", es: "Descubre tu potencial de optimización",
      de: "Sieh dein Optimierungspotenzial", it: "Scopri il tuo potenziale di ottimizzazione", nl: "Bekijk je optimalisatiepotentieel",
      pt: "Veja seu potencial de otimização", pl: "Zobacz swój potencjał optymalizacji", sv: "Se din optimeringspotential", da: "Se dit optimeringspotentiale",
    },
    microCopy: {
      en: "2-minute analysis · No commitment · Read-only access",
      fr: "Analyse de 2 minutes · Sans engagement · Accès lecture seule",
      es: "Análisis de 2 minutos · Sin compromiso · Acceso de solo lectura",
      de: "2-Minuten-Analyse · Keine Verpflichtung · Nur-Lese-Zugriff",
      it: "Analisi in 2 minuti · Nessun impegno · Accesso in sola lettura",
      nl: "2-minuten analyse · Geen verplichting · Alleen-lezen toegang",
      pt: "Análise de 2 minutos · Sem compromisso · Acesso só de leitura",
      pl: "Analiza 2 minuty · Bez zobowiązań · Dostęp tylko do odczytu",
      sv: "2-minuters analys · Inget åtagande · Läsåtkomst",
      da: "2-minutters analyse · Ingen forpligtelse · Skrivebeskyttet adgang",
    },
    identifyInstantly: {
      en: "Identify your optimization potential instantly.", fr: "Identifiez instantanément votre potentiel d'optimisation.",
      es: "Identifica tu potencial de optimización al instante.", de: "Erkenne dein Optimierungspotenzial sofort.",
      it: "Individua il tuo potenziale di ottimizzazione all'istante.", nl: "Identificeer direct je optimalisatiepotentieel.",
      pt: "Identifique o seu potencial de otimização instantaneamente.", pl: "Natychmiast zidentyfikuj swój potencjał optymalizacji.",
      sv: "Identifiera din optimeringspotential omedelbart.", da: "Identificér dit optimeringspotentiale øjeblikkeligt.",
    },
    avgBenchmark: {
      en: "Avg. optimization potential: €29,000/year · €3K–€72K range · Based on real network benchmarks",
      fr: "Potentiel moyen : 29 000 €/an · Fourchette 3K–72K€ · Basé sur de vraies données réseau",
      es: "Potencial medio: 29.000 €/año · Rango 3K–72K€ · Basado en benchmarks reales de la red",
      de: "Durchschn. Optimierungspotenzial: 29.000 €/Jahr · 3K–72K€-Spanne · Basiert auf echten Netzwerkdaten",
      it: "Potenziale medio: 29.000 €/anno · Gamma 3K–72K€ · Basato su benchmark reali della rete",
      nl: "Gem. optimalisatiepotentieel: €29.000/jaar · €3K–€72K-bereik · Op basis van echte networkbenchmarks",
      pt: "Potencial médio: 29.000 €/ano · Intervalo 3K–72K€ · Baseado em benchmarks reais da rede",
      pl: "Śr. potencjał optymalizacji: 29 000 €/rok · Zakres 3K–72K€ · Na podstawie rzeczywistych benchmarków sieci",
      sv: "Genomsn. optimeringspotential: 29 000 €/år · 3K–72K€-intervall · Baserat på verkliga nätverksbenchmarks",
      da: "Gns. optimeringspotentiale: 29.000 €/år · 3K–72K€ interval · Baseret på reelle netværksbenchmarks",
    },
    overpaying: {
      en: "Overpaying detected:", fr: "Surpaiement détecté :", es: "Pago excesivo detectado:",
      de: "Überzahlung erkannt:", it: "Pagamento eccessivo rilevato:", nl: "Teveel betaald gedetecteerd:",
      pt: "Pagamento excessivo detetado:", pl: "Wykryto przepłacanie:", sv: "Överbetalning upptäckt:", da: "Overbetalning opdaget:",
    },
    analyzerTitle: {
      en: "Analyzer · Savings Report", fr: "Analyseur · Rapport d'économies", es: "Analizador · Informe de ahorro",
      de: "Analyse · Einsparungsbericht", it: "Analizzatore · Report risparmi", nl: "Analyzer · Besparingsrapport",
      pt: "Analisador · Relatório de economia", pl: "Analizator · Raport oszczędności", sv: "Analys · Besparingsrapport", da: "Analyse · Besparelsesrapport",
    },
    sampleBrand: {
      en: "Sample brand · €500K/yr", fr: "Marque test · 500K€/an", es: "Marca de ejemplo · 500K€/año",
      de: "Beispielmarke · 500K€/Jahr", it: "Brand campione · 500K€/anno", nl: "Voorbeeldmerk · €500K/jaar",
      pt: "Marca exemplo · 500K€/ano", pl: "Przykładowa marka · 500K€/rok", sv: "Exempelvarumärke · 500K€/år", da: "Eksempelbrand · 500K€/år",
    },
    potentialSavings: {
      en: "Potential savings unlocked", fr: "Économies potentielles débloquées", es: "Ahorro potencial desbloqueado",
      de: "Potenzielle Einsparungen freigeschaltet", it: "Risparmio potenziale sbloccato", nl: "Potentiële besparingen ontgrendeld",
      pt: "Poupanças potenciais desbloqueadas", pl: "Odblokowany potencjał oszczędności", sv: "Potentiella besparingar upplåsta", da: "Potentielle besparelser låst op",
    },
    analyze: {
      en: "Analyze", fr: "Analyser", es: "Analizar", de: "Analysieren", it: "Analizza",
      nl: "Analyseer", pt: "Analisar", pl: "Analizuj", sv: "Analysera", da: "Analysér",
    },
    infraScore: {
      en: "Infrastructure Score:", fr: "Score d'infrastructure :", es: "Índice de infraestructura:",
      de: "Infrastruktur-Score:", it: "Punteggio infrastruttura:", nl: "Infrastructuurscore:",
      pt: "Score de infraestrutura:", pl: "Wynik infrastruktury:", sv: "Infrastrukturpoäng:", da: "Infrastruktur-score:",
    },
    infraPotential: {
      en: "Your potential: 84/100 · See how", fr: "Votre potentiel : 84/100 · Voir comment",
      es: "Tu potencial: 84/100 · Ver cómo", de: "Dein Potenzial: 84/100 · Wie geht das?",
      it: "Il tuo potenziale: 84/100 · Scopri come", nl: "Jouw potentieel: 84/100 · Zie hoe",
      pt: "O teu potencial: 84/100 · Ver como", pl: "Twój potencjał: 84/100 · Zobacz jak",
      sv: "Din potential: 84/100 · Se hur", da: "Dit potentiale: 84/100 · Se hvordan",
    },
    dealsUnlocked: {
      en: "Structural rates unlocked", fr: "Conditions structurelles débloquées", es: "Tarifas estructurales desbloqueadas",
      de: "Strukturelle Konditionen freigeschaltet", it: "Tariffe strutturali sbloccate", nl: "Structurele tarieven ontgrendeld",
      pt: "Tarifas estruturais desbloqueadas", pl: "Odblokowano stawki strukturalne", sv: "Strukturella tariffer upplåsta", da: "Strukturelle tariffer låst op",
    },
    dealsSubtext: {
      en: "Rates you can't negotiate alone · Join to activate",
      fr: "Des conditions que vous ne pouvez pas négocier seul · Rejoignez pour activer",
      es: "Tarifas que no puedes negociar solo · Únete para activar",
      de: "Konditionen, die du allein nicht verhandelst · Tritt bei, um zu aktivieren",
      it: "Tariffe che non puoi negoziare da solo · Unisciti per attivare",
      nl: "Tarieven die je zelf niet kunt onderhandelen · Sluit aan om te activeren",
      pt: "Tarifas que não pode negociar sozinho · Junte-se para ativar",
      pl: "Stawki, których nie możesz negocjować samodzielnie · Dołącz, aby aktywować",
      sv: "Tariffer du inte kan förhandla själv · Gå med för att aktivera",
      da: "Priser du ikke kan forhandle alene · Tilmeld dig for at aktivere",
    },
    join: {
      en: "Join", fr: "Rejoindre", es: "Únete", de: "Beitreten", it: "Unisciti",
      nl: "Aanmelden", pt: "Aderir", pl: "Dołącz", sv: "Gå med", da: "Tilmeld dig",
    },
    sampleNote: {
      en: "Sample analysis · Independent brand · 2025", fr: "Analyse exemple · Marque indépendante · 2025",
      es: "Análisis de muestra · Marca independiente · 2025", de: "Beispielanalyse · Unabhängige Marke · 2025",
      it: "Analisi campione · Brand indipendente · 2025", nl: "Voorbeeldanalyse · Onafhankelijk merk · 2025",
      pt: "Análise exemplo · Marca independente · 2025", pl: "Przykładowa analiza · Niezależna marka · 2025",
      sv: "Exempelanalys · Oberoende varumärke · 2025", da: "Eksempelanalyse · Uafhængigt brand · 2025",
    },
  },
  footer: {
    tagline: {
      en: "Infrastructure leverage for independent brands",
      fr: "Levier d'infrastructure pour les marques indépendantes",
      es: "Apalancamiento de infraestructura para marcas independientes",
      de: "Infrastruktur-Leverage für unabhängige Marken",
      it: "Leva infrastrutturale per brand indipendenti",
      nl: "Infrastructuurhefboom voor onafhankelijke merken",
      pt: "Alavancagem de infraestrutura para marcas independentes",
      pl: "Dźwignia infrastruktury dla niezależnych marek",
      sv: "Infrastrukturhävstång för oberoende varumärken",
      da: "Infrastrukturhåndtag for uafhængige brands",
    },
    headline: {
      en: "Find your unfair advantage", fr: "Trouvez votre avantage décisif", es: "Encuentra tu ventaja injusta",
      de: "Finde deinen unfairen Vorteil", it: "Trova il tuo vantaggio competitivo", nl: "Vind je oneerlijke voordeel",
      pt: "Encontre sua vantagem competitiva", pl: "Znajdź swoją przewagę", sv: "Hitta din orättvisa fördel", da: "Find din uretfærdige fordel",
    },
    sub: {
      en: "Stop overpaying for your infrastructure.", fr: "Arrêtez de payer trop cher votre infrastructure.",
      es: "Deja de pagar de más por tu infraestructura.", de: "Hör auf, zu viel für deine Infrastruktur zu zahlen.",
      it: "Smetti di pagare troppo per la tua infrastruttura.", nl: "Stop met te veel betalen voor je infrastructuur.",
      pt: "Pare de pagar demais pela sua infraestrutura.", pl: "Przestań przepłacać za swoją infrastrukturę.",
      sv: "Sluta betala för mycket för din infrastruktur.", da: "Stop med at betale for meget for din infrastruktur.",
    },
    ctaSavings: {
      en: "Calculate your savings", fr: "Calculez vos économies", es: "Calcula tu ahorro",
      de: "Berechne deine Einsparungen", it: "Calcola il tuo risparmio", nl: "Bereken je besparingen",
      pt: "Calcule sua economia", pl: "Oblicz swoje oszczędności", sv: "Beräkna dina besparingar", da: "Beregn dine besparelser",
    },
    cta: {
      en: "Run the analyzer", fr: "Lancer l'analyse", es: "Ejecutar el analizador",
      de: "Analyse starten", it: "Avvia analisi", nl: "Start analyse",
      pt: "Executar análise", pl: "Uruchom analizę", sv: "Starta analys", da: "Kør analyse",
    },
    desc: {
      en: "Brands typically identify €29,000/year in optimization potential. Most improvements activate within minutes.",
      fr: "Les marques identifient généralement 29 000 €/an de potentiel d'optimisation. La plupart des améliorations s'activent en quelques minutes.",
      es: "Las marcas suelen identificar 29.000 €/año en potencial de optimización. La mayoría de las mejoras se activan en minutos.",
      de: "Marken identifizieren typischerweise 29.000 €/Jahr an Optimierungspotenzial. Die meisten Verbesserungen werden in wenigen Minuten aktiviert.",
      it: "I brand identificano tipicamente 29.000 €/anno di potenziale di ottimizzazione. La maggior parte dei miglioramenti si attiva in pochi minuti.",
      nl: "Merken identificeren doorgaans €29.000/jaar aan optimalisatiepotentieel. De meeste verbeteringen activeren binnen minuten.",
      pt: "As marcas identificam tipicamente 29.000 €/ano em potencial de otimização. A maioria das melhorias ativa em minutos.",
      pl: "Marki zazwyczaj identyfikują 29 000 €/rok potencjału optymalizacji. Większość ulepszeń aktywuje się w ciągu kilku minut.",
      sv: "Varumärken identifierar typiskt 29 000 €/år i optimeringspotential. De flesta förbättringar aktiveras inom minuter.",
      da: "Brands identificerer typisk €29.000/år i optimeringspotentiale. De fleste forbedringer aktiveres inden for få minutter.",
    },
    privacy: {
      en: "Privacy", fr: "Confidentialité", es: "Privacidad", de: "Datenschutz", it: "Privacy",
      nl: "Privacy", pt: "Privacidade", pl: "Prywatność", sv: "Integritet", da: "Privatliv",
    },
    terms: {
      en: "Terms", fr: "Conditions", es: "Términos", de: "Bedingungen", it: "Termini",
      nl: "Voorwaarden", pt: "Termos", pl: "Warunki", sv: "Villkor", da: "Vilkår",
    },
  },
  analyzerCTA: {
    label: {
      en: "Infrastructure Analyzer", fr: "Analyseur d'infrastructure", es: "Analizador de infraestructura",
      de: "Infrastruktur-Analyzer", it: "Analizzatore infrastruttura", nl: "Infrastructuur Analyzer",
      pt: "Analisador de infraestrutura", pl: "Analizator infrastruktury", sv: "Infrastrukturanalysator", da: "Infrastrukturanalysator",
    },
    headline: {
      en: "Identify exactly where\nvalue is left unoptimized.", fr: "Identifiez exactement où\nla valeur reste inexploitée.",
      es: "Identifica exactamente dónde\nqueda valor sin optimizar.", de: "Erkenne genau, wo\nPotenzial ungenutzt bleibt.",
      it: "Individua esattamente dove\nrimane valore non ottimizzato.", nl: "Identificeer precies waar\nwaarde onbenut blijft.",
      pt: "Identifique exatamente onde\no valor fica por otimizar.", pl: "Zidentyfikuj dokładnie, gdzie\npozostaje nieoptymalizowana wartość.",
      sv: "Identifiera exakt var\nvärde lämnas ooptimerat.", da: "Identificér præcis hvor\nværdi efterlades uoptimeret.",
    },
    desc: {
      en: "Benchmark your payments, shipping, and SaaS stack against real network rates. See your optimization potential in 2 minutes.",
      fr: "Comparez vos paiements, votre logistique et votre stack SaaS avec les tarifs réels du réseau. Voyez votre potentiel d'optimisation en 2 minutes.",
      es: "Compara tus pagos, envíos y stack SaaS con las tarifas reales de la red. Ve tu potencial de optimización en 2 minutos.",
      de: "Vergleiche deine Zahlungen, Versand und deinen SaaS-Stack mit echten Netzwerkraten. Sieh dein Optimierungspotenzial in 2 Minuten.",
      it: "Confronta i tuoi pagamenti, la spedizione e il tuo stack SaaS con le tariffe reali della rete. Visualizza il tuo potenziale di ottimizzazione in 2 minuti.",
      nl: "Vergelijk je betalingen, verzending en SaaS-stack met echte netwerktarieven. Zie je optimalisatiepotentieel in 2 minuten.",
      pt: "Compare os seus pagamentos, envios e stack SaaS com tarifas reais da rede. Veja o seu potencial de otimização em 2 minutos.",
      pl: "Porównaj swoje płatności, wysyłkę i stack SaaS z rzeczywistymi stawkami sieci. Zobacz swój potencjał optymalizacji w 2 minuty.",
      sv: "Jämför dina betalningar, frakt och SaaS-stack mot verkliga nätverkspriser. Se din optimeringspotential på 2 minuter.",
      da: "Sammenlign dine betalinger, forsendelse og SaaS-stack med reelle netværkspriser. Se dit optimeringspotentiale på 2 minutter.",
    },
    cta: {
      en: "Run the Analyzer", fr: "Lancer l'Analyseur", es: "Ejecutar el Analizador",
      de: "Analyzer starten", it: "Avvia l'Analizzatore", nl: "Start de Analyzer",
      pt: "Executar o Analisador", pl: "Uruchom Analizator", sv: "Starta Analysatorn", da: "Kør Analysatoren",
    },
    microcopy: {
      en: "2 minutes · Real benchmarks · No commitment", fr: "2 minutes · Benchmarks réels · Sans engagement",
      es: "2 minutos · Benchmarks reales · Sin compromiso", de: "2 Minuten · Echte Benchmarks · Keine Verpflichtung",
      it: "2 minuti · Benchmark reali · Nessun impegno", nl: "2 minuten · Echte benchmarks · Geen verplichting",
      pt: "2 minutos · Benchmarks reais · Sem compromisso", pl: "2 minuty · Rzeczywiste benchmarki · Bez zobowiązań",
      sv: "2 minuter · Riktiga benchmarks · Inget åtagande", da: "2 minutter · Reelle benchmarks · Ingen forpligtelse",
    },
    sample: {
      en: "Sample analysis — €500K brand", fr: "Analyse exemple — marque à 500K€", es: "Análisis de muestra — marca de 500K€",
      de: "Beispielanalyse — 500K€-Marke", it: "Analisi campione — brand da 500K€", nl: "Voorbeeldanalyse — €500K-merk",
      pt: "Análise exemplo — marca de 500K€", pl: "Przykładowa analiza — marka 500K€", sv: "Exempelanalys — 500K€-varumärke", da: "Eksempelanalyse — 500K€-brand",
    },
    savingsPerYear: {
      en: "Savings/yr", fr: "Économies/an", es: "Ahorro/año", de: "Einsparung/Jahr", it: "Risparmio/anno",
      nl: "Besparing/jaar", pt: "Poupança/ano", pl: "Oszczędności/rok", sv: "Besparing/år", da: "Besparelse/år",
    },
    totalOptimization: {
      en: "Optimization potential / year", fr: "Potentiel d'optimisation / an", es: "Potencial de optimización / año",
      de: "Optimierungspotenzial / Jahr", it: "Potenziale di ottimizzazione / anno", nl: "Optimalisatiepotentieel / jaar",
      pt: "Potencial de otimização / ano", pl: "Potencjał optymalizacji / rok", sv: "Optimeringspotential / år", da: "Optimeringspotentiale / år",
    },
    calcSavings: {
      en: "Calculate my savings", fr: "Calculer mes économies", es: "Calcular mi ahorro",
      de: "Meine Einsparungen berechnen", it: "Calcola il mio risparmio", nl: "Bereken mijn besparingen",
      pt: "Calcular a minha economia", pl: "Oblicz moje oszczędności", sv: "Beräkna mina besparingar", da: "Beregn mine besparelser",
    },
  },
};

const LanguageContext = createContext({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    // Persist English to ensure consistency
    try { localStorage.setItem("node_lang", 'en'); } catch {}
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function t(obj, lang) {
  return obj?.[lang] ?? obj?.["en"] ?? "";
}