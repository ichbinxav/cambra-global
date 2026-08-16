import { normalizeInstantlyEvent } from './outboundProvider.ts';

export const INBOUND_CONVERSATION_PROVIDER_VERSION = 'inbound-conversation-provider-1.0.0';

export interface InboundConversationProvider {
  readonly key:string;
  normalize(raw:any):any;
  validate(normalized:any):{ok:boolean;reason:string|null};
}

export class InstantlyInboundConversationProvider implements InboundConversationProvider {
  readonly key='instantly';
  normalize(raw:any){return normalizeInstantlyEvent(raw);}
  validate(event:any){
    if(!event?.event_type)return {ok:false,reason:'event_type_required'};
    if(!event?.timestamp)return {ok:false,reason:'event_timestamp_required'};
    if(event?.event_type==='reply_received'&&!event?.message_id)return {ok:false,reason:'event_message_id_required'};
    if(['reply_received','email_bounced','lead_unsubscribed','lead_not_interested','lead_wrong_person','lead_out_of_office'].includes(String(event.event_type))&&!event?.lead_email)return {ok:false,reason:'lead_email_required'};
    return {ok:true,reason:null};
  }
}

/** Constant-time comparison for provider-supplied shared-secret headers. */
export async function providerSecretMatches(expected:string,received:string){
  if(!expected||!received)return false;
  const encode=(value:string)=>new TextEncoder().encode(value);
  const [left,right]=await Promise.all([
    crypto.subtle.digest('SHA-256',encode(expected)),
    crypto.subtle.digest('SHA-256',encode(received)),
  ]);
  const a=new Uint8Array(left),b=new Uint8Array(right);
  if(a.length!==b.length)return false;
  let difference=0;
  for(let index=0;index<a.length;index++)difference|=a[index]^b[index];
  return difference===0;
}
