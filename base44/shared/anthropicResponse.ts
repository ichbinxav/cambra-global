/** Return only user-visible text blocks. Thinking/tool blocks are never exposed. */
export function extractAnthropicText(payload:any){
  if(!Array.isArray(payload?.content)) return '';
  return payload.content
    .filter((part:any)=>part?.type==='text'&&typeof part?.text==='string')
    .map((part:any)=>part.text)
    .join('\n')
    .trim();
}
