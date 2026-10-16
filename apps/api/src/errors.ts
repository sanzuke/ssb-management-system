import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "@ssb/shared";

export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "unauthorized", "Perlu login");
export const forbidden = () => new HttpError(403, "forbidden", "Tidak punya akses");

export function errorBody(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function onError(err: Error, c: Context) {
  if (err instanceof HttpError) return c.json(errorBody(err.code, err.message), err.status);
  // Penolakan dari middleware Hono, misalnya CSRF.
  if (err instanceof HTTPException) {
    return c.json(errorBody(err.status === 403 ? "forbidden" : "bad_request", err.status === 403 ? "Permintaan ditolak" : "Permintaan tidak valid"), err.status as 400 | 403);
  }
  const cause = (err as { cause?: { message?: string; code?: string } }).cause;
  console.error(
    JSON.stringify({
      level: "error",
      name: err.name,
      msg: err.message,
      cause: cause ? { message: cause.message, code: cause.code } : undefined,
      path: c.req.path,
      method: c.req.method,
    }),
  );
  return c.json(errorBody("internal", "Terjadi kesalahan di server"), 500);
}
