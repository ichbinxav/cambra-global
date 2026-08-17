# DASHBOARD CORE — C12 decision log

**Date:** 2026-08-17
**Scope:** The two CRITICAL browser writes the legacy-routes ratchet has carried since C0 —
OAuth app registration and webhook endpoint configuration.

---

## 1. What the CRITICAL framing got wrong, and what it got right

The ratchet recorded these as "credential or standing-configuration writes from the browser".
Two parts of the natural reading are wrong, and saying so matters as much as the fix.

**The randomness was never the problem.** Both panels used `crypto.getRandomValues` over 24
bytes — a CSPRNG producing 192 bits. That is not a weak secret.

**The token endpoint is correct.** `oauthToken/entry.ts` requires a `client_secret` for
confidential clients and compares it in constant time. `oauthAuthorize` validates the
`redirect_uri` against the stored allowlist and the requested scopes against the stored
`allowed_scopes`. And the OAuth secret was correctly never sent to the server: only its
SHA-256 and last four characters were stored, which for a high-entropy random token is right,
unlike for a password.

**What is actually wrong: the entity write WAS the trust decision.** Every one of those
correct server-side controls reads a field that a generic browser CRUD call set.

| Control | Reads | Who set it |
| --- | --- | --- |
| `oauthAuthorize:77` — PKCE enforcement | `app.pkce_required` | the browser |
| `oauthAuthorize:76` — redirect allowlist | `app.redirect_uris` | the browser |
| `oauthAuthorize:98` — scope allowlist | `app.allowed_scopes` | the browser |
| `oauthToken:110` — confidential branch | `app.type`, `app.client_secret_hash` | the browser |

`oauthAuthorize:77` is the sharpest case, because it is literally
`if (app.pkce_required && !code_challenge)`. **PKCE is enforced only when the stored flag says
so.** A caller able to write the entity could switch it off, and nothing else in the flow
would notice.

Nothing checked the redirect URIs at all — not that they were https, absolute, wildcard-free,
or not pointing at a loopback or metadata host. The allowlist `oauthAuthorize` enforces was
simply whatever the browser wrote into it.

And there was **no server-side scope catalog for OAuth apps**. One existed, inside
`createApiKey`, for API keys only.

---

## 2. The webhook hard delete

`WebhookEndpoint.delete(id)` behind a browser `confirm()` destroyed the signing secret, the
delivery history, the failure count and the auto-disable timestamp. No undo, and no record of
who did it.

The entity already declares a `disabled` status. So the delete was never necessary: disabling
stops delivery and keeps everything that lets a past delivery be explained or an accidental
action be reversed.

**Decision:** the hard delete is refused, by name, with the alternative stated
(`hard_delete_refused` → `integration_disable_webhook`). It is answered rather than omitted so
a caller that used to delete learns what to do instead of getting "not implemented". Disabling
requires a reason and reports `deleted: false` plus what it retained, so "disabled" is never
read as "gone".

Webhook URLs are now validated too: https only, no embedded credentials, and no loopback,
private-range or cloud-metadata host. A webhook URL is a request the platform will make on a
schedule, so an unvalidated one is a server-side request to wherever the caller says.

---

## 3. One scope catalog instead of three

The scope list existed in `createApiKey/entry.ts` and again in `runApiSelfTests/entry.ts`, and
the OAuth panel had none. Three copies of an authorization vocabulary is the same
shadow-authority shape as C11's second field named "revenue share": whichever copy a caller
happens to be validated against decides what it can reach.

`base44/shared/apiScopeCatalog.ts` is now the single catalog, extracted verbatim from
`createApiKey`, which was the de facto authority.

**`runApiSelfTests` deliberately does NOT import it.** A self-test that imports the thing it
tests tests nothing. It stays an independent second statement of the same set, and
`integration:check` fails if the two diverge.

**They had diverged:** the self-test list was missing `read:users`, which `createApiKey` would
issue. Corrected.

`PRIVILEGED_SCOPES` (`admin`, `platform`, `write`, `manage:integrations`) are refused for a
third-party OAuth app. An API key, which is first-party, may still hold them.

---

## 4. A vacuous check I wrote and caught

Verifying that the catalog and the self-test list agreed, my first comparison printed
`match: true` — because both extractions had returned **zero entries**. A regex failure read
as agreement.

The extraction in `integration:check` now **throws** when it finds no entries, so an empty
extraction fails loudly instead of passing quietly.

This is the fourth time in this programme a check has been satisfiable without checking
anything, and the four have a single shape:

1. C4/C9 — a comment quoting the forbidden pattern made the gate fail on prose.
2. C11 — a check for a phrase was satisfied by the corrective comment I had just written.
3. C11 — the Benchmarks marker matched a *pointer* to the logic, not the false claim.
4. C12 — a comparison of two lists that were both empty.

**A check that greps text cannot tell a claim from a description of a claim, and a check that
compares extractions must fail when an extraction is empty.** Assert on something only the
implementation can produce.

---

## 5. What the panels do now

Both go through preview → confirm on the `integration_` logical route. The preview shows the
scopes and redirect URIs back, because **those two lists are the app's authority** and the old
panel installed them without ever displaying them.

The plaintext secret is still shown exactly once and never stored — that property was right and
is kept deliberately. The difference is that the server generates it, so it can bind the secret
to the row it writes.

`owner_email` is now recorded on both. Neither panel set it, so there was no record of who
created an OAuth app or a webhook endpoint.

Revoking an app no longer claims what it cannot do. The browser `confirm()` said "All issued
tokens will be invalidated." They are not: revoking stops future authorizations, and
`oauthRevoke` handles live tokens. The response says so.

`readIntegrationRegistry` flags apps that **predate governed registration** — no PKCE
requirement or no recorded owner — and existing webhooks whose URL would now be refused. C12
stops new ones; the stored rows are visible rather than assumed clean.

---

## 6. Counters

- Logical routes 37 → **38** (`integrationRegistryAdmin` on `adminSummaries` behind the
  `integration_` prefix). Physical functions stay **276**.
- Direct browser CRUD: 8 open → **4 open across 3 files, 5 fixed, and zero CRITICAL**.
- No new entity. No seal changed. `productionSealEligible` remains `false`.

---

## 7. Carried forward to C13

- The three remaining CRUD sites, all non-critical: `OrganizationsPanel.jsx`
  (Organization create/update, MEDIUM), `AdminApplicationDetail.jsx` (DealApplication.update,
  LOW), `AdminUserDetail.jsx` (AdminNote.create, LOW).
- Retire the ten blocker-cleared legacy routes, wire the redirects, cut the sidebar to twelve
  entries after parity.
- `/admin/audits` is still `NOT_BUILT` — the only unbuilt workspace, carried from C5.
- **Stored rows that predate this chunk.** Existing OAuth apps may have
  `pkce_required: false`, scopes outside the catalog, or unvalidated redirect URIs; existing
  webhooks may have http or private-host URLs. The registry surfaces both. Deciding whether to
  force-correct or revoke them is an operational call on live integrations and belongs with the
  founder, not with a code change.
