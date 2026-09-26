import { Router } from 'express';
import { dashboardQuery, userListQuery, userUpdateInput } from '@stocksense/shared';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { checkLedger } from '../inventory/integrity';
import { actorOf, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { listUsers, updateUser } from '../users/service';
import { getDashboard } from './service';

/** /api/v1/dashboard: KPIs and the low-stock list for everyone; the ledger proof for Managers. */
export function dashboardRouter(): Router {
  const r = Router();
  r.get('/', requirePermission('dashboard.view'), async (req, res) => {
    res.json({ data: await getDashboard(dashboardQuery.parse(req.query)) });
  });
  /** The "Ledger integrity" card: every balance re-derived from the move ledger. */
  r.get('/integrity', requirePermission('ledger.integrity'), async (_req, res) => {
    res.json({ data: { ...(await checkLedger()), checkedAt: new Date().toISOString() } });
  });
  return r;
}

/** /api/v1/users: Settings → Users, Managers only. */
export function usersRouter(): Router {
  const r = Router();
  r.use(requirePermission('users.manage'));
  r.get('/', async (req, res) => {
    res.json(await listUsers(userListQuery.parse(req.query)));
  });
  r.patch('/:id', validate(userUpdateInput), async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
    res.json({ data: await updateUser(actorOf(req), id.data, req.body) });
  });
  return r;
}
