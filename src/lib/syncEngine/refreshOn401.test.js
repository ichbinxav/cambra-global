import { describe, it, expect, vi } from "vitest";
import {
  createRefreshState,
  isEligibleForRefresh,
  fetchPageWithMaybeRefresh,
} from "./refreshOn401.js";

// Helper: build a fake Response with just the bits this module reads.
function fakeRes(status, body = {}) {
  return { status, ok: status >= 200 && status < 300, body };
}

describe("isEligibleForRefresh", () => {
  it("returns true only for oauth + refresh_token present", () => {
    expect(isEligibleForRefresh("oauth", true)).toBe(true);
  });
  it("rejects oauth without refresh_token", () => {
    expect(isEligibleForRefresh("oauth", false)).toBe(false);
  });
  it("rejects api_key regardless of refresh_token flag", () => {
    expect(isEligibleForRefresh("api_key", true)).toBe(false);
    expect(isEligibleForRefresh("api_key", false)).toBe(false);
  });
  it("rejects basic_auth regardless of refresh_token flag", () => {
    expect(isEligibleForRefresh("basic_auth", true)).toBe(false);
    expect(isEligibleForRefresh("basic_auth", false)).toBe(false);
  });
  it("rejects unknown auth_method", () => {
    expect(isEligibleForRefresh("something_new", true)).toBe(false);
  });
});

describe("createRefreshState", () => {
  it("starts un-refreshed", () => {
    const s = createRefreshState();
    expect(s.refreshed).toBe(false);
  });
});

describe("fetchPageWithMaybeRefresh — passthrough", () => {
  it("returns the response unchanged on 200", async () => {
    const doFetch = vi.fn().mockResolvedValue(fakeRes(200));
    const refreshFn = vi.fn();
    const rebuildHeaders = vi.fn();
    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: true,
      state: createRefreshState(),
    });
    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(refreshFn).not.toHaveBeenCalled();
    expect(rebuildHeaders).not.toHaveBeenCalled();
  });

  it("returns the response unchanged on non-401 errors (403/500)", async () => {
    for (const status of [400, 403, 404, 500, 503]) {
      const doFetch = vi.fn().mockResolvedValue(fakeRes(status));
      const refreshFn = vi.fn();
      const rebuildHeaders = vi.fn();
      const res = await fetchPageWithMaybeRefresh({
        doFetch, refreshFn, rebuildHeaders,
        eligible: true,
        state: createRefreshState(),
      });
      expect(res.status).toBe(status);
      expect(refreshFn).not.toHaveBeenCalled();
      expect(rebuildHeaders).not.toHaveBeenCalled();
    }
  });
});

describe("fetchPageWithMaybeRefresh — happy path (T1, T2)", () => {
  it("T1: 401 on first page → refresh ok → retry 200, only ONE refresh, MARKS state", async () => {
    const doFetch = vi.fn()
      .mockResolvedValueOnce(fakeRes(401))
      .mockResolvedValueOnce(fakeRes(200, { data: ["row"] }));
    const refreshFn = vi.fn().mockResolvedValue(true);
    const rebuildHeaders = vi.fn().mockResolvedValue();
    const state = createRefreshState();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: true,
      state,
    });

    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(rebuildHeaders).toHaveBeenCalledTimes(1);
    expect(state.refreshed).toBe(true);
  });

  it("T2: simulates 401 at page 3 of 5 → refresh in middle of paginated run → cursor unchanged", async () => {
    // Simulate the paginator loop: state is shared across pages, but we
    // only call fetchPageWithMaybeRefresh per page. Pages 1-2 succeed
    // without ever entering the refresh branch. Page 3 returns 401,
    // gets refreshed once, retries 200. Pages 4-5 succeed without
    // touching refresh again (because state.refreshed=true). The cursor
    // is owned by the caller, not by this module — we assert by
    // counting fetch calls per page.
    const state = createRefreshState();
    const refreshFn = vi.fn().mockResolvedValue(true);
    const rebuildHeaders = vi.fn().mockResolvedValue();

    // Page 1: 200 in one shot
    let doFetch1 = vi.fn().mockResolvedValue(fakeRes(200));
    let r1 = await fetchPageWithMaybeRefresh({ doFetch: doFetch1, refreshFn, rebuildHeaders, eligible: true, state });
    expect(r1.status).toBe(200);
    expect(doFetch1).toHaveBeenCalledTimes(1);

    // Page 2: 200 in one shot
    let doFetch2 = vi.fn().mockResolvedValue(fakeRes(200));
    let r2 = await fetchPageWithMaybeRefresh({ doFetch: doFetch2, refreshFn, rebuildHeaders, eligible: true, state });
    expect(r2.status).toBe(200);
    expect(doFetch2).toHaveBeenCalledTimes(1);

    // Page 3: 401 → refresh → 200 (the only page that triggers refresh)
    let doFetch3 = vi.fn()
      .mockResolvedValueOnce(fakeRes(401))
      .mockResolvedValueOnce(fakeRes(200));
    let r3 = await fetchPageWithMaybeRefresh({ doFetch: doFetch3, refreshFn, rebuildHeaders, eligible: true, state });
    expect(r3.status).toBe(200);
    expect(doFetch3).toHaveBeenCalledTimes(2);

    // Pages 4 and 5: 200 in one shot
    let doFetch4 = vi.fn().mockResolvedValue(fakeRes(200));
    let r4 = await fetchPageWithMaybeRefresh({ doFetch: doFetch4, refreshFn, rebuildHeaders, eligible: true, state });
    expect(r4.status).toBe(200);

    let doFetch5 = vi.fn().mockResolvedValue(fakeRes(200));
    let r5 = await fetchPageWithMaybeRefresh({ doFetch: doFetch5, refreshFn, rebuildHeaders, eligible: true, state });
    expect(r5.status).toBe(200);

    // Refresh happened exactly ONCE across the whole 5-page run.
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(rebuildHeaders).toHaveBeenCalledTimes(1);
    expect(state.refreshed).toBe(true);
  });
});

describe("fetchPageWithMaybeRefresh — refresh fails (T3)", () => {
  it("T3: 401 + refreshFn returns false → returns original 401, no retry", async () => {
    const doFetch = vi.fn().mockResolvedValue(fakeRes(401));
    const refreshFn = vi.fn().mockResolvedValue(false);
    const rebuildHeaders = vi.fn();
    const state = createRefreshState();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: true,
      state,
    });

    expect(res.status).toBe(401);
    // Only the first fetch happened — no retry after failed refresh.
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(rebuildHeaders).not.toHaveBeenCalled();
    // State still flips so future pages don't re-try refresh.
    expect(state.refreshed).toBe(true);
  });

  it("T3b: 401 + refreshFn THROWS → returns original 401, no retry, state still flips", async () => {
    const doFetch = vi.fn().mockResolvedValue(fakeRes(401));
    const refreshFn = vi.fn().mockRejectedValue(new Error("refresh exchange failed"));
    const rebuildHeaders = vi.fn();
    const state = createRefreshState();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: true,
      state,
    });

    expect(res.status).toBe(401);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(rebuildHeaders).not.toHaveBeenCalled();
    expect(state.refreshed).toBe(true);
  });

  it("T3c: rebuildHeaders throws → returns original 401, no retry", async () => {
    const doFetch = vi.fn().mockResolvedValue(fakeRes(401));
    const refreshFn = vi.fn().mockResolvedValue(true);
    const rebuildHeaders = vi.fn().mockRejectedValue(new Error("Integration.get failed"));
    const state = createRefreshState();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: true,
      state,
    });

    expect(res.status).toBe(401);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(state.refreshed).toBe(true);
  });
});

describe("fetchPageWithMaybeRefresh — no infinite loop (T4)", () => {
  it("T4: 401 → refresh ok → retry still 401 → returns the second 401, NEVER triggers a 2nd refresh", async () => {
    // First call to doFetch (page N attempt 1) → 401
    // Second call to doFetch (page N attempt 2, post-refresh) → 401 again
    const doFetch = vi.fn()
      .mockResolvedValueOnce(fakeRes(401))
      .mockResolvedValueOnce(fakeRes(401));
    const refreshFn = vi.fn().mockResolvedValue(true);
    const rebuildHeaders = vi.fn().mockResolvedValue();
    const state = createRefreshState();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: true,
      state,
    });

    // Final answer is the second 401 — caller treats it as a normal failure.
    expect(res.status).toBe(401);
    expect(doFetch).toHaveBeenCalledTimes(2);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(state.refreshed).toBe(true);
  });

  it("T4b: state already burned in a prior page → 401 falls through immediately", async () => {
    const state = createRefreshState();
    state.refreshed = true; // simulate: a prior page already used our one refresh

    const doFetch = vi.fn().mockResolvedValue(fakeRes(401));
    const refreshFn = vi.fn();
    const rebuildHeaders = vi.fn();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: true,
      state,
    });

    expect(res.status).toBe(401);
    expect(doFetch).toHaveBeenCalledTimes(1);
    // Critical: zero refresh attempts even though we got a 401.
    expect(refreshFn).not.toHaveBeenCalled();
    expect(rebuildHeaders).not.toHaveBeenCalled();
  });
});

describe("fetchPageWithMaybeRefresh — non-OAuth providers untouched (T5)", () => {
  it("T5: 401 + eligible=false (api_key/basic_auth) → returns 401 unchanged, NO refresh attempted", async () => {
    const doFetch = vi.fn().mockResolvedValue(fakeRes(401));
    const refreshFn = vi.fn();
    const rebuildHeaders = vi.fn();
    const state = createRefreshState();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: false, // pre-computed: api_key OR no refresh_token
      state,
    });

    expect(res.status).toBe(401);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(refreshFn).not.toHaveBeenCalled();
    expect(rebuildHeaders).not.toHaveBeenCalled();
    // Critically, state is NOT flipped — it was never our turn.
    expect(state.refreshed).toBe(false);
  });

  it("T5b: 200 + eligible=false → identical to eligible=true (passthrough)", async () => {
    const doFetch = vi.fn().mockResolvedValue(fakeRes(200));
    const refreshFn = vi.fn();
    const rebuildHeaders = vi.fn();
    const state = createRefreshState();

    const res = await fetchPageWithMaybeRefresh({
      doFetch, refreshFn, rebuildHeaders,
      eligible: false,
      state,
    });

    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(state.refreshed).toBe(false);
  });
});