export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const notFound = (code = 'not_found') => new ApiError(404, code);
export const forbidden = (code = 'forbidden') => new ApiError(403, code);
export const badRequest = (code = 'bad_request', details?: unknown) => new ApiError(400, code, code, details);
export const unauthorized = () => new ApiError(401, 'auth_required');

/** Maps Postgres errors (incl. our RAISE codes) to API errors. */
export function fromPg(e: any): ApiError | null {
  if (!e || typeof e.code !== 'string' || e.code.length !== 5) return null;
  const msg: string = e.message ?? '';
  const known = /^[a-z_]+$/.test(msg) ? msg : null;
  switch (e.code) {
    case '42501':
      return new ApiError(403, known ?? 'forbidden');
    case 'P0002':
      return new ApiError(404, known ?? 'not_found');
    case '22023':
      return new ApiError(409, known ?? 'conflict');
    case '54000':
      return new ApiError(429, known ?? 'rate_limited');
    case '28000':
      return new ApiError(401, 'auth_required');
    case '23505':
      return new ApiError(409, 'already_exists', e.constraint);
    case '23514':
    case '22P02':
    case '22001':
    case '23502':
      return new ApiError(400, 'invalid_data', e.constraint ?? msg);
    case '23503':
      return new ApiError(400, 'invalid_reference', e.constraint);
    default:
      return null;
  }
}
