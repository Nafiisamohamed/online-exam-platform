/**
 * Request validation (baseline 6.6: validate all inputs on the server).
 *
 * `validate({ body, query, params })` checks each part of the request with a
 * zod schema before the handler runs. Invalid input is rejected with
 * 400 VALIDATION_ERROR and a list of { path, message } problems. Valid input
 * replaces the raw values, so handlers only ever see parsed, typed data
 * (read it with `req.valid.body`, `req.valid.query`, `req.valid.params`).
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors.ts";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      valid: { body?: any; query?: any; params?: any };
    }
  }
}

type Schemas = { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const valid: Request["valid"] = req.valid ?? {};
    const problems: { path: string; message: string }[] = [];
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) valid[part] = result.data;
      else for (const issue of result.error.issues) problems.push({ path: [part, ...issue.path].join("."), message: issue.message });
    }
    if (problems.length) return next(new AppError(400, "VALIDATION_ERROR", "The request is not valid", { problems }));
    req.valid = valid;
    next();
  };
}

/** Common building blocks for schemas. */
export const zid = z.uuid({ message: "must be a valid id" });
export const idParams = z.object({ id: zid });
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const trimmed = (max = 500) => z.string().trim().min(1, "is required").max(max);
