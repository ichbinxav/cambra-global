#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {collectSourceTreeEntries} from './lib/sourceTreeHash.mjs';

// AUDIT DEP-04 (2026-08-17): widened to cover credential classes this platform
// demonstrably handles (Stripe rk_live_ restricted keys, GitHub fine-grained PATs,
// webhook signing secrets, Resend API keys, Perplexity, Google API keys, SendGrid,
// Slack tokens, connection strings with embedded passwords).
const detectors=[
  ['AWS_ACCESS_KEY',/AKIA[0-9A-Z]{16}/g],
  ['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['STRIPE_LIVE_SECRET',/sk_live_[A-Za-z0-9]{16,}/g],
  ['STRIPE_LIVE_RESTRICTED',/rk_live_[A-Za-z0-9]{16,}/g],
  ['GITHUB_TOKEN',/gh[pousr]_[A-Za-z0-9]{20,}/g],
  ['GITHUB_FINE_GRAINED_PAT',/github_pat_[A-Za-z0-9_]{20,}/g],
  ['OPENAI_SECRET',/(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{24,}/g],
  ['ANTHROPIC_SECRET',/(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['WEBHOOK_SIGNING_SECRET',/(?<![A-Za-z0-9])whsec_[A-Za-z0-9]{20,}/g],
  ['RESEND_API_KEY',/(?<![A-Za-z0-9])re_[A-Za-z0-9]{20,}/g],
  ['PERPLEXITY_KEY',/(?<![A-Za-z0-9])pplx-[A-Za-z0-9]{20,}/g],
  ['GOOGLE_API_KEY',/AIza[0-9A-Za-z_-]{35}/g],
  ['SLACK_TOKEN',/xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['SENDGRID_KEY',/(?<![A-Za-z0-9])SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g],
  ['CONNECTION_STRING_WITH_PASSWORD',/(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@\/]+:[^\s@\/]{4,}@[^\s\/]+/g],
];
const binary=/\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip)$/i,findings=[];
for(const entry of collectSourceTreeEntries('.')){
  if(binary.test(entry.path)||entry.path==='scripts/check-secrets.mjs')continue;
  const text=fs.readFileSync(path.resolve(entry.path),'utf8');
  for(const [kind,pattern] of detectors){
    pattern.lastIndex=0;
    for(const match of text.matchAll(pattern)){
      // Explicitly fake example values are documentation, not credentials. The
      // boundary assertions above still catch a real token embedded in prose.
      if(match[0].toLowerCase().includes('fake'))continue;
      const line=text.slice(0,match.index).split('\n').length;
      findings.push({kind,path:entry.path,line});
    }
  }
}
if(findings.length){for(const finding of findings)console.error(`secrets:check FAIL — ${finding.kind} candidate at ${finding.path}:${finding.line} (value redacted)`);process.exit(1)}
console.log('secrets:check PASS — no known high-confidence credential pattern found in the canonical source set');
