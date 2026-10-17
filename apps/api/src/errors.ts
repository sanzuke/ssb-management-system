import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError } from "@ssb/shared";
import type { Logger } from "./logger";

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
    return c.json(
      errorBody(err.status === 403 ? "forbidden" : "bad_request", err.status === 403 ? "Permintaan ditolak" : "Permintaan tidak valid"),
      err.status as 400 | 403,
    );
  }
  const cause = (err as { cause?: { message?: string; code?: string } }).cause;
  const log = c.get("logger") as Logger | undefined;
  const fields = {
    reqId: c.get("reqId"),
    name: err.name,
    err: err.message,
    cause: cause ? { message: cause.message, code: cause.code } : undefined,
    path: c.req.path,
    method: c.req.method,
  };
  // Tanpa logger terpasang (mis. dipanggil di luar createApp), tetap catat ke stderr.
  if (log) log.log("error", "unhandled_error", fields);
  else console.error(JSON.stringify({ level: "error", msg: "unhandled_error", ...fields }));
  return c.json(errorBody("internal", "Terjadi kesalahan di server"), 500);
}
