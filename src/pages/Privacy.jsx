import MarketingPageShell from "@/components/landing/MarketingPageShell";
import LegalSections from "@/components/landing/LegalSections";

const SECTIONS = [
  { title: "1. Data controller", content: "CAMBRA is the data controller responsible for the personal data processed through this platform. For any data-related request, contact us at privacy@cambra.io." },
  { title: "2. What we collect", content: "We collect information you provide directly: name, professional email, brand information, infrastructure cost data, uploaded statements and operational metrics entered through the Analyzer. We also collect non-identifying usage telemetry to improve the platform." },
  { title: "3. How we use your data", content: "Your data is used to deliver CAMBRA's infrastructure intelligence — generating audits, calculating benchmarks, identifying optimization opportunities and personalizing your dashboard. We never sell your data. Aggregated, fully anonymized benchmarks may inform network-wide intelligence." },
  { title: "4. File upload & AI processing", content: "When you upload statements or invoices (PDF, Excel, CSV) through the Analyzer or Connect Tools, they are processed by large language models to extract structured cost and operational data. Uploaded files are stored encrypted and remain your property. AI processing is confined to your account scope." },
  { title: "5. AI usage disclosure", content: "CAMBRA uses third-party AI models (OpenAI, Google) for extraction, intelligence and the Copilot assistant. Data sent for inference is processed under strict data-processing agreements and is not used to train provider models. AI outputs are estimates and are not legal, financial or fiscal advice." },
  { title: "6. Storage & security", content: "All data is stored in encrypted EU-based infrastructure. We use TLS 1.3 in transit, AES-256 at rest, role-based access control and continuous audit logging. Access to your data is strictly restricted to systems and personnel that require it to operate the service." },
  { title: "7. Your rights (GDPR)", content: "If you are located in the European Economic Area, the United Kingdom or Switzerland, you have the right to access, rectify, erase, restrict, port and object to the processing of your data. You may also withdraw consent at any time. To exercise any of these rights, contact privacy@cambra.io — we respond within 30 days." },
  { title: "8. Data retention", content: "We retain personal and operational data only for as long as your account is active or as required to provide the service. Upon account deletion, identifiable data is deleted within 90 days. Anonymized, aggregated benchmarks may be retained indefinitely." },
  { title: "9. Cookies", content: "We use strictly necessary cookies for authentication and session management. We do not use advertising or third-party tracking cookies. See our Cookie Policy for the complete list." },
  { title: "10. International transfers", content: "Where data is transferred outside the EEA (e.g. for AI inference), we rely on Standard Contractual Clauses approved by the European Commission and apply equivalent safeguards." },
  { title: "11. Contact", content: "For any privacy-related question, request or complaint: privacy@cambra.io. You also have the right to lodge a complaint with your local data protection authority." },
];

export default function Privacy() {
  return (
    <MarketingPageShell
      eyebrow="Legal · GDPR compliant"
      title="Privacy"
      titleAccent="Policy."
      subtitle={`Last updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`}
      heroAlign="left"
      maxWidth="max-w-3xl"
    >
      <LegalSections sections={SECTIONS} />
    </MarketingPageShell>
  );
}