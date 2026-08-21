# GitHub administration hardening for Base44 sync

Last verified: 2026-08-21  
Repository: `ichbinxav/cambra-global`  
Owner type: personal account (`ichbinxav`)  
Default branch: `main`

## Verified state

- Repository visibility is `PUBLIC`.
- `main` is not protected and no repository ruleset exists.
- The CI check to require is `verify`. The last-known audited observation was
  workflow run `#1087` for commit
  `4b49b3f314c355bb5d962e7fcf3e8124db7cccc5`, reported passed at audit time:
  <https://github.com/ichbinxav/cambra-global/actions/runs/32498138466>.
  This historical observation is not evidence for the current working tree or
  any later commit; re-run `verify` for the exact final SHA.
- Recent Base44 Builder commits were observed as unsigned at audit time. This
  document does not retain an immutable signature receipt; re-check the exact
  commits before enabling a signature rule.
- The current automation integration can read and write repository content,
  branches, pull requests, and CI, but it cannot manage visibility, rulesets,
  installed-app permissions, or personal access tokens. An attempted issue
  creation also returned `403 Resource not accessible by integration`.
- Repository scanning cannot prove whether an account-level `claude2` PAT
  exists. Run the repository secret gate on the exact final tree, and inspect
  account token settings separately before recording the token as absent or
  revoked.

## Owner runbook

1. In GitHub account settings, open **Developer settings → Personal access
   tokens** and review both fine-grained and classic tokens. If `claude2`
   exists, identify its consumers, revoke it, and rotate only those consumers.
   Base44 GitHub App authentication is independent of this PAT.
2. Record an explicit public/private decision. Before changing the repository
   to private, verify that the Base44 Builder GitHub App is authorized for
   private repositories; after the change, run one Base44 sync and one complete
   CI smoke test.
3. Create a repository ruleset targeting `main` in evaluate mode first:
   - block branch deletion;
   - block force pushes;
   - require pull requests for human changes;
   - require the `verify` status check;
   - if Base44 must keep syncing directly to `main`, grant bypass only to the
     Base44 Builder GitHub App, never to broad user or organization groups.
4. Validate human and Base44 paths, then enforce the ruleset. A direct-push
   Base44 bypass means its changes remain post-push-CI, not pre-merge gated.
5. Do not require signed commits yet. Base44 Builder currently produces
   unsigned commits and would be blocked. Ask Base44 for signed app commits or
   PR-based synchronization, then enable the signature rule for future commits.

Do not rewrite historical commits solely to add signatures. Rewriting would be
destructive and would invalidate published SHAs and audit evidence.

## Acceptance criteria

- `claude2` is confirmed absent or revoked, with known consumers rotated.
- Repository visibility has an explicit owner decision and Base44 sync remains
  functional under that decision.
- `main` rejects deletion and force-push.
- Human changes require a pull request and successful `verify` check.
- Base44 has a documented least-privilege bypass or uses PR-based sync.
- A signature rule is enabled only after future Base44 commits are verifiably
  signed.
