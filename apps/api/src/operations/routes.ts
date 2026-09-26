import { Router } from 'express';
import {
  OPERATION_ACTIONS,
  operationActionInput,
  operationCreateInput,
  operationListQuery,
  operationUpdateInput,
  type OperationCreateInput,
  type OperationUpdateInput,
} from '@stocksense/shared';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { actorOf } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getOperation } from './dto';
import { listOperations } from './list';
import { createOperation, runAction, updateOperation, type ActionName } from './service';

const ACTIONS = new Set<string>(OPERATION_ACTIONS.filter((a) => a !== 'edit'));

/** A malformed id can't match any document, so it's a 404 rather than a 400. */
function idParam(raw: unknown): string {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new AppError('NOT_FOUND', 'Operation not found');
  return parsed.data;
}

/** /api/v1/operations. Permission for each action is checked in the service, on the stored type. */
export function operationsRouter(): Router {
  const r = Router();

  r.get('/', async (req, res) => {
    res.json(await listOperations(operationListQuery.parse(req.query)));
  });

  r.post('/', validate(operationCreateInput), async (req, res) => {
    res.status(201).json({ data: await createOperation(actorOf(req), req.body as OperationCreateInput) });
  });

  r.get('/:id', async (req, res) => {
    res.json({ data: await getOperation(idParam(req.params.id)) });
  });

  r.patch('/:id', validate(operationUpdateInput), async (req, res) => {
    res.json({ data: await updateOperation(actorOf(req), idParam(req.params.id), req.body as OperationUpdateInput) });
  });

  r.post('/:id/:action', async (req, res) => {
    const action = String(req.params.action);
    if (!ACTIONS.has(action)) throw new AppError('NOT_FOUND', `Unknown action "${action}"`);
    const input = operationActionInput.parse(req.body ?? {});
    res.json({ data: await runAction(actorOf(req), idParam(req.params.id), action as ActionName, input) });
  });

  return r;
}
