import {beforeEach,describe,expect,it,vi} from 'vitest';
const {track}=vi.hoisted(()=>({track:vi.fn()}));
vi.mock('@/api/base44Client',()=>({base44:{analytics:{track}}}));
import {PRODUCT_ANALYTICS_EVENTS,hasAnalyticsConsent,sanitizeAnalyticsProperties,trackProductEvent} from './productAnalytics.js';

describe('consent-gated product analytics',()=>{
  beforeEach(()=>{track.mockClear();global.localStorage={getItem:vi.fn(()=>null)};});
  it('does not track before explicit analytics consent',()=>{expect(hasAnalyticsConsent()).toBe(false);expect(trackProductEvent('analysis_started')).toBe(false);expect(track).not.toHaveBeenCalled()});
  it('tracks only allowlisted events after consent',()=>{global.localStorage.getItem=vi.fn(()=>JSON.stringify({analytics:true}));expect(trackProductEvent('analysis_started',{source:'analyzer'})).toBe(true);expect(track).toHaveBeenCalledOnce();expect(trackProductEvent('invented_event')).toBe(false)});
  it('removes identifiers, free text, URLs and unknown properties',()=>{expect(sanitizeAnalyticsProperties({source:'analyzer',email:'person@example.com',session_id:'secret',url:'https://example.com',unknown:'x'})).toEqual({source:'analyzer'})});
  it('keeps a stable documented taxonomy',()=>{expect(PRODUCT_ANALYTICS_EVENTS).toContain('recover_accepted');expect(PRODUCT_ANALYTICS_EVENTS).toContain('critical_admin_action')});
});
