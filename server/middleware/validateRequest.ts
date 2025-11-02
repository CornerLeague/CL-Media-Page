import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SportAdapterFactory } from '../agents/adapters/sportAdapterFactory';
import { logger, withSource } from '../logger';

const log = withSource('validateRequest');

// Narrow enum from supported sports for Zod validation
const supported = SportAdapterFactory.getSupportedSports();
// Transform to lowercase to match the transform in the schema
const supportedLowercase = supported.map(s => s.toLowerCase());
// Zod doesn't allow dynamic enum directly; cast to tuple of known literals
const SupportedSports = z.enum(supportedLowercase as ["nba", "nfl", "mlb", "nhl", "soccer", "college_football", "college_basketball"]);

const isoDate = z
  .string()
  .refine((s) => !s || !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO date' });

const TeamIdsUnion = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => {
    const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
    const cleaned = raw.map((t) => t.trim()).filter(Boolean).map((t) => t.toUpperCase());
    return Array.from(new Set(cleaned));
  });

const limitSchema = z
  .preprocess((v) => {
    if (typeof v === 'string') {
      // Check if the string represents a valid integer (no decimals)
      if (!/^\d+$/.test(v)) {
        return NaN; // This will cause validation to fail
      }
      return parseInt(v, 10);
    }
    return v;
  }, z.number().int().min(1).max(50))
  .optional()
  .default(10);

const ScoresQuerySchema = z
  .object({
    teamIds: TeamIdsUnion,
    sport: z
      .string()
      .optional()
      .transform((s) => (s ? s.toLowerCase() : undefined))
      .pipe(SupportedSports.optional()),
    limit: limitSchema,
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate) {
      if (new Date(data.startDate).getTime() > new Date(data.endDate).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startDate'],
          message: 'startDate must be before or equal to endDate',
        });
      }
    }
  });

// For this phase, Schedule queries share the same fields as Scores
const ScheduleQuerySchema = ScoresQuerySchema;

const BoxScoreParamsSchema = z.object({
  gameId: z.string().trim().min(1),
});

const UserTeamScoresQuerySchema = z.object({
  sport: z
    .string()
    .transform((s) => s.toLowerCase())
    .pipe(SupportedSports),
  limit: limitSchema,
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});

function sendValidationError(res: Response, reqPath: string, issues: z.ZodIssue[]) {
  const requestId = (res as any).locals?.requestId || (res as any).requestId || (res as any).id || (res as any).locals?.id;
  if (issues?.length) {
    log.warn({ path: reqPath, issues, requestId }, 'request validation failed');
  }
  const body: any = { error: 'Invalid payload', details: issues };
  if (requestId) body.requestId = requestId;
  return res.status(400).json(body);
}

export function validateScoresQuery(req: Request, res: Response, next: NextFunction) {
  const parsed = ScoresQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendValidationError(res, req.path, parsed.error.issues);
  }
  req.validated = { ...(req.validated || {}), query: parsed.data };
  return next();
}

export function validateScheduleQuery(req: Request, res: Response, next: NextFunction) {
  const parsed = ScheduleQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendValidationError(res, req.path, parsed.error.issues);
  }
  req.validated = { ...(req.validated || {}), query: parsed.data };
  return next();
}

export function validateBoxScoreParams(req: Request, res: Response, next: NextFunction) {
  const parsed = BoxScoreParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return sendValidationError(res, req.path, parsed.error.issues);
  }
  req.validated = { ...(req.validated || {}), params: parsed.data };
  return next();
}

export function validateUserTeamScoresQuery(req: Request, res: Response, next: NextFunction) {
  const parsed = UserTeamScoresQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendValidationError(res, req.path, parsed.error.issues);
  }
  req.validated = { ...(req.validated || {}), query: parsed.data };
  return next();
}