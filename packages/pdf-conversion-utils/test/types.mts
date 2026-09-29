import {
  createConversionRuntime,
  ConversionError,
  type ConversionRuntime,
  type ConversionResult
} from '@imgly/pdf-conversion-utils';

const runtime: ConversionRuntime = createConversionRuntime({
  assetBaseURL: new URL('file:///runtime/')
});
const result: Promise<ConversionResult> = runtime.run(
  {
    files: { 'input.ps': new Uint8Array() },
    args: [],
    outputFiles: ['output.pdf']
  },
  { signal: new AbortController().signal, maxOutputBytes: 100 }
);
void result;
const failure: Error = new ConversionError(
  'Failure',
  'CONVERSION_FAILED',
  ['diagnostic'],
  1
);
void failure;
runtime.dispose();
