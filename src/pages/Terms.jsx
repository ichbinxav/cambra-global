import MarketingPageShell from "@/components/landing/MarketingPageShell";
import LegalSections from "@/components/landing/LegalSections";

const SECTIONS = [
  { title: "1. Acceptance", content: "By accessing or using the CAMBRA platform, you agree to be bound by these Terms & Conditions. If you do not agree, do not use the platform. CAMBRA reserves the right to update these terms with reasonable advance notice." },
  { title: "2. Platform purpose", content: "CAMBRA provides infrastructure intelligence, cost analysis, benchmarking and network access for independent commerce brands. The platform is intended for business use only. You must be authorized to represent the brand or entity you register." },
  { title: "3. Audit outputs & estimates", content: "All Analyzer outputs, savings estimates, infrastructure scores and benchmark comparisons are estimates derived from your inputs and the CAMBRA network dataset. They are operational guidance — not financial, legal or fiscal advice. CAMBRA does not guarantee any specific savings outcome. Always consult qualified advisors before material decisions." },
  { title: "4. Data ownership & licence", content: "You retain full ownership of all data you submit. By using the platform, you grant CAMBRA a limited, revocable licence to process that data to deliver the service. Aggregated, fully anonymized data may be used to improve benchmarks. We will never share identifiable data with third parties without your explicit consent." },
  { title: "5. Network directory", content: "The member directory is accessible only to authenticated, verified members. Listings are not endorsements. Brands are responsible for the accuracy of their own profile. Contact information visible in the directory may only be used for legitimate business collaboration — never for unsolicited prospecting." },
  { title: "6. Pricing & commercial terms", content: "Current early-partner access is offered free of charge to founding brands. CAMBRA may introduce paid tiers in the future with reasonable advance notice. Early partners will be honoured under their original commercial conditions. Performance-based pricing on infrastructure recovery may apply where explicitly agreed in writing." },
  { title: "7. Acceptable use", content: "You agree not to: reverse-engineer the platform, scrape benchmark data, misrepresent your brand, upload unlawful content, attempt to access another user's data, or use CAMBRA to compete directly with the service. Violations may result in immediate suspension." },
  { title: "8. Limitation of liability", content: "To the maximum extent permitted by law, CAMBRA is not liable for indirect, incidental, special or consequential damages arising from use of the platform. Total liability is limited to the amounts paid by you for the service in the preceding twelve months." },
  { title: "9. Termination", content: "You may terminate your account at any time from Account settings. CAMBRA may suspend or terminate access for violations of these terms or for prolonged inactivity. Upon termination, your data is handled according to our Privacy Policy." },
  { title: "10. Governing law", content: "These terms are governed by the laws of France and the European Union. Any dispute will first be addressed through good-faith negotiation; if unresolved, jurisdiction lies with the competent courts of Paris, France." },
  { title: "11. Contact", content: "For any contractual question: legal@cambra.io." },
];

export default function Terms() {
  return (
    <MarketingPageShell
      eyebrow="Legal"
      title="Terms &"
      titleAccent="Conditions."
      subtitle={`Last updated: ${new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}`}
      heroAlign="left"
      maxWidth="max-w-3xl"
    >
      <LegalSections sections={SECTIONS} />
    </MarketingPageShell>
  );
}