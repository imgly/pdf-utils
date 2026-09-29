export interface RuntimeOptions {
  /** Directory containing the worker, gs.js and gs.wasm; defaults to the package assets. */
  assetBaseURL?: string | URL;
  /** Explicit worker entry URL for bundlers or separately hosted assets. */
  workerURL?: string | URL;
  /** Positive timeout in milliseconds once an operation starts, including initialization. Maximum: 2147483647. Default: 30000. */
  timeoutMs?: number;
}

export interface OperationOptions {
  signal?: AbortSignal;
  /** Override the timeout with a positive millisecond value up to 2147483647. */
  timeoutMs?: number;
}

export interface RunOptions extends OperationOptions {
  /** Maximum combined output size in bytes, checked before reading files. Default: 100 MiB. */
  maxOutputBytes?: number;
}

export interface ConversionJob {
  /** Input basenames, written under /work/. Caller-owned buffers are never detached. */
  files: Record<string, Uint8Array | string>;
  /** Ghostscript arguments. Refer to job files with absolute /work/<basename> paths. */
  args: string[];
  /** Output basenames under /work/. Each requested output must exist and be nonempty. */
  outputFiles: string[];
}

export interface RuntimeInfo {
  version: string;
}

export interface ConversionResult extends RuntimeInfo {
  files: Record<string, Uint8Array>;
  /** stdout/stderr, bounded to 64 KiB per job. */
  diagnostics: string[];
}

export interface ConversionRuntime {
  /** Load runtime assets and compile WASM without converting a document. */
  preload(options?: OperationOptions): Promise<RuntimeInfo>;
  /** Run jobs serially, with a fresh Ghostscript instance for each document. */
  run(job: ConversionJob, options?: RunOptions): Promise<ConversionResult>;
  /** Reject outstanding operations and terminate the worker. This runtime cannot be reused. */
  dispose(): void;
}

export type ConversionErrorCode =
  | 'INVALID_INPUT'
  | 'LOAD_FAILED'
  | 'CONVERSION_FAILED'
  | 'OUTPUT_LIMIT'
  | 'ABORTED'
  | 'TIMEOUT'
  | 'DISPOSED'
  | 'WORKER_FAILED';

export class ConversionError extends Error {
  readonly name = 'ConversionError';

  constructor(
    message: string,
    readonly code: ConversionErrorCode,
    readonly diagnostics: string[] = [],
    readonly exitCode?: number
  ) {
    super(message);
  }
}
