import type { Context } from "hono";
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
  console.error(JSON.stringify({ level: "error", msg: err.message, path: c.req.path, method: c.req.method }));
  return c.json(errorBody("internal", "Terjadi kesalahan di server"), 500);
}
