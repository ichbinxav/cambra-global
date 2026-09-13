import { useEffect, useRef, useState } from 'react';

let scriptPromise;
export function loadWalletStripe() {
  if (typeof window.Stripe === 'function') return Promise.resolve(window.Stripe);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/dahlia/stripe.js';
    script.async = true;
    const timer = window.setTimeout(() => {
      script.remove(); scriptPromise = null;
      reject(new Error('No se ha podido cargar Stripe en 20 segundos.'));
    }, 20000);
    script.onload = () => {
      window.clearTimeout(timer);
      if (typeof window.Stripe === 'function') resolve(window.Stripe);
      else {scriptPromise=null;reject(new Error('Stripe no ha podido inicializarse.'));}
    };
    script.onerror = () => {
      window.clearTimeout(timer);script.remove();scriptPromise=null;
      reject(new Error('El navegador no ha podido descargar Stripe.'));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export default function CheckInWallet({publishableKey, profile, onResult, onBusy, onError, prepareSetup, readResult}) {
  const mount = useRef(null);
  const callbacks = useRef({});
  callbacks.current = {onResult,onBusy,onError,prepareSetup,readResult};
  const [stage,setStage] = useState('Cargando Stripe…');
  const [available,setAvailable] = useState(null);
  const [loadError,setLoadError] = useState('');
  useEffect(() => {
    let active=true, element, timer, confirming=false;
    setStage('Cargando Stripe…');setAvailable(null);setLoadError('');
    const fail = e => {
      if(!active)return;
      const text=e?.message || 'La wallet no se ha podido cargar.';
      setLoadError(text);setStage('');callbacks.current.onError(text);
    };
    async function start() {
      try {
        const Stripe=await loadWalletStripe();
        if(!active)return;
        const stripe=Stripe(publishableKey);
        const elements=stripe.elements({mode:'setup',currency:'eur',paymentMethodTypes:['card'],locale:'es',
          appearance:{theme:'night',variables:{colorPrimary:'#dcff85',colorBackground:'#1b1b1e',colorText:'#ffffff',borderRadius:'12px'}}});
        element=elements.create('expressCheckout',{
          business:{name:'CAMBRA CHECK-IN™'},
          emailRequired:profile!=='none',phoneNumberRequired:profile==='all',
          billingAddressRequired:profile==='all',shippingAddressRequired:false,
          paymentMethods:{applePay:'auto',googlePay:'auto',link:'never',paypal:'never',amazonPay:'never',klarna:'never'},
          buttonTheme:{applePay:'white',googlePay:'white'},buttonHeight:52,
          layout:{maxColumns:1,maxRows:2,overflow:'never'}
        });
        // Subscribe before mounting, so a synchronous ready/error cannot be lost.
        element.on('ready',e=>{
          if(!active)return;
          window.clearTimeout(timer);setStage('');setLoadError('');
          setAvailable(e.availablePaymentMethods || {});callbacks.current.onError('');
        });
        element.on('loaderror',e=>{window.clearTimeout(timer);fail(e.error);});
        element.on('cancel',()=>callbacks.current.onError('Prueba cancelada. Si te pidió completar datos, anótalo como un paso adicional.'));
        element.on('confirm',async event=>{
          if(confirming||!active)return;confirming=true;
          callbacks.current.onBusy(true);callbacks.current.onError('');
          try{
            const submitted=await elements.submit();
            if(submitted.error)throw submitted.error;
            const setup=await callbacks.current.prepareSetup();
            if(!active)return;
            const b=event.billingDetails;
            const details=b?Object.fromEntries(Object.entries({name:b.name,email:b.email,phone:b.phone,address:b.address}).filter(([,v])=>v!=null)):null;
            const confirmed=await stripe.confirmSetup({elements,clientSecret:setup.client_secret,
              confirmParams:{return_url:window.location.origin+'/checkin-demo',
                ...(details?{payment_method_data:{billing_details:details}}:{})},redirect:'if_required'});
            if(confirmed.error)throw confirmed.error;
            const result=await callbacks.current.readResult(setup.setup_intent_id);
            if(active)callbacks.current.onResult(result);
          }catch(e){if(active)callbacks.current.onError(e?.message || 'No se ha podido completar la prueba.');event.paymentFailed?.({reason:'fail'});}
          finally{confirming=false;if(active)callbacks.current.onBusy(false);}
        });
        setStage('Cargando los botones de tu wallet…');
        timer=window.setTimeout(()=>fail(new Error('Stripe no ha terminado de cargar los botones. La prueba no se ha completado.')),20000);
        element.mount(mount.current);
      }catch(e){window.clearTimeout(timer);fail(e);}
    }
    start();
    return ()=>{active=false;window.clearTimeout(timer);element?.destroy();};
  },[publishableKey,profile]);
  return <div className="ci-wallet">
    {stage && <p role="status">{stage}</p>}
    <div ref={mount}/>
    {loadError && <p className="ci-small" role="status">La carga se ha detenido. Usa «Volver a comprobar» para reiniciar.</p>}
    {available && !available.applePay && !available.googlePay && <p className="ci-notice">Stripe no encuentra una wallet disponible en este navegador. Prueba Safari con Apple Pay o Chrome con Google Pay configurado.</p>}
  </div>;
}
