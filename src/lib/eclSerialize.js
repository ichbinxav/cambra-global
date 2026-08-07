// v62.4 — ECL P2: deterministic serialization, hashing and real deep freezing.
//
// CANONICAL implementation. The backend artifact base44/shared/generated/
// eclDomain.ts is GENERATED from this file (npm run ecl:generate), so there is
// exactly one implementation of these semantics in the repo.
//
// SHA-256 is implemented here in pure JS on purpose: node:crypto does not exist
// in the browser and WebCrypto is async, so importing either would make the
// frontend and the backend structurally different. A shared synchronous
// implementation is what makes "same result → same hash" provable across both.

/**
 * REAL deep freeze — Object.freeze is shallow, so a frozen envelope with a live
 * array inside is still mutable and would silently let a caller rewrite
 * evidence. Walks arrays, plain objects and nested combinations, and tolerates
 * cycles.
 */
export function deepFreeze(value, seen = undefined) {
  const visited = seen || new Set();
  if (value === null || typeof value !== "object") return value;
  if (visited.has(value)) return value;
  visited.add(value);
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, visited);
    return value;
  }
  for (const key of Object.keys(value)) deepFreeze(value[key], visited);
  return value;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Normalize a value for serialization: Date → ISO, ISO-ish datetime string →
 * canonical ISO (so "2026-08-06T10:00+02:00" and its UTC equivalent serialize
 * identically), everything else untouched. Plain calendar dates (YYYY-MM-DD)
 * are deliberately NOT widened into datetimes: that would invent a time.
 */
function normalizeScalar(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" && ISO_DATETIME.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value === undefined) return null;
  return value;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return normalizeScalar(value);
  if (value instanceof Date) return normalizeScalar(value);
  // Arrays keep their order: order is semantic in this model (reminder ladders,
  // rule sequences), so sorting them would destroy meaning, not normalize it.
  if (Array.isArray(value)) return value.map(canonical);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    out[key] = canonical(value[key]);
  }
  return out;
}

/** Recursively key-sorted, date-normalized JSON. Same content → same string. */
export function stableSerialize(result) {
  return JSON.stringify(canonical(result));
}

// ── SHA-256 (pure, synchronous, isomorphic) ─────────────────────────────
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = str.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** SHA-256 of a UTF-8 string, lowercase hex. */
export function sha256Hex(input) {
  const bytes = utf8Bytes(String(input));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 64-bit big-endian length (high word is 0 for any realistic payload here).
  for (let i = 0; i < 4; i++) bytes.push(0);
  bytes.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** SHA-256 of stableSerialize(result). Semantic change → different hash. */
export function hashConfidenceResult(result) {
  return sha256Hex(stableSerialize(result));
}