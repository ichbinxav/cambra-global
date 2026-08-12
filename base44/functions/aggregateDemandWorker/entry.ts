import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { annualize, aggregationPowerScore, apsLabel, poolStatusFromAPS, committedVolumeFromExplicitCommitments } from '../../shared/aggregateCore.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

const slug=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const now=()=>new Date().toISOString();

guardedScheduledServe({"worker_key":"aggregateDemandWorker","cadence_seconds":21600},createClientFromRequest,async(req)=>{
  try{
    const b=createClientFromRequest(req); const body=await req.json().catch(()=>({}));
    const g=await requireAdminOrInternal(req,b,body); if(!g.ok)return g.response;
    const s=b.asServiceRole;
    const obs=await s.entities.PaymentRoutingObservation.filter({data_classification:'production',learning_eligible:true,is_demo:false},'-created_date',5000).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'}));
    const brands=await s.entities.Brand.list('-created_date',2000).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'}));
    const routingOpp=await s.entities.RoutingOpportunity.filter({status:{$in:['candidate','qualified','recommended']},is_demo:false},'-created_at',3000).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'}));
    const recover=await s.entities.DealActivation.filter({vertical:'payments',status:{$in:['authorized','migrating','live','monetizing']}},'-last_updated',3000).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'}));
    const commitments=await s.entities.AggregateCommitment.filter({status:{$in:['explicitly_authorized','active']}},'-created_at',3000).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'}));
    const brandById=new Map(brands.map((x:any)=>[String(x.id),x]));
    const oppByBrand=new Map<string,any[]>(); for(const x of routingOpp)oppByBrand.set(String(x.brand_id),[...(oppByBrand.get(String(x.brand_id))||[]),x]);
    const recoverBrands=new Set(recover.map((x:any)=>String(x.brand_id)));
    const byBrand=new Map<string,any[]>(); for(const o of obs)byBrand.set(String(o.brand_id),[...(byBrand.get(String(o.brand_id))||[]),o]);
    let demandCreated=0,demandUpdated=0; const demandRows:any[]=[];

    for(const [brandId,rows] of byBrand){
      const brand=brandById.get(brandId); if(!brand||brand.is_demo)continue;
      const groups=new Map<string,any[]>();
      for(const o of rows){
        const country=String(o.merchant_country||brand.country||'').toUpperCase(); const currency=String(o.currency||'EUR').toUpperCase(); const channel=String(o.channel||'online'); const provider=slug(o.provider_slug);
        const key=`payments|${country||'XX'}|${currency}|${channel}|${provider}`; groups.set(key,[...(groups.get(key)||[]),o]);
      }
      for(const [key,rs] of groups){
        let observed=0,tx=0,weightedConfidence=0;
        for(const r of rs){
          const derivedDays=((Date.parse(r.window_to||'')-Date.parse(r.window_from||''))/86400000);
          const days=r.granularity==='aggregate_window'?Math.max(1,Number(r.feature_json?.window_days||derivedDays||90)):365;
          const vol=Number(r.granularity==='transaction'?r.amount_minor:r.gross_volume_minor||0);
          observed+=annualize(vol,days); tx+=annualize(Number(r.granularity==='transaction'?1:r.transaction_count||0),days); weightedConfidence+=Number(r.data_quality_json?.confidence||.7);
        }
        const confidence=Math.min(1,weightedConfidence/Math.max(1,rs.length));
        const brandOpp=oppByBrand.get(brandId)||[]; const hasAddressability=brandOpp.some((x:any)=>Number(x.confidence||0)>=.6)||recoverBrands.has(brandId);
        const migrationReadiness=hasAddressability?Math.min(1,Math.max(.6,...brandOpp.map((x:any)=>Number(x.confidence||0)))):0;
        const addressable=hasAddressability?Math.round(observed*migrationReadiness):0;
        const cRows=commitments.filter((c:any)=>String(c.brand_id)===brandId); const committed=committedVolumeFromExplicitCommitments(cRows); const probable=Math.min(addressable,Math.round(addressable*confidence));
        const [vertical,country,currency,channel,provider]=key.split('|'); const demandKey=`${brandId}|${key}`;
        const row={demand_key:demandKey,brand_id:brandId,vertical,subcategory:'payment_processing',country,currency,channel,current_provider_slug:provider,observed_annual_volume_minor:observed,addressable_annual_volume_minor:addressable,committed_annual_volume_minor:committed,probable_annual_volume_minor:probable,transaction_count_annualized:tx,annual_spend_minor:0,migration_readiness:migrationReadiness,switching_friction:hasAddressability?1-migrationReadiness:1,confidence,demand_profile_json:{source:'routing_intelligence',payment_method_mix:'not_invented',card_mix:'not_invented',risk_profile:'unknown_unless_observed'},evidence_json:{routing_observation_ids:rs.map((x:any)=>x.id).slice(0,200),routing_opportunity_ids:brandOpp.map((x:any)=>x.id).slice(0,50),recover_present:recoverBrands.has(brandId),commitment_ids:cRows.map((x:any)=>x.id),committed_volume_rule:'explicit AggregateCommitment only'},data_classification:'production',updated_at:now(),is_demo:false};
        const old=await s.entities.DemandUnit.filter({demand_key:demandKey},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'})); let saved:any;
        if(old[0]){saved=await s.entities.DemandUnit.update(old[0].id,row);demandUpdated++;}else{saved=await s.entities.DemandUnit.create(row);demandCreated++;} demandRows.push(saved);
      }
    }

    const poolGroups=new Map<string,any[]>(); for(const d of demandRows){const k=`${d.vertical}|${d.country||'XX'}|${d.currency}|${d.channel||'online'}`;poolGroups.set(k,[...(poolGroups.get(k)||[]),d]);}
    let poolsUpdated=0,membersUpdated=0;
    for(const [key,rows] of poolGroups){
      const [vertical,country,currency,channel]=key.split('|');
      const observed=rows.reduce((a:number,x:any)=>a+Number(x.observed_annual_volume_minor||0),0); const addressable=rows.reduce((a:number,x:any)=>a+Number(x.addressable_annual_volume_minor||0),0); const committed=rows.reduce((a:number,x:any)=>a+Number(x.committed_annual_volume_minor||0),0); const probable=rows.reduce((a:number,x:any)=>a+Number(x.probable_annual_volume_minor||0),0); const tx=rows.reduce((a:number,x:any)=>a+Number(x.transaction_count_annualized||0),0);
      const confidence=rows.reduce((a:number,x:any)=>a+Number(x.confidence||0),0)/Math.max(1,rows.length); const migration=rows.reduce((a:number,x:any)=>a+Number(x.migration_readiness||0),0)/Math.max(1,rows.length); const concentration=Math.max(0,...rows.map((x:any)=>observed?Number(x.observed_annual_volume_minor||0)/observed:0));
      const old=await s.entities.AggregatePool.filter({pool_key:key},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'})); const merchantCount=new Set(rows.map((x:any)=>x.brand_id)).size;
      const score=aggregationPowerScore({addressable_annual_volume_minor:addressable,committed_annual_volume_minor:committed,merchant_count:merchantCount,migration_readiness:migration,confidence,concentration,growth_rate:0});
      const patch={pool_key:key,vertical,subcategory:'payment_processing',country,currency,channel,status:poolStatusFromAPS(score,old[0]?.status),merchant_count:merchantCount,observed_annual_volume_minor:observed,addressable_annual_volume_minor:addressable,committed_annual_volume_minor:committed,probable_annual_volume_minor:probable,confidence_adjusted_volume_minor:Math.round(addressable*confidence),transaction_count_annualized:tx,aggregation_power_score:score,readiness_label:apsLabel(score),migration_readiness:migration,concentration,growth_rate:0,next_negotiation_threshold_json:{next_aps:score<50?50:score<65?65:score<80?80:90},updated_at:now()};
      const pool=old[0]?await s.entities.AggregatePool.update(old[0].id,patch):await s.entities.AggregatePool.create(patch); poolsUpdated++;
      for(const d of rows){const mk=`${pool.id}|${d.brand_id}|${d.id}`;const m={membership_key:mk,pool_id:pool.id,brand_id:d.brand_id,demand_unit_id:d.id,status:Number(d.addressable_annual_volume_minor||0)>0?'eligible':'potential',observed_volume_minor:d.observed_annual_volume_minor,addressable_volume_minor:d.addressable_annual_volume_minor,committed_volume_minor:d.committed_annual_volume_minor,confidence:d.confidence,joined_at:now(),updated_at:now()};const om=await s.entities.AggregatePoolMember.filter({membership_key:mk},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:[],severity:'secondary'}));if(om[0])await s.entities.AggregatePoolMember.update(om[0].id,{...m,joined_at:om[0].joined_at||now()});else await s.entities.AggregatePoolMember.create(m);membersUpdated++;}
      await s.entities.Event.create({brand_id:'_platform',event_type:'aggregate.pool.updated',source:'aggregate_demand_worker',entity_type:'AggregatePool',entity_id:pool.id,payload_json:{pool_key:key,merchant_count:merchantCount,observed_annual_volume_minor:observed,addressable_annual_volume_minor:addressable,committed_annual_volume_minor:committed,aps:score,truthful_volume_classes:true},status:'processed',processed_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'aggregateDemandWorker',fallback:null,severity:'secondary'}));
    }
    return Response.json({ok:true,production_observations:obs.length,demand_created:demandCreated,demand_updated:demandUpdated,pools_updated:poolsUpdated,members_updated:membersUpdated,note:'Committed volume is sourced only from explicit AggregateCommitment records. Founder/internal/test observations are excluded.'});
  }catch(e){console.error(e);return Response.json({ok:false,error:'aggregate_demand_worker_failed'},{status:500});}
});
