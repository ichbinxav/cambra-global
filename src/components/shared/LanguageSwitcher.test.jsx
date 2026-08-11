// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LanguageSwitcher from './LanguageSwitcher.jsx';
import {LanguageProvider} from '@/lib/i18n.jsx';

describe('LanguageSwitcher',()=>{
  beforeEach(()=>{
    localStorage.clear();
    Object.defineProperty(navigator,'languages',{configurable:true,value:['fr-FR','en-GB']});
    Object.defineProperty(navigator,'language',{configurable:true,value:'fr-FR'});
  });
  afterEach(()=>cleanup());

  it('starts in detected-language mode while keeping English explicitly available',()=>{
    render(<LanguageProvider><LanguageSwitcher /></LanguageProvider>);
    const select=screen.getByRole('combobox');
    expect(select.value).toBe('auto');
    expect(screen.getByRole('option',{name:'Français'})).toBeTruthy();
    expect(screen.getByRole('option',{name:'English'})).toBeTruthy();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('persists a manual choice and can return to automatic detection',async()=>{
    const user=userEvent.setup();
    render(<LanguageProvider><LanguageSwitcher /></LanguageProvider>);
    const select=screen.getByRole('combobox');
    await user.selectOptions(select,'en');
    expect(select.value).toBe('en');
    expect(localStorage.getItem('cambra_lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    await user.selectOptions(select,'auto');
    expect(select.value).toBe('auto');
    expect(localStorage.getItem('cambra_lang')).toBeNull();
    expect(document.documentElement.lang).toBe('fr');
  });
});
