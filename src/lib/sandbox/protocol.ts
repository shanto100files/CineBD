export type RpcOperation =
  | 'fetch'
  | 'getBaseUrl'
  | 'openWebView'
  | 'crypto'
  | 'kvGet'
  | 'kvSet'
  | 'kvDelete'
  | 'kvKeys'
  | 'kvClear';

export type SerializedBody =
  | {kind: 'none'}
  | {kind: 'text'; value: string}
  | {kind: 'base64'; value: string; contentType?: string};

export interface SerializedRequest {
  method?: string;
  headers: Array<[string, string]>;
  body: SerializedBody;
  redirect?: 'follow' | 'manual';
}

export interface SerializedResponse {
  status: number;
  statusText: string;
  url: string;
  headers: Array<[string, string]>;
  bodyBase64: string;
}

/** Native -> sandbox */
export type HostMessage =
  | {
      type: 'invoke';
      token: string;
      /**
       * The provider module source. Omitted once the document has confirmed
       * it already holds this exact `moduleHash` — shipping up to 2 MB of
       * source on EVERY call (then JSON.stringify + base64 + a bridge hop)
       * was the single biggest per-call cost in the app.
       */
      moduleCode?: string;
      /** Content hash of `moduleCode`; stable across invokes and app restarts. */
      moduleHash?: string;
      exportName?: string;
      args?: Record<string, unknown>;
      state: Record<string, unknown>;
      timeoutMs: number;
    }
  | {
      type: 'cancel';
      token: string;
    }
  | {
      type: 'rpc-result';
      token: string;
      id: number;
      result?: unknown;
      error?: string;
    };

/** Sandbox -> native */
export type SandboxMessage =
  | {type: 'ready'}
  | {
      type: 'rpc';
      token: string;
      id: number;
      operation: RpcOperation;
      args: unknown;
    }
  | {
      type: 'result';
      token: string;
      result?: unknown;
      error?: string;
      state?: Record<string, unknown>;
    }
  | {
      type: 'log';
      level: 'log' | 'warn' | 'error';
      message: string;
    };

export const SANDBOX_INVOKE_TIMEOUT_MS = 120_000;
export const MAX_MODULE_SIZE = 2_000_000;
export const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
export const MAX_STATE_BYTES = 256_000;
/**
 * The document answers with this when an invoke arrived without `moduleCode`
 * and it does not hold that `moduleHash` (page restarted, cache evicted, or a
 * stale runtime). The native side treats it as "re-send the source" instead of
 * surfacing a provider error — a miss costs one extra round trip, never a
 * broken call.
 */
export const MODULE_UNKNOWN_PREFIX = 'MODULE_UNKNOWN:';
