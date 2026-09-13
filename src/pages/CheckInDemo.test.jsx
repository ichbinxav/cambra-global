// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
const state=vi.hoisted(()=>({invoke:vi.fn(),options:null,confirm:vi.fn()}));
vi.mock('@/api/base44Client',()=>({base44:{functions:{invoke:state.invoke}}}));
import CheckInDemoGate, { CheckInDemoContent as CheckInDemo } from './CheckInDemo';
beforeEach(()=>{
 cleanup();sessionStorage.clear();state.options=null;state.confirm.mockReset().mockResolvedValue({});
 window.Stripe=()=>({
   confirmSetup:state.confirm,
   elements:options=>{
     state.options=options;
     return {submit:async()=>({}),create:()=>{
       const handlers={};let button;
       return {
         on:(name,handler)=>{handlers[name]=handler;},
         mount:node=>{
           if(!handlers.ready)throw Error('Ready listener must be registered before mount');
           button=document.createElement('button');button.textContent='Native wallet';
           button.onclick=()=>handlers.confirm({billingDetails:{email:'trial@example.invalid'}});
           node.append(button);handlers.ready({availablePaymentMethods:{applePay:true}});
         },
         destroy:()=>button?.remove()
       };
     }};
   }
 });
 state.invoke.mockReset().mockImplementation(async(name,b)=>{
  if(b.action==='status')return {data:{public_access:true,ticket:'private-session',publishable_key:'pk_test_fake',domain:{enabled:true}}};
  if(b.action==='setup')return {data:{setup_intent_id:'seti_trial',client_secret:'seti_trial_secret_fake'}};
  if(b.action==='result')return {data:{status:'succeeded',saved:true,contact:{email:'trial@example.invalid'},fields:{email:true}}};
  throw Error('Unexpected action '+b.action);
 });
});
describe('Public wallet initialization',()=>{
 it('opens only embedded wallets and creates setup after wallet confirmation',async()=>{
  render(<CheckInDemo/>);
  const wallet=await screen.findByRole('button',{name:'Native wallet'});
  expect(state.invoke.mock.calls.some(([,b])=>b.action==='setup')).toBe(false);
  expect(screen.queryByRole('button',{name:/Abrir prueba en Stripe/})).toBeNull();
  expect(state.options).toMatchObject({mode:'setup',currency:'eur',paymentMethodTypes:['card']});
  expect(state.options.clientSecret).toBeUndefined();
  fireEvent.click(wallet);
  await screen.findByText('Esto ha llegado de verdad');
  expect(state.invoke).toHaveBeenCalledWith('checkin-wallet-demo',expect.objectContaining({action:'setup',ticket:'private-session',consent:'wallet-demo-v1'}));
  expect(state.confirm).toHaveBeenCalledWith(expect.objectContaining({clientSecret:'seti_trial_secret_fake',redirect:'if_required'}));
  expect(state.invoke.mock.calls.filter(([,b])=>b.action==='setup')).toHaveLength(1);
 });
 it('confirms the selected contact profile after remounting the wallet',async()=>{
  render(<CheckInDemo/>);
  await screen.findByRole('button',{name:'Native wallet'});
  fireEvent.click(screen.getByRole('radio',{name:'Todos los datos'}));
  fireEvent.click(await screen.findByRole('button',{name:'Native wallet'}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('checkin-wallet-demo',expect.objectContaining({action:'setup',profile:'all'})));
 });
 it('does not confirm a method when the server refuses setup',async()=>{
  const normal=state.invoke.getMockImplementation();
  state.invoke.mockImplementation((name,b)=>b.action==='setup'?Promise.reject(new Error('Operación detenida')):normal(name,b));
  render(<CheckInDemo/>);
  fireEvent.click(await screen.findByRole('button',{name:'Native wallet'}));
  await screen.findByText('Operación detenida');
  expect(state.confirm).not.toHaveBeenCalled();
  expect(screen.queryByText('Esto ha llegado de verdad')).toBeNull();
 });
});

it('keeps the editor preview out of the live wallet flow',()=>{
  render(<CheckInDemoGate/>);
  expect(screen.getByRole('link',{name:'Abrir la prueba en cambra.global ↗'}).getAttribute('href')).toBe('https://cambra.global/checkin-demo');
  expect(state.invoke).not.toHaveBeenCalled();
});
