/** Expected, user-facing failures. The API maps `status` to the HTTP status code. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`, 404);
export const forbidden = (message = "You cannot do that") => new AppError("FORBIDDEN", message, 403);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new AppError(code, message, 409, details);
