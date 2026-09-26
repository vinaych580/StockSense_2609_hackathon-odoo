import type { Actor } from '../inventory/posting';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth: the signed-in user, reloaded from the database on every request. */
      actor?: Actor;
      /** Set by requireAuth: the hashed session id. */
      sessionId?: string;
    }
  }
}

export {};
