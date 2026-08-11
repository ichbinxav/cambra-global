// Legacy P6 lead-fit scorer. Despite the historical function name, this is
// not canonical P5 merchant economics and must never emit savings, rates or
// executable recommendations. Canonical P5 lives in p5OpportunityEngine.js
// and MerchantOpportunity.jsonc.
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:null}
function s(v:any){return String(v||'').toLowerCase()}
export function deterministicMerchantOpportunity(lead:any){
 const e=lead?.enrichment_json||{}; const raw=lead?.raw_json||{}; const org=raw?.organization||e?.organization||{};
 const employees=n(e?.employee_count??org?.estimated_num_employees??org?.num_employees); const stores=n(e?.store_count??org?.store_count);
 const revenue=n(e?.annual_revenue??org?.annual_revenue); const traffic=n(e?.monthly_traffic??org?.monthly_traffic);
 const tech=JSON.stringify([e?.technologies,e?.tech_stack,org?.technologies,raw?.technologies]).toLowerCase(); const blob=JSON.stringify([e,org,raw]).toLowerCase();
 let commerce=0,economic=0,payments=0,decision=0,timing=0,confidence=0;
 if(/ecommerce|e-commerce|retail|dtc|shopify|woocommerce|bigcommerce|prestashop|magento/.test(blob)) commerce+=15;
 if(/shopify|woocommerce|bigcommerce|prestashop|magento/.test(tech)) commerce+=8; if(stores&&stores>0) commerce+=Math.min(7,stores>=5?7:4);
 if(employees!=null) economic+=employees>=200?18:employees>=50?14:employees>=10?9:3; if(revenue!=null) economic+=revenue>=10000000?10:revenue>=2000000?7:3; if(traffic!=null) economic+=traffic>=100000?6:traffic>=20000?4:1; if(stores!=null) economic+=stores>=10?6:stores>=2?3:0;
 if(/stripe|adyen|mollie|paypal|klarna|worldline|checkout\.com|sumup|zettle|square|payplug|payment|psp|pos|tpv/.test(blob)) payments+=12; if(/international|multi.?country|omnichannel|multi.?store|cross.?border/.test(blob)) payments+=6;
 const title=s(lead?.contact_title); if(/founder|chief executive|ceo|chief financial|cfo|chief operating|coo|head of (ecommerce|e-commerce|payments|finance)|director.*(ecommerce|payments|finance)/.test(title)) decision=15; else if(/vp|vice president|director|head/.test(title)) decision=9; else decision=3;
 if(/funding|raised|series [a-d]|expansion|expanding|new store|new market|hiring|growth/.test(blob)) timing=10;
 if(lead?.contact_email) confidence+=2;if(lead?.company_domain)confidence+=1;if(lead?.enriched)confidence+=1;if(lead?.source)confidence+=1;
 commerce=Math.min(25,commerce);economic=Math.min(25,economic);payments=Math.min(20,payments);confidence=Math.min(5,confidence);
 let penalty=0;if(commerce<8)penalty-=40;if(employees!=null&&employees<5&&economic<8)penalty-=20;if(decision<9)penalty-=10;
 const rawScore=commerce+economic+payments+decision+timing+confidence+penalty; const opportunity=Math.max(0,Math.min(100,rawScore));
 const evidenceCount=[employees,revenue,traffic,stores].filter(v=>v!=null).length+[/shopify|woocommerce|bigcommerce|prestashop|magento/.test(tech),/stripe|adyen|mollie|paypal|klarna|worldline|checkout\.com|sumup|zettle|square|payplug/.test(blob)].filter(Boolean).length;
 const evidenceConfidence=Math.min(1,0.25+evidenceCount*.12+(lead?.enriched?.2:0)+(lead?.contact_email?.1:0));
 return {opportunity_score:opportunity,evidence_confidence:Number(evidenceConfidence.toFixed(2)),breakdown:{commerce_fit:commerce,economic_potential:economic,payments_complexity:payments,decision_maker:decision,timing,data_confidence:confidence,penalties:penalty},signals:{employees,revenue,monthly_traffic:traffic,store_count:stores,commerce_platform:/shopify/.test(tech)?'shopify':/woocommerce/.test(tech)?'woocommerce':/prestashop/.test(tech)?'prestashop':/magento/.test(tech)?'magento':null,payment_provider:(blob.match(/stripe|adyen|mollie|paypal|klarna|worldline|checkout\.com|sumup|zettle|square|payplug/)||[])[0]||null},evidence_count:evidenceCount};
}
