/**
 * GET /api/v1/events: the Server-Sent Events stream. Every signed-in user receives every
 * data.changed (the payload carries ids and names, no private data); session.updated goes only to
 * that user's own connections. A comment line every 25 s keeps proxies from closing the stream and
 * re-checks the session, ending the stream once it is gone (logged out, expired, deactivated).
 * Missed events are not replayed: on reconnect the client refetches what it shows.
 */
import { Router, type Request } from 'express';
import { lookupSession } from '../auth/sessions';
import { bus, type AppEvent } from '../lib/events';
import { actorOf } from '../middleware/auth';

export const HEARTBEAT_MS = 25_000;

/** Open streams, for tests and the shutdown log. */
export const openStreams = { count: 0 };

export function eventsRouter(opts: { heartbeatMs?: number } = {}): Router {
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const r = Router();

  r.get('/', (req: Request, res) => {
    const actor = actorOf(req);
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    openStreams.count++;

    const write = (chunk: string) => {
      if (!res.writableEnded) res.write(chunk);
    };
    // Browsers retry after 3 s; the first event tells the client the stream is live.
    write(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ userId: actor.id })}\n\n`);

    const onEvent = (e: AppEvent) => {
      if (e.type === 'session.updated') {
        if (e.userId === actor.id) write('event: session.updated\ndata: {}\n\n');
        return;
      }
      write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    bus.on('event', onEvent);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      bus.off('event', onEvent);
      openStreams.count--;
      if (!res.writableEnded) res.end();
    };

    const beat = setInterval(() => {
      lookupSession(req)
        .then((found) => {
          if (found.status !== 'ok') {
            write('event: session.ended\ndata: {}\n\n');
            close();
          } else write(': ping\n\n');
        })
        .catch(() => write(': ping\n\n'));
    }, heartbeatMs);

    req.on('close', close);
    res.on('error', close);
  });

  return r;
}
