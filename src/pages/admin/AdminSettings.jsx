import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell, BookOpen, Bot, Building2, CheckCircle2, ChevronRight, Code2,
  Database, ExternalLink, Globe2, KeyRound, Loader2, Search, Settings2,
  ShieldCheck, Users, WalletCards, XCircle,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTranslation, LANGUAGES } from "@/lib/i18n.jsx";

const SECTIONS = [
  { key: "company", label: "Company", icon: Building2, description: "Legal, fiscal and billing identity", keywords:"VAT TVA SIREN SIRET address invoice contracts" },
  { key: "users_access", label: "Users & Access", icon: Users, description: "Internal access and permissions", keywords:"invite role MFA sessions admin founder" },
  { key: "language_region", label: "Language & Region", icon: Globe2, description: "Language, market, currency and time", keywords:"timezone date number format country EUR" },
  { key: "notifications", label: "Notifications", icon: Bell, description: "What should interrupt the Founder", keywords:"email critical high digest quiet hours" },
  { key: "integrations", label: "Integrations", icon: KeyRound, description: "Connection configuration and status", keywords:"Stripe Apollo Instantly Resend GitHub webhook API" },
  { key: "ai_costs", label: "AI & Costs", icon: WalletCards, description: "Policies and hard economic limits", keywords:"AI budget model spend enrichment cap" },
  { key: "data_privacy", label: "Data & Privacy", icon: ShieldCheck, description: "Retention and privacy safeguards", keywords:"deletion export anonymization k cohort merchant" },
  { key: "advanced", label: "Developer / Advanced", icon: Code2, description: "Read-only deployment configuration", keywords:"release git SHA source tree runtime feature flags" },
];

const LANGUAGE_OPTIONS = LANGUAGES.map(({ code, label, locale }) => ({ code, label, locale }));

// Admin Settings intentionally keeps its copy local: this is one bounded Founder/Admin
// surface and it must switch atomically with the global product language. English is the
// canonical fallback; every visible static sentence below has an explicit FR/ES peer.
const SETTINGS_COPY = {
  fr: {
    "Company": "Entreprise",
    "Legal, fiscal and billing identity": "Identité juridique, fiscale et de facturation",
    "Users & Access": "Utilisateurs et accès",
    "Internal access and permissions": "Accès internes et autorisations",
    "Language & Region": "Langue et région",
    "Language, market, currency and time": "Langue, marché, devise et heure",
    "Notifications": "Notifications",
    "What should interrupt the Founder": "Ce qui doit alerter le fondateur",
    "Integrations": "Intégrations",
    "Connection configuration and status": "Configuration et état des connexions",
    "AI & Costs": "IA et coûts",
    "Policies and hard economic limits": "Politiques et limites économiques strictes",
    "Data & Privacy": "Données et confidentialité",
    "Retention and privacy safeguards": "Conservation et protections de la vie privée",
    "Developer / Advanced": "Développeur / Avancé",
    "Read-only deployment configuration": "Configuration de déploiement en lecture seule",
    "Not configured": "Non configuré",
    "Enabled": "Activé",
    "Disabled": "Désactivé",
    "Unknown": "Inconnu",
    "Configured ✓": "Configuré ✓",
    "Loading settings…": "Chargement des paramètres…",
    "Pass": "Conforme",
    "Active": "Actif",
    "Connected": "Connecté",
    "Configured": "Configuré",
    "Healthy": "Opérationnel",
    "Ready": "Prêt",
    "Delivered": "Livré",
    "Available": "Disponible",
    "Pending": "En attente",
    "Needs attention": "Attention requise",
    "Blocked": "Bloqué",
    "Not run": "Non exécuté",
    "Unavailable": "Indisponible",
    "Read only": "Lecture seule",
    "Managed by platform": "Géré par la plateforme",
    "Protected": "Protégé",
    "Build-time asserted": "Vérifié lors du build",
    "One canonical company identity": "Une identité d’entreprise canonique",
    "These values are used as the single source for contracts, invoices, legal documents and VAT handling. Sensitive changes require a confirmed, audited backend workflow.": "Ces valeurs constituent la source unique des contrats, factures, documents juridiques et du traitement de la TVA. Toute modification sensible exige un processus backend confirmé et audité.",
    "Legal identity": "Identité juridique",
    "Legal name": "Dénomination sociale",
    "Legal form": "Forme juridique",
    "Created": "Créée le",
    "Registered office": "Siège social",
    "Address & fiscal calendar": "Adresse et calendrier fiscal",
    "Registered address": "Adresse du siège",
    "Domiciliation": "Domiciliation",
    "Country": "Pays",
    "France": "France",
    "Financial year end": "Clôture de l’exercice",
    "Consistency check": "Contrôle de cohérence",
    "Where the identity is consumed": "Utilisation de cette identité",
    "Consistency check pending": "Contrôle de cohérence en attente",
    "The settings service has not returned a cross-surface identity check yet. CAMBRA will surface drift rather than silently creating another identity.": "Le service de paramètres n’a pas encore renvoyé le contrôle d’identité inter-surfaces. CAMBRA signalera tout écart au lieu de créer silencieusement une autre identité.",
    "Contracts, invoices and public legal identity are checked against the canonical runtime/build sources.": "Les contrats, factures et l’identité juridique publique sont vérifiés par rapport aux sources canoniques du runtime et du build.",
    "Private fiscal configuration": "Configuration fiscale privée",
    "Admin-only fiscal profile": "Profil fiscal réservé aux administrateurs",
    "Corporate tax": "Impôt sur les sociétés",
    "Internal fiscal reference is protected and never exposed on public surfaces.": "La référence fiscale interne est protégée et n’est jamais exposée sur les surfaces publiques.",
    "VAT filing": "Déclaration de TVA",
    "Private fiscal profile not available": "Profil fiscal privé indisponible",
    "This value is intentionally not inferred from public pages. Configure it only through the protected deployment identity workflow.": "Cette valeur n’est volontairement pas déduite des pages publiques. Configurez-la uniquement via le processus protégé d’identité de déploiement.",
    "Internal access is distinct from merchant accounts": "Les accès internes sont distincts des comptes marchands",
    "CAMBRA only exposes supported roles and security facts. It does not invent MFA, session revoke or granular permissions where the canonical authorization layer does not provide them.": "CAMBRA n’affiche que les rôles et éléments de sécurité réellement pris en charge. Il n’invente ni MFA, ni révocation de session, ni autorisations granulaires absentes de la couche d’autorisation canonique.",
    "Internal users": "Utilisateurs internes",
    "Access directory": "Répertoire des accès",
    "Open users": "Ouvrir les utilisateurs",
    "User": "Utilisateur",
    "Role": "Rôle",
    "Status": "État",
    "Last access": "Dernier accès",
    "Security": "Sécurité",
    "Not available": "Indisponible",
    "Internal access directory is not configured": "Le répertoire des accès internes n’est pas configuré",
    "The current canonical user model supports Admin and User roles. Merchant accounts remain managed separately and are not presented as Founder/Admin staff.": "Le modèle utilisateur canonique actuel prend en charge les rôles Admin et Utilisateur. Les comptes marchands restent gérés séparément et ne sont pas présentés comme membres de l’équipe Founder/Admin.",
    "Authorization": "Autorisation",
    "Supported role model": "Modèle de rôles pris en charge",
    "Current roles": "Rôles actuels",
    "Permission policy": "Politique d’autorisation",
    "Role-scoped in canonical authorization": "Portée par rôle dans l’autorisation canonique",
    "Invitations, suspension, session revocation and additional role scopes become editable here only when their canonical backend workflows are available and auditable.": "Les invitations, suspensions, révocations de session et portées de rôle supplémentaires ne seront modifiables ici que lorsque leurs processus backend canoniques seront disponibles et auditables.",
    "Language, market and currency are independent": "La langue, le marché et la devise sont indépendants",
    "Changing the admin language updates this Founder/Admin interface. It does not change the market context, original money values or currency of underlying records.": "Changer la langue d’administration met à jour cette interface Founder/Admin. Cela ne modifie ni le contexte de marché, ni les montants d’origine, ni la devise des enregistrements.",
    "Display preferences": "Préférences d’affichage",
    "Admin language": "Langue d’administration",
    "Default market context": "Contexte de marché par défaut",
    "No default market": "Aucun marché par défaut",
    "Display currency": "Devise d’affichage",
    "Timezone": "Fuseau horaire",
    "Automatic": "Automatique",
    "Date format": "Format de date",
    "Number format": "Format des nombres",
    "Currency format": "Format monétaire",
    "First day of week": "Premier jour de la semaine",
    "Locale default": "Valeur locale par défaut",
    "Symbol before amount": "Symbole avant le montant",
    "Symbol after amount": "Symbole après le montant",
    "ISO code after amount": "Code ISO après le montant",
    "Monday": "Lundi",
    "Sunday": "Dimanche",
    "Saturday": "Samedi",
    "Saving…": "Enregistrement…",
    "Save preferences": "Enregistrer les préférences",
    "Saved ✓": "Enregistré ✓",
    "Could not save language and region preferences": "Impossible d’enregistrer les préférences de langue et de région",
    "Formats": "Formats",
    "Locale-aware formatting": "Mise en forme adaptée à la langue",
    "Timestamps are rendered in the selected timezone when source data includes a timestamp. Monetary conversions, when supported, retain original currency and show separate FX evidence.": "Les horodatages utilisent le fuseau sélectionné lorsque la source en fournit un. Les conversions monétaires prises en charge conservent la devise d’origine et affichent une preuve de change distincte.",
    "Interrupt only when it matters": "N’interrompre que lorsque c’est nécessaire",
    "Critical safety, security and financial escalation follows mandatory governance. Settings cannot silently disable it.": "Les escalades critiques de sûreté, sécurité et finance suivent une gouvernance obligatoire. Les paramètres ne peuvent pas les désactiver silencieusement.",
    "Delivery policy": "Politique de livraison",
    "Supported notification channels": "Canaux de notification pris en charge",
    "Open System health": "Ouvrir l’état du système",
    "Founder/Admin in-app": "Dans l’application Founder/Admin",
    "Mandatory HIGH/CRITICAL escalation": "Escalade HIGH/CRITICAL obligatoire",
    "Configured delivery policy": "Politique de livraison configurée",
    "In-app": "Dans l’application",
    "Email · HIGH/CRITICAL": "E-mail · HIGH/CRITICAL",
    "No general preference controls are configured": "Aucun réglage général de préférence n’est configuré",
    "The current production alert channel is governed by incident delivery policy. High and critical delivery evidence stays in System rather than being duplicated here.": "Le canal d’alerte de production actuel est régi par la politique de livraison des incidents. Les preuves de livraison haute et critique restent dans Système au lieu d’être dupliquées ici.",
    "Escalation": "Escalade",
    "Current safeguards": "Protections actuelles",
    "Critical incidents": "Incidents critiques",
    "Mandatory email": "E-mail obligatoire",
    "High / critical recipient": "Destinataire haute / critique",
    "Configuration required": "Configuration requise",
    "Quiet hours": "Heures calmes",
    "Digest, in-app-only and category preferences will appear only after their canonical policy store is available. No unsupported channel is shown as enabled.": "Les préférences de synthèse, d’application seule et par catégorie apparaîtront lorsque leur registre de politique canonique sera disponible. Aucun canal non pris en charge n’est présenté comme actif.",
    "Connection configuration, not operational monitoring": "Configuration des connexions, pas supervision opérationnelle",
    "Secret values never render here. CAMBRA displays only configuration state, scope and safe metadata; logs and replays remain in System.": "Les secrets ne sont jamais affichés ici. CAMBRA montre uniquement l’état de configuration, la portée et les métadonnées sûres ; journaux et relances restent dans Système.",
    "Connected services": "Services connectés",
    "Integration configuration": "Configuration des intégrations",
    "Open integrations": "Ouvrir les intégrations",
    "Account identity not exposed": "Identité du compte non exposée",
    "Scopes": "Portées",
    "Configuration": "Configuration",
    "Last changed": "Dernière modification",
    "Open system details": "Ouvrir les détails système",
    "No founder integration summary is available": "Aucun résumé d’intégration Founder n’est disponible",
    "Use the existing Integrations and API & Webhooks pages for supported connections. This page will never fall back to a direct credential query.": "Utilisez les pages Intégrations et API & Webhooks existantes pour les connexions prises en charge. Cette page ne recourra jamais à une requête directe des identifiants.",
    "API & Webhooks": "API et webhooks",
    "System health": "État du système",
    "Founder Control": "Contrôle Founder",
    "Hard caps remain authoritative": "Les plafonds stricts restent la référence",
    "Settings explains the approved economic policy. Changes to hard limits stay in Founder Control because they require impact preview, explicit confirmation and audit evidence.": "Les paramètres expliquent la politique économique approuvée. Les modifications des limites strictes restent dans Contrôle Founder car elles exigent un aperçu d’impact, une confirmation explicite et une preuve d’audit.",
    "Economic policy": "Politique économique",
    "AI & paid operation budgets": "Budgets IA et opérations payantes",
    "Manage hard limits": "Gérer les limites strictes",
    "All paid operations · daily": "Toutes les opérations payantes · quotidien",
    "All paid operations · monthly": "Toutes les opérations payantes · mensuel",
    "monthly": "mensuel",
    "used": "utilisé",
    "No valid active cap": "Aucun plafond actif valide",
    "No active budget summary": "Aucun résumé de budget actif",
    "Paid autonomous execution remains fail-closed until an approved canonical budget is present.": "L’exécution autonome payante reste bloquée par défaut tant qu’un budget canonique approuvé n’est pas présent.",
    "Routing policy": "Politique de routage",
    "AI workload policy": "Politique de charge IA",
    "Default tier": "Niveau par défaut",
    "Task-specific policy": "Politique propre à la tâche",
    "Fallback / retry": "Repli / nouvelle tentative",
    "Managed by canonical task policy": "Géré par la politique canonique de la tâche",
    "Paid enrichment": "Enrichissement payant",
    "Authorization not derived from budget": "Autorisation non déduite du budget",
    "Controlled by Discovery per-run budget and global hard caps": "Contrôlé par le budget de chaque exécution Discovery et les plafonds globaux",
    "Governance is protected by policy": "La gouvernance est protégée par politique",
    "Retention is versioned and limited to authorized deletion or anonymization paths. This screen does not allow ad-hoc destruction of legally required evidence.": "La conservation est versionnée et limitée aux voies autorisées de suppression ou d’anonymisation. Cet écran ne permet pas la destruction ponctuelle de preuves légalement requises.",
    "Retention": "Conservation",
    "Configured lifecycle policies": "Politiques de cycle de vie configurées",
    "days": "jours",
    "Aggregated / policy-bound": "Agrégé / encadré par politique",
    "Authorized lifecycle only": "Cycle de vie autorisé uniquement",
    "Retention policies are managed centrally": "Les politiques de conservation sont gérées centralement",
    "The canonical retention engine keeps the active policy registry. Policy changes require an authorized code and governance change, not a casual UI override.": "Le moteur canonique de conservation tient le registre actif. Toute modification exige un changement de code et de gouvernance autorisé, pas un simple réglage d’interface.",
    "Privacy safeguards": "Protections de la vie privée",
    "Tenant and intelligence boundaries": "Limites tenant et intelligence",
    "Merchant data requests": "Demandes de données marchands",
    "Authorized workflow required": "Processus autorisé requis",
    "Cross-tenant intelligence": "Intelligence inter-tenants",
    "Privacy-safe aggregation only": "Agrégation respectueuse de la vie privée uniquement",
    "Minimum cohort": "Cohorte minimale",
    "Settings exposes protection status and links to governed workflows; it cannot weaken tenant isolation, legal holds or minimum cohort rules.": "Les paramètres affichent l’état des protections et renvoient vers des processus gouvernés ; ils ne peuvent affaiblir l’isolation des tenants, les conservations légales ni la cohorte minimale.",
    "Advanced is deliberately read-only by default": "La section Avancé est volontairement en lecture seule",
    "Deployment identity and operational diagnostics remain protected. Settings is not an environment-variable editor and cannot bypass activation gates.": "L’identité de déploiement et les diagnostics opérationnels restent protégés. Les paramètres ne sont pas un éditeur de variables d’environnement et ne peuvent contourner les gates d’activation.",
    "Runtime identity": "Identité du runtime",
    "Deployment evidence": "Preuve de déploiement",
    "Environment": "Environnement",
    "Application / project ID": "ID application / projet",
    "Release version": "Version de publication",
    "Deployed Git SHA": "SHA Git déployé",
    "Source-tree identity": "Identité de l’arbre source",
    "Runtime": "Runtime",
    "Feature flags": "Feature flags",
    "Founder-visible feature configuration": "Configuration des fonctions visible par le Founder",
    "Merchant acquisition outbound": "Prospection marchande sortante",
    "Authorizes merchant acquisition only after canonical go-live gates.": "Autorise la prospection marchande uniquement après validation des gates canoniques de mise en production.",
    "Premium Outlook transport": "Transport Outlook premium",
    "Allows premium mailbox delivery through Outlook.": "Autorise l’envoi via des boîtes premium Outlook.",
    "Resend volume transport": "Transport de volume Resend",
    "Allows volume delivery through Resend.": "Autorise l’envoi en volume via Resend.",
    "Instantly transport": "Transport Instantly",
    "Allows commercial delivery through Instantly.": "Autorise l’envoi commercial via Instantly.",
    "Risk level": "Niveau de risque",
    "Redeploy required": "Redéploiement requis",
    "No redeploy required": "Aucun redéploiement requis",
    "depends on": "dépend de",
    "No Founder-editable flags": "Aucun flag modifiable par le Founder",
    "Only flags that have a safe, governed activation path are listed. Sensitive activation remains in the relevant operational control.": "Seuls les flags disposant d’un chemin d’activation sûr et gouverné sont listés. Les activations sensibles restent dans le contrôle opérationnel concerné.",
    "Developer": "Développeur",
    "Logs & workers": "Journaux et workers",
    "Release evidence": "Preuve de publication",
    "Founder / Admin": "Founder / Admin",
    "Settings": "Paramètres",
    "Configure CAMBRA’s identity, preferences and guarded policies. Operations, incidents, backups and emergency controls remain in their dedicated workspaces.": "Configurez l’identité, les préférences et les politiques protégées de CAMBRA. Les opérations, incidents, sauvegardes et contrôles d’urgence restent dans leurs espaces dédiés.",
    "Search settings": "Rechercher dans les paramètres",
    "No matching setting.": "Aucun paramètre correspondant.",
    "Could not load this setting": "Impossible de charger ce paramètre",
    "Settings could not be loaded": "Impossible de charger les paramètres",
    "Try again": "Réessayer",
  },
  es: {
    "Company": "Empresa",
    "Legal, fiscal and billing identity": "Identidad legal, fiscal y de facturación",
    "Users & Access": "Usuarios y acceso",
    "Internal access and permissions": "Accesos internos y permisos",
    "Language & Region": "Idioma y región",
    "Language, market, currency and time": "Idioma, mercado, moneda y hora",
    "Notifications": "Notificaciones",
    "What should interrupt the Founder": "Qué debe avisar al fundador",
    "Integrations": "Integraciones",
    "Connection configuration and status": "Configuración y estado de conexiones",
    "AI & Costs": "IA y costes",
    "Policies and hard economic limits": "Políticas y límites económicos estrictos",
    "Data & Privacy": "Datos y privacidad",
    "Retention and privacy safeguards": "Retención y protecciones de privacidad",
    "Developer / Advanced": "Desarrollador / Avanzado",
    "Read-only deployment configuration": "Configuración de despliegue de solo lectura",
    "Not configured": "No configurado",
    "Enabled": "Activado",
    "Disabled": "Desactivado",
    "Unknown": "Desconocido",
    "Configured ✓": "Configurado ✓",
    "Loading settings…": "Cargando ajustes…",
    "Pass": "Correcto",
    "Active": "Activo",
    "Connected": "Conectado",
    "Configured": "Configurado",
    "Healthy": "Operativo",
    "Ready": "Listo",
    "Delivered": "Entregado",
    "Available": "Disponible",
    "Pending": "Pendiente",
    "Needs attention": "Requiere atención",
    "Blocked": "Bloqueado",
    "Not run": "No ejecutado",
    "Unavailable": "No disponible",
    "Read only": "Solo lectura",
    "Managed by platform": "Gestionado por la plataforma",
    "Protected": "Protegido",
    "Build-time asserted": "Comprobado durante el build",
    "One canonical company identity": "Una identidad de empresa canónica",
    "These values are used as the single source for contracts, invoices, legal documents and VAT handling. Sensitive changes require a confirmed, audited backend workflow.": "Estos valores son la fuente única para contratos, facturas, documentos legales y gestión del IVA. Los cambios sensibles requieren un proceso backend confirmado y auditado.",
    "Legal identity": "Identidad legal",
    "Legal name": "Razón social",
    "Legal form": "Forma jurídica",
    "Created": "Creación",
    "Registered office": "Domicilio social",
    "Address & fiscal calendar": "Dirección y calendario fiscal",
    "Registered address": "Dirección registrada",
    "Domiciliation": "Domiciliación",
    "Country": "País",
    "France": "Francia",
    "Financial year end": "Cierre del ejercicio",
    "Consistency check": "Comprobación de coherencia",
    "Where the identity is consumed": "Dónde se usa esta identidad",
    "Consistency check pending": "Comprobación de coherencia pendiente",
    "The settings service has not returned a cross-surface identity check yet. CAMBRA will surface drift rather than silently creating another identity.": "El servicio de ajustes aún no ha devuelto la comprobación de identidad entre superficies. CAMBRA mostrará cualquier desviación en vez de crear silenciosamente otra identidad.",
    "Contracts, invoices and public legal identity are checked against the canonical runtime/build sources.": "Los contratos, facturas y la identidad legal pública se comprueban contra las fuentes canónicas de runtime y build.",
    "Private fiscal configuration": "Configuración fiscal privada",
    "Admin-only fiscal profile": "Perfil fiscal solo para administradores",
    "Corporate tax": "Impuesto de sociedades",
    "Internal fiscal reference is protected and never exposed on public surfaces.": "La referencia fiscal interna está protegida y nunca se expone en superficies públicas.",
    "VAT filing": "Declaración de IVA",
    "Private fiscal profile not available": "Perfil fiscal privado no disponible",
    "This value is intentionally not inferred from public pages. Configure it only through the protected deployment identity workflow.": "Este valor no se deduce intencionadamente de páginas públicas. Configúralo únicamente mediante el proceso protegido de identidad de despliegue.",
    "Internal access is distinct from merchant accounts": "El acceso interno es distinto de las cuentas de merchants",
    "CAMBRA only exposes supported roles and security facts. It does not invent MFA, session revoke or granular permissions where the canonical authorization layer does not provide them.": "CAMBRA solo muestra roles y datos de seguridad compatibles. No inventa MFA, revocación de sesiones ni permisos granulares cuando la autorización canónica no los ofrece.",
    "Internal users": "Usuarios internos",
    "Access directory": "Directorio de accesos",
    "Open users": "Abrir usuarios",
    "User": "Usuario",
    "Role": "Rol",
    "Status": "Estado",
    "Last access": "Último acceso",
    "Security": "Seguridad",
    "Not available": "No disponible",
    "Internal access directory is not configured": "El directorio de accesos internos no está configurado",
    "The current canonical user model supports Admin and User roles. Merchant accounts remain managed separately and are not presented as Founder/Admin staff.": "El modelo canónico actual admite los roles Admin y Usuario. Las cuentas de merchants se gestionan por separado y no se presentan como personal Founder/Admin.",
    "Authorization": "Autorización",
    "Supported role model": "Modelo de roles compatible",
    "Current roles": "Roles actuales",
    "Permission policy": "Política de permisos",
    "Role-scoped in canonical authorization": "Limitado por rol en la autorización canónica",
    "Invitations, suspension, session revocation and additional role scopes become editable here only when their canonical backend workflows are available and auditable.": "Las invitaciones, suspensiones, revocaciones de sesión y nuevos ámbitos de rol solo podrán editarse aquí cuando sus procesos backend canónicos sean auditables y estén disponibles.",
    "Language, market and currency are independent": "El idioma, el mercado y la moneda son independientes",
    "Changing the admin language updates this Founder/Admin interface. It does not change the market context, original money values or currency of underlying records.": "Cambiar el idioma de administración actualiza esta interfaz Founder/Admin. No modifica el mercado, los importes originales ni la moneda de los registros.",
    "Display preferences": "Preferencias de visualización",
    "Admin language": "Idioma de administración",
    "Default market context": "Contexto de mercado predeterminado",
    "No default market": "Sin mercado predeterminado",
    "Display currency": "Moneda de visualización",
    "Timezone": "Zona horaria",
    "Automatic": "Automática",
    "Date format": "Formato de fecha",
    "Number format": "Formato numérico",
    "Currency format": "Formato de moneda",
    "First day of week": "Primer día de la semana",
    "Locale default": "Predeterminado del idioma",
    "Symbol before amount": "Símbolo antes del importe",
    "Symbol after amount": "Símbolo después del importe",
    "ISO code after amount": "Código ISO después del importe",
    "Monday": "Lunes",
    "Sunday": "Domingo",
    "Saturday": "Sábado",
    "Saving…": "Guardando…",
    "Save preferences": "Guardar preferencias",
    "Saved ✓": "Guardado ✓",
    "Could not save language and region preferences": "No se pudieron guardar las preferencias de idioma y región",
    "Formats": "Formatos",
    "Locale-aware formatting": "Formato adaptado al idioma",
    "Timestamps are rendered in the selected timezone when source data includes a timestamp. Monetary conversions, when supported, retain original currency and show separate FX evidence.": "Las fechas y horas usan la zona seleccionada cuando el origen incluye una marca temporal. Las conversiones monetarias compatibles conservan la moneda original y muestran pruebas FX por separado.",
    "Interrupt only when it matters": "Interrumpir solo cuando importa",
    "Critical safety, security and financial escalation follows mandatory governance. Settings cannot silently disable it.": "Las escaladas críticas de seguridad y finanzas siguen una gobernanza obligatoria. Ajustes no puede desactivarlas silenciosamente.",
    "Delivery policy": "Política de entrega",
    "Supported notification channels": "Canales de notificación compatibles",
    "Open System health": "Abrir estado del sistema",
    "Founder/Admin in-app": "Dentro de Founder/Admin",
    "Mandatory HIGH/CRITICAL escalation": "Escalada HIGH/CRITICAL obligatoria",
    "Configured delivery policy": "Política de entrega configurada",
    "In-app": "En la aplicación",
    "Email · HIGH/CRITICAL": "Email · HIGH/CRITICAL",
    "No general preference controls are configured": "No hay controles generales de preferencias configurados",
    "The current production alert channel is governed by incident delivery policy. High and critical delivery evidence stays in System rather than being duplicated here.": "El canal actual de alertas de producción se rige por la política de entrega de incidentes. Las pruebas de entrega altas y críticas permanecen en Sistema y no se duplican aquí.",
    "Escalation": "Escalada",
    "Current safeguards": "Protecciones actuales",
    "Critical incidents": "Incidentes críticos",
    "Mandatory email": "Email obligatorio",
    "High / critical recipient": "Destinatario alto / crítico",
    "Configuration required": "Configuración requerida",
    "Quiet hours": "Horas de descanso",
    "Digest, in-app-only and category preferences will appear only after their canonical policy store is available. No unsupported channel is shown as enabled.": "Las preferencias de resumen, solo en la app y por categoría aparecerán cuando exista su repositorio canónico de políticas. Ningún canal no compatible se muestra como activo.",
    "Connection configuration, not operational monitoring": "Configuración de conexiones, no monitorización operativa",
    "Secret values never render here. CAMBRA displays only configuration state, scope and safe metadata; logs and replays remain in System.": "Los secretos nunca se muestran aquí. CAMBRA solo enseña el estado de configuración, los ámbitos y metadatos seguros; los logs y reintentos permanecen en Sistema.",
    "Connected services": "Servicios conectados",
    "Integration configuration": "Configuración de integraciones",
    "Open integrations": "Abrir integraciones",
    "Account identity not exposed": "Identidad de cuenta no expuesta",
    "Scopes": "Ámbitos",
    "Configuration": "Configuración",
    "Last changed": "Último cambio",
    "Open system details": "Abrir detalles del sistema",
    "No founder integration summary is available": "No hay resumen de integraciones Founder disponible",
    "Use the existing Integrations and API & Webhooks pages for supported connections. This page will never fall back to a direct credential query.": "Usa las páginas existentes Integraciones y API y webhooks para las conexiones compatibles. Esta pantalla nunca consultará credenciales directamente.",
    "API & Webhooks": "API y webhooks",
    "System health": "Estado del sistema",
    "Founder Control": "Control Founder",
    "Hard caps remain authoritative": "Los límites estrictos siguen siendo la autoridad",
    "Settings explains the approved economic policy. Changes to hard limits stay in Founder Control because they require impact preview, explicit confirmation and audit evidence.": "Ajustes explica la política económica aprobada. Los cambios de límites estrictos se mantienen en Control Founder porque requieren vista previa del impacto, confirmación explícita y pruebas de auditoría.",
    "Economic policy": "Política económica",
    "AI & paid operation budgets": "Presupuestos de IA y operaciones de pago",
    "Manage hard limits": "Gestionar límites estrictos",
    "All paid operations · daily": "Todas las operaciones de pago · diario",
    "All paid operations · monthly": "Todas las operaciones de pago · mensual",
    "monthly": "mensual",
    "used": "usado",
    "No valid active cap": "Sin límite activo válido",
    "No active budget summary": "Sin resumen de presupuesto activo",
    "Paid autonomous execution remains fail-closed until an approved canonical budget is present.": "La ejecución autónoma de pago permanece bloqueada por defecto hasta que exista un presupuesto canónico aprobado.",
    "Routing policy": "Política de enrutamiento",
    "AI workload policy": "Política de carga de IA",
    "Default tier": "Nivel predeterminado",
    "Task-specific policy": "Política específica de la tarea",
    "Fallback / retry": "Alternativa / reintento",
    "Managed by canonical task policy": "Gestionado por la política canónica de la tarea",
    "Paid enrichment": "Enriquecimiento de pago",
    "Authorization not derived from budget": "La autorización no se deriva del presupuesto",
    "Controlled by Discovery per-run budget and global hard caps": "Controlado por el presupuesto de cada run de Discovery y los límites globales",
    "Governance is protected by policy": "La gobernanza está protegida por políticas",
    "Retention is versioned and limited to authorized deletion or anonymization paths. This screen does not allow ad-hoc destruction of legally required evidence.": "La retención está versionada y limitada a procesos autorizados de borrado o anonimización. Esta pantalla no permite destruir de forma puntual pruebas exigidas legalmente.",
    "Retention": "Retención",
    "Configured lifecycle policies": "Políticas de ciclo de vida configuradas",
    "days": "días",
    "Aggregated / policy-bound": "Agregado / limitado por política",
    "Authorized lifecycle only": "Solo ciclo de vida autorizado",
    "Retention policies are managed centrally": "Las políticas de retención se gestionan de forma centralizada",
    "The canonical retention engine keeps the active policy registry. Policy changes require an authorized code and governance change, not a casual UI override.": "El motor canónico de retención mantiene el registro activo. Cambiar una política requiere un cambio autorizado de código y gobernanza, no un ajuste casual de la interfaz.",
    "Privacy safeguards": "Protecciones de privacidad",
    "Tenant and intelligence boundaries": "Límites de tenant e inteligencia",
    "Merchant data requests": "Solicitudes de datos de merchants",
    "Authorized workflow required": "Proceso autorizado obligatorio",
    "Cross-tenant intelligence": "Inteligencia entre tenants",
    "Privacy-safe aggregation only": "Solo agregación respetuosa con la privacidad",
    "Minimum cohort": "Cohorte mínima",
    "Settings exposes protection status and links to governed workflows; it cannot weaken tenant isolation, legal holds or minimum cohort rules.": "Ajustes muestra el estado de las protecciones y enlaza procesos gobernados; no puede debilitar el aislamiento entre tenants, las retenciones legales ni las reglas de cohorte mínima.",
    "Advanced is deliberately read-only by default": "Avanzado es intencionadamente de solo lectura",
    "Deployment identity and operational diagnostics remain protected. Settings is not an environment-variable editor and cannot bypass activation gates.": "La identidad del despliegue y los diagnósticos operativos permanecen protegidos. Ajustes no es un editor de variables de entorno ni puede saltarse los gates de activación.",
    "Runtime identity": "Identidad del runtime",
    "Deployment evidence": "Prueba del despliegue",
    "Environment": "Entorno",
    "Application / project ID": "ID de aplicación / proyecto",
    "Release version": "Versión de release",
    "Deployed Git SHA": "SHA de Git desplegado",
    "Source-tree identity": "Identidad del árbol de código",
    "Runtime": "Runtime",
    "Feature flags": "Feature flags",
    "Founder-visible feature configuration": "Configuración de funciones visible para Founder",
    "Merchant acquisition outbound": "Outbound de adquisición de merchants",
    "Authorizes merchant acquisition only after canonical go-live gates.": "Autoriza la adquisición de merchants solo tras superar los gates canónicos de puesta en producción.",
    "Premium Outlook transport": "Transporte premium de Outlook",
    "Allows premium mailbox delivery through Outlook.": "Permite el envío mediante buzones premium de Outlook.",
    "Resend volume transport": "Transporte de volumen de Resend",
    "Allows volume delivery through Resend.": "Permite el envío de volumen mediante Resend.",
    "Instantly transport": "Transporte de Instantly",
    "Allows commercial delivery through Instantly.": "Permite el envío comercial mediante Instantly.",
    "Risk level": "Nivel de riesgo",
    "Redeploy required": "Requiere redespliegue",
    "No redeploy required": "No requiere redespliegue",
    "depends on": "depende de",
    "No Founder-editable flags": "No hay flags editables por Founder",
    "Only flags that have a safe, governed activation path are listed. Sensitive activation remains in the relevant operational control.": "Solo se muestran flags con un proceso de activación seguro y gobernado. La activación sensible permanece en el control operativo correspondiente.",
    "Developer": "Desarrollador",
    "Logs & workers": "Logs y workers",
    "Release evidence": "Pruebas de release",
    "Founder / Admin": "Founder / Admin",
    "Settings": "Ajustes",
    "Configure CAMBRA’s identity, preferences and guarded policies. Operations, incidents, backups and emergency controls remain in their dedicated workspaces.": "Configura la identidad, preferencias y políticas protegidas de CAMBRA. Las operaciones, incidentes, copias de seguridad y controles de emergencia siguen en sus espacios específicos.",
    "Search settings": "Buscar ajustes",
    "No matching setting.": "No hay ajustes coincidentes.",
    "Could not load this setting": "No se pudo cargar este ajuste",
    "Settings could not be loaded": "No se pudieron cargar los ajustes",
    "Try again": "Reintentar",
  },
};

function useSettingsCopy() {
  const { lang } = useTranslation();
  return useCallback((english) => SETTINGS_COPY[lang]?.[english] || english, [lang]);
}

function unwrap(response) {
  return response?.data || response || {};
}

function displayValue(value, fallback = "Not configured") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  return String(value);
}

function formatMoney(minor, currency = "EUR", lang = "en") {
  const amount = Number(minor);
  if (!Number.isFinite(amount)) return "—";
  const locale = { en: "en-IE", fr: "fr-FR", es: "es-ES" }[lang] || "en-IE";
  try { return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100); }
  catch { return `${(amount / 100).toFixed(2)} ${currency}`; }
}

function Tone({ status }) {
  const ui = useSettingsCopy();
  const normalized = String(status || "").toUpperCase();
  const good = ["ACTIVE", "CONNECTED", "CONFIGURED", "PASS", "HEALTHY", "READY", "ENABLED", "DELIVERED", "AVAILABLE", "PROTECTED", "BUILD_TIME_ASSERTED"].some((value) => normalized === value || normalized.startsWith(`${value}_`));
  const warn = ["PENDING", "NEEDS_ATTENTION", "BLOCKED", "NOT_CONFIGURED", "NOT_RUN", "UNAVAILABLE", "READ_ONLY", "CONFIGURATION_REQUIRED"].some((value) => normalized === value || normalized.startsWith(`${value}_`));
  const statusCopy = [
    ["PASS", "Pass"], ["ACTIVE", "Active"], ["CONNECTED", "Connected"],
    ["CONFIGURED", "Configured"], ["HEALTHY", "Healthy"], ["READY", "Ready"],
    ["ENABLED", "Enabled"], ["DELIVERED", "Delivered"], ["AVAILABLE", "Available"],
    ["PENDING", "Pending"], ["NEEDS_ATTENTION", "Needs attention"], ["BLOCKED", "Blocked"],
    ["NOT_CONFIGURED", "Not configured"], ["NOT_RUN", "Not run"], ["UNAVAILABLE", "Unavailable"],
    ["READ_ONLY", "Read only"], ["CONFIGURATION_REQUIRED", "Configuration required"],
    ["PLATFORM_MANAGED", "Managed by platform"], ["PROTECTED", "Protected"],
    ["BUILD_TIME_ASSERTED", "Build-time asserted"], ["DISABLED", "Disabled"],
  ].find(([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}_`));
  const readable = statusCopy?.[1] || normalized.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  const classes = good
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : warn
      ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-border/60 bg-secondary/50 text-muted-foreground";
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[.12em] ${classes}`}>{ui(readable || "Unknown")}</span>;
}

function LoadingState() {
  const ui = useSettingsCopy();
  return <div className="flex min-h-[330px] items-center justify-center"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" />{ui("Loading settings…")}</div></div>;
}

function EmptyState({ title, body }) {
  const ui = useSettingsCopy();
  return <div className="rounded-2xl border border-dashed border-border/70 bg-card p-7 text-center"><p className="text-sm font-black">{ui(title)}</p><p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-muted-foreground">{ui(body)}</p></div>;
}

function ValueRow({ label, value, detail = null, sensitive = false }) {
  const ui = useSettingsCopy();
  const renderedValue = sensitive ? ui("Configured ✓") : ui(displayValue(value, ui("Not configured")));
  return <div className="grid gap-1 border-b border-border/45 py-3 last:border-0 sm:grid-cols-[minmax(9rem,.75fr)_minmax(0,1.25fr)] sm:gap-4">
    <p className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">{ui(label)}</p>
    <div className="min-w-0"><p className="break-words text-sm font-semibold">{renderedValue}</p>{detail && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{ui(detail)}</p>}</div>
  </div>;
}

function SurfaceCard({ title, eyebrow, icon: Icon, children, action = null }) {
  const ui = useSettingsCopy();
  return <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-secondary/40"><Icon size={15} /></div><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground">{ui(eyebrow)}</p><h2 className="mt-1 text-base font-black tracking-tight">{ui(title)}</h2></div></div>{action}</div><div className="mt-4">{children}</div></section>;
}

function DeepLink({ to, children }) {
  const ui = useSettingsCopy();
  return <Link to={to} className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-3 py-2 text-[11px] font-bold transition-colors hover:bg-secondary"><span>{ui(children)}</span><ChevronRight size={12} /></Link>;
}

function CompanySection({ settings }) {
  const ui = useSettingsCopy();
  const company = settings.canonical_identity || {};
  const consistency = settings.consistency_check || {};
  const consistencyRows = Object.entries(consistency).filter(([key]) => key !== "evidence");
  const internalFiscal = settings.internal_fiscal_profile || null;
  const formattedSiret = /^\d{14}$/.test(String(company.siret || "")) ? `${String(company.siret).slice(0, 9)} ${String(company.siret).slice(9)}` : company.siret;
  return <div className="space-y-4">
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.045] p-4"><p className="text-sm font-black">{ui("One canonical company identity")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("These values are used as the single source for contracts, invoices, legal documents and VAT handling. Sensitive changes require a confirmed, audited backend workflow.")}</p></div>
    <div className="grid gap-4 xl:grid-cols-2"><SurfaceCard eyebrow="Legal identity" title="CAMBRA Global SASU" icon={Building2}><ValueRow label="Legal name" value={company.legal_name} /><ValueRow label="Legal form" value={company.legal_form} /><ValueRow label="SIREN" value={company.siren} /><ValueRow label="SIRET" value={formattedSiret} /><ValueRow label="VAT" value={company.vat_id || company.vat} /><ValueRow label="APE / NAF" value={company.activity_code || company.ape_naf} detail={company.activity_label} /><ValueRow label="Created" value={company.creation_date} /></SurfaceCard>
      <SurfaceCard eyebrow="Registered office" title="Address & fiscal calendar" icon={BookOpen}><ValueRow label="Registered address" value={company.registered_address} /><ValueRow label="Domiciliation" value={company.domiciliation_details} /><ValueRow label="Country" value={company.country || "France"} /><ValueRow label="Financial year end" value={company.fiscal_year_end} /></SurfaceCard></div>
    <SurfaceCard eyebrow="Consistency check" title="Where the identity is consumed" icon={CheckCircle2}>{consistencyRows.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{consistencyRows.map(([key, status]) => <div key={key} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-3"><span className="text-xs font-bold capitalize">{ui(key.replaceAll("_", " "))}</span><Tone status={typeof status === "object" ? status.status : status} /></div>)}</div> : <EmptyState title="Consistency check pending" body="The settings service has not returned a cross-surface identity check yet. CAMBRA will surface drift rather than silently creating another identity." />}{consistency.evidence && <p className="mt-4 text-[11px] text-muted-foreground">{ui("Contracts, invoices and public legal identity are checked against the canonical runtime/build sources.")}</p>}</SurfaceCard>
    <SurfaceCard eyebrow="Private fiscal configuration" title="Admin-only fiscal profile" icon={ShieldCheck}>{internalFiscal ? <div className="grid gap-3 md:grid-cols-2"><ValueRow label="Corporate tax" value={internalFiscal.corporate_income_tax?.regime} detail="Internal fiscal reference is protected and never exposed on public surfaces." /><ValueRow label="VAT filing" value={internalFiscal.vat?.regime} detail={internalFiscal.vat?.ca3_frequency} /><ValueRow label="CFE" value={internalFiscal.cfe?.rof ? "Configured ✓" : "Not configured"} /><ValueRow label="CVAE / RCM" value={internalFiscal.cvae?.rof && internalFiscal.rcm?.rof ? "Configured ✓" : "Not configured"} /></div> : <EmptyState title="Private fiscal profile not available" body="This value is intentionally not inferred from public pages. Configure it only through the protected deployment identity workflow." />}</SurfaceCard>
  </div>;
}

function UsersSection({ settings }) {
  const ui = useSettingsCopy();
  const access = settings || {};
  const users = Array.isArray(access.users) ? access.users : [];
  return <div className="space-y-4"><div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.045] p-4"><p className="text-sm font-black">{ui("Internal access is distinct from merchant accounts")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("CAMBRA only exposes supported roles and security facts. It does not invent MFA, session revoke or granular permissions where the canonical authorization layer does not provide them.")}</p></div><SurfaceCard eyebrow="Internal users" title="Access directory" icon={Users}>{users.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="border-b text-[9px] font-black uppercase tracking-[.13em] text-muted-foreground"><tr><th className="p-2">{ui("User")}</th><th className="p-2">{ui("Role")}</th><th className="p-2">{ui("Status")}</th><th className="p-2">{ui("Last access")}</th><th className="p-2">{ui("Security")}</th></tr></thead><tbody>{users.map((user) => <tr key={user.id || user.email} className="border-b border-border/40 last:border-0"><td className="p-2"><p className="text-xs font-bold">{displayValue(user.name || user.full_name || user.email)}</p><p className="text-[10px] text-muted-foreground">{user.email}</p></td><td className="p-2 text-xs">{ui(displayValue(user.role))}</td><td className="p-2"><Tone status={user.status || "ACTIVE"} /></td><td className="p-2 text-xs text-muted-foreground">{ui(displayValue(user.last_access, "Not available"))}</td><td className="p-2 text-xs text-muted-foreground">{String(user.mfa_status || "").startsWith("PLATFORM_MANAGED") ? ui("Managed by platform") : ui(displayValue(user.mfa_status, "Not available"))}</td></tr>)}</tbody></table></div> : <EmptyState title="Internal access directory is not configured" body="The current canonical user model supports Admin and User roles. Merchant accounts remain managed separately and are not presented as Founder/Admin staff." />}</SurfaceCard><SurfaceCard eyebrow="Authorization" title="Supported role model" icon={ShieldCheck}><ValueRow label="Current roles" value={(access.internal_roles || []).map(role => ui(role.label))} /><ValueRow label="Permission policy" value={ui(access.truth_boundary || "Role-scoped in canonical authorization")} /><p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{ui("Invitations, suspension, session revocation and additional role scopes become editable here only when their canonical backend workflows are available and auditable.")}</p></SurfaceCard></div>;
}

function LanguageSection({ settings, lang, setLang }) {
  const ui = useSettingsCopy();
  const [savedCurrent, setSavedCurrent] = useState(null);
  const preference = savedCurrent || settings.current || {};
  const preferenceDraft = useCallback(() => ({
    language: preference.language || lang || "en",
    market_code: preference.market_code || "",
    currency: preference.currency || "EUR",
    timezone: preference.timezone_mode === "automatic" ? "" : (preference.timezone || ""),
    date_format: preference.date_format || "locale_default",
    number_format: preference.number_format || "locale_default",
    currency_format: preference.currency_format || "locale_default",
    first_day_of_week: preference.first_day_of_week ?? "",
  }), [lang, preference.currency, preference.currency_format, preference.date_format, preference.first_day_of_week, preference.language, preference.market_code, preference.number_format, preference.timezone, preference.timezone_mode]);
  const [draft, setDraft] = useState(preferenceDraft);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const markets = Array.isArray(settings.markets) ? settings.markets : [];
  const currencies = [...new Set([...(Array.isArray(settings.currencies) ? settings.currencies : []), draft.currency].filter(Boolean))].sort();
  const timezones = [...new Set([...(Array.isArray(settings.timezones) ? settings.timezones : []), draft.timezone].filter(Boolean))].sort();
  const marketName = useMemo(() => {
    try { return new Intl.DisplayNames([{ en:"en-GB", fr:"fr-FR", es:"es-ES" }[lang] || "en-GB"], { type:"region" }); }
    catch { return null; }
  }, [lang]);
  useEffect(() => setDraft(preferenceDraft()), [preferenceDraft]);
  const save = async () => {
    setSaving(true); setResult(null);
    try {
      const persistedPreference = {
        language: draft.language,
        locale: LANGUAGE_OPTIONS.find((item) => item.code === draft.language)?.locale || "en-GB",
        market_code: draft.market_code || null,
        currency: draft.currency,
        timezone: draft.timezone || "UTC",
        timezone_mode: draft.timezone ? "explicit" : "automatic",
        date_format: draft.date_format,
        number_format: draft.number_format,
        currency_format: draft.currency_format,
        first_day_of_week: draft.first_day_of_week === "" ? null : Number(draft.first_day_of_week),
      };
      const response = unwrap(await base44.functions.invoke("founderOSCommand", {
        action: "save_admin_locale_preference",
        command_key:`settings-locale:${Date.now()}`,
        preference: persistedPreference,
      }));
      if (response?.ok === false) throw new Error("save_failed");
      setSavedCurrent(persistedPreference);
      setLang(draft.language);
      setResult({ ok:true, message:"Saved ✓" });
    } catch { setResult({ ok:false, message:"Could not save language and region preferences" }); }
    finally { setSaving(false); }
  };
  return <div className="space-y-4">
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.045] p-4"><p className="text-sm font-black">{ui("Language, market and currency are independent")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("Changing the admin language updates this Founder/Admin interface. It does not change the market context, original money values or currency of underlying records.")}</p></div>
    <SurfaceCard eyebrow="Display preferences" title="Language & Region" icon={Globe2}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Admin language"><select value={draft.language} onChange={(event) => setDraft((value) => ({ ...value, language: event.target.value }))} className="setting-input">{LANGUAGE_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></Field>
        <Field label="Default market context"><select value={draft.market_code} onChange={(event) => setDraft((value) => ({ ...value, market_code: event.target.value }))} className="setting-input"><option value="">{ui("No default market")}</option>{markets.map((market) => <option key={market.market_code} value={market.market_code}>{`${marketName?.of(market.market_code) || market.market_code} · ${market.market_code}`}</option>)}</select></Field>
        <Field label="Display currency"><select value={draft.currency} onChange={(event) => setDraft((value) => ({ ...value, currency: event.target.value }))} className="setting-input">{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></Field>
        <Field label="Timezone"><select value={draft.timezone} onChange={(event) => setDraft((value) => ({ ...value, timezone: event.target.value }))} className="setting-input"><option value="">{ui("Automatic")}</option>{timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></Field>
        <Field label="Date format"><select value={draft.date_format} onChange={(event) => setDraft((value) => ({ ...value, date_format: event.target.value }))} className="setting-input"><option value="locale_default">{ui("Locale default")}</option><option value="dd/MM/yyyy">DD/MM/YYYY</option><option value="MM/dd/yyyy">MM/DD/YYYY</option><option value="yyyy-MM-dd">YYYY-MM-DD</option></select></Field>
        <Field label="Number format"><select value={draft.number_format} onChange={(event) => setDraft((value) => ({ ...value, number_format: event.target.value }))} className="setting-input"><option value="locale_default">{ui("Locale default")}</option><option value="space_comma">1 234,56</option><option value="comma_dot">1,234.56</option><option value="dot_comma">1.234,56</option></select></Field>
        <Field label="Currency format"><select value={draft.currency_format} onChange={(event) => setDraft((value) => ({ ...value, currency_format: event.target.value }))} className="setting-input"><option value="locale_default">{ui("Locale default")}</option><option value="symbol_before">{ui("Symbol before amount")}</option><option value="symbol_after">{ui("Symbol after amount")}</option><option value="code_after">{ui("ISO code after amount")}</option></select></Field>
        <Field label="First day of week"><select value={draft.first_day_of_week} onChange={(event) => setDraft((value) => ({ ...value, first_day_of_week: event.target.value }))} className="setting-input"><option value="">{ui("Locale default")}</option><option value="1">{ui("Monday")}</option><option value="0">{ui("Sunday")}</option><option value="6">{ui("Saturday")}</option></select></Field>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-foreground px-4 py-2 text-xs font-black text-background disabled:opacity-50">{ui(saving ? "Saving…" : "Save preferences")}</button>{result && <p className={`text-xs ${result.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>{ui(result.message)}</p>}</div>
    </SurfaceCard>
    <SurfaceCard eyebrow="Formats" title="Locale-aware formatting" icon={Settings2}><p className="text-[11px] leading-relaxed text-muted-foreground">{ui("Timestamps are rendered in the selected timezone when source data includes a timestamp. Monetary conversions, when supported, retain original currency and show separate FX evidence.")}</p></SurfaceCard>
  </div>;
}

function NotificationsSection({ settings }) {
  const ui = useSettingsCopy();
  const notification = settings || {};
  const channels = (notification.effective_policy?.channels || []).map(channel => ({ channel, status:"CONFIGURED", summary:channel === "IN_APP" ? "Founder/Admin in-app" : "Mandatory HIGH/CRITICAL escalation" }));
  return <div className="space-y-4">
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.045] p-4"><p className="text-sm font-black">{ui("Interrupt only when it matters")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("Critical safety, security and financial escalation follows mandatory governance. Settings cannot silently disable it.")}</p></div>
    <SurfaceCard eyebrow="Delivery policy" title="Supported notification channels" icon={Bell} action={<DeepLink to="/admin/maintenance">Open System health</DeepLink>}>
      {channels.length ? <div className="grid gap-3 md:grid-cols-2">{channels.map((channel) => <div key={channel.key || channel.channel} className="rounded-xl border border-border/60 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black">{ui(channel.channel === "IN_APP" ? "In-app" : "Email · HIGH/CRITICAL")}</p><p className="mt-1 text-[11px] text-muted-foreground">{ui(displayValue(channel.summary, "Configured delivery policy"))}</p></div><Tone status={channel.status} /></div></div>)}</div> : <EmptyState title="No general preference controls are configured" body="The current production alert channel is governed by incident delivery policy. High and critical delivery evidence stays in System rather than being duplicated here." />}
    </SurfaceCard>
    <SurfaceCard eyebrow="Escalation" title="Current safeguards" icon={ShieldCheck}><ValueRow label="Critical incidents" value={notification.effective_policy?.required_push_policy?.some(item => item.severity === "CRITICAL" && item.delivery === "EMAIL") ? "Mandatory email" : "Not configured"} /><ValueRow label="High / critical recipient" value={notification.effective_recipient?.configured ? notification.effective_recipient.fingerprint : "Configuration required"} /><ValueRow label="Quiet hours" value={notification.effective_policy?.quiet_hours || "Not configured"} /><p className="mt-3 text-[11px] text-muted-foreground">{ui("Digest, in-app-only and category preferences will appear only after their canonical policy store is available. No unsupported channel is shown as enabled.")}</p></SurfaceCard>
  </div>;
}

function IntegrationsSection({ settings }) {
  const ui = useSettingsCopy();
  const integrations = useMemo(() => {
    const rows = new Map();
    for (const integration of Array.isArray(settings.supported_integrations) ? settings.supported_integrations : []) {
      const key = String(integration.integration_id || integration.name || "").toLowerCase();
      rows.set(key, {
        key,
        name: integration.name || integration.integration_id,
        status: integration.availability || "NOT_CONFIGURED",
        configuration_status: integration.connection_status,
        scopes: integration.auth_type,
      });
    }
    for (const provider of Array.isArray(settings.commercial_providers) ? settings.commercial_providers : []) {
      const key = String(provider.provider_key || "").toLowerCase();
      rows.set(key, {
        ...(rows.get(key) || {}),
        key,
        name: provider.provider_key,
        status: provider.auth_test_pass ? "CONNECTED" : (provider.status || "NEEDS_ATTENTION"),
        configured: provider.secret_configured,
        configuration_status: provider.secret_configured ? "Configured ✓" : "Not configured",
        scopes: provider.role,
        last_changed_at: provider.last_checked_at || provider.last_success_at,
      });
    }
    return [...rows.values()];
  }, [settings.commercial_providers, settings.supported_integrations]);
  return <div className="space-y-4">
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.045] p-4"><p className="text-sm font-black">{ui("Connection configuration, not operational monitoring")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("Secret values never render here. CAMBRA displays only configuration state, scope and safe metadata; logs and replays remain in System.")}</p></div>
    <SurfaceCard eyebrow="Connected services" title="Integration configuration" icon={KeyRound} action={<DeepLink to="/admin/integrations">Open integrations</DeepLink>}>
      {integrations.length ? <div className="grid gap-3 md:grid-cols-2">{integrations.map((integration) => <div key={integration.key || integration.id || integration.provider} className="rounded-xl border border-border/60 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black">{displayValue(integration.name || integration.provider)}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{ui(displayValue(integration.account_identity || integration.workspace || integration.provider_account_id, "Account identity not exposed"))}</p></div><Tone status={integration.status} /></div><div className="mt-3 space-y-1 text-[11px] text-muted-foreground"><p>{ui("Scopes")}: {ui(displayValue(integration.scopes, "Not available"))}</p><p>{ui("Configuration")}: {ui(integration.configured === true ? "Configured ✓" : displayValue(integration.configuration_status, "Not configured"))}</p><p>{ui("Last changed")}: {ui(displayValue(integration.last_changed_at || integration.connected_at, "Not available"))}</p></div>{integration.system_path && <Link to={integration.system_path} className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold underline">{ui("Open system details")} <ExternalLink size={11} /></Link>}</div>)}</div> : <EmptyState title="No founder integration summary is available" body="Use the existing Integrations and API & Webhooks pages for supported connections. This page will never fall back to a direct credential query." />}
    </SurfaceCard>
    <div className="flex flex-wrap gap-2"><DeepLink to="/admin/api-integrations">API & Webhooks</DeepLink><DeepLink to="/admin/maintenance">System health</DeepLink><DeepLink to="/admin/founder-control">Founder Control</DeepLink></div>
  </div>;
}

function AiCostsSection({ settings }) {
  const ui = useSettingsCopy();
  const { lang } = useTranslation();
  const budget = settings.budget || {};
  const aiPolicy = settings.ai_policy || {};
  const paidEnrichment = settings.paid_enrichment || {};
  const control = budget.control || null;
  const usage = budget.usage || {};
  const limits = control ? [
    { key:"daily_total", label:"All paid operations · daily", used_minor:usage.daily_total_minor, limit_minor:control.daily_total_limit_minor, currency:control.currency || "EUR", status:budget.validation?.ok ? "ACTIVE" : "BLOCKED" },
    { key:"monthly_total", label:"All paid operations · monthly", used_minor:usage.monthly_total_minor, limit_minor:control.monthly_total_limit_minor, currency:control.currency || "EUR", status:budget.validation?.ok ? "ACTIVE" : "BLOCKED" },
    ...["ai","api","enrichment","email"].map(key => ({ key, label:`${key.toUpperCase()} · monthly`, used_minor:usage.categories?.[key]?.monthly_minor, limit_minor:control.category_limits_json?.[key]?.monthly_limit_minor, currency:control.currency || "EUR", status:budget.validation?.ok ? "ACTIVE" : "BLOCKED" })),
  ] : [];
  const defaultTier = aiPolicy.default_reasoning_tier === "TASK_SPECIFIC_POLICY" ? "Task-specific policy" : aiPolicy.default_reasoning_tier;
  const fallbackPolicy = aiPolicy.fallback_policy === "CANONICAL_TASK_POLICY" ? "Managed by canonical task policy" : aiPolicy.fallback_policy;
  const enrichmentAuthorization = paidEnrichment.authorization_status === "NOT_DERIVED_FROM_BUDGET" ? "Authorization not derived from budget" : paidEnrichment.authorization_status;
  return <div className="space-y-4"><div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.045] p-4"><p className="text-sm font-black">{ui("Hard caps remain authoritative")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("Settings explains the approved economic policy. Changes to hard limits stay in Founder Control because they require impact preview, explicit confirmation and audit evidence.")}</p></div><SurfaceCard eyebrow="Economic policy" title="AI & paid operation budgets" icon={WalletCards} action={<DeepLink to="/admin/founder-control">Manage hard limits</DeepLink>}>{limits.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{limits.map((limit) => { const used = Number(limit.used_minor || limit.used || 0); const max = Number(limit.limit_minor || limit.limit || 0); const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0; const translatedLabel = limit.key === "daily_total" || limit.key === "monthly_total" ? ui(limit.label) : `${limit.key.toUpperCase()} · ${ui("monthly")}`; return <div key={limit.key || limit.label} className="rounded-xl border border-border/60 p-4"><div className="flex items-start justify-between gap-2"><p className="text-xs font-black">{translatedLabel}</p><Tone status={limit.status} /></div><p className="mt-3 text-lg font-black">{limit.currency === "MESSAGES" ? `${used} / ${max}` : `${formatMoney(used, limit.currency || "EUR", lang)} / ${formatMoney(max, limit.currency || "EUR", lang)}`}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[10px] text-muted-foreground">{max > 0 ? `${pct}% ${ui("used")}` : ui("No valid active cap")}</p></div>; })}</div> : <EmptyState title="No active budget summary" body="Paid autonomous execution remains fail-closed until an approved canonical budget is present." />}</SurfaceCard><SurfaceCard eyebrow="Routing policy" title="AI workload policy" icon={Bot}><ValueRow label="Default tier" value={defaultTier || "Task-specific policy"} /><ValueRow label="Fallback / retry" value={fallbackPolicy || "Managed by canonical task policy"} /><ValueRow label="Paid enrichment" value={enrichmentAuthorization || "Authorization not derived from budget"} detail={paidEnrichment.run_level_limits ? "Controlled by Discovery per-run budget and global hard caps" : undefined} /></SurfaceCard></div>;
}

function PrivacySection({ settings }) {
  const ui = useSettingsCopy();
  const privacy = settings.privacy_invariants || {};
  const policies = Array.isArray(settings.retention_policies) ? settings.retention_policies : [];
  const merchantWorkflow = privacy.merchant_data_workflow === "GOVERNED_WORKFLOW_REQUIRED" ? "Authorized workflow required" : privacy.merchant_data_workflow;
  const crossTenant = privacy.cross_tenant_intelligence === "privacy-safe aggregates only" ? "Privacy-safe aggregation only" : privacy.cross_tenant_intelligence;
  return <div className="space-y-4"><div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.045] p-4"><p className="text-sm font-black">{ui("Governance is protected by policy")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("Retention is versioned and limited to authorized deletion or anonymization paths. This screen does not allow ad-hoc destruction of legally required evidence.")}</p></div><SurfaceCard eyebrow="Retention" title="Configured lifecycle policies" icon={Database}>{policies.length ? <div className="grid gap-3 md:grid-cols-2">{policies.map((policy) => <div key={policy.policy_key || policy.key || policy.category} className="rounded-xl border border-border/60 p-4"><div className="flex items-start justify-between gap-2"><p className="text-sm font-black">{displayValue(policy.label || policy.category || policy.policy_key).replaceAll("_", " ")}</p><Tone status={policy.status || "PROTECTED"} /></div><p className="mt-2 text-[11px] text-muted-foreground">{displayValue(policy.action)} · {policy.retention_days ? `${policy.retention_days} ${ui("days")}` : ui("Aggregated / policy-bound")}</p><p className="mt-1 text-[10px] text-muted-foreground">{ui(displayValue(policy.safeguard || policy.detail, "Authorized lifecycle only"))}</p></div>)}</div> : <EmptyState title="Retention policies are managed centrally" body="The canonical retention engine keeps the active policy registry. Policy changes require an authorized code and governance change, not a casual UI override." />}</SurfaceCard><SurfaceCard eyebrow="Privacy safeguards" title="Tenant and intelligence boundaries" icon={ShieldCheck}><ValueRow label="Merchant data requests" value={merchantWorkflow || "Authorized workflow required"} /><ValueRow label="Cross-tenant intelligence" value={crossTenant || "Privacy-safe aggregation only"} /><ValueRow label="Minimum cohort" value={Number.isFinite(Number(privacy.minimum_cohort)) ? `k ≥ ${Number(privacy.minimum_cohort)}` : "k ≥ 10"} /><p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{ui("Settings exposes protection status and links to governed workflows; it cannot weaken tenant isolation, legal holds or minimum cohort rules.")}</p></SurfaceCard></div>;
}

function AdvancedSection({ settings }) {
  const ui = useSettingsCopy();
  const advanced = { ...(settings.deployment_identity || {}), environment:settings.environment, app_id:settings.deployment_identity?.app_identifier };
  const flags = Array.isArray(settings.feature_flags) ? settings.feature_flags : [];
  return <div className="space-y-4"><div className="rounded-2xl border border-amber-500/25 bg-amber-500/[.045] p-4"><p className="text-sm font-black">{ui("Advanced is deliberately read-only by default")}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ui("Deployment identity and operational diagnostics remain protected. Settings is not an environment-variable editor and cannot bypass activation gates.")}</p></div><SurfaceCard eyebrow="Runtime identity" title="Deployment evidence" icon={Code2}><ValueRow label="Environment" value={advanced.environment} /><ValueRow label="Application / project ID" value={advanced.app_id || advanced.project_id} /><ValueRow label="Release version" value={advanced.release_version} /><ValueRow label="Deployed Git SHA" value={advanced.git_sha} /><ValueRow label="Source-tree identity" value={advanced.source_tree_hash} /><ValueRow label="Runtime" value={advanced.runtime_version} /></SurfaceCard><SurfaceCard eyebrow="Feature flags" title="Founder-visible feature configuration" icon={Settings2}>{flags.length ? <div className="space-y-2">{flags.map((flag) => <div key={flag.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3"><div><p className="text-xs font-black">{ui(flag.label || flag.key)}</p><p className="mt-1 text-[10px] text-muted-foreground">{ui(displayValue(flag.purpose))}{flag.dependencies ? ` · ${ui("depends on")} ${displayValue(flag.dependencies)}` : ""}</p><p className="mt-1 text-[10px] text-muted-foreground">{ui("Risk level")}: {displayValue(flag.risk_level)} · {ui(flag.restart_required ? "Redeploy required" : "No redeploy required")}</p></div><Tone status={flag.status || (flag.enabled ? "ENABLED" : "DISABLED")} /></div>)}</div> : <EmptyState title="No Founder-editable flags" body="Only flags that have a safe, governed activation path are listed. Sensitive activation remains in the relevant operational control." />}</SurfaceCard><div className="flex flex-wrap gap-2"><DeepLink to="/admin/developer">Developer</DeepLink><DeepLink to="/admin/maintenance">Logs & workers</DeepLink><DeepLink to="/admin/api-integrations">API & Webhooks</DeepLink><DeepLink to="/admin/documentation">Release evidence</DeepLink></div></div>;
}

function Field({ label, children }) {
  const ui = useSettingsCopy();
  return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">{ui(label)}</span>{children}</label>;
}

function SectionContent({ active, settings, lang, setLang }) {
  if (active === "company") return <CompanySection settings={settings} />;
  if (active === "users_access") return <UsersSection settings={settings} />;
  if (active === "language_region") return <LanguageSection settings={settings} lang={lang} setLang={setLang} />;
  if (active === "notifications") return <NotificationsSection settings={settings} />;
  if (active === "integrations") return <IntegrationsSection settings={settings} />;
  if (active === "ai_costs") return <AiCostsSection settings={settings} />;
  if (active === "data_privacy") return <PrivacySection settings={settings} />;
  return <AdvancedSection settings={settings} />;
}

export default function AdminSettings() {
  const { lang, setLang } = useTranslation();
  const ui = useSettingsCopy();
  const [active, setActive] = useState("company");
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const activeSection = SECTIONS.find((section) => section.key === active) || SECTIONS[0];
  const ActiveIcon = activeSection.icon;
  const visibleSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return SECTIONS;
    return SECTIONS.filter((section) => `${ui(section.label)} ${ui(section.description)} ${section.label} ${section.description} ${section.keywords || ""}`.toLowerCase().includes(query));
  }, [search, ui]);
  const load = useCallback(async (section) => {
    setLoading(true); setError("");
    try {
      const response = unwrap(await base44.functions.invoke("getFounderControlCenter", { view: "settings", section }));
      if (response?.ok === false) throw new Error("settings_load_failed");
      setSettings(response.data || {});
    } catch { setError("Settings could not be loaded"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(active); }, [active, load]);
  useEffect(() => { if (visibleSections.length && !visibleSections.some((section) => section.key === active)) setActive(visibleSections[0].key); }, [active, visibleSections]);
  return <div className="space-y-5 pb-10"><style>{`.setting-input{height:2.5rem;width:100%;border-radius:.6rem;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:0 .75rem;font-size:.8rem;outline:none}.setting-input:focus{border-color:hsl(var(--foreground) / .45);box-shadow:0 0 0 2px hsl(var(--foreground) / .06)}`}</style><header className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground"><Settings2 size={13} /> {ui("Founder / Admin")}</div><h1 className="mt-2 text-3xl font-black tracking-[-.035em]">{ui("Settings")}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{ui("Configure CAMBRA’s identity, preferences and guarded policies. Operations, incidents, backups and emergency controls remain in their dedicated workspaces.")}</p></div><div className="relative w-full lg:w-72"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui("Search settings")} aria-label={ui("Search settings")} className="h-10 w-full rounded-xl border border-border/60 bg-card pl-9 pr-3 text-xs outline-none focus:border-foreground/40" /></div></header><div className="grid gap-5 xl:grid-cols-[15rem_minmax(0,1fr)]"><aside className="overflow-x-auto xl:overflow-visible"><nav className="flex gap-1 rounded-2xl border border-border/60 bg-card p-2 xl:block xl:space-y-1">{visibleSections.map((section) => { const Icon = section.icon; const selected = section.key === active; return <button type="button" key={section.key} onClick={() => setActive(section.key)} className={`flex min-w-[11rem] items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors xl:w-full ${selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}><Icon size={15} /><span className="min-w-0"><span className="block text-xs font-black">{ui(section.label)}</span><span className={`mt-0.5 block truncate text-[10px] ${selected ? "text-background/70" : "text-muted-foreground"}`}>{ui(section.description)}</span></span></button>; })}{!visibleSections.length && <p className="px-3 py-4 text-xs text-muted-foreground">{ui("No matching setting.")}</p>}</nav></aside><main className="min-w-0"><div className="mb-4 flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card"><ActiveIcon size={16} /></div><div><p className="text-lg font-black">{ui(activeSection.label)}</p><p className="text-[11px] text-muted-foreground">{ui(activeSection.description)}</p></div></div>{loading ? <LoadingState /> : error ? <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[.06] p-5"><div className="flex gap-3"><XCircle className="mt-0.5 shrink-0 text-rose-600" size={18} /><div><p className="text-sm font-black">{ui("Could not load this setting")}</p><p className="mt-1 text-xs text-muted-foreground">{ui(error)}</p><button type="button" onClick={() => load(active)} className="mt-4 rounded-lg border border-border/70 px-3 py-2 text-xs font-bold">{ui("Try again")}</button></div></div></div> : <SectionContent active={active} settings={settings} lang={lang} setLang={setLang} />}</main></div></div>;
}
