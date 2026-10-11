export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found`);

export const validationError = (fields: Record<string, string>) =>
  new ApiError(400, 'VALIDATION_FAILED', 'Please fix the highlighted fields', { fields });
