import { useEffect, useState } from 'react';
import CheckInWallet from './CheckInWallet';
import { base44 } from '@/api/base44Client';
import './CheckInDemo.css';

const API = 'checkin-wallet-demo';
const TICKET_KEY = 'cambra_wallet_demo_ticket';
const TRIAL_KEY = 'cambra_wallet_demo_trial';
const profiles = { none: 'Sin contacto', email: 'Solo email', all: 'Todos los datos' };
const errors = {
  stripe_live_key_missing: 'Falta configurar la clave real de Stripe en CAMBRA.',
  stripe_wrong_account: 'La conexión apunta a otra cuenta Stripe. La prueba está detenida.',
  stripe_account_unreachable: 'No se ha podido verificar la cuenta real de Stripe.',
  stripe_read_failed: 'Stripe no ha permitido comprobar la configuración. Hay que revisar los permisos de la conexión.',
  stripe_write_failed: 'Stripe no ha podido preparar la prueba. No se ha ejecutado ningún cobro.',
  domain_not_registered: 'Hay que habilitar este dominio para las wallets.',
  operational_control_paused: 'El control operativo de CAMBRA tiene pausada esta operación.',
  invitation_invalid_or_expired: 'La sesión de prueba ha caducado. Pulsa Volver a comprobar.',
  invitation_required: 'No se ha podido iniciar la sesión de prueba. Pulsa Volver a comprobar.',
  admin_required: 'Esta acción requiere tu sesión de administrador de CAMBRA.',
  wallet_demo_unavailable: 'La conexión de la prueba todavía no está disponible.',
  trial_not_owned: 'Este resultado pertenece a otro enlace de prueba.',
};
const message = e => errors[e?.response?.data?.error || e?.code || e?.message] || e?.message || 'No se ha podido completar la prueba.';
function getStored(key) { try { return sessionStorage.getItem(key); } catch { return null; } }
function putStored(key, value) { try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value); } catch { /* memory-only session still works */ } }
async function call(action, args = {}) {
  const res = await base44.functions.invoke(API, { action, host: window.location.hostname, ...args });
  const d = res.data;
  if (!d || d.error || d.ok === false) throw Object.assign(new Error(errors[d?.error] || 'La prueba todavía no está disponible.'), { code: d?.error });
  return d;
}
function formatAddress(a) { return a ? [a.line1,a.line2,a.postal_code,a.city,a.state,a.country].filter(Boolean).join(', ') : ''; }

export default function CheckInDemo() {
  const supportedHost=['cambra.global','www.cambra.global'].includes(window.location.hostname);
  if (!supportedHost || window.self !== window.top) return <main className="ci-demo">
    <header className="ci-header"><a href="https://cambra.global">CAMBRA<span>CHECK-IN™</span></a></header>
    <section className="ci-card">
      <p className="ci-eyebrow">PRUEBA DE WALLET</p>
      <h1>Abre la prueba<br/>fuera del editor.</h1>
      <p className="ci-lead">La prueba de Apple Pay y Google Pay está configurada en cambra.global. Ábrela directamente en tu navegador para continuar.</p>
      <a className="ci-action" style={{textAlign:'center',textDecoration:'none'}} href="https://cambra.global/checkin-demo" target="_blank" rel="noopener noreferrer">Abrir la prueba en cambra.global ↗</a>
    </section>
  </main>;
  return <CheckInDemoContent/>;
}

export function CheckInDemoContent() {
  const [ticket, setTicket] = useState(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get('trial');
    if (t) { putStored(TICKET_KEY,t); putStored(TRIAL_KEY,null); return t; }
    return getStored(TICKET_KEY) || '';
  });
  const [config, setConfig] = useState(null);
  const [profile, setProfile] = useState('email');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState('');
  const [recent, setRecent] = useState(null);
  const [observation, setObservation] = useState('');
  const [retry, setRetry] = useState(0);
  const [copyMessage, setCopyMessage] = useState('');
  useEffect(() => {
    const oldTitle=document.title; document.title='Prueba real · CAMBRA CHECK-IN™';
    const robots=document.createElement('meta');robots.name='robots';robots.content='noindex,nofollow';document.head.append(robots);
    const referrer=document.createElement('meta');referrer.name='referrer';referrer.content='strict-origin-when-cross-origin';document.head.append(referrer);
    let active=true;
    async function init() {
      setLoading(true);setError('');
      try {
        let current=ticket;
        let d;
        try { d=await call('status', current ? { ticket: current } : {}); }
        catch (e) {
          const code=e?.response?.data?.error || e?.code || '';
          if (!current || !code.startsWith('invitation_')) throw e;
          current='';putStored(TICKET_KEY,null);putStored(TRIAL_KEY,null);
          if(active)setTicket('');
          d=await call('status');
        }
        if (!active) return;
        if (!current) {
          current=d.ticket || (await call('new_session')).ticket;
          putStored(TICKET_KEY,current);
          if(active)setTicket(current);
        }
        if(!active)return;
        setConfig(d);
        if(window.location.hash.startsWith('#trial=')) history.replaceState(null,'',window.location.pathname+window.location.search);
        const params=new URLSearchParams(window.location.search);
        const returned=params.get('setup_intent');
        const checkoutReturned=params.get('checkout_session_id');
        let saved=null;try { saved=JSON.parse(getStored(TRIAL_KEY)||'null'); } catch {}
        if(current && saved?.checkout_session_id && checkoutReturned===saved.checkout_session_id) {
          const latest=await call('hosted_result',{ticket:current,profile:saved.profile,checkout_session_id:checkoutReturned});
          if(active){setProfile(saved.profile);if(latest.status==='succeeded'||latest.status==='processing')setResult(latest);}
          if(latest.setup_intent_id)putStored(TRIAL_KEY,JSON.stringify({profile:saved.profile,setup_intent_id:latest.setup_intent_id}));
        } else if(current && saved?.setup_intent_id && (!returned || returned===saved.setup_intent_id)) {
          const latest=await call('result',{ticket:current,...saved});
          if(active){setProfile(saved.profile);if(latest.status==='succeeded'||latest.status==='processing')setResult(latest);}
        }
        if(returned || checkoutReturned || params.has('checkout_cancelled')) history.replaceState(null,'',window.location.pathname);
      } catch(e) {if(active)setError(message(e));}
      finally {if(active)setLoading(false);}
    }
    init();
    return ()=>{active=false;document.title=oldTitle;robots.remove();referrer.remove();};
    // Each visitor receives a private session automatically; retry refreshes readiness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[retry]);
  async function prepareSetup() {
    const d=await call('setup',{ticket,profile,consent:'wallet-demo-v1'});
    putStored(TRIAL_KEY,JSON.stringify({profile,setup_intent_id:d.setup_intent_id}));
    return d;
  }
  async function share() {
    setError('');
    try {
      const url='https://cambra.global/checkin-demo';setInvite(url);
      try {await navigator.clipboard.writeText(url);setCopyMessage('Enlace público copiado.');}
      catch {setCopyMessage('Selecciona y copia el enlace público.');}
    }catch(e){setError(message(e));}
  }
  async function activate() {
    setBusy(true);setError('');
    try {await call('register_domain');setRetry(x=>x+1);}
    catch(e){setError(message(e));}
    finally{setBusy(false);}
  }
  async function detach() {
    if(!result)return;setBusy(true);setError('');
    try {await call('detach',{ticket,profile,setup_intent_id:result.setup_intent_id});setResult(r=>({...r,saved:false,detached:true}));}
    catch(e){setError(message(e));}
    finally{setBusy(false);}
  }
  async function refreshResult() {
    if(!result)return;setBusy(true);
    try{setResult(await call('result',{ticket,profile,setup_intent_id:result.setup_intent_id}));}catch(e){setError(message(e));}finally{setBusy(false);}
  }
  async function reset() {
    setError('');setObservation('');setResult(null);putStored(TRIAL_KEY,null);
    setBusy(true);
    try {const d=await call('new_session');putStored(TICKET_KEY,d.ticket);setTicket(d.ticket);}
    catch(e){setError(message(e));}
    finally{setBusy(false);}
  }
  const contact=result?.contact;
  return <main className="ci-demo">
    <header className="ci-header"><a href="/">CAMBRA<span>CHECK-IN™</span></a><span className="ci-badge">PRUEBA REAL</span></header>
    <section className="ci-card">
      <p className="ci-eyebrow">APPLE PAY · GOOGLE PAY</p>
      <h1>Probemos tu wallet.</h1>
      <p className="ci-lead">Comprueba qué datos comparte sin escribirlos. Si te pide completar algo, cancela la prueba.</p>
      {loading && <p className="ci-notice" role="status">Comprobando la conexión real…</p>}
      {error && <div className="ci-error" role="alert"><p>{error}</p><button disabled={busy||loading} onClick={()=>setRetry(x=>x+1)}>Volver a comprobar</button></div>}
      {!loading && config && !ticket && <p className="ci-notice">No se ha podido iniciar la prueba. Pulsa Volver a comprobar.</p>}
      {!loading && config && ticket && !result && <>
        <fieldset disabled={busy}><legend>Datos que quieres solicitar</legend><div className="ci-choices">{Object.entries(profiles).map(([value,label])=><label key={value}><input type="radio" name="contact-profile" value={value} checked={profile===value} onChange={()=>{setProfile(value);setError('');}}/><span>{label}</span></label>)}</div></fieldset>
        <p className="ci-hint">{profile==='all'?'Solicitamos email, nombre, teléfono y dirección de facturación. Si te pide completar algo, puedes cancelar.':profile==='email'?'Solicitamos el email. Si ya está preparado, puede compartirse sin escribirlo.':'No solicitamos datos de contacto. Los campos vacíos no significan que no estén guardados.'}</p>
        <div className="ci-consent">Al confirmar en tu wallet, aceptas compartir los datos solicitados y guardar el método en Stripe para esta prueba de CAMBRA GLOBAL SASU. <strong>No autorizas cobros futuros.</strong></div>
        <p className="ci-hint">Pulsa tu wallet para confirmar aquí mismo.</p>
        {config.domain?.enabled && config.publishable_key
          ? <CheckInWallet key={profile+ticket+retry} publishableKey={config.publishable_key} profile={profile} onResult={setResult} onBusy={setBusy} onError={setError} prepareSetup={prepareSetup} readResult={id=>call('result',{ticket,profile,setup_intent_id:id})}/>
          : <p className="ci-notice">Las wallets aún no están habilitadas para este dominio.</p>}
        <p className="ci-small">Esta página no crea pagos ni solicita una retención de importe. Stripe o tu banco pueden pedir una verificación adicional. Estamos probando el guardado; no se garantiza ningún cobro posterior.</p>
      </>}
      {result && <section className="ci-result" aria-live="polite">
        <p className="ci-eyebrow">{result.detached?'MÉTODO DESVINCULADO':result.saved?'GUARDADO CONFIRMADO POR STRIPE':'ESTADO: '+result.status}</p>
        <h2>{result.detached?'Prueba terminada':result.status==='succeeded'?'Esto ha llegado de verdad':'Verificación pendiente'}</h2>
        {result.card && <p>{result.wallet==='apple_pay'?'Apple Pay':result.wallet==='google_pay'?'Google Pay':'Tarjeta'} · {result.card.brand} ···· {result.card.last4}</p>}
        {contact && <dl>{[['Email',contact.email],['Nombre',contact.name],['Teléfono',contact.phone],['Dirección',formatAddress(contact.address)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'No recibido'}</dd></div>)}</dl>}
        <p className="ci-small">Estos datos proceden del método recuperado desde Stripe en modo real. Comprueba que sean tuyos. «No recibido» no significa «no guardado».</p>
        <p>¿Tuviste que escribir o iniciar sesión?</p><div className="ci-observe">{['Nada, salió directamente','Tuve que completar un paso'].map(x=><button key={x} aria-pressed={observation===x} onClick={()=>setObservation(x)}>{x}</button>)}</div>
        {observation && <p className="ci-hint">{observation}. Esta observación queda solo en tu pantalla.</p>}
        {result.status!=='succeeded' && <button className="ci-action" disabled={busy} onClick={refreshResult}>Consultar estado</button>}
        {result.saved && <button className="ci-action" disabled={busy} onClick={detach}>Desvincular el método de esta prueba</button>}
        <button className="ci-link" disabled={busy} onClick={reset}>Nueva prueba</button>
      </section>}
      {config?.admin && <details className="ci-admin"><summary>Controles de la prueba</summary>
        <p className="ci-small">Conexión real verificada. Apple Pay: {config.domain?.apple_pay}. Google Pay: {config.domain?.google_pay}.</p>
        {(config.domain?.apple_pay!=='active'||config.domain?.google_pay!=='active'||!config.domain?.enabled) && <button className="ci-action" disabled={busy} onClick={activate}>Habilitar wallets en este dominio</button>}
        <button className="ci-action" disabled={busy} onClick={share}>Copiar enlace público</button>
        {invite && <><p className="ci-hint" role="status">{copyMessage}</p><input className="ci-share" readOnly value={invite} aria-label="Enlace de invitación" onFocus={e=>e.target.select()}/></>}
        <button className="ci-link" onClick={async()=>{try{setRecent((await call('recent')).trials);}catch(e){setError(message(e));}}}>Ver resultados recientes</button>
        {recent && <div className="ci-recent">{!recent.length?<p>No hay pruebas entre las últimas 100 preparaciones de Stripe.</p>:recent.map(t=><article key={t.id}><strong>{t.wallet||'Wallet sin confirmar'} · {profiles[t.profile]||t.profile}</strong><p>{new Date(t.created*1000).toLocaleString('es-ES')} · {t.status}</p><p>{Object.entries(t.fields).map(([k,v])=>k+': '+(v?'sí':'no')).join(' · ')}</p></article>)}</div>}
      </details>}
      <details className="ci-privacy"><summary>Qué se guarda y qué estamos probando</summary><p>Stripe guarda el método tokenizado y los datos de contacto recibidos bajo la cuenta de CAMBRA para esta prueba. CAMBRA puede consultar el resultado. Esta página no almacena el número completo de tarjeta ni el token de la wallet.</p><p>Puedes desvincular el método al terminar. Desvincularlo no borra los registros históricos de Stripe. La prueba no autoriza cargos, suscripciones ni recuperación de deudas. La captura de pantalla y la observación de pasos adicionales solo se comparten si tú decides hacerlo.</p><p><a href="/Privacy">Privacidad de CAMBRA</a> · <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">Privacidad de Stripe</a></p></details>
    </section>
    <footer>CAMBRA GLOBAL SASU · Prueba de CAMBRA CHECK-IN™</footer>
  </main>;
}
