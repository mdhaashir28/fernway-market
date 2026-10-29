// Input validation with zod. `parse` either returns clean, typed data or throws
// a 400 error listing every field that needs fixing.
import { z } from 'zod';
import { ApiError } from './errors.js';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || null,
      message: issue.message,
    }));
    throw new ApiError(400, 'VALIDATION_ERROR', fields[0]?.message ?? 'Some fields are invalid.', { fields });
  }
  return result.data;
}

/** A positive whole-number id taken from the URL, e.g. /products/12 */
export const idParam = z.object({ id: z.coerce.number().int().positive('Invalid id') });

/** Query-string booleans arrive as text: "true"/"1" → true, "false"/"0" → false. */
export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * Optional text fields: trims, and turns "" into null so the database stores NULL.
 * A missing field stays `undefined` (meaning "don't change it" in updates).
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value || null));

