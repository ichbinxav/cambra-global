import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, Database, FileText, FolderOpen, Gift, LockKeyhole, LogOut, Mail, Save, Settings, Shield, Store, Trash2, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import AccountFieldSection from "@/components/account/AccountFieldSection";
import { BRAND_FIELDS, PAYMENTS_PROFILE_FIELDS } from "@/components/account/accountFields";
import MonthlyEmailPreference from "@/components/account/MonthlyEmailPreference";
import RecoverCommitmentsCard from "@/components/account/RecoverCommitmentsCard";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";
import { signOutToHome } from "@/lib/logout";

const ACTION_COPY = {
  en: { saveProfile: "Save profile", privacyBody: "Control your information and send a traceable privacy request.", exportData: "Request a copy of my data", deleteAccount: "Request account deletion", deleteBody: "We verify your identity first and retain only records required by law.", referralsBody: "Share your code, follow activations and see your current CAMBRA fee." },
  es: { saveProfile: "Guardar perfil", privacyBody: "Controla tu información y envía una solicitud de privacidad trazable.", exportData: "Solicitar una copia de mis datos", deleteAccount: "Solicitar la eliminación de la cuenta", deleteBody: "Primero verificamos tu identidad y conservamos únicamente los registros exigidos por ley.", referralsBody: "Comparte tu código, sigue las activaciones y consulta tu comisión CAMBRA actual." },
  fr: { saveProfile: "Enregistrer le profil", privacyBody: "Contrôlez vos informations et envoyez une demande de confidentialité traçable.", exportData: "Demander une copie de mes données", deleteAccount: "Demander la suppression du compte", deleteBody: "Nous vérifions d’abord votre identité et ne conservons que les documents exigés par la loi.", referralsBody: "Partagez votre code, suivez les activations et consultez votre commission CAMBRA." },
  de: { saveProfile: "Profil speichern", privacyBody: "Verwalten Sie Ihre Informationen und senden Sie eine nachvollziehbare Datenschutzanfrage.", exportData: "Kopie meiner Daten anfordern", deleteAccount: "Kontolöschung anfordern", deleteBody: "Wir prüfen zuerst Ihre Identität und bewahren nur gesetzlich vorgeschriebene Unterlagen auf.", referralsBody: "Teilen Sie Ihren Code, verfolgen Sie Aktivierungen und sehen Sie Ihre aktuelle CAMBRA-Gebühr." },
  it: { saveProfile: "Salva profilo", privacyBody: "Controlla le tue informazioni e invia una richiesta privacy tracciabile.", exportData: "Richiedi una copia dei miei dati", deleteAccount: "Richiedi l’eliminazione dell’account", deleteBody: "Prima verifichiamo la tua identità e conserviamo solo i dati richiesti dalla legge.", referralsBody: "Condividi il codice, segui le attivazioni e consulta la commissione CAMBRA attuale." },
  pl: { saveProfile: "Zapisz profil", privacyBody: "Zarządzaj informacjami i wyślij możliwe do śledzenia żądanie dotyczące prywatności.", exportData: "Poproś o kopię moich danych", deleteAccount: "Poproś o usunięcie konta", deleteBody: "Najpierw weryfikujemy tożsamość i zachowujemy wyłącznie dokumenty wymagane prawem.", referralsBody: "Udostępnij kod, śledź aktywacje i sprawdź bieżącą opłatę CAMBRA." },
  pt: { saveProfile: "Guardar perfil", privacyBody: "Controle as suas informações e envie um pedido de privacidade rastreável.", exportData: "Pedir uma cópia dos meus dados", deleteAccount: "Pedir a eliminação da conta", deleteBody: "Primeiro verificamos a sua identidade e conservamos apenas os registos exigidos por lei.", referralsBody: "Partilhe o código, acompanhe ativações e consulte a comissão CAMBRA atual." },
  el: { saveProfile: "Αποθήκευση προφίλ", privacyBody: "Ελέγξτε τις πληροφορίες σας και στείλτε ένα ανιχνεύσιμο αίτημα απορρήτου.", exportData: "Αίτημα αντιγράφου των δεδομένων μου", deleteAccount: "Αίτημα διαγραφής λογαριασμού", deleteBody: "Πρώτα επαληθεύουμε την ταυτότητά σας και διατηρούμε μόνο τα αρχεία που απαιτεί ο νόμος.", referralsBody: "Μοιραστείτε τον κωδικό σας, παρακολουθήστε ενεργοποιήσεις και δείτε την τρέχουσα προμήθεια CAMBRA." },
  sv: { saveProfile: "Spara profil", privacyBody: "Hantera din information och skicka en spårbar integritetsbegäran.", exportData: "Begär en kopia av mina data", deleteAccount: "Begär radering av konto", deleteBody: "Vi verifierar först din identitet och sparar endast uppgifter som lagen kräver.", referralsBody: "Dela din kod, följ aktiveringar och se din aktuella CAMBRA-avgift." },
  da: { saveProfile: "Gem profil", privacyBody: "Administrer dine oplysninger og send en sporbar anmodning om databeskyttelse.", exportData: "Anmod om en kopi af mine data", deleteAccount: "Anmod om sletning af konto", deleteBody: "Vi bekræfter først din identitet og gemmer kun lovpligtige oplysninger.", referralsBody: "Del din kode, følg aktiveringer og se dit aktuelle CAMBRA-gebyr." },
  fi: { saveProfile: "Tallenna profiili", privacyBody: "Hallitse tietojasi ja lähetä seurattava tietosuojapyyntö.", exportData: "Pyydä kopio tiedoistani", deleteAccount: "Pyydä tilin poistamista", deleteBody: "Vahvistamme ensin henkilöllisyytesi ja säilytämme vain lain edellyttämät tiedot.", referralsBody: "Jaa koodisi, seuraa aktivointeja ja tarkista nykyinen CAMBRA-maksusi." },
  cs: { saveProfile: "Uložit profil", privacyBody: "Spravujte své údaje a odešlete dohledatelnou žádost o ochranu soukromí.", exportData: "Požádat o kopii mých údajů", deleteAccount: "Požádat o smazání účtu", deleteBody: "Nejprve ověříme vaši totožnost a uchováme pouze záznamy vyžadované zákonem.", referralsBody: "Sdílejte svůj kód, sledujte aktivace a zobrazte aktuální poplatek CAMBRA." },
  ro: { saveProfile: "Salvează profilul", privacyBody: "Controlează informațiile și trimite o solicitare de confidențialitate trasabilă.", exportData: "Solicită o copie a datelor mele", deleteAccount: "Solicită ștergerea contului", deleteBody: "Îți verificăm mai întâi identitatea și păstrăm doar evidențele cerute de lege.", referralsBody: "Distribuie codul, urmărește activările și consultă comisionul CAMBRA actual." },
  hu: { saveProfile: "Profil mentése", privacyBody: "Kezelje adatait, és küldjön nyomon követhető adatvédelmi kérelmet.", exportData: "Adataim másolatának kérése", deleteAccount: "Fióktörlés kérése", deleteBody: "Először ellenőrizzük személyazonosságát, és csak a jogszabályban előírt adatokat őrizzük meg.", referralsBody: "Ossza meg kódját, kövesse az aktiválásokat és tekintse meg aktuális CAMBRA-díját." },
  bg: { saveProfile: "Запазване на профила", privacyBody: "Управлявайте информацията си и изпратете проследима заявка за поверителност.", exportData: "Заявка за копие на моите данни", deleteAccount: "Заявка за изтриване на акаунта", deleteBody: "Първо потвърждаваме самоличността ви и пазим само изискуемите по закон записи.", referralsBody: "Споделете кода си, следете активациите и вижте текущата такса CAMBRA." },
  hr: { saveProfile: "Spremi profil", privacyBody: "Upravljajte svojim podacima i pošaljite sljediv zahtjev za privatnost.", exportData: "Zatraži kopiju mojih podataka", deleteAccount: "Zatraži brisanje računa", deleteBody: "Najprije provjeravamo vaš identitet i čuvamo samo zakonski obvezne zapise.", referralsBody: "Podijelite kod, pratite aktivacije i provjerite trenutačnu CAMBRA naknadu." },
  et: { saveProfile: "Salvesta profiil", privacyBody: "Hallake oma teavet ja saatke jälgitav privaatsustaotlus.", exportData: "Taotle minu andmete koopiat", deleteAccount: "Taotle konto kustutamist", deleteBody: "Kontrollime esmalt teie isikut ja säilitame ainult seadusega nõutud andmed.", referralsBody: "Jagage oma koodi, jälgige aktiveerimisi ja vaadake kehtivat CAMBRA tasu." },
  lv: { saveProfile: "Saglabāt profilu", privacyBody: "Pārvaldiet savu informāciju un nosūtiet izsekojamu privātuma pieprasījumu.", exportData: "Pieprasīt manu datu kopiju", deleteAccount: "Pieprasīt konta dzēšanu", deleteBody: "Vispirms pārbaudām jūsu identitāti un saglabājam tikai likumā prasītos ierakstus.", referralsBody: "Kopīgojiet kodu, sekojiet aktivizācijām un skatiet pašreizējo CAMBRA maksu." },
  lt: { saveProfile: "Išsaugoti profilį", privacyBody: "Tvarkykite savo informaciją ir siųskite atsekamą privatumo užklausą.", exportData: "Prašyti mano duomenų kopijos", deleteAccount: "Prašyti ištrinti paskyrą", deleteBody: "Pirmiausia patikriname jūsų tapatybę ir saugome tik teisės aktų reikalaujamus įrašus.", referralsBody: "Bendrinkite kodą, stebėkite aktyvavimus ir peržiūrėkite dabartinį CAMBRA mokestį." },
  sk: { saveProfile: "Uložiť profil", privacyBody: "Spravujte svoje údaje a odošlite sledovateľnú žiadosť o ochranu súkromia.", exportData: "Požiadať o kópiu mojich údajov", deleteAccount: "Požiadať o vymazanie účtu", deleteBody: "Najprv overíme vašu totožnosť a uchováme iba zákonom požadované záznamy.", referralsBody: "Zdieľajte kód, sledujte aktivácie a pozrite si aktuálny poplatok CAMBRA." },
  sl: { saveProfile: "Shrani profil", privacyBody: "Upravljajte svoje podatke in pošljite sledljivo zahtevo za zasebnost.", exportData: "Zahtevaj kopijo mojih podatkov", deleteAccount: "Zahtevaj izbris računa", deleteBody: "Najprej preverimo vašo identiteto in hranimo le zakonsko zahtevane evidence.", referralsBody: "Delite kodo, spremljajte aktivacije in preverite trenutno pristojbino CAMBRA." },
  nb: { saveProfile: "Lagre profil", privacyBody: "Administrer opplysningene dine og send en sporbar personvernforespørsel.", exportData: "Be om en kopi av dataene mine", deleteAccount: "Be om sletting av konto", deleteBody: "Vi bekrefter først identiteten din og beholder bare opplysninger som kreves ved lov.", referralsBody: "Del koden, følg aktiveringer og se gjeldende CAMBRA-gebyr." },
  is: { saveProfile: "Vista prófíl", privacyBody: "Stýrðu upplýsingunum þínum og sendu rekjanlega persónuverndarbeiðni.", exportData: "Biðja um afrit af gögnunum mínum", deleteAccount: "Biðja um eyðingu reiknings", deleteBody: "Við staðfestum fyrst auðkenni þitt og geymum aðeins skrár sem lög krefjast.", referralsBody: "Deildu kóðanum, fylgstu með virkjunum og skoðaðu núverandi CAMBRA-gjald." },
};

function Section({ icon: Icon, title, children, className = "" }) {
  return (
    <section className={`cambra-paper-card p-6 sm:p-7 ${className}`.trim()}>
      <div className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFEDFF] text-[#4D3DF1]"><Icon size={18} /></span>
        <h2 className="text-[18px] font-bold tracking-[-.025em] text-[#11182D]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function Account() {
  const { lang, t } = useTranslation();
  const copy = ACTION_COPY[lang] || ACTION_COPY.en;
  const [user, setUser] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [brands, setBrands] = useState([]);
  const [paymentsProfiles, setPaymentsProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    base44.auth.me().then((currentUser) => Promise.all([
      base44.entities.Brand.filter({ created_by: currentUser.email }, "-created_date", 1),
      base44.entities.PaymentsProfile.filter({ created_by: currentUser.email }, "-created_date", 1),
    ]).then(([brandRows, profileRows]) => {
      if (cancelled) return;
      setUser(currentUser);
      setProfileName(currentUser.full_name || "");
      setBrands(brandRows);
      setPaymentsProfiles(profileRows);
    })).catch(() => {
      if (!cancelled) toast.error(t("res_err_msg"));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [t]);

  const brand = brands[0];
  const paymentsProfile = paymentsProfiles[0];

  const saveProfile = async () => {
    const fullName = profileName.trim();
    if (!fullName || savingProfile) return;
    setSavingProfile(true);
    try {
      await base44.auth.updateMe({ full_name: fullName });
      setUser((current) => ({ ...current, full_name: fullName }));
      toast.success(t("acc_saved"));
    } catch {
      toast.error(t("res_err_msg"));
    } finally {
      setSavingProfile(false);
    }
  };

  const updatePaymentsProfile = async (field, value) => {
    if (!paymentsProfile) return;
    await base44.entities.PaymentsProfile.update(paymentsProfile.id, { [field]: value });
    setPaymentsProfiles([{ ...paymentsProfile, [field]: value }]);
    toast.success(t("acc_saved"));
  };

  const updateBrand = async (field, value) => {
    if (!brand) return;
    await base44.entities.Brand.update(brand.id, { [field]: value });
    setBrands([{ ...brand, [field]: value }]);
    toast.success(t("acc_saved"));
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#D5D8E3] border-t-[#5B4CF5]" /></div>;
  }

  return (
    <div className="workspace-light-page pb-12">
      <header className="max-w-[900px]">
        <SectionLabel>{t("acc_eyebrow")}</SectionLabel>
        <h1 className="workspace-page-title mt-5">{t("acc_title")}</h1>
        <p className="workspace-page-lead mt-4">{t("acc_subtitle")}</p>
        <p className="mt-3 text-[11px] font-semibold text-[#7B8399]">{t("account_required_note")}</p>
      </header>

      <nav className="mt-8 grid gap-3 sm:grid-cols-3" aria-label={t("account_security_title")}>
        {[
          { to: "/ConnectStripe", icon: LockKeyhole, label: t("account_manage_data") },
          { to: "/UploadStatement", icon: Upload, label: t("az_entry_upload_title") },
          { to: "/Reports", icon: FileText, label: t("rpt_title") },
        ].map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className="cambra-paper-card group flex min-h-20 items-center justify-between gap-4 px-5 py-4 text-[12px] font-bold text-[#17213A] transition-transform hover:-translate-y-0.5">
            <span className="inline-flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFEDFF] text-[#4D3DF1]"><Icon size={15} /></span>{label}</span>
            <ArrowRight size={14} className="text-[#5B4CF5] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </nav>

      <div className="mt-10 grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
        <div className="space-y-6">
          {brand && (
            <Section icon={Building2} title={t("acc_s_brand")}>
              <AccountFieldSection fields={BRAND_FIELDS} record={brand} onSave={updateBrand} />
            </Section>
          )}

          {paymentsProfile && (
            <Section icon={Store} title={t("acc_s_tpe")}>
              <AccountFieldSection fields={PAYMENTS_PROFILE_FIELDS} record={paymentsProfile} onSave={updatePaymentsProfile} />
            </Section>
          )}

          <RecoverCommitmentsCard />
        </div>

        <aside className="space-y-6">
          <Section icon={User} title={t("acc_s_profile")}>
            <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-[#7B8399]">
              {t("acc_full_name")}
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#DCE0EA] bg-white px-3 text-[13px] font-semibold normal-case tracking-normal text-[#11182D] outline-none transition-colors focus:border-[#7567F8]" />
            </label>
            <Button onClick={saveProfile} disabled={!profileName.trim() || savingProfile || profileName.trim() === (user?.full_name || "")} className="mt-3 h-10 rounded-xl px-4 text-[11px] font-bold text-white disabled:opacity-40" style={{ background: "var(--g-voltio)" }}>
              <Save size={13} /> {copy.saveProfile}
            </Button>
            <dl className="mt-6 space-y-5 border-t border-[#E5E7EE] pt-5">
              <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7B8399]">{t("acc_email")}</dt><dd className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#11182D]">{user?.email || "—"}<span className="inline-flex items-center gap-1 rounded-full bg-[#E7F8EF] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#17834F]"><CheckCircle2 size={10} /> {t("account_verified")}</span></dd></div>
              <div><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7B8399]">{t("acc_role")}</dt><dd className="mt-1.5 text-[13px] font-semibold capitalize text-[#39425C]">{user?.role || t("acc_role_member")}</dd></div>
            </dl>
          </Section>

          <Section icon={Mail} title={t("acc_s_email_notif")}>
            <MonthlyEmailPreference user={user} onUpdate={setUser} />
          </Section>

          <Section icon={Gift} title={t("nav_referrals")}>
            <p className="text-[12px] leading-relaxed text-[#677089]">{copy.referralsBody}</p>
            <Link to="/Referrals" className="mt-5 flex min-h-11 items-center justify-between rounded-xl border border-[#E0E3EC] bg-[#F9F9FC] px-4 text-[12px] font-bold text-[#4D3DF1]"><span className="inline-flex items-center gap-2"><Gift size={14} /> {t("nav_referrals")}</span><ArrowRight size={14} /></Link>
          </Section>

          <Section icon={Shield} title={t("footer_data_requests")}>
            <p className="text-[12px] leading-relaxed text-[#677089]">{copy.privacyBody}</p>
            <div className="mt-5 space-y-2">
              <Link to="/ConnectStripe" className="flex min-h-11 items-center justify-between rounded-xl border border-[#E0E3EC] bg-[#F9F9FC] px-4 text-[12px] font-bold text-[#4D3DF1]"><span className="inline-flex items-center gap-2"><LockKeyhole size={14} /> {t("account_manage_data")}</span><ArrowRight size={14} /></Link>
              <Link to="/Vault" className="flex min-h-11 items-center justify-between rounded-xl border border-[#E0E3EC] bg-[#F9F9FC] px-4 text-[12px] font-bold text-[#4D3DF1]"><span className="inline-flex items-center gap-2"><FolderOpen size={14} /> {t("sidebar_documents")}</span><ArrowRight size={14} /></Link>
              <Link to="/Privacy" className="flex min-h-11 items-center justify-between rounded-xl border border-[#E0E3EC] bg-[#F9F9FC] px-4 text-[12px] font-bold text-[#4D3DF1]"><span className="inline-flex items-center gap-2"><FileText size={14} /> {t("footer_privacy")}</span><ArrowRight size={14} /></Link>
              <Link to="/Contact?topic=data-request" className="flex min-h-11 items-center justify-between rounded-xl border border-[#E0E3EC] bg-[#F9F9FC] px-4 text-[12px] font-bold text-[#4D3DF1]"><span className="inline-flex items-center gap-2"><Database size={14} /> {copy.exportData}</span><ArrowRight size={14} /></Link>
            </div>
            <Link to="/Contact?topic=delete-account" className="mt-4 block rounded-xl border border-[#F1C7CD] bg-[#FFF7F8] p-4 text-[#B83247]">
              <span className="flex items-center gap-2 text-[12px] font-bold"><Trash2 size={14} /> {copy.deleteAccount}</span>
              <span className="mt-2 block text-[10.5px] leading-relaxed text-[#8E5962]">{copy.deleteBody}</span>
            </Link>
          </Section>

          <Section icon={Settings} title={t("acc_s_session")}>
            <p className="text-[12px] leading-relaxed text-[#677089]">{t("acc_session_text")}</p>
            <Button variant="outline" size="sm" onClick={signOutToHome} className="mt-5 h-10 rounded-xl border-[#D8DCE8] bg-white px-4 text-xs font-bold text-[#1C2641] hover:bg-[#F4F3FF]">
              <LogOut size={13} /> {t("acc_signout")}
            </Button>
          </Section>
        </aside>
      </div>
    </div>
  );
}
