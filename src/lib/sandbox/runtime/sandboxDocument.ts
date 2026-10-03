/**
 * Sandbox document: the WebView page that hosts provider workers.
 *
 * It holds no provider code beyond a small content-addressed source cache
 * (see `moduleCache`) used to avoid re-shipping megabytes of module source on
 * every call. Its other jobs are:
 *  - spawn one nested Worker per invoke (fresh realm, no shared prototypes)
 *  - relay RPC frames between the worker and the native host
 *  - terminate a worker that overruns its timeout, which is the only way to
 *    stop a runaway `while (true) {}`
 *
 * The worker bundle is inlined at build time as `__WORKER_SOURCE__`.
 */
import {base64ToUtf8} from '../base64';
import {MODULE_UNKNOWN_PREFIX} from '../protocol';
import type {HostMessage, SandboxMessage} from '../protocol';

declare const __WORKER_SOURCE__: string;

interface NativeBridge {
  postMessage: (message: string) => void;
}

const nativeBridge = (window as unknown as {ReactNativeWebView: NativeBridge})
  .ReactNativeWebView;

const send = (message: SandboxMessage): void => {
  try {
    nativeBridge.postMessage(JSON.stringify(message));
  } catch {
    // Nothing else to do: the bridge is the only channel out.
  }
};

interface ActiveInvoke {
  worker: Worker;
  timer: number;
}

const active = new Map<string, ActiveInvoke>();
let workerUrl = '';

/**
 * Provider module source this page already holds, keyed by content hash.
 *
 * The host omits `moduleCode` for hashes in here, which removes the
 * `JSON.stringify` + base64 encode + bridge transfer of up to 2 MB from every
 * provider call after the first — that transfer was the dominant per-call cost
 * in the app. Deliberately dies with the page: the host clears its own
 * "delivered" set on every ready/reload, so a fresh page always gets sources
 * again.
 */
const moduleCache = new Map<string, string>();
let moduleCacheBytes = 0;
const MAX_MODULE_CACHE_BYTES = 12 * 1024 * 1024;

const rememberModule = (hash: string, code: string): void => {
  const existing = moduleCache.get(hash);
  if (existing === code) {
    return;
  }
  if (existing !== undefined) {
    moduleCacheBytes -= existing.length;
  }
  moduleCache.set(hash, code);
  moduleCacheBytes += code.length;
  // FIFO eviction. A later miss is not an error: the host sees
  // MODULE_UNKNOWN and re-sends the source, costing one round trip.
  while (moduleCacheBytes > MAX_MODULE_CACHE_BYTES && moduleCache.size > 1) {
    const oldest = moduleCache.keys().next();
    if (oldest.done) {
      return;
    }
    const evicted = moduleCache.get(oldest.value);
    moduleCache.delete(oldest.value);
    if (evicted !== undefined) {
      moduleCacheBytes -= evicted.length;
    }
  }
};

const getWorkerUrl = (): string => {
  if (!workerUrl) {
    const blob = new Blob([__WORKER_SOURCE__], {
      type: 'application/javascript',
    });
    workerUrl = URL.createObjectURL(blob);
  }
  return workerUrl;
};

/**
 * A single idle worker kept ready so the bundle parse/compile cost happens
 * before the next invoke instead of on the user's critical path.
 *
 * This does NOT weaken isolation: a warm worker has never received an `invoke`
 * message, so it has executed no provider code and shares no state. Each
 * provider call still gets its own fresh realm that is terminated afterwards.
 */
let warmWorker: Worker | null = null;

const spawnWorker = (): Worker => new Worker(getWorkerUrl());

const prewarmWorker = (): void => {
  if (warmWorker) {
    return;
  }
  try {
    warmWorker = spawnWorker();
  } catch {
    // If pre-warming fails we simply fall back to spawning on demand.
    warmWorker = null;
  }
};

const takeWorker = (): Worker => {
  const worker = warmWorker ?? spawnWorker();
  warmWorker = null;
  // Kick off the next warm worker so it is ready for the following invoke.
  prewarmWorker();
  return worker;
};

const cleanup = (token: string): void => {
  const entry = active.get(token);
  if (!entry) {
    return;
  }
  active.delete(token);
  clearTimeout(entry.timer);
  try {
    entry.worker.terminate();
  } catch {
    // already gone
  }
};

const handleInvoke = (
  message: Extract<HostMessage, {type: 'invoke'}>,
): void => {
  const {token} = message;
  if (active.has(token)) {
    return;
  }

  // Resolve the module source BEFORE spawning anything. A hash-only invoke we
  // cannot satisfy fails closed with a retryable marker rather than handing
  // `undefined` to `new Function`, and never reaches the document realm.
  const hash = message.moduleHash ?? '';
  const moduleCode =
    typeof message.moduleCode === 'string'
      ? message.moduleCode
      : hash
        ? moduleCache.get(hash)
        : undefined;
  if (typeof moduleCode !== 'string') {
    send({
      type: 'result',
      token,
      error: `${MODULE_UNKNOWN_PREFIX}${hash}`,
    });
    return;
  }
  if (hash) {
    rememberModule(hash, moduleCode);
  }

  let worker: Worker;
  try {
    worker = takeWorker();
  } catch (error) {
    // Fail closed rather than falling back to the document realm, which would
    // silently give provider code a DOM and an escape route.
    send({
      type: 'result',
      token,
      error: `Sandbox worker unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return;
  }

  const timer = setTimeout(() => {
    cleanup(token);
    send({type: 'result', token, error: 'Provider execution timed out'});
  }, message.timeoutMs) as unknown as number;

  active.set(token, {worker, timer});

  worker.onmessage = (event: MessageEvent<SandboxMessage>) => {
    const payload = event.data;
    if (!payload || !('type' in payload)) {
      return;
    }
    if (payload.type === 'rpc') {
      send(payload);
      return;
    }
    if (payload.type === 'result') {
      send(payload);
      cleanup(token);
    }
  };

  worker.onerror = event => {
    send({
      type: 'result',
      token,
      error: event.message || 'Provider execution failed',
    });
    cleanup(token);
  };

  worker.postMessage({...message, moduleCode});
};

const handleHostMessage = (message: HostMessage): void => {
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.type === 'invoke') {
    handleInvoke(message);
    return;
  }
  if (message.type === 'cancel') {
    cleanup(message.token);
    return;
  }
  if (message.type === 'rpc-result') {
    const entry = active.get(message.token);
    if (entry) {
      entry.worker.postMessage(message);
    }
  }
};

/**
 * Native entry point. Frames arrive base64 encoded so no quoting or line
 * separator (U+2028/U+2029) can break out of the injected script.
 */
(window as unknown as Record<string, unknown>).__sandboxReceive = (
  encoded: string,
) => {
  try {
    handleHostMessage(JSON.parse(base64ToUtf8(encoded)) as HostMessage);
  } catch (error) {
    send({
      type: 'log',
      level: 'error',
      message: `Malformed host frame: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
};

// Warm the first worker up front so even the initial invoke skips the cold
// parse/compile of the worker bundle.
prewarmWorker();

send({type: 'ready'});
