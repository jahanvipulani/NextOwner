interface ErrorLike {
  response?: { data?: { detail?: unknown } };
  message?: string;
}

/** Turns an API/axios error into one readable sentence. Handles FastAPI 422 arrays. */
export function formatError(err: unknown): string {
  const e = err as ErrorLike | null | undefined;
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string' && detail.length > 0) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown; loc?: unknown } | null;
    const msg = first && typeof first.msg === 'string' ? first.msg : 'Invalid input';
    const loc =
      first && Array.isArray(first.loc)
        ? first.loc.filter((part: unknown) => part !== 'body').join('.')
        : '';
    return loc ? `${loc}: ${msg}` : msg;
  }
  if (e && typeof e.message === 'string' && e.message.length > 0) return e.message;
  return 'Something went wrong. Please try again.';
}
