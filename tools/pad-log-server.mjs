// Collects reports from public/pad-test.html (any browser) and prints them; stops after a while.
// Usage: node tools/pad-log-server.mjs [seconds=600]
import { createServer } from 'node:http';
const limit = Number(process.argv[2] ?? 600) * 1000;
const latest = new Map();
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.end('ok'); return; }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const r = JSON.parse(body);
      latest.set(r.ua, r);
      const seen = r.log.some((l) => l.includes('EVENT connected') || (l.includes('poll:') && !l.includes('no pads')));
      if (seen) finish();
    } catch {}
    res.end('ok');
  });
});
let done = false;
function finish() {
  if (done) return;
  done = true;
  // Give it a few more seconds to collect button presses.
  setTimeout(() => { print(); process.exit(0); }, 8000);
}
function print() {
  if (!latest.size) console.log('No report received.');
  for (const r of latest.values()) {
    console.log('=== ' + r.ua);
    console.log(r.log.slice(-40).join('\n'));
  }
}
server.listen(5199, () => console.log('listening on 5199'));
setTimeout(() => { print(); process.exit(0); }, limit);
