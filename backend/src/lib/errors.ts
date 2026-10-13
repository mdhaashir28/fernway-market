// Errors that are safe to show to API users. Every error response looks like:
//   { "error": { "code": "SOME_CODE", "message": "Human-readable text", "details": ... } }

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please log in to continue.') => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = "You don't have permission to do that.") => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (thing = 'Resource') => new ApiError(404, 'NOT_FOUND', `${thing} not found.`);
export const conflict = (code: string, message: string, details?: unknown) => new ApiError(409, code, message, details);
