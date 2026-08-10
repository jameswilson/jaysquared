/* Runs every suite in this folder and reports pass/fail.
   A suite fails if it exits non-zero, prints a line containing '✗', or reports
   a page error. Usage: npm test   (or: node tests/run-all.js) */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUITES = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.js') && f !== 'run-all.js')
  .sort();

let failed = 0;
for (const f of SUITES) {
  let out = '', ok = true;
  const t0 = Date.now();
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, f)], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000,
    });
  } catch (e) {
    ok = false;
    out = (e.stdout || '') + (e.stderr || '');
  }
  if (out.includes('✗')) ok = false;
  if (/errors:\s*(?!none)\S/.test(out)) ok = false;

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + f.padEnd(16) + secs + 's');
  if (!ok) console.log(out.split('\n').map(l => '        ' + l).join('\n'));
  if (!ok) failed++;
}

console.log('\n' + (failed ? failed + ' of ' + SUITES.length + ' suites failed'
                           : 'all ' + SUITES.length + ' suites passed'));
process.exit(failed ? 1 : 0);
