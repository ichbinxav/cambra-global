// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const {invoke,analyticsTrack}=vi.hoisted(()=>({invoke:vi.fn(),analyticsTrack:vi.fn()}));
vi.mock('@/api/base44Client',()=>({base44:{functions:{invoke},analytics:{track:analyticsTrack}}}));
import RecoverMandateModal from './RecoverMandateModal.jsx';
import {LanguageProvider} from '@/lib/i18n.jsx';

const context={deal_activation_id:'deal-1',legal_entity_name:'Example SARL',document_version:'recover-v1',snapshot:{fee_pct:25,projected_savings_annual:12000},baseline:{baseline_value:100000,verified_at:'2026-08-01T00:00:00.000Z'},evidence_attestation:{text:'I confirm the evidence.'},mandate_copy:{checkbox:'I can bind Example SARL and accept.',summary:{},titles:{limits:'Limits'},limits_bullets:['No binding provider contract without approval.']}};
const startResponse={data:{mandate_id:'mandate-1',acceptance_snapshot:context.snapshot,evidence_preview:{current_rate_pct:2.5}}};
const renderModal=(props={})=>render(<LanguageProvider><RecoverMandateModal context={context} onClose={vi.fn()} onAccepted={vi.fn()} {...props}/></LanguageProvider>);

describe('RecoverMandateModal',()=>{
  beforeEach(()=>{invoke.mockReset();analyticsTrack.mockReset();localStorage.clear();invoke.mockImplementation((name)=>name==='startRecoverAcceptance'?Promise.resolve(startResponse):Promise.resolve({data:{ok:true}}));});
  afterEach(()=>cleanup());

  it('requires a signer name and both attestations, then sends the exact acceptance boundary',async()=>{
    const user=userEvent.setup();const onAccepted=vi.fn();renderModal({onAccepted});
    const accept=await screen.findByRole('button',{name:/Accept and authorize/i});
    expect(accept.disabled).toBe(true);
    await user.type(screen.getByLabelText('Your full name'),'Jane Doe');
    expect(accept.disabled).toBe(true);
    const checks=screen.getAllByRole('checkbox');expect(checks).toHaveLength(2);
    await user.click(checks[0]);expect(accept.disabled).toBe(true);
    await user.click(checks[1]);expect(accept.disabled).toBe(false);
    await user.click(accept);
    await waitFor(()=>expect(invoke).toHaveBeenCalledWith('acceptRecoverMandate',{mandate_id:'mandate-1',signed_by_name:'Jane Doe',signed_by_role:'',evidence_attestation_accepted:true,accepted:true}));
    expect(onAccepted).toHaveBeenCalledOnce();
  });

  it('surfaces terms_changed and never reports acceptance',async()=>{
    const user=userEvent.setup();const onAccepted=vi.fn();invoke.mockImplementation((name)=>name==='startRecoverAcceptance'?Promise.resolve(startResponse):Promise.resolve({data:{error:'terms_changed'}}));renderModal({onAccepted});
    const accept=await screen.findByRole('button',{name:/Accept and authorize/i});
    await user.type(screen.getByLabelText('Your full name'),'Jane Doe');
    for(const checkbox of screen.getAllByRole('checkbox'))await user.click(checkbox);
    await user.click(accept);
    expect((await screen.findByRole('alert')).textContent).toContain('The terms changed');
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
