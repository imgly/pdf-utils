import { createConversionRuntime } from '../dist/browser.js';
window.createConversionRuntime = createConversionRuntime;
window.runtime = createConversionRuntime();
window.makeJob = (content = '0 0 moveto 10 10 lineto stroke showpage') => ({
  files: {
    'input.eps': `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 20 30\n${content}\n%%EOF\n`
  },
  args: [
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    '-dEPSCrop',
    '-sDEVICE=pdfwrite',
    '-sOutputFile=/work/output.pdf',
    '/work/input.eps'
  ],
  outputFiles: ['output.pdf']
});
