import type {
  ConversionErrorCode,
  ConversionJob,
  ConversionResult,
  RuntimeInfo
} from './types.js';

export interface WorkerRequest {
  id: number;
  assetBaseURL: string;
  job?: ConversionJob;
  maxOutputBytes: number;
}

export type WorkerResponse =
  | { id: number; result: RuntimeInfo | ConversionResult }
  | {
      id: number;
      error: {
        message: string;
        code: ConversionErrorCode;
        diagnostics: string[];
        exitCode?: number;
      };
    };

export interface WorkerAdapter {
  postMessage(message: WorkerRequest): void;
  onMessage(callback: (message: WorkerResponse) => void): void;
  onError(callback: (error: Error) => void): void;
  terminate(): void;
  ref?(): void;
  unref?(): void;
}

export type WorkerFactory = (url: URL) => WorkerAdapter;
