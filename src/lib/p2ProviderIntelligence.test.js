import {describe,it,expect} from 'vitest';
import {P2_MARKETS,assertP2MarketUniverse,availabilityKey,canPromoteUnavailable,verifiedAtFor,canUseForVerifiedEconomics,canInheritAcrossMarkets,currencyEvidenceConsistent,resolveIdentity} from './p2ProviderIntelligence.js';
describe('P2 provider intelligence invariants',()=>{
 it('keeps exactly 33 markets incl FR and independent LI/CH with BG EUR',()=>{expect(assertP2MarketUniverse()).toBe(true);expect(P2_MARKETS).toHaveLength(33);expect(P2_MARKETS.indexOf('LI')).not.toBe(P2_MARKETS.indexOf('CH'));});
 it('keys availability by provider product market channel',()=>{expect(availabilityKey({provider_id:'stripe',product_id:'terminal',market:'LI',channel:'IN_PERSON'})).toBe('stripe|terminal|LI|IN_PERSON');});
 it('requires evidence for UNAVAILABLE',()=>{expect(canPromoteUnavailable({availability:'UNAVAILABLE',research_state:'RESOLVED',evidence_refs:[]})).toBe(false);expect(canPromoteUnavailable({availability:'UNAVAILABLE',research_state:'RESOLVED',evidence_refs:['official']})).toBe(true);});
 it('does not fake verified_at',()=>{expect(verifiedAtFor('LOW','2026-01-01')).toBeNull();expect(verifiedAtFor('VERIFIED','2026-01-01')).toBe('2026-01-01');});
 it('isolates estimates from verified economics',()=>{expect(canUseForVerifiedEconomics({provenance:'ESTIMATED'})).toBe(false);expect(canUseForVerifiedEconomics({provenance:'CONTRACT_OBSERVED'})).toBe(true);});
 it('prohibits cross-market inheritance absent explicit scope',()=>{expect(canInheritAcrossMarkets({applicable_markets:['DE']},'IT')).toBe(false);expect(canInheritAcrossMarkets({applicable_markets:['DE','IT']},'IT')).toBe(true);});
 it('surfaces currency/evidence mismatch without equating market currency',()=>{expect(currencyEvidenceConsistent({currency:'EUR',evidence_currency:'PLN'})).toBe(false);expect(currencyEvidenceConsistent({currency:'USD',evidence_currency:'USD',market:'PL'})).toBe(true);});
 it('never fuzzy-merges similar names',()=>{expect(resolveIdentity({name:'Stripee'},[{name:'Stripe',aliases:[],domains:[]}]).outcome).toBe('UNCERTAIN');});
});
