/**
 * Content hash for provider module source.
 *
 * Used as a cache key so the native side can omit `moduleCode` from invokes
 * the document has already seen. Must be pure JS with no React Native or DOM
 * dependency: `sandboxBridge.ts` runs on the JS thread and
 * `runtime/sandboxDocument.ts` is bundled into the WebView page.
 *
 * cyrb53 — two 32-bit streams combined into a 53-bit result, which is the
 * largest integer JavaScript can represent exactly. At ~2^53 the collision
 * odds across a few hundred modules are negligible, and unlike a 32-bit hash
 * a collision cannot silently swap one provider's source for another's.
 */
/* eslint-disable no-bitwise */
const hashSource = (source: string): number => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

/**
 * Hashing is O(source length) and runs on every invoke, but the extension
 * storage memo hands back the SAME string reference until the modules are
 * invalidated — so the lookup hits a V8-cached string hash and we skip the
 * full pass entirely.
 */
const hashCache = new Map<string, string>();
const MAX_CACHED_HASHES = 64;

export const hashModuleSource = (source: string): string => {
  const cached = hashCache.get(source);
  if (cached !== undefined) {
    return cached;
  }
  const hashed = hashSource(source).toString(36);
  if (hashCache.size >= MAX_CACHED_HASHES) {
    hashCache.clear();
  }
  hashCache.set(source, hashed);
  return hashed;
};
