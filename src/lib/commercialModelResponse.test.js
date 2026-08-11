import {describe,it,expect} from 'vitest';
import {extractAnthropicText} from '../../base44/shared/anthropicResponse.ts';

describe('Anthropic response boundary',()=>{
  it('reads every text block without exposing thinking or tool payloads',()=>{
    const payload={content:[
      {type:'thinking',thinking:'private reasoning'},
      {type:'text',text:'first'},
      {type:'tool_use',input:{secret:'hidden'}},
      {type:'text',text:'second'},
    ]};
    expect(extractAnthropicText(payload)).toBe('first\nsecond');
    expect(extractAnthropicText({content:[{type:'thinking',thinking:'private'}]})).toBe('');
  });
});
