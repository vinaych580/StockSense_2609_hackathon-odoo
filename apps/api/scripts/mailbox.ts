/**
 * `pnpm mail`: a local mail catcher, so OTP password-reset emails work without Docker or a real
 * mail account. SMTP on :1025 accepts every message; http://localhost:8025 shows the inbox and
 * updates live. Mail is kept in memory only (the newest 200) and is gone when this stops.
 * If Mailpit is already running on these ports, it is used instead.
 */
import 'dotenv/config';
import http from 'node:http';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 1025);
const HTTP_PORT = Number(process.env.MAILBOX_PORT ?? 8025);
const KEEP = 200;

interface Message {
  id: number;
  from: string;
  to: string;
  subject: string;
  text: string;
  date: string;
  /** A 6-digit code found in the subject or body, shown large in the inbox. */
  code: string | null;
}

const inbox: Message[] = [];
const listeners = new Set<http.ServerResponse>();
let nextId = 1;

function notify() {
  for (const res of listeners) res.write('data: changed\n\n');
}

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS', 'AUTH'],
  banner: 'StockSense local mailbox',
  logger: false,
  onData(stream, _session, callback) {
    simpleParser(stream)
      .then((mail) => {
        const text = (mail.text ?? '').trim();
        const subject = mail.subject ?? '(no subject)';
        const to = [mail.to].flat().filter(Boolean).map((a) => a!.text).join(', ');
        const message: Message = {
          id: nextId++,
          from: mail.from?.text ?? '',
          to,
          subject,
          text,
          date: (mail.date ?? new Date()).toISOString(),
          code: /\b(\d{6})\b/.exec(`${subject}\n${text}`)?.[1] ?? null,
        };
        inbox.unshift(message);
        inbox.length = Math.min(inbox.length, KEEP);
        console.log(`✉  ${to}: ${subject}`);
        notify();
        callback();
      })
      .catch((err: Error) => callback(err));
  },
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${HTTP_PORT}`);
  if (url.pathname === '/api/messages' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(inbox));
  } else if (url.pathname === '/api/messages' && req.method === 'DELETE') {
    inbox.length = 0;
    notify();
    res.writeHead(204).end();
  } else if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    listeners.add(res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      listeners.delete(res);
    });
  } else if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(PAGE);
  } else {
    res.writeHead(404).end();
  }
});

function inUse(what: string, port: number) {
  return (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.log(`Port ${port} is already taken (${what}). Another mail catcher, such as Mailpit, is probably running; using that one.`);
    process.exit(0);
  };
}

const smtpInUse = inUse('SMTP', SMTP_PORT);
smtp.on('error', (err: NodeJS.ErrnoException) => (err.code === 'EADDRINUSE' ? smtpInUse(err) : console.error('SMTP error:', err.message)));
server.once('error', inUse('inbox page', HTTP_PORT));

smtp.listen(SMTP_PORT, () => {
  server.listen(HTTP_PORT, () => {
    console.log(`Local mailbox: SMTP on localhost:${SMTP_PORT}, inbox at http://localhost:${HTTP_PORT}`);
  });
});

function shutdown() {
  for (const res of listeners) res.end();
  server.close();
  smtp.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Local inbox · StockSense</title>
<style>
  :root {
    --sheet: #f3f5f4; --sheet-2: #e8ecea; --ink: #15181a; --ink-2: #454c52; --ink-3: #636b71;
    --rule: #c2c9c6; --blue: #2447c9; --yellow: #ffe14d;
    --sans: Barlow, "Segoe UI", system-ui, -apple-system, sans-serif;
    --cond: "Barlow Semi Condensed", "Arial Narrow", "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--sheet); color: var(--ink); font: 16px/1.5 var(--sans); }
  header { display: flex; align-items: end; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    padding: 20px 24px 14px; border-bottom: 2px solid var(--ink); }
  h1 { margin: 0; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.01em; line-height: 1.1; }
  .sub { margin: 4px 0 0; color: var(--ink-2); font-size: 0.9375rem; }
  .label { font-family: var(--cond); font-weight: 700; font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
  .live { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
  .live.on .dot { background: #1f8a4c; }
  button { font: inherit; font-size: 0.875rem; font-weight: 600; border: 1.5px solid var(--ink); background: #fff;
    color: var(--ink); padding: 6px 12px; cursor: pointer; }
  button:hover { background: var(--sheet-2); }
  button:focus-visible, .item:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  main { display: grid; grid-template-columns: minmax(260px, 360px) 1fr; min-height: calc(100% - 90px); }
  .list { border-right: 1.5px solid var(--rule); overflow-y: auto; margin: 0; padding: 0; list-style: none; }
  .item { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--rule);
    background: transparent; padding: 12px 20px; font-weight: 400; }
  .item:hover { background: var(--sheet-2); }
  .item[aria-current="true"] { background: #fff; box-shadow: inset 4px 0 0 var(--ink); }
  .item .subject { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .meta { display: block; color: var(--ink-3); font-size: 0.8125rem; }
  .reader { padding: 24px; max-width: 760px; }
  .reader h2 { margin: 4px 0 12px; font-size: 1.375rem; font-weight: 600; line-height: 1.25; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 0 0 20px; font-size: 0.9375rem; }
  dt { color: var(--ink-3); } dd { margin: 0; overflow-wrap: anywhere; }
  .code { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin: 0 0 20px; padding: 14px 18px;
    background: var(--yellow); border: 2px solid var(--ink); }
  .code strong { font-size: 2.25rem; font-weight: 700; letter-spacing: 0.25em; font-variant-numeric: tabular-nums; line-height: 1; }
  pre { margin: 0; white-space: pre-wrap; font: inherit; background: #fff; border: 1.5px solid var(--rule); padding: 16px 18px; }
  .empty { padding: 48px 24px; color: var(--ink-2); max-width: 520px; }
  .empty p { margin: 0 0 8px; }
  @media (max-width: 720px) {
    main { grid-template-columns: 1fr; }
    .list { border-right: 0; border-bottom: 1.5px solid var(--ink); max-height: 40vh; }
    header, .reader { padding-left: 16px; padding-right: 16px; }
  }
</style>
</head>
<body>
<header>
  <div>
    <span class="label">StockSense · local mail · SMTP localhost:${SMTP_PORT}</span>
    <h1>Local inbox</h1>
    <p class="sub">Every email the app sends on this machine lands here. Nothing leaves your computer.</p>
  </div>
  <div style="display:flex;align-items:center;gap:16px">
    <span class="live label" id="live"><span class="dot"></span><span id="live-text">Connecting</span></span>
    <button type="button" id="clear">Clear inbox</button>
  </div>
</header>
<main>
  <ul class="list" id="list" aria-label="Messages"></ul>
  <section class="reader" id="reader" aria-live="polite"></section>
</main>
<script>
  const list = document.getElementById('list');
  const reader = document.getElementById('reader');
  let messages = [];
  let selected = null;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  function render() {
    list.innerHTML = messages.map((m) =>
      '<li><button type="button" class="item" data-id="' + m.id + '" aria-current="' + (m.id === selected) + '">' +
      '<span class="subject">' + esc(m.subject) + '</span>' +
      '<span class="meta">To ' + esc(m.to) + ' · ' + time(m.date) + '</span></button></li>').join('');
    const m = messages.find((x) => x.id === selected);
    if (!m) {
      reader.innerHTML = '<div class="empty"><p class="label">No mail yet</p>' +
        '<p>On the StockSense log-in page, choose <b>Forgot password?</b> and enter a demo email such as ' +
        '<b>manager@stocksense.test</b>. The reset code appears here within a second.</p></div>';
      return;
    }
    reader.innerHTML =
      '<span class="label">Message ' + m.id + '</span><h2>' + esc(m.subject) + '</h2>' +
      '<dl><dt>From</dt><dd>' + esc(m.from) + '</dd><dt>To</dt><dd>' + esc(m.to) + '</dd>' +
      '<dt>Received</dt><dd>' + new Date(m.date).toLocaleString() + '</dd></dl>' +
      (m.code ? '<div class="code"><span class="label" style="color:var(--ink)">Code</span><strong>' + m.code +
        '</strong><button type="button" id="copy">Copy code</button></div>' : '') +
      '<pre>' + esc(m.text) + '</pre>';
    const copy = document.getElementById('copy');
    if (copy) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(m.code); copy.textContent = 'Copied'; }
      catch { copy.textContent = 'Select and copy it'; }
    };
  }

  async function load() {
    const res = await fetch('/api/messages');
    const next = await res.json();
    const newest = next[0]?.id ?? null;
    if (selected === null || !next.some((m) => m.id === selected) || (newest !== (messages[0]?.id ?? null))) selected = newest;
    messages = next;
    render();
  }

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (!item) return;
    selected = Number(item.dataset.id);
    render();
  });
  document.getElementById('clear').onclick = async () => {
    await fetch('/api/messages', { method: 'DELETE' });
  };

  const live = document.getElementById('live');
  const liveText = document.getElementById('live-text');
  const events = new EventSource('/api/events');
  events.onopen = () => { live.classList.add('on'); liveText.textContent = 'Live'; load(); };
  events.onerror = () => { live.classList.remove('on'); liveText.textContent = 'Reconnecting'; };
  events.onmessage = () => load();
  load();
</script>
</body>
</html>`;
