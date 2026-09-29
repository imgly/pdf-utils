import runtimeModule = require('@imgly/pdf-conversion-utils');

const runtime: runtimeModule.ConversionRuntime =
  runtimeModule.createConversionRuntime();
const info: Promise<runtimeModule.RuntimeInfo> = runtime.preload();
void info;
const failure: Error = new runtimeModule.ConversionError('Failure', 'TIMEOUT');
void failure;
runtime.dispose();
