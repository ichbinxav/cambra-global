import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sendSource = fs.readFileSync(
  path.join(ROOT, 'base44/functions/commercialSendMessage/entry.ts'),
  'utf8',
);
const safetySource = fs.readFileSync(
  path.join(ROOT, 'base44/shared/commercialSendSafety.ts'),
  'utf8',
);

describe('commercial email signatures', () => {
  it('enforces an organizational signature derived from the configured sending identity', () => {
    expect(sendSource).toContain('function ensureSignature');
    expect(sendSource).toMatch(/const signedText\s*=\s*ensureSignature/);
    expect(sendSource).toMatch(/title:\s*["']Founder Office["'],\s*email/);
    expect(sendSource).toContain('configuredSignatureEmail');
    expect(sendSource).toMatch(/Deno\.env\.get\(["']CAMBRA_OUTLOOK_SIGNATURE_EMAIL["']\)/);
    expect(sendSource).not.toMatch(/name:\s*["']Xavi M\. Contero["']/);
    expect(sendSource).not.toContain('xavi@cambra.global');
    expect(sendSource).toContain('www.cambra.global');
    expect(sendSource).toMatch(/text_body:\s*signedText/);
  });

  it('omits unknown mailbox identity and fails closed for unconfigured Resend', () => {
    expect(sendSource).toMatch(/const mail\s*=\s*i\.email/);
    expect(sendSource).toMatch(/new Error\(["']resend_from_identity_required["']\)/);
  });

  it('sends signed body through Outlook, Resend and the Instantly transport adapter', () => {
    expect(sendSource).toMatch(
      /executeOutlookAcceptedTransport\([\s\S]*?html:\s*signedHTML[\s\S]*?thread_id:\s*thread\.id/,
    );
    expect(safetySource).toMatch(
      /body:\s*\{\s*contentType:\s*["']HTML["'],\s*content:\s*String\(input\?\.html\s*\|\|\s*["']["']\)\s*\}/,
    );
    expect(sendSource).toMatch(/provider\s*===\s*["']resend["'][\s\S]*?text:\s*signedText,\s*html:\s*signedHTML/);
    expect(sendSource).toMatch(/provider\s*===\s*["']instantly["'][\s\S]*?text:\s*signedText/);
    expect(sendSource).toMatch(/text:\s*signedText,\s*html:\s*signedHTML/);
    expect(sendSource).toContain('CAMBRA_LOGO');
  });
});
