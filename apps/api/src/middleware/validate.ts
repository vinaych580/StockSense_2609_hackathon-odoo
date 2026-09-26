import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** Parses req.body with a shared zod schema and replaces it with the result (unknown fields stripped). */
export function validate(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    req.body = schema.parse(req.body ?? {});
    next();
  };
}
