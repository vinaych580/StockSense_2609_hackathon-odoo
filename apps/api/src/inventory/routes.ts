import { Router } from 'express';
import { moveListQuery, stockListQuery } from '@stocksense/shared';
import { requirePermission } from '../middleware/auth';
import { listMoves, listStock } from './queries';

/** GET /stock: balances per product and internal location. */
export function stockRouter(): Router {
  const r = Router();
  r.get('/', requirePermission('stock.view'), async (req, res) => {
    res.json(await listStock(stockListQuery.parse(req.query)));
  });
  return r;
}

/** GET /moves: the append-only ledger, newest first. */
export function movesRouter(): Router {
  const r = Router();
  r.get('/', requirePermission('stock.view'), async (req, res) => {
    res.json(await listMoves(moveListQuery.parse(req.query)));
  });
  return r;
}
