import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Bot, Check, CheckCircle2, ChevronDown,
  Gauge, Loader2, MessageSquareText, Octagon,
  Pause, Play, RefreshCw, ShieldCheck, SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/lib/i18n.jsx";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RESUME_OPTIONS = [
  { key: "communications", label: "Communications", detail: "Internal sending permission only. Outbound remains OFF." },
  { key: "negotiations", label: "Negotiation", detail: "Policy-scoped preparation; no contract acceptance." },
  { key: "migrations", label: "Migration / implementation", detail: "Only mandate-approved steps." },
  { key: "billing_issuance", label: "New billing issuance", detail: "Reconciliation already remains observable." },
  { key: "paid_discovery", label: "Paid Discovery", detail: "Still bounded by global and per-run budgets." },
];
const FOUNDER_CONTROL_SNAPSHOT_TIMEOUT_MS = 12_000;

export async function boundedFounderControlSnapshot(promise, timeoutMs = FOUNDER_CONTROL_SNAPSHOT_TIMEOUT_MS) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("founder_control_snapshot_timeout"), { code:"FOUNDER_CONTROL_SNAPSHOT_TIMEOUT" })), Math.max(1, timeoutMs));
  });
  try { return await Promise.race([promise, timeout]); }
  finally { if (timer !== null) clearTimeout(timer); }
}

// Founder Control is intentionally self-contained: every user-facing static
// string on this high-risk page has EN/FR/ES parity without expanding the
// public-site dictionaries. English is the canonical lookup key.
const LOCAL_COPY = {
  fr: {
    "Communications":"Communications", "Negotiations":"Négociations", "Migrations":"Migrations", "Billing Issuance":"Émission de facturation", "Internal sending permission only. Outbound remains OFF.":"Autorisation d’envoi interne uniquement. L’outbound reste DÉSACTIVÉ.",
    "Negotiation":"Négociation", "Policy-scoped preparation; no contract acceptance.":"Préparation encadrée par la politique ; aucune acceptation de contrat.",
    "Migration / implementation":"Migration / mise en œuvre", "Only mandate-approved steps.":"Uniquement les étapes approuvées par mandat.",
    "New billing issuance":"Nouvelle émission de facturation", "Reconciliation already remains observable.":"Le rapprochement reste déjà observable.",
    "Paid Discovery":"Discovery payante", "Still bounded by global and per-run budgets.":"Toujours limitée par les budgets globaux et par exécution.",
    "Unknown":"Inconnu", "Healthy":"Sain", "Blocked":"Bloqué", "Degraded":"Dégradé", "Active":"Actif", "Safe":"Sûr", "Limited":"Limité", "Paused":"En pause", "Off":"Désactivé", "On":"Activé", "Pass":"Validé", "Pending":"En attente", "Approval Required":"Approbation requise", "Founder Approval":"Approbation du fondateur", "Manual Only":"Manuel uniquement", "Recommend Only":"Recommandation uniquement", "Research Recommend Only":"Recherche et recommandation uniquement", "Reconciliation Only":"Rapprochement uniquement", "Prepare Approved Steps":"Préparer les étapes approuvées", "Monitor Research Propose":"Surveiller, rechercher et proposer", "Autonomous Within Policy":"Autonome dans la politique", "Autonomous Within Explicit Policy":"Autonome dans la politique explicite", "Autonomous Within Budget":"Autonome dans le budget", "Scheduled Allowed":"Planification autorisée", "Emergency Stopped":"Arrêt d’urgence", "Resume Check Required":"Vérification de reprise requise", "Authorized But Not Sending":"Autorisé sans envoi", "Canary":"Pilote",
    "Commercial Outbound":"Outbound commercial", "Discovery":"Discovery", "AI Workforce":"Équipe IA", "Contracts & Mandates":"Contrats et mandats", "Migration / Implementation":"Migration / mise en œuvre", "Billing / Collections":"Facturation / recouvrement", "Provider Intelligence":"Intelligence fournisseurs",
    "Connected infrastructure is not sending-authorized. Effective capacity is zero.":"L’infrastructure connectée n’est pas autorisée à envoyer. La capacité effective est nulle.",
    "Execution remains bounded by policy, sender, suppression and cost controls.":"L’exécution reste limitée par la politique, l’expéditeur, la suppression et les contrôles de coûts.",
    "Local/manual zero-cost intelligence remains available; paid and scheduled Discovery is paused.":"L’intelligence locale/manuelle sans coût reste disponible ; la Discovery payante et planifiée est en pause.",
    "Zero-Waste plans remain bounded by monthly and per-run hard caps.":"Les plans Zero-Waste restent limités par des plafonds stricts mensuels et par exécution.",
    "Read-only intelligence may continue. Agents cannot approve, sign, raise their own limits, spend outside the cost governor or bypass domain authority.":"L’intelligence en lecture seule peut continuer. Les agents ne peuvent ni approuver, ni signer, ni relever leurs propres limites, ni dépenser hors du contrôle des coûts, ni contourner l’autorité du domaine.",
    "Research and proposals do not equal authority to accept provider economics or contracts.":"La recherche et les propositions ne confèrent pas l’autorité d’accepter les conditions économiques ou les contrats des fournisseurs.",
    "Material acceptance remains Founder-gated and merchant mandate scope is revalidated at execution.":"Toute acceptation matérielle reste soumise au fondateur et la portée du mandat marchand est revalidée à l’exécution.",
    "Only merchant-approved, mandate-scoped steps can execute. Blocked work is never auto-overridden.":"Seules les étapes approuvées par le marchand et couvertes par le mandat peuvent s’exécuter. Un travail bloqué n’est jamais contourné automatiquement.",
    "Emergency containment pauses only new issuance. Reconciliation and already-earned financial truth remain observable.":"Le confinement d’urgence suspend uniquement les nouvelles émissions. Le rapprochement et la vérité financière déjà acquise restent observables.",
    "Evidence collection and proposals may continue; negotiation, agreement and material execution remain separately gated.":"La collecte de preuves et les propositions peuvent continuer ; la négociation, l’accord et l’exécution matérielle restent contrôlés séparément.",
    "Effective capacity":"Capacité effective", "messages/day":"messages/jour", "What blocks it":"Ce qui le bloque", "All configured":"Tous configurés", "Dry-run":"Simulation", "Fresh preflight passed. Explicit activation is now available.":"Le contrôle préalable récent est validé. L’activation explicite est maintenant disponible.", "Pause":"Mettre en pause", "Start canary":"Démarrer le pilote", "Authority, dependencies and limits":"Autorité, dépendances et limites", "Authority:":"Autorité :", "Open operating page":"Ouvrir la page opérationnelle",
    "Instantly / mailbox transport":"Transport Instantly / boîte mail", "SPF / DKIM / DMARC":"SPF / DKIM / DMARC", "Suppression lifecycle":"Cycle de suppression", "Paid-operation budget":"Budget des opérations payantes", "Discovery scheduler":"Planificateur Discovery", "Worker duplicate protection":"Protection contre les doublons de workers", "Legal execution policy":"Politique d’exécution juridique", "Active merchant mandates":"Mandats marchands actifs", "Scoped legal policy":"Politique juridique ciblée", "Migration queue":"File de migration", "Merchant authority":"Autorité du marchand", "Stripe integration":"Intégration Stripe", "Intelligence schedulers":"Planificateurs d’intelligence",
    "Effective daily capacity":"Capacité quotidienne effective", "Policy daily maximum":"Maximum quotidien de la politique", "Monthly paid operations":"Opérations payantes mensuelles", "Largest saved-search run cap":"Plafond maximal d’une recherche enregistrée", "AI monthly":"IA mensuelle", "All paid operations · daily":"Toutes les opérations payantes · quotidien", "All paid operations · monthly":"Toutes les opérations payantes · mensuel", "Commercial outbound · daily":"Outbound commercial · quotidien",
    "Ask CAMBRA":"Demander à CAMBRA", "Live Founder Control context. Chat explains and proposes; it cannot mutate authority.":"Contexte Founder Control en direct. Le chat explique et propose ; il ne peut pas modifier l’autorité.", "Ask why something is blocked, what is active, what a limit means, or what needs your attention. Any material action still requires the real preview and confirmation flow.":"Demandez pourquoi un élément est bloqué, ce qui est actif, la signification d’une limite ou ce qui requiert votre attention. Toute action matérielle exige toujours le véritable flux d’aperçu et de confirmation.", "Ask about authority, limits, blockers or current state…":"Demandez au sujet de l’autorité, des limites, des blocages ou de l’état actuel…", "I do not have enough current evidence to answer that.":"Je ne dispose pas de suffisamment de preuves actuelles pour répondre.", "CAMBRA is unavailable":"CAMBRA est indisponible",
    "Daily total":"Total quotidien", "Monthly total":"Total mensuel", "Daily €":"Quotidien €", "Monthly €":"Mensuel €", "Warning %":"Alerte %", "Hard stop %":"Arrêt strict %", "AI":"IA", "API":"API", "Enrichment":"Enrichissement", "Email":"E-mail",
    "Operation blocked":"Opération bloquée", "Operation failed":"Échec de l’opération", "Completed":"Terminé", "Emergency Stop preview ready":"Aperçu de l’arrêt d’urgence prêt", "Global Emergency Stop applied":"Arrêt d’urgence global appliqué", "Safe Resume dependencies checked":"Dépendances de reprise sûre vérifiées", "Selected capabilities resumed safely":"Capacités sélectionnées reprises en toute sécurité", "Approval preview ready":"Aperçu de l’approbation prêt", "approved":"approuvée", "rejected":"rejetée", "Action {decision}":"Action {decision}", "Budget impact preview ready":"Aperçu de l’impact budgétaire prêt", "Hard budget updated and audited":"Budget strict mis à jour et audité", "Canary preflight passed":"Contrôle préalable du pilote validé", "Controlled canary started":"Pilote contrôlé démarré", "Outbound paused":"Outbound mis en pause",
    "Founder Control is unavailable":"Founder Control est indisponible", "No permissive state is inferred. Material effects remain fail-closed until the canonical control snapshot can be read.":"Aucun état permissif n’est déduit. Les effets matériels restent fermés par défaut jusqu’à la lecture de l’instantané de contrôle canonique.", "The canonical snapshot did not respond in time. No authority was inferred.":"L’instantané canonique n’a pas répondu à temps. Aucune autorité n’a été déduite.", "Retry":"Réessayer", "Founder Control":"Founder Control", "One calm view of what CAMBRA can actually do":"Une vue claire de ce que CAMBRA peut réellement faire", "Authority, operating modes, dependencies, economic limits and material decisions. Connected never means authorized, and a proposed action never means executed.":"Autorité, modes opératoires, dépendances, limites économiques et décisions matérielles. Connecté ne signifie jamais autorisé, et une action proposée ne signifie jamais exécutée.", "Refresh":"Actualiser",
    "Global operating state":"État opérationnel global", "Outbound":"Outbound", "material approvals":"approbations matérielles", "GLOBAL EMERGENCY STOP":"ARRÊT D’URGENCE GLOBAL", "Dependency-aware Safe Resume":"Reprise sûre avec vérification des dépendances", "Stops external material effects. Analyzer, evidence, inbound integrity, audit and read-only intelligence remain available.":"Arrête les effets matériels externes. Analyzer, les preuves, l’intégrité entrante, l’audit et l’intelligence en lecture seule restent disponibles.",
    "Capabilities":"Capacités", "Eight projections of existing authority—no parallel control plane.":"Huit projections de l’autorité existante — aucun plan de contrôle parallèle.", "Captured {date}":"Capturé le {date}", "Material approvals":"Approbations matérielles", "Only L3/L4 decisions. State is revalidated at execution.":"Décisions L3/L4 uniquement. L’état est revalidé à l’exécution.", "{count} pending":"{count} en attente", "Reject":"Rejeter", "Review & approve":"Examiner et approuver", "No material Founder decision is waiting.":"Aucune décision matérielle du fondateur n’est en attente.", "Hard economic limits":"Limites économiques strictes", "Agents cannot raise these limits.":"Les agents ne peuvent pas relever ces limites.", "Change":"Modifier", "{count} / day":"{count} / jour", "No valid active budget: paid execution is fail-closed.":"Aucun budget actif valide : l’exécution payante est fermée par défaut.",
    "Canary & shadow":"Pilote et shadow", "Only real domain-specific modes.":"Uniquement les modes réels propres au domaine.", "{count} actions/day":"{count} actions/jour", "Scope:":"Portée :", "No scope":"Aucune portée", "Expiry:":"Expiration :", "No active commercial canary.":"Aucun pilote commercial actif.", "Routing shadow:":"Shadow de routage :", "Growth shadow:":"Shadow de croissance :", "Critical change history":"Historique des changements critiques", "Who changed what, when and why.":"Qui a changé quoi, quand et pourquoi.", "system":"système", "No reason recorded":"Aucun motif enregistré", "No material change in the current window.":"Aucun changement matériel dans la période actuelle.",
    "Confirm Global Emergency Stop":"Confirmer l’arrêt d’urgence global", "{decision} material action":"Action matérielle : {decision}", "Start controlled canary":"Démarrer le pilote contrôlé", "Review the real impact. Local containment remains effective even if a provider pause needs retry.":"Examinez l’impact réel. Le confinement local reste effectif même si la mise en pause d’un fournisseur doit être retentée.", "The preview is bound to current state and will be revalidated before execution.":"L’aperçu est lié à l’état actuel et sera revalidé avant l’exécution.", "Outbound changes from OFF only after this explicit confirmation and a fresh matching preflight.":"L’outbound ne quitte l’état DÉSACTIVÉ qu’après cette confirmation explicite et un contrôle préalable récent correspondant.", "Affected":"Affecté", "Active jobs observed":"Tâches actives observées", "{count} total · {discovery} Discovery · {migrations} migrations":"{count} au total · {discovery} Discovery · {migrations} migrations", "Risk:":"Risque :", "Resolver:":"Résolveur :", "Provider scope:":"Portée du fournisseur :", "Preflight expires:":"Expiration du contrôle préalable :", "Emergency Stop, hard budgets, sender health, suppression and policy expiry can still stop execution.":"L’arrêt d’urgence, les budgets stricts, la santé des expéditeurs, la suppression et l’expiration des politiques peuvent toujours arrêter l’exécution.", "Founder reason":"Motif du fondateur", "Why this change is necessary":"Pourquoi ce changement est nécessaire", "Cancel":"Annuler", "Applying…":"Application…", "Confirm with fresh preview":"Confirmer avec un aperçu récent",
    "Selective Safe Resume":"Reprise sûre sélective", "No blind global restart. Select only the internal capability gates you intend to reopen; outbound and commercial policies remain paused.":"Aucun redémarrage global à l’aveugle. Sélectionnez uniquement les capacités internes à rouvrir ; l’outbound et les politiques commerciales restent en pause.", "Why these capabilities should resume now":"Pourquoi ces capacités doivent reprendre maintenant", "Review dependencies":"Examiner les dépendances", "Resume selected capabilities":"Reprendre les capacités sélectionnées",
    "Hard paid-operation budget":"Budget strict des opérations payantes", "Configure the canonical global caps. Discovery still has separate per-run caps.":"Configurez les plafonds globaux canoniques. Discovery conserve des plafonds distincts par exécution.", "Review old value, new value and economic impact before confirmation.":"Examinez l’ancienne valeur, la nouvelle valeur et l’impact économique avant confirmation.", "Old":"Ancien", "New":"Nouveau", "Daily {amount} · Monthly {monthly}":"Quotidien {amount} · Mensuel {monthly}", "Impact":"Impact", "Daily delta {amount} · Monthly delta {monthly}. Agents cannot self-increase these caps.":"Écart quotidien {amount} · Écart mensuel {monthly}. Les agents ne peuvent pas augmenter eux-mêmes ces plafonds.", "Preview impact":"Prévisualiser l’impact", "Confirm hard limits":"Confirmer les limites strictes",
    "{count} configured profiles":"{count} profils configurés", "{count} active schedules":"{count} planifications actives", "{count} active mandates":"{count} mandats actifs", "{count} blocked":"{count} bloqués", "€{amount} used this month":"{amount} € utilisés ce mois-ci", "{count} critical incidents open.":"{count} incidents critiques ouverts.", "Canary provider scope":"Portée fournisseur du pilote", "Canonical material authority and operating state.":"Autorité matérielle et état opérationnel canoniques.", "Use a governed action with a fresh preview when a change is needed.":"Utilisez une action gouvernée avec un aperçu récent lorsqu’un changement est nécessaire.",
    "Resolving":"Résolution en cours", "Review Required":"Révision requise", "{count} decisions requiring attention":"{count} décisions requièrent une attention", "Resolution is already in progress. Material execution remains fail-closed until the canonical resolver completes.":"Une résolution est déjà en cours. L’exécution matérielle reste fermée par défaut jusqu’à la fin du résolveur canonique.", "Review":"Examiner",
    "No fresh PASS":"Aucune validation récente", "No active schedule":"Aucune planification active", "No duplicate execution detected":"Aucune exécution en double détectée", "Duplicate or unknown scheduler state":"État du planificateur en double ou inconnu", "At least one approved scoped policy":"Au moins une politique ciblée approuvée", "No broad permission inferred":"Aucune autorisation générale déduite", "Scoped evidence available":"Preuve ciblée disponible", "Review required":"Révision requise", "Connected with non-failed sync":"Connecté avec une synchronisation sans échec", "No healthy connected Stripe integration":"Aucune intégration Stripe saine et connectée", "Duplicate guard healthy":"Protection contre les doublons saine", "Duplicate state unknown or blocked":"État des doublons inconnu ou bloqué", "Only domain-specific shadow systems are shown. There is no fictitious global shadow switch.":"Seuls les systèmes shadow propres au domaine sont affichés. Il n’existe aucun interrupteur shadow global fictif.",
    "Emergency authority is unavailable, so material effects fail closed.":"L’autorité d’urgence est indisponible ; les effets matériels restent donc fermés par défaut.", "{count} canonical sources unavailable.":"{count} sources canoniques indisponibles.", "Selective dependency-aware Safe Resume is required.":"Une reprise sûre sélective avec vérification des dépendances est requise.", "All material effect domains are paused.":"Tous les domaines à effets matériels sont en pause.", "One or more material domains or spend controls are paused.":"Un ou plusieurs domaines matériels ou contrôles de dépenses sont en pause.", "Canonical authority sources are available and no critical containment is active.":"Les sources d’autorité canoniques sont disponibles et aucun confinement critique n’est actif.",
    "Material external effects stop fail-closed.":"Les effets matériels externes s’arrêtent en mode fermé par défaut.", "Configured outbound capacity becomes 0 and active Instantly campaigns are paused.":"La capacité outbound configurée passe à 0 et les campagnes Instantly actives sont mises en pause.", "Analyzer, read-only intelligence, inbound integrity processing, reconciliation, evidence and audit remain available.":"Analyzer, l’intelligence en lecture seule, le traitement de l’intégrité entrante, le rapprochement, les preuves et l’audit restent disponibles.",
    "At least one capability selected":"Au moins une capacité sélectionnée", "Emergency authority available":"Autorité d’urgence disponible", "Canonical authority sources available":"Sources d’autorité canoniques disponibles", "No critical incidents":"Aucun incident critique", "No duplicate scheduler execution":"Aucune double exécution du planificateur", "{capability} workers healthy":"Workers {capability} sains", "Paid-operation budget valid":"Budget des opérations payantes valide", "Suppression lifecycle proven":"Cycle de suppression démontré", "No unresolved blocked migration":"Aucune migration bloquée non résolue", "Stripe dependency healthy":"Dépendance Stripe saine", "Choose only the capabilities you intend to resume":"Choisissez uniquement les capacités à reprendre", "Canonical singleton loaded":"Singleton canonique chargé", "Missing or unreadable authority record":"Enregistrement d’autorité absent ou illisible", "At least one required source is unavailable":"Au moins une source requise est indisponible", "Required authority sources are readable":"Les sources d’autorité requises sont lisibles", "{count} critical incidents":"{count} incidents critiques", "Required scheduler evidence is healthy":"Les preuves requises du planificateur sont saines", "Hard caps valid":"Plafonds stricts valides", "Missing, invalid or stopped budget":"Budget absent, invalide ou arrêté", "Fresh lifecycle PASS":"Cycle récent validé", "Bounce/complaint/opt-out proof missing":"Preuve de rebond, plainte ou désinscription absente", "{count} blocked migrations":"{count} migrations bloquées", "No blocked migration":"Aucune migration bloquée", "Connected and last sync not failed":"Connecté et dernière synchronisation sans échec", "Healthy connected Stripe integration required":"Une intégration Stripe saine et connectée est requise"
  },
  es: {
    "Communications":"Comunicaciones", "Negotiations":"Negociaciones", "Migrations":"Migraciones", "Billing Issuance":"Emisión de facturación", "Internal sending permission only. Outbound remains OFF.":"Solo permiso interno de envío. El outbound permanece DESACTIVADO.",
    "Negotiation":"Negociación", "Policy-scoped preparation; no contract acceptance.":"Preparación limitada por la política; sin aceptación de contratos.",
    "Migration / implementation":"Migración / implementación", "Only mandate-approved steps.":"Solo pasos aprobados por mandato.",
    "New billing issuance":"Nueva emisión de facturación", "Reconciliation already remains observable.":"La conciliación ya permanece observable.",
    "Paid Discovery":"Discovery de pago", "Still bounded by global and per-run budgets.":"Sigue limitada por presupuestos globales y por ejecución.",
    "Unknown":"Desconocido", "Healthy":"Saludable", "Blocked":"Bloqueado", "Degraded":"Degradado", "Active":"Activo", "Safe":"Seguro", "Limited":"Limitado", "Paused":"Pausado", "Off":"Desactivado", "On":"Activado", "Pass":"Aprobado", "Pending":"Pendiente", "Approval Required":"Requiere aprobación", "Founder Approval":"Aprobación del fundador", "Manual Only":"Solo manual", "Recommend Only":"Solo recomendación", "Research Recommend Only":"Solo investigación y recomendación", "Reconciliation Only":"Solo conciliación", "Prepare Approved Steps":"Preparar pasos aprobados", "Monitor Research Propose":"Monitorizar, investigar y proponer", "Autonomous Within Policy":"Autónomo dentro de la política", "Autonomous Within Explicit Policy":"Autónomo dentro de la política explícita", "Autonomous Within Budget":"Autónomo dentro del presupuesto", "Scheduled Allowed":"Programación permitida", "Emergency Stopped":"Parada de emergencia", "Resume Check Required":"Requiere comprobación de reanudación", "Authorized But Not Sending":"Autorizado sin enviar", "Canary":"Piloto",
    "Commercial Outbound":"Outbound comercial", "Discovery":"Discovery", "AI Workforce":"Equipo de IA", "Contracts & Mandates":"Contratos y mandatos", "Migration / Implementation":"Migración / implementación", "Billing / Collections":"Facturación / cobros", "Provider Intelligence":"Inteligencia de proveedores",
    "Connected infrastructure is not sending-authorized. Effective capacity is zero.":"La infraestructura conectada no está autorizada para enviar. La capacidad efectiva es cero.",
    "Execution remains bounded by policy, sender, suppression and cost controls.":"La ejecución sigue limitada por la política, el remitente, las supresiones y los controles de costes.",
    "Local/manual zero-cost intelligence remains available; paid and scheduled Discovery is paused.":"La inteligencia local/manual sin coste sigue disponible; la Discovery de pago y programada está pausada.",
    "Zero-Waste plans remain bounded by monthly and per-run hard caps.":"Los planes Zero-Waste siguen limitados por topes estrictos mensuales y por ejecución.",
    "Read-only intelligence may continue. Agents cannot approve, sign, raise their own limits, spend outside the cost governor or bypass domain authority.":"La inteligencia de solo lectura puede continuar. Los agentes no pueden aprobar, firmar, elevar sus propios límites, gastar fuera del control de costes ni eludir la autoridad del dominio.",
    "Research and proposals do not equal authority to accept provider economics or contracts.":"La investigación y las propuestas no equivalen a autoridad para aceptar condiciones económicas o contratos de proveedores.",
    "Material acceptance remains Founder-gated and merchant mandate scope is revalidated at execution.":"La aceptación material sigue bajo control del fundador y el alcance del mandato del merchant se revalida al ejecutar.",
    "Only merchant-approved, mandate-scoped steps can execute. Blocked work is never auto-overridden.":"Solo pueden ejecutarse pasos aprobados por el merchant y cubiertos por el mandato. El trabajo bloqueado nunca se anula automáticamente.",
    "Emergency containment pauses only new issuance. Reconciliation and already-earned financial truth remain observable.":"La contención de emergencia pausa solo las nuevas emisiones. La conciliación y la verdad financiera ya devengada siguen siendo observables.",
    "Evidence collection and proposals may continue; negotiation, agreement and material execution remain separately gated.":"La recogida de pruebas y las propuestas pueden continuar; la negociación, el acuerdo y la ejecución material siguen controlados por separado.",
    "Effective capacity":"Capacidad efectiva", "messages/day":"mensajes/día", "What blocks it":"Qué lo bloquea", "All configured":"Todos configurados", "Dry-run":"Simulación", "Fresh preflight passed. Explicit activation is now available.":"La comprobación previa reciente ha pasado. La activación explícita ya está disponible.", "Pause":"Pausar", "Start canary":"Iniciar piloto", "Authority, dependencies and limits":"Autoridad, dependencias y límites", "Authority:":"Autoridad:", "Open operating page":"Abrir página operativa",
    "Instantly / mailbox transport":"Transporte de Instantly / buzón", "SPF / DKIM / DMARC":"SPF / DKIM / DMARC", "Suppression lifecycle":"Ciclo de supresiones", "Paid-operation budget":"Presupuesto de operaciones de pago", "Discovery scheduler":"Programador de Discovery", "Worker duplicate protection":"Protección contra workers duplicados", "Legal execution policy":"Política de ejecución legal", "Active merchant mandates":"Mandatos de merchants activos", "Scoped legal policy":"Política legal acotada", "Migration queue":"Cola de migración", "Merchant authority":"Autoridad del merchant", "Stripe integration":"Integración de Stripe", "Intelligence schedulers":"Programadores de inteligencia",
    "Effective daily capacity":"Capacidad diaria efectiva", "Policy daily maximum":"Máximo diario de la política", "Monthly paid operations":"Operaciones de pago mensuales", "Largest saved-search run cap":"Mayor tope de ejecución de una búsqueda guardada", "AI monthly":"IA mensual", "All paid operations · daily":"Todas las operaciones de pago · diario", "All paid operations · monthly":"Todas las operaciones de pago · mensual", "Commercial outbound · daily":"Outbound comercial · diario",
    "Ask CAMBRA":"Preguntar a CAMBRA", "Live Founder Control context. Chat explains and proposes; it cannot mutate authority.":"Contexto de Founder Control en vivo. El chat explica y propone; no puede modificar la autoridad.", "Ask why something is blocked, what is active, what a limit means, or what needs your attention. Any material action still requires the real preview and confirmation flow.":"Pregunta por qué algo está bloqueado, qué está activo, qué significa un límite o qué requiere tu atención. Toda acción material sigue necesitando el flujo real de vista previa y confirmación.", "Ask about authority, limits, blockers or current state…":"Pregunta sobre autoridad, límites, bloqueos o el estado actual…", "I do not have enough current evidence to answer that.":"No dispongo de pruebas actuales suficientes para responder.", "CAMBRA is unavailable":"CAMBRA no está disponible",
    "Daily total":"Total diario", "Monthly total":"Total mensual", "Daily €":"Diario €", "Monthly €":"Mensual €", "Warning %":"Aviso %", "Hard stop %":"Parada estricta %", "AI":"IA", "API":"API", "Enrichment":"Enriquecimiento", "Email":"Correo",
    "Operation blocked":"Operación bloqueada", "Operation failed":"La operación ha fallado", "Completed":"Completado", "Emergency Stop preview ready":"Vista previa de la parada de emergencia lista", "Global Emergency Stop applied":"Parada de emergencia global aplicada", "Safe Resume dependencies checked":"Dependencias de reanudación segura comprobadas", "Selected capabilities resumed safely":"Capacidades seleccionadas reanudadas con seguridad", "Approval preview ready":"Vista previa de aprobación lista", "approved":"aprobada", "rejected":"rechazada", "Action {decision}":"Acción {decision}", "Budget impact preview ready":"Vista previa del impacto presupuestario lista", "Hard budget updated and audited":"Presupuesto estricto actualizado y auditado", "Canary preflight passed":"Comprobación previa del piloto superada", "Controlled canary started":"Piloto controlado iniciado", "Outbound paused":"Outbound pausado",
    "Founder Control is unavailable":"Founder Control no está disponible", "No permissive state is inferred. Material effects remain fail-closed until the canonical control snapshot can be read.":"No se infiere ningún estado permisivo. Los efectos materiales permanecen cerrados por defecto hasta poder leer la instantánea de control canónica.", "The canonical snapshot did not respond in time. No authority was inferred.":"La instantánea canónica no respondió a tiempo. No se infirió ninguna autoridad.", "Retry":"Reintentar", "Founder Control":"Founder Control", "One calm view of what CAMBRA can actually do":"Una vista clara de lo que CAMBRA puede hacer realmente", "Authority, operating modes, dependencies, economic limits and material decisions. Connected never means authorized, and a proposed action never means executed.":"Autoridad, modos operativos, dependencias, límites económicos y decisiones materiales. Conectado nunca significa autorizado, y una acción propuesta nunca significa ejecutada.", "Refresh":"Actualizar",
    "Global operating state":"Estado operativo global", "Outbound":"Outbound", "material approvals":"aprobaciones materiales", "GLOBAL EMERGENCY STOP":"PARADA DE EMERGENCIA GLOBAL", "Dependency-aware Safe Resume":"Reanudación segura con comprobación de dependencias", "Stops external material effects. Analyzer, evidence, inbound integrity, audit and read-only intelligence remain available.":"Detiene los efectos materiales externos. Analyzer, las pruebas, la integridad de entrada, la auditoría y la inteligencia de solo lectura siguen disponibles.",
    "Capabilities":"Capacidades", "Eight projections of existing authority—no parallel control plane.":"Ocho proyecciones de la autoridad existente; sin un plano de control paralelo.", "Captured {date}":"Capturado el {date}", "Material approvals":"Aprobaciones materiales", "Only L3/L4 decisions. State is revalidated at execution.":"Solo decisiones L3/L4. El estado se revalida al ejecutar.", "{count} pending":"{count} pendientes", "Reject":"Rechazar", "Review & approve":"Revisar y aprobar", "No material Founder decision is waiting.":"No hay ninguna decisión material del fundador pendiente.", "Hard economic limits":"Límites económicos estrictos", "Agents cannot raise these limits.":"Los agentes no pueden aumentar estos límites.", "Change":"Cambiar", "{count} / day":"{count} / día", "No valid active budget: paid execution is fail-closed.":"No hay un presupuesto activo válido: la ejecución de pago está cerrada por defecto.",
    "Canary & shadow":"Piloto y shadow", "Only real domain-specific modes.":"Solo modos reales específicos del dominio.", "{count} actions/day":"{count} acciones/día", "Scope:":"Alcance:", "No scope":"Sin alcance", "Expiry:":"Caducidad:", "No active commercial canary.":"No hay ningún piloto comercial activo.", "Routing shadow:":"Shadow de routing:", "Growth shadow:":"Shadow de crecimiento:", "Critical change history":"Historial de cambios críticos", "Who changed what, when and why.":"Quién cambió qué, cuándo y por qué.", "system":"sistema", "No reason recorded":"Sin motivo registrado", "No material change in the current window.":"No hay cambios materiales en la ventana actual.",
    "Confirm Global Emergency Stop":"Confirmar la parada de emergencia global", "{decision} material action":"Acción material: {decision}", "Start controlled canary":"Iniciar piloto controlado", "Review the real impact. Local containment remains effective even if a provider pause needs retry.":"Revisa el impacto real. La contención local sigue siendo efectiva aunque haya que reintentar la pausa de un proveedor.", "The preview is bound to current state and will be revalidated before execution.":"La vista previa está vinculada al estado actual y se revalidará antes de ejecutar.", "Outbound changes from OFF only after this explicit confirmation and a fresh matching preflight.":"El outbound solo sale de DESACTIVADO tras esta confirmación explícita y una comprobación previa reciente coincidente.", "Affected":"Afectado", "Active jobs observed":"Trabajos activos observados", "{count} total · {discovery} Discovery · {migrations} migrations":"{count} en total · {discovery} Discovery · {migrations} migraciones", "Risk:":"Riesgo:", "Resolver:":"Resolutor:", "Provider scope:":"Alcance del proveedor:", "Preflight expires:":"La comprobación previa caduca:", "Emergency Stop, hard budgets, sender health, suppression and policy expiry can still stop execution.":"La parada de emergencia, los presupuestos estrictos, la salud del remitente, las supresiones y la caducidad de la política aún pueden detener la ejecución.", "Founder reason":"Motivo del fundador", "Why this change is necessary":"Por qué es necesario este cambio", "Cancel":"Cancelar", "Applying…":"Aplicando…", "Confirm with fresh preview":"Confirmar con vista previa reciente",
    "Selective Safe Resume":"Reanudación segura selectiva", "No blind global restart. Select only the internal capability gates you intend to reopen; outbound and commercial policies remain paused.":"Sin reinicio global a ciegas. Selecciona solo las capacidades internas que quieras reabrir; el outbound y las políticas comerciales permanecen pausados.", "Why these capabilities should resume now":"Por qué deben reanudarse ahora estas capacidades", "Review dependencies":"Revisar dependencias", "Resume selected capabilities":"Reanudar capacidades seleccionadas",
    "Hard paid-operation budget":"Presupuesto estricto de operaciones de pago", "Configure the canonical global caps. Discovery still has separate per-run caps.":"Configura los topes globales canónicos. Discovery mantiene topes separados por ejecución.", "Review old value, new value and economic impact before confirmation.":"Revisa el valor anterior, el nuevo y el impacto económico antes de confirmar.", "Old":"Anterior", "New":"Nuevo", "Daily {amount} · Monthly {monthly}":"Diario {amount} · Mensual {monthly}", "Impact":"Impacto", "Daily delta {amount} · Monthly delta {monthly}. Agents cannot self-increase these caps.":"Diferencia diaria {amount} · diferencia mensual {monthly}. Los agentes no pueden aumentar estos topes por sí mismos.", "Preview impact":"Previsualizar impacto", "Confirm hard limits":"Confirmar límites estrictos",
    "{count} configured profiles":"{count} perfiles configurados", "{count} active schedules":"{count} programaciones activas", "{count} active mandates":"{count} mandatos activos", "{count} blocked":"{count} bloqueados", "€{amount} used this month":"{amount} € utilizados este mes", "{count} critical incidents open.":"{count} incidentes críticos abiertos.", "Canary provider scope":"Alcance de proveedor del piloto", "Canonical material authority and operating state.":"Autoridad material y estado operativo canónicos.", "Use a governed action with a fresh preview when a change is needed.":"Utiliza una acción gobernada con una vista previa reciente cuando sea necesario un cambio.",
    "Resolving":"Resolución en curso", "Review Required":"Revisión requerida", "{count} decisions requiring attention":"{count} decisiones requieren atención", "Resolution is already in progress. Material execution remains fail-closed until the canonical resolver completes.":"Ya hay una resolución en curso. La ejecución material permanece cerrada por defecto hasta que termine el resolutor canónico.", "Review":"Revisar",
    "No fresh PASS":"Sin validación reciente", "No active schedule":"Sin programación activa", "No duplicate execution detected":"No se ha detectado ejecución duplicada", "Duplicate or unknown scheduler state":"Estado del programador duplicado o desconocido", "At least one approved scoped policy":"Al menos una política acotada aprobada", "No broad permission inferred":"No se infiere ningún permiso amplio", "Scoped evidence available":"Prueba acotada disponible", "Review required":"Revisión requerida", "Connected with non-failed sync":"Conectado con sincronización sin fallos", "No healthy connected Stripe integration":"No hay una integración de Stripe conectada y saludable", "Duplicate guard healthy":"Protección contra duplicados saludable", "Duplicate state unknown or blocked":"Estado de duplicados desconocido o bloqueado", "Only domain-specific shadow systems are shown. There is no fictitious global shadow switch.":"Solo se muestran sistemas shadow específicos del dominio. No existe un interruptor shadow global ficticio.",
    "Emergency authority is unavailable, so material effects fail closed.":"La autoridad de emergencia no está disponible, por lo que los efectos materiales permanecen cerrados por defecto.", "{count} canonical sources unavailable.":"{count} fuentes canónicas no disponibles.", "Selective dependency-aware Safe Resume is required.":"Se requiere una reanudación segura selectiva con comprobación de dependencias.", "All material effect domains are paused.":"Todos los dominios con efectos materiales están pausados.", "One or more material domains or spend controls are paused.":"Uno o más dominios materiales o controles de gasto están pausados.", "Canonical authority sources are available and no critical containment is active.":"Las fuentes de autoridad canónicas están disponibles y no hay ninguna contención crítica activa.",
    "Material external effects stop fail-closed.":"Los efectos materiales externos se detienen en modo cerrado por defecto.", "Configured outbound capacity becomes 0 and active Instantly campaigns are paused.":"La capacidad outbound configurada pasa a 0 y se pausan las campañas activas de Instantly.", "Analyzer, read-only intelligence, inbound integrity processing, reconciliation, evidence and audit remain available.":"Analyzer, la inteligencia de solo lectura, el procesamiento de integridad de entrada, la conciliación, las pruebas y la auditoría siguen disponibles.",
    "At least one capability selected":"Al menos una capacidad seleccionada", "Emergency authority available":"Autoridad de emergencia disponible", "Canonical authority sources available":"Fuentes de autoridad canónicas disponibles", "No critical incidents":"Sin incidentes críticos", "No duplicate scheduler execution":"Sin ejecución duplicada del programador", "{capability} workers healthy":"Workers de {capability} saludables", "Paid-operation budget valid":"Presupuesto de operaciones de pago válido", "Suppression lifecycle proven":"Ciclo de supresiones demostrado", "No unresolved blocked migration":"Sin migraciones bloqueadas no resueltas", "Stripe dependency healthy":"Dependencia de Stripe saludable", "Choose only the capabilities you intend to resume":"Elige solo las capacidades que quieras reanudar", "Canonical singleton loaded":"Singleton canónico cargado", "Missing or unreadable authority record":"Registro de autoridad ausente o ilegible", "At least one required source is unavailable":"Al menos una fuente requerida no está disponible", "Required authority sources are readable":"Las fuentes de autoridad requeridas son legibles", "{count} critical incidents":"{count} incidentes críticos", "Required scheduler evidence is healthy":"Las pruebas requeridas del programador son saludables", "Hard caps valid":"Topes estrictos válidos", "Missing, invalid or stopped budget":"Presupuesto ausente, inválido o detenido", "Fresh lifecycle PASS":"Ciclo reciente validado", "Bounce/complaint/opt-out proof missing":"Falta la prueba de rebote, queja o baja", "{count} blocked migrations":"{count} migraciones bloqueadas", "No blocked migration":"Sin migraciones bloqueadas", "Connected and last sync not failed":"Conectado y última sincronización sin fallos", "Healthy connected Stripe integration required":"Se requiere una integración de Stripe conectada y saludable"
  },
};

const SAFE_BUDGET = {
  daily_total_limit_minor: 2500,
  monthly_total_limit_minor: 50000,
  anomaly_warning_pct: 70,
  hard_stop_pct: 95,
  category_limits_json: {
    ai: { daily_limit_minor: 1000, monthly_limit_minor: 20000 },
    api: { daily_limit_minor: 600, monthly_limit_minor: 12000 },
    enrichment: { daily_limit_minor: 500, monthly_limit_minor: 10000 },
    email: { daily_limit_minor: 400, monthly_limit_minor: 8000 },
  },
  estimated_unit_cost_minor_json: { ai: 8, api: 12, enrichment: 20, email: 1 },
};

const tone = {
  SAFE: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  LIMITED: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  PAUSED: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  EMERGENCY_STOPPED: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  RESUME_CHECK_REQUIRED: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  DEGRADED: "border-rose-400/35 bg-rose-400/10 text-rose-200",
};

const providerActions = {
  instantly: "start_instantly",
  resend: "start_volume",
  outlook: "start_premium",
  all: "start_all",
};

const CANONICAL_LABELS = {
  UNKNOWN:"Unknown", HEALTHY:"Healthy", BLOCKED:"Blocked", DEGRADED:"Degraded", ACTIVE:"Active", SAFE:"Safe", LIMITED:"Limited", PAUSED:"Paused", OFF:"Off", ON:"On", PASS:"Pass", PENDING:"Pending", RESOLVING:"Resolving", REVIEW_REQUIRED:"Review Required", CANARY:"Canary",
  APPROVAL_REQUIRED:"Approval Required", FOUNDER_APPROVAL:"Founder Approval", MANUAL_ONLY:"Manual Only", RECOMMEND_ONLY:"Recommend Only", RESEARCH_RECOMMEND_ONLY:"Research Recommend Only", RECONCILIATION_ONLY:"Reconciliation Only", PREPARE_APPROVED_STEPS:"Prepare Approved Steps", MONITOR_RESEARCH_PROPOSE:"Monitor Research Propose", AUTONOMOUS_WITHIN_POLICY:"Autonomous Within Policy", AUTONOMOUS_WITHIN_EXPLICIT_POLICY:"Autonomous Within Explicit Policy", AUTONOMOUS_WITHIN_BUDGET:"Autonomous Within Budget", SCHEDULED_ALLOWED:"Scheduled Allowed", EMERGENCY_STOPPED:"Emergency Stopped", RESUME_CHECK_REQUIRED:"Resume Check Required", AUTHORIZED_BUT_NOT_SENDING:"Authorized But Not Sending",
};

function payload(response) { return response?.data || response || {}; }
function interpolate(value, params = {}) { return String(value).replace(/\{(\w+)\}/g, (_, key) => params[key] === undefined ? `{${key}}` : String(params[key])); }
function useFounderCopy() {
  const { lang, locale } = useTranslation();
  const tr = useCallback((source, params) => interpolate(LOCAL_COPY[lang]?.[source] ?? source, params), [lang]);
  return { tr, lang, locale };
}
function money(minor, locale) { return new Intl.NumberFormat(locale || "en-GB", { style: "currency", currency: "EUR" }).format((Number(minor) || 0) / 100); }
function when(value, locale) { if (!value) return "—"; try { return new Date(value).toLocaleString(locale); } catch { return String(value); } }
function rawLabel(value) { return String(value || "Unknown").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase()); }
function label(value, tr) { const normalized = String(value || "UNKNOWN").toUpperCase(); return tr(CANONICAL_LABELS[normalized] || rawLabel(value)); }
function localizedText(value, tr) {
  const text = String(value || "");
  if (!text) return text;
  if (LOCAL_COPY.fr[text] || LOCAL_COPY.es[text]) return tr(text);
  if (text.includes(". ")) return text.split(/(?<=\.)\s+/).map(sentence => localizedText(sentence, tr)).join(" ");
  let match = text.match(/^(\d+) configured profiles?$/); if (match) return tr("{count} configured profiles", { count:match[1] });
  match = text.match(/^(\d+) active schedules?$/); if (match) return tr("{count} active schedules", { count:match[1] });
  match = text.match(/^(\d+) active mandates?$/); if (match) return tr("{count} active mandates", { count:match[1] });
  match = text.match(/^(\d+) blocked$/); if (match) return tr("{count} blocked", { count:match[1] });
  match = text.match(/^€([\d.]+) used this month$/); if (match) return tr("€{amount} used this month", { amount:match[1] });
  match = text.match(/^(\d+) critical incidents?(?: remain)? open\.?$/); if (match) return tr("{count} critical incidents open.", { count:match[1] });
  match = text.match(/^(\d+) canonical sources? (?:is|are) unavailable\.?$/); if (match) return tr("{count} canonical sources unavailable.", { count:match[1] });
  match = text.match(/^(\d+) critical incident\(s\)$/); if (match) return tr("{count} critical incidents", { count:match[1] });
  match = text.match(/^(communications|negotiations|migrations|billing issuance|paid discovery) workers healthy$/i); if (match) return tr("{capability} workers healthy", { capability:tr(rawLabel(match[1])) });
  match = text.match(/^(\d+) blocked migration\(s\)$/); if (match) return tr("{count} blocked migrations", { count:match[1] });
  if (/^[a-z0-9_:.-]+(?:,\s*[a-z0-9_:.-]+)+$/i.test(text)) return text.split(/,\s*/).map(part => label(part, tr)).join(" · ");
  if (/^[a-z0-9_:.-]+(?:\s·\s[a-z0-9_:.-]+)*$/i.test(text)) return text.split(" · ").map(part => label(part, tr)).join(" · ");
  return tr(text);
}
function commandKey(prefix) { return `${prefix}:${Date.now()}:${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`; }

function StatusPill({ value, text = null }) {
  const { tr } = useFounderCopy();
  const normalized = String(value || "UNKNOWN").toUpperCase();
  const style = normalized === "HEALTHY" || normalized === "PASS" || normalized === "ACTIVE" || normalized === "SAFE"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
    : normalized === "UNKNOWN" || normalized === "BLOCKED" || normalized === "DEGRADED" || normalized.includes("STOP")
      ? "border-rose-400/25 bg-rose-400/10 text-rose-300"
      : "border-amber-400/25 bg-amber-400/10 text-amber-300";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[.12em] ${style}`}>{text || label(normalized, tr)}</span>;
}

function Dependency({ row }) {
  const { tr } = useFounderCopy();
  const Icon = row.status === "HEALTHY" || row.status === "PASS" ? CheckCircle2 : row.status === "UNKNOWN" ? AlertTriangle : XCircle;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-white/[.06] bg-black/10 p-2.5">
      <Icon size={13} className={row.status === "HEALTHY" || row.status === "PASS" ? "mt-0.5 text-emerald-400" : row.status === "UNKNOWN" ? "mt-0.5 text-amber-400" : "mt-0.5 text-rose-400"} />
      <div className="min-w-0"><p className="text-[11px] font-bold">{localizedText(row.label, tr)}</p><p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{localizedText(row.detail, tr)}</p></div>
    </div>
  );
}

function CapabilityCard({ item, onPauseOutbound, onPreflight, onStartCanary, providerScope, setProviderScope, canaryPreflight, busy }) {
  const { tr } = useFounderCopy();
  const isOutbound = item.key === "commercial_outbound";
  return (
    <article className="rounded-2xl border border-white/[.08] bg-card/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="font-black tracking-tight">{localizedText(item.label, tr)}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{localizedText(item.explanation, tr)}</p></div>
        <StatusPill value={item.current_mode} />
      </div>
      {item.effective_capacity !== null && <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[.06] px-3 py-2"><p className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">{tr("Effective capacity")}</p><p className="mt-0.5 text-lg font-black tabular-nums">{item.effective_capacity} <span className="text-[10px] font-semibold text-muted-foreground">{tr("messages/day")}</span></p></div>}
      {item.blockers?.length > 0 && <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[.06] p-3"><p className="text-[10px] font-black uppercase tracking-[.14em] text-amber-300">{tr("What blocks it")}</p><p className="mt-1 text-[11px] leading-5 text-amber-100/70">{item.blockers.slice(0, 4).map(value => label(value, tr)).join(" · ")}</p></div>}
      {isOutbound && (
        <div className="mt-3 space-y-2 rounded-xl border border-white/[.07] bg-black/10 p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select value={providerScope} onChange={event => setProviderScope(event.target.value)} aria-label={tr("Canary provider scope")} className="h-9 rounded-lg border border-white/10 bg-background px-2 text-xs">
              <option value="instantly">Instantly</option><option value="resend">Resend</option><option value="outlook">Outlook</option><option value="all">{tr("All configured")}</option>
            </select>
            <button onClick={onPreflight} disabled={busy} className="h-9 rounded-lg border border-cyan-400/25 px-3 text-xs font-bold text-cyan-200 disabled:opacity-40">{tr("Dry-run")}</button>
          </div>
          {canaryPreflight && <p className={`text-[10px] leading-4 ${canaryPreflight.allowed ? "text-emerald-300" : "text-amber-300"}`}>{canaryPreflight.allowed ? tr("Fresh preflight passed. Explicit activation is now available.") : (canaryPreflight.blockers || [canaryPreflight.error]).filter(Boolean).slice(0, 4).map(value => label(value, tr)).join(" · ")}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onPauseOutbound} disabled={busy || item.current_mode === "OFF"} className="h-9 rounded-lg border border-white/10 text-xs font-bold disabled:opacity-35"><Pause size={12} className="mr-1 inline" />{tr("Pause")}</button>
            <button onClick={onStartCanary} disabled={busy || !canaryPreflight?.allowed} className="h-9 rounded-lg bg-emerald-400 text-xs font-black text-slate-950 disabled:opacity-35"><Play size={12} className="mr-1 inline" />{tr("Start canary")}</button>
          </div>
        </div>
      )}
      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-bold text-muted-foreground"><span>{tr("Authority, dependencies and limits")}</span><ChevronDown size={13} className="transition-transform group-open:rotate-180" /></summary>
        <div className="mt-3 space-y-2">
          {item.dependencies?.map(row => <Dependency key={row.key} row={row} />)}
          {item.limits?.map(row => <div key={row.label} className="flex items-center justify-between gap-3 text-[10px]"><span className="text-muted-foreground">{localizedText(row.label, tr)}</span><span className="font-bold tabular-nums">{row.limit ?? 0} {localizedText(row.unit, tr)}</span></div>)}
          <p className="text-[10px] leading-4 text-muted-foreground"><strong className="text-foreground">{tr("Authority:")}</strong> {(item.authority || []).join(" · ")}</p>
          {item.manage_path && <Link to={item.manage_path} className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-300">{tr("Open operating page")} <ArrowRight size={11} /></Link>}
        </div>
      </details>
    </article>
  );
}

function AskCambra({ open, onOpenChange }) {
  const { tr } = useFounderCopy();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ask = async promptValue => {
    const prompt = String(promptValue ?? question).trim();
    if (!prompt || loading) return;
    setMessages(rows => [...rows, { role: "user", text: prompt }]); setQuestion(""); setLoading(true); setError("");
    try {
      const response = await base44.functions.invoke("copilotChat", { question:prompt, pageTitle:tr("Founder Control"), pageDescription:tr("Canonical material authority and operating state."), nextStep:tr("Use a governed action with a fresh preview when a change is needed."), context_scope:"FOUNDER_CONTROL" });
      const data = payload(response);
      setMessages(rows => [...rows, { role:"assistant", text:data.answer || tr("I do not have enough current evidence to answer that.") }]);
    } catch (cause) { setError(cause?.message || tr("CAMBRA is unavailable")); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(780px,88vh)] max-w-xl flex-col overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b p-5 pr-12"><DialogTitle className="flex items-center gap-2"><Bot size={18} />{tr("Ask CAMBRA")}</DialogTitle><DialogDescription>{tr("Live Founder Control context. Chat explains and proposes; it cannot mutate authority.")}</DialogDescription></DialogHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!messages.length && <div className="rounded-2xl bg-secondary/50 p-4 text-xs leading-5">{tr("Ask why something is blocked, what is active, what a limit means, or what needs your attention. Any material action still requires the real preview and confirmation flow.")}</div>}
          {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-2xl p-3 text-xs leading-5 ${message.role === "user" ? "ml-10 bg-foreground text-background" : "mr-10 bg-secondary"}`}>{message.text}</div>)}
          {loading && <Loader2 size={16} className="animate-spin" />}{error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
        <div className="border-t p-4"><textarea value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} placeholder={tr("Ask about authority, limits, blockers or current state…")} className="min-h-20 w-full resize-none rounded-xl border bg-background p-3 text-xs" /><button onClick={() => ask()} disabled={loading || !question.trim()} className="mt-2 h-10 w-full rounded-xl bg-foreground text-xs font-black text-background disabled:opacity-40">{tr("Ask CAMBRA")}</button></div>
      </DialogContent>
    </Dialog>
  );
}

function BudgetFields({ value, onChange }) {
  const { tr } = useFounderCopy();
  const set = (key, next) => onChange({ ...value, [key]: Number(next) });
  const setCategory = (category, cadence, next) => onChange({ ...value, category_limits_json:{ ...value.category_limits_json, [category]:{ ...(value.category_limits_json?.[category] || {}), [cadence]:Number(next) } } });
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">{[["daily_total_limit_minor","Daily total"],["monthly_total_limit_minor","Monthly total"]].map(([key, title]) => <label key={key} className="text-xs font-bold">{tr(title)} (€)<input type="number" min="1" value={(value[key] || 0) / 100} onChange={event => set(key, Math.round(Number(event.target.value) * 100))} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 font-normal" /></label>)}</div>
    <div className="grid gap-2 sm:grid-cols-2">{["ai","api","enrichment","email"].map(category => <div key={category} className="rounded-xl border p-3"><p className="text-[10px] font-black uppercase tracking-[.14em]">{tr(category === "ai" ? "AI" : category === "api" ? "API" : category === "enrichment" ? "Enrichment" : "Email")}</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-muted-foreground">{tr("Daily €")}<input type="number" value={(value.category_limits_json?.[category]?.daily_limit_minor || 0) / 100} onChange={event => setCategory(category, "daily_limit_minor", Math.round(Number(event.target.value) * 100))} className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-foreground" /></label><label className="text-[10px] text-muted-foreground">{tr("Monthly €")}<input type="number" value={(value.category_limits_json?.[category]?.monthly_limit_minor || 0) / 100} onChange={event => setCategory(category, "monthly_limit_minor", Math.round(Number(event.target.value) * 100))} className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-foreground" /></label></div></div>)}</div>
    <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">{tr("Warning %")}<input type="number" min="1" max="99" value={value.anomaly_warning_pct} onChange={event => set("anomaly_warning_pct", event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 font-normal" /></label><label className="text-xs font-bold">{tr("Hard stop %")}<input type="number" min="1" max="100" value={value.hard_stop_pct} onChange={event => set("hard_stop_pct", event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 font-normal" /></label></div>
  </div>;
}

export default function AdminFounderControl() {
  const { tr, locale } = useFounderCopy();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState("");
  const [selectedResume, setSelectedResume] = useState([]);
  const [providerScope, setProviderScope] = useState("instantly");
  const [canaryPreflight, setCanaryPreflight] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(SAFE_BUDGET);

  const invoke = useCallback(async (name, body = {}) => {
    try {
      const data = payload(await base44.functions.invoke(name, body));
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw Object.assign(new Error(tr("Operation blocked")), { data:{ error:"invalid_function_response", function:name } });
      }
      if (data.ok === false) throw Object.assign(new Error(data.error || tr("Operation blocked")), { data });
      return data;
    } catch (cause) {
      if (cause?.data) throw cause;
      const data = payload(cause?.response?.data || cause?.data || {});
      throw Object.assign(new Error(data?.error || cause?.message || tr("Operation failed")), { data });
    }
  }, [tr]);

  const requireCanonical = useCallback((data, paths) => {
    const missing = paths.filter(path => {
      const value = path.split(".").reduce((current, key) => current?.[key], data);
      return value === undefined || value === null || value === "";
    });
    if (!data || typeof data !== "object" || Array.isArray(data) || missing.length) {
      throw Object.assign(new Error(tr("Operation blocked")), {
        data:{ error:"canonical_preview_incomplete", missing_fields:missing },
      });
    }
    return data;
  }, [tr]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await boundedFounderControlSnapshot(invoke("getFounderControlCenter", {}));
      setSnapshot(data);
      if (data.cost_control) setBudgetDraft({ ...SAFE_BUDGET, ...data.cost_control, category_limits_json:{ ...SAFE_BUDGET.category_limits_json, ...(data.cost_control.category_limits_json || {}) }, estimated_unit_cost_minor_json:{ ...SAFE_BUDGET.estimated_unit_cost_minor_json, ...(data.cost_control.estimated_unit_cost_minor_json || {}) } });
    } catch (cause) {
      const timedOut = cause?.code === "FOUNDER_CONTROL_SNAPSHOT_TIMEOUT";
      setNotice({ type:"error", text:timedOut ? tr("The canonical snapshot did not respond in time. No authority was inferred.") : cause.message, detail:cause.data });
    }
    finally { if (!silent) setLoading(false); }
  }, [invoke, tr]);

  useEffect(() => { load(); }, [load]);

  const run = async (key, work, success = tr("Completed")) => {
    setBusy(key); setNotice(null);
    try { const result = await work(); setNotice({ type:"success", text:success, detail:result }); return result; }
    catch (cause) { setNotice({ type:"error", text:cause.message, detail:cause.data }); return null; }
    finally { await load(true); setBusy(""); }
  };

  const prepareStop = () => run("stop-preview", async () => {
    const prepared = requireCanonical(await invoke("emergencyControlAdmin", { action:"safe_mode_preview" }), ["preview.state_fingerprint", "command_key", "confirmation_required"]);
    setReason(""); setModal({ kind:"stop", ...prepared }); return prepared;
  }, tr("Emergency Stop preview ready"));
  const confirmStop = () => run("stop-confirm", async () => {
    const current = requireCanonical(modal, ["preview.state_fingerprint", "command_key", "confirmation_required"]);
    const result = await invoke("emergencyControlAdmin", { action:"safe_mode_on", confirmation:current.confirmation_required, command_key:current.command_key, preview_hash:current.preview.state_fingerprint, reason, correlation_id:commandKey("emergency") });
    setModal(null); return result;
  }, tr("Global Emergency Stop applied"));

  const openResume = () => { const paused = RESUME_OPTIONS.filter(item => snapshot?.emergency?.[`${item.key}_paused`] !== false).map(item => item.key); setSelectedResume(paused); setReason(""); setModal({ kind:"resume", stage:"select" }); };
  const prepareResume = () => run("resume-preview", async () => {
    const prepared = requireCanonical(await invoke("emergencyControlAdmin", { action:"resume_preflight", selected_capabilities:selectedResume }), ["preflight.preflight_hash", "command_key", "confirmation_required"]);
    setModal({ kind:"resume", stage:"review", ...prepared }); return prepared;
  }, tr("Safe Resume dependencies checked"));
  const confirmResume = () => run("resume-confirm", async () => {
    const current = requireCanonical(modal, ["preflight.preflight_hash", "command_key", "confirmation_required"]);
    const result = await invoke("emergencyControlAdmin", { action:"resume_selected", selected_capabilities:selectedResume, confirmation:current.confirmation_required, command_key:current.command_key, preflight_hash:current.preflight.preflight_hash, reason, correlation_id:commandKey("resume") });
    setModal(null); return result;
  }, tr("Selected capabilities resumed safely"));

  const prepareApproval = (approval, decision) => run(`approval-${approval.id}`, async () => {
    const prepared = requireCanonical(await invoke("founderOSCommand", { action:"resolve_approval", approval_id:approval.id, decision }), ["preview", "command_key", "confirmation_nonce"]);
    setReason(""); setModal({ kind:"approval", approval, decision, ...prepared }); return prepared;
  }, tr("Approval preview ready"));
  const confirmApproval = () => run("approval-confirm", async () => {
    const current = requireCanonical(modal, ["approval.id", "decision", "command_key", "confirmation_nonce"]);
    const result = await invoke("founderOSCommand", { action:"resolve_approval", approval_id:current.approval.id, decision:current.decision, confirmed:true, command_key:current.command_key, confirmation_nonce:current.confirmation_nonce, reason });
    setModal(null); return result;
  }, tr("Action {decision}", { decision:tr(modal?.decision === "approve" ? "approved" : "rejected") }));

  const budgetInput = useMemo(() => ({ ...budgetDraft, version:budgetDraft.version || commandKey("founder-budget") }), [budgetDraft]);
  const openBudget = () => { setBudgetDraft(value => ({ ...value, version:commandKey("founder-budget") })); setReason(""); setModal({ kind:"budget", stage:"edit" }); };
  const prepareBudget = () => run("budget-preview", async () => {
    const prepared = requireCanonical(await invoke("outboundControlAdmin", { action:"configure_cost_budget", ...budgetInput }), ["preview.preview_hash", "command_key", "confirmation_required"]);
    setModal({ kind:"budget", stage:"review", ...prepared, budgetInput }); return prepared;
  }, tr("Budget impact preview ready"));
  const confirmBudget = () => run("budget-confirm", async () => {
    const current = requireCanonical(modal, ["budgetInput", "preview.preview_hash", "command_key", "confirmation_required"]);
    const result = await invoke("outboundControlAdmin", { action:"configure_cost_budget", ...current.budgetInput, confirmed:true, confirmation:current.confirmation_required, command_key:current.command_key, preview_hash:current.preview.preview_hash });
    setModal(null); return result;
  }, tr("Hard budget updated and audited"));

  const runCanaryPreflight = () => run("canary-preflight", async () => {
    try {
      const prepared = requireCanonical(await invoke("outboundControlAdmin", { action:"preflight", provider_scope:providerScope }), ["preflight_hash", "allowed"]);
      setCanaryPreflight(prepared); return prepared;
    } catch (cause) { setCanaryPreflight({ allowed:false, ...(cause.data || {}), error:cause.message }); throw cause; }
  }, tr("Canary preflight passed"));
  const prepareCanary = () => {
    try {
      const prepared = requireCanonical(canaryPreflight, ["preflight_hash", "allowed"]);
      if (prepared.allowed !== true) throw Object.assign(new Error(tr("Operation blocked")), { data:{ error:"canary_preflight_blocked", blockers:prepared.blockers || [] } });
      setModal({ kind:"canary", providerScope, preflight:prepared });
    } catch (cause) { setNotice({ type:"error", text:cause.message, detail:cause.data }); }
  };
  const confirmCanary = () => run("canary-start", async () => {
    const current = requireCanonical(modal, ["providerScope", "preflight.preflight_hash"]);
    const action = providerActions[current.providerScope];
    if (!action) throw Object.assign(new Error(tr("Operation blocked")), { data:{ error:"unsupported_canary_provider" } });
    const result = await invoke("outboundControlAdmin", { action, confirmation:"START_CANARY_OUTBOUND", preflight_hash:current.preflight.preflight_hash });
    setModal(null); setCanaryPreflight(null); return result;
  }, tr("Controlled canary started"));
  const pauseOutbound = () => run("outbound-pause", () => invoke("outboundControlAdmin", { action:"pause_all" }), tr("Outbound paused"));

  if (loading && !snapshot) return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="animate-spin text-cyan-300" /></div>;
  if (!snapshot) return <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-6"><h1 className="text-xl font-black">{tr("Founder Control is unavailable")}</h1><p className="mt-2 text-sm text-muted-foreground">{tr("No permissive state is inferred. Material effects remain fail-closed until the canonical control snapshot can be read.")}</p>{notice?.text && <p className="mt-3 rounded-xl border border-rose-400/20 bg-black/10 p-3 text-xs text-rose-200">{notice.text}</p>}<button onClick={() => load()} className="mt-4 rounded-xl border px-4 py-2 text-sm font-bold">{tr("Retry")}</button></div>;

  const global = snapshot.global_status || {};
  const emergency = snapshot.emergency || {};
  const approvals = snapshot.material_approvals || [];
  const budget = snapshot.cost_control;

  return (
    <div className="space-y-5 pb-16">
      <section className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.12),transparent_42%),rgba(6,18,35,.82)] p-5 shadow-2xl shadow-black/20 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-cyan-300"><Gauge size={18} /><span className="text-[10px] font-black uppercase tracking-[.2em]">{tr("Founder Control")}</span></div>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{tr("One calm view of what CAMBRA can actually do")}</h1>
            <p className="mt-2 text-sm leading-6 text-white/55">{tr("Authority, operating modes, dependencies, economic limits and material decisions. Connected never means authorized, and a proposed action never means executed.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAskOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-4 text-xs font-bold"><MessageSquareText size={14} />{tr("Ask CAMBRA")}</button>
            <button onClick={() => load()} disabled={!!busy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.05] px-4 text-xs font-bold disabled:opacity-40"><RefreshCw size={14} className={busy ? "animate-spin" : ""} />{tr("Refresh")}</button>
          </div>
        </div>
      </section>

      {notice && <div role="status" className={`rounded-xl border p-3 text-sm ${notice.type === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}><p className="font-bold">{localizedText(notice.text, tr)}</p>{notice.detail?.blockers?.length > 0 && <p className="mt-1 text-xs opacity-75">{notice.detail.blockers.slice(0, 6).map(value => label(value, tr)).join(" · ")}</p>}</div>}

      <section className={`rounded-2xl border p-5 ${tone[global.state] || tone.LIMITED}`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[.16em] opacity-70">{tr("Global operating state")}</p>
            <div className="mt-1 flex items-center gap-3"><h2 className="text-2xl font-black">{label(global.state, tr)}</h2><ShieldCheck size={19} /></div>
            <p className="mt-2 text-sm leading-6 opacity-75">{localizedText(global.explanation, tr)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill value={global.commercial_outbound} text={`${tr("Outbound")} · ${label(global.commercial_outbound, tr)}`} />
              <StatusPill value={global.discovery} text={`${tr("Discovery")} · ${label(global.discovery, tr)}`} />
              <StatusPill value={global.ai_workforce} text={`${tr("AI")} · ${label(global.ai_workforce, tr)}`} />
              <StatusPill value={approvals.length ? "PENDING" : "PASS"} text={`${global.material_approval_count || 0} ${tr("material approvals")}`} />
            </div>
          </div>
          <div className="min-w-[260px] space-y-2">
            <button onClick={prepareStop} disabled={!!busy || emergency.safe_mode} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 text-sm font-black text-white shadow-lg shadow-rose-950/30 disabled:opacity-35"><Octagon size={17} />{tr("GLOBAL EMERGENCY STOP")}</button>
            {(emergency.safe_mode || emergency.resume_check_required) && <button onClick={openResume} disabled={!!busy} className="h-10 w-full rounded-xl border border-current/20 text-xs font-black disabled:opacity-40">{tr("Dependency-aware Safe Resume")}</button>}
            <p className="text-[10px] leading-4 opacity-65">{tr("Stops external material effects. Analyzer, evidence, inbound integrity, audit and read-only intelligence remain available.")}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-black">{tr("Capabilities")}</h2><p className="mt-1 text-xs text-muted-foreground">{tr("Eight projections of existing authority—no parallel control plane.")}</p></div><p className="text-[10px] text-muted-foreground">{tr("Captured {date}", { date:when(snapshot.captured_at, locale) })}</p></div>
        <div className="grid gap-3 lg:grid-cols-2">{snapshot.capabilities?.map(item => <CapabilityCard key={item.key} item={item} busy={!!busy} providerScope={providerScope} setProviderScope={value => { setProviderScope(value); setCanaryPreflight(null); }} canaryPreflight={canaryPreflight} onPauseOutbound={pauseOutbound} onPreflight={runCanaryPreflight} onStartCanary={prepareCanary} />)}</div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border border-white/[.08] bg-card/70 p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">{tr("Material approvals")}</h2><p className="mt-1 text-xs text-muted-foreground">{tr("Only L3/L4 decisions. State is revalidated at execution.")}</p></div><StatusPill value={approvals.length ? "REVIEW_REQUIRED" : "PASS"} text={tr("{count} decisions requiring attention", { count:approvals.length })} /></div>
          {approvals.length ? <div className="mt-4 space-y-3">{approvals.map(item => { const pending = item.status === "pending"; return <div key={item.id} className="rounded-xl border border-white/[.07] bg-black/10 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black">{label(item.action_type, tr)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.summary}</p></div><div className="flex flex-col items-end gap-1"><StatusPill value={item.status || "REVIEW_REQUIRED"} /><StatusPill value={Number(item.risk_level) >= 4 ? "BLOCKED" : "PENDING"} text={`L${item.risk_level}`} /></div></div>{!pending && <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[.06] p-2.5 text-[10px] leading-4 text-amber-200"><p className="font-black uppercase tracking-[.1em]">{tr("Review Required")}</p><p className="mt-1 opacity-80">{tr("Resolution is already in progress. Material execution remains fail-closed until the canonical resolver completes.")}</p></div>}<div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => prepareApproval(item, "reject")} disabled={!!busy || !pending} className="h-9 rounded-lg border border-rose-400/20 text-xs font-bold text-rose-300 disabled:opacity-40">{tr("Reject")}</button>{pending ? <button onClick={() => prepareApproval(item, "approve")} disabled={!!busy} className="h-9 rounded-lg bg-foreground text-xs font-black text-background disabled:opacity-40">{tr("Review & approve")}</button> : <Link to="/admin/inbox" className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-400/20 text-xs font-black text-amber-200">{tr("Review")}</Link>}</div></div>; })}</div> : <div className="mt-4 rounded-xl border border-dashed p-6 text-center"><Check size={18} className="mx-auto text-emerald-400" /><p className="mt-2 text-xs text-muted-foreground">{tr("No material Founder decision is waiting.")}</p></div>}
        </section>

        <section className="rounded-2xl border border-white/[.08] bg-card/70 p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-black">{tr("Hard economic limits")}</h2><p className="mt-1 text-xs text-muted-foreground">{tr("Agents cannot raise these limits.")}</p></div><button onClick={openBudget} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold"><SlidersHorizontal size={13} />{tr("Change")}</button></div>
          <div className="mt-4 space-y-3">{snapshot.limits?.slice(0, 6).map(item => { const pct = item.limit_minor > 0 ? Math.min(100, Math.round((item.used_minor / item.limit_minor) * 100)) : 0; return <div key={item.key}><div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="font-bold">{localizedText(item.label, tr)}</span><span className="tabular-nums text-muted-foreground">{item.currency === "EUR" ? `${money(item.used_minor, locale)} / ${money(item.limit_minor, locale)}` : tr("{count} / day", { count:item.limit_minor || 0 })}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.07]"><div className={`h-full rounded-full ${pct >= 90 ? "bg-rose-400" : pct >= 70 ? "bg-amber-400" : "bg-cyan-300"}`} style={{ width:`${pct}%` }} /></div></div>})}</div>
          {!budget && <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/[.06] p-3 text-[10px] text-rose-300">{tr("No valid active budget: paid execution is fail-closed.")}</p>}
        </section>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <details className="group rounded-2xl border border-white/[.08] bg-card/70 p-5"><summary className="flex cursor-pointer list-none items-center justify-between"><div><h2 className="font-black">{tr("Canary & shadow")}</h2><p className="mt-1 text-xs text-muted-foreground">{tr("Only real domain-specific modes.")}</p></div><ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary><div className="mt-4 space-y-3 text-xs">{snapshot.active_canary ? <div className="rounded-xl border p-3"><div className="flex justify-between gap-3"><strong>{label(snapshot.active_canary.status, tr)}</strong><span>{tr("{count} actions/day", { count:snapshot.active_canary.max_actions })}</span></div><p className="mt-2 text-muted-foreground">{tr("Scope:")} {(snapshot.active_canary.scope || []).join(", ") || tr("No scope")} · {tr("Expiry:")} {when(snapshot.active_canary.expiry, locale)}</p></div> : <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{tr("No active commercial canary.")}</p>}<div className="rounded-xl border p-3"><p><strong>{tr("Routing shadow:")}</strong> {snapshot.active_shadow?.routing?.active || 0}</p><p className="mt-1"><strong>{tr("Growth shadow:")}</strong> {snapshot.active_shadow?.growth?.active || 0}</p><p className="mt-2 text-muted-foreground">{localizedText(snapshot.active_shadow?.note, tr)}</p></div></div></details>
        <details className="group rounded-2xl border border-white/[.08] bg-card/70 p-5"><summary className="flex cursor-pointer list-none items-center justify-between"><div><h2 className="font-black">{tr("Critical change history")}</h2><p className="mt-1 text-xs text-muted-foreground">{tr("Who changed what, when and why.")}</p></div><ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary><div className="mt-4 max-h-80 space-y-2 overflow-auto">{snapshot.critical_changes?.length ? snapshot.critical_changes.map(item => <div key={`${item.source}-${item.id}`} className="rounded-xl border border-white/[.06] p-3 text-[10px]"><div className="flex justify-between gap-3"><strong>{label(item.capability, tr)}</strong><span className="text-muted-foreground">{when(item.at, locale)}</span></div><p className="mt-1 text-muted-foreground">{item.actor || tr("system")} · {item.reason ? localizedText(item.reason, tr) : tr("No reason recorded")}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{item.audit_id}</p></div>) : <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">{tr("No material change in the current window.")}</p>}</div></details>
      </section>

      <AskCambra open={askOpen} onOpenChange={setAskOpen} />

      <Dialog open={!!modal && modal.kind !== "resume" && modal.kind !== "budget"} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-xl">
          <DialogHeader><DialogTitle>{modal?.kind === "stop" ? tr("Confirm Global Emergency Stop") : modal?.kind === "approval" ? tr("{decision} material action", { decision:label(modal.decision, tr) }) : tr("Start controlled canary")}</DialogTitle><DialogDescription>{modal?.kind === "stop" ? tr("Review the real impact. Local containment remains effective even if a provider pause needs retry.") : modal?.kind === "approval" ? tr("The preview is bound to current state and will be revalidated before execution.") : tr("Outbound changes from OFF only after this explicit confirmation and a fresh matching preflight.")}</DialogDescription></DialogHeader>
          {modal?.kind === "stop" && <div className="space-y-3"><div className="rounded-xl border border-rose-400/20 bg-rose-400/[.06] p-3 text-xs"><p className="font-black">{tr("Affected")}</p><p className="mt-1 leading-5 text-muted-foreground">{modal.preview?.affected_capabilities?.map(item => label(item, tr)).join(" · ")}</p></div><div className="rounded-xl border p-3 text-xs"><p className="font-black">{tr("Active jobs observed")}</p><p className="mt-1 text-muted-foreground">{tr("{count} total · {discovery} Discovery · {migrations} migrations", { count:modal.preview?.active_jobs?.total || 0, discovery:modal.preview?.active_jobs?.discovery_runs || 0, migrations:modal.preview?.active_jobs?.migrations || 0 })}</p></div><ul className="space-y-1 text-xs text-muted-foreground">{modal.preview?.expected_behavior?.map(item => <li key={item}>• {localizedText(item, tr)}</li>)}</ul></div>}
          {modal?.kind === "approval" && <div className="space-y-3"><div className="rounded-xl border p-3 text-xs"><p className="font-black">{label(modal.preview?.action_type, tr)}</p><p className="mt-1 leading-5 text-muted-foreground">{modal.preview?.summary}</p></div><div className="grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-secondary p-2">{tr("Risk:")} L{modal.preview?.risk_level}</div><div className="rounded-lg bg-secondary p-2">{tr("Resolver:")} {modal.preview?.resolver}</div></div></div>}
          {modal?.kind === "canary" && <div className="rounded-xl border p-4 text-xs"><p><strong>{tr("Provider scope:")}</strong> {label(modal.providerScope, tr)}</p><p className="mt-2"><strong>{tr("Preflight expires:")}</strong> {when(modal.preflight?.expires_at, locale)}</p><p className="mt-2 text-muted-foreground">{tr("Emergency Stop, hard budgets, sender health, suppression and policy expiry can still stop execution.")}</p></div>}
          {modal && modal.kind !== "canary" && <label className="text-xs font-bold">{tr("Founder reason")}<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder={tr("Why this change is necessary")} className="mt-1 min-h-20 w-full resize-none rounded-xl border bg-background p-3 font-normal" /></label>}
          <DialogFooter><button onClick={() => setModal(null)} className="h-10 rounded-xl border px-4 text-xs font-bold">{tr("Cancel")}</button><button onClick={modal?.kind === "stop" ? confirmStop : modal?.kind === "approval" ? confirmApproval : confirmCanary} disabled={!!busy || (modal?.kind !== "canary" && reason.trim().length < 3)} className={`h-10 rounded-xl px-4 text-xs font-black disabled:opacity-40 ${modal?.kind === "stop" || (modal?.kind === "approval" && modal?.decision === "reject") ? "bg-rose-500 text-white" : "bg-foreground text-background"}`}>{busy ? tr("Applying…") : tr("Confirm with fresh preview")}</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.kind === "resume"} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle>{tr("Selective Safe Resume")}</DialogTitle><DialogDescription>{tr("No blind global restart. Select only the internal capability gates you intend to reopen; outbound and commercial policies remain paused.")}</DialogDescription></DialogHeader>{modal?.stage === "select" ? <div className="space-y-2">{RESUME_OPTIONS.map(item => <label key={item.key} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"><Checkbox checked={selectedResume.includes(item.key)} onCheckedChange={checked => setSelectedResume(rows => checked ? [...new Set([...rows, item.key])] : rows.filter(key => key !== item.key))} /><span><span className="block text-xs font-black">{tr(item.label)}</span><span className="mt-1 block text-[10px] text-muted-foreground">{tr(item.detail)}</span></span></label>)}</div> : <div className="space-y-2">{modal?.preflight?.checklist?.map(item => <div key={item.key} className={`rounded-xl border p-3 text-xs ${item.status === "PASS" ? "border-emerald-400/20 bg-emerald-400/[.05]" : "border-rose-400/20 bg-rose-400/[.05]"}`}><div className="flex items-center justify-between gap-3"><strong>{localizedText(item.label, tr)}</strong><StatusPill value={item.status} /></div><p className="mt-1 text-[10px] text-muted-foreground">{localizedText(item.detail, tr)}</p></div>)}<label className="block pt-2 text-xs font-bold">{tr("Founder reason")}<textarea value={reason} onChange={event => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl border bg-background p-3 font-normal" placeholder={tr("Why these capabilities should resume now")} /></label></div>}<DialogFooter><button onClick={() => setModal(null)} className="h-10 rounded-xl border px-4 text-xs font-bold">{tr("Cancel")}</button>{modal?.stage === "select" ? <button onClick={prepareResume} disabled={!!busy || !selectedResume.length} className="h-10 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{tr("Review dependencies")}</button> : <button onClick={confirmResume} disabled={!!busy || !modal?.preflight?.allowed || reason.trim().length < 3} className="h-10 rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 disabled:opacity-40">{tr("Resume selected capabilities")}</button>}</DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={modal?.kind === "budget"} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl"><DialogHeader><DialogTitle>{tr("Hard paid-operation budget")}</DialogTitle><DialogDescription>{modal?.stage === "edit" ? tr("Configure the canonical global caps. Discovery still has separate per-run caps.") : tr("Review old value, new value and economic impact before confirmation.")}</DialogDescription></DialogHeader>{modal?.stage === "edit" ? <BudgetFields value={budgetDraft} onChange={next => setBudgetDraft({ ...next, version:next.version || commandKey("founder-budget") })} /> : <div className="space-y-3 text-xs"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-3"><p className="font-black">{tr("Old")}</p><p className="mt-2 text-muted-foreground">{tr("Daily {amount} · Monthly {monthly}", { amount:money(modal?.preview?.old_value?.daily_total_limit_minor, locale), monthly:money(modal?.preview?.old_value?.monthly_total_limit_minor, locale) })}</p></div><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[.05] p-3"><p className="font-black">{tr("New")}</p><p className="mt-2 text-muted-foreground">{tr("Daily {amount} · Monthly {monthly}", { amount:money(modal?.preview?.new_value?.daily_total_limit_minor, locale), monthly:money(modal?.preview?.new_value?.monthly_total_limit_minor, locale) })}</p></div></div><div className="rounded-xl border border-amber-400/20 bg-amber-400/[.05] p-3"><p className="font-black">{tr("Impact")}</p><p className="mt-1 text-muted-foreground">{tr("Daily delta {amount} · Monthly delta {monthly}. Agents cannot self-increase these caps.", { amount:money(modal?.preview?.impact?.daily_delta_minor, locale), monthly:money(modal?.preview?.impact?.monthly_delta_minor, locale) })}</p></div></div>}<DialogFooter><button onClick={() => setModal(null)} className="h-10 rounded-xl border px-4 text-xs font-bold">{tr("Cancel")}</button>{modal?.stage === "edit" ? <button onClick={prepareBudget} disabled={!!busy} className="h-10 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{tr("Preview impact")}</button> : <button onClick={confirmBudget} disabled={!!busy} className="h-10 rounded-xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{tr("Confirm hard limits")}</button>}</DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
