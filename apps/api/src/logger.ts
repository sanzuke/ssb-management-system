import type { MiddlewareHandler } from "hono";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export type Logger = {
  log(level: LogLevel, msg: string, fields?: LogFields): void;
};

/** Log satu baris JSON per kejadian ke stdout (error ke stderr), mudah dibaca mesin log. */
export function createLogger(opts: { silent?: boolean; sink?: (line: string, level: LogLevel) => void } = {}): Logger {
  const sink =
    opts.sink ??
    ((line: string, level: LogLevel) => {
      if (level === "error") console.error(line);
      else console.log(line);
    });
  return {
    log(level, msg, fields) {
      if (opts.silent) return;
      sink(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }), level);
    },
  };
}

export type LogEnv = { Variables: { reqId: string; logger: Logger } };

const REQ_ID = /^[\w.-]{1,64}$/;

/**
 * Beri tiap permintaan id (memakai X-Request-Id masuk bila bentuknya aman), kembalikan di header respons,
 * dan catat satu baris saat selesai: metode, path (tanpa query string), status, durasi.
 * Isi permintaan, cookie, dan query tidak pernah dicatat.
 */
export function requestLogger(logger: Logger): MiddlewareHandler<LogEnv> {
  return async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const reqId = incoming && REQ_ID.test(incoming) ? incoming : crypto.randomUUID();
    c.set("reqId", reqId);
    c.set("logger", logger);
    c.header("X-Request-Id", reqId);
    const start = performance.now();
    await next();
    const status = c.res.status;
    logger.log(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "request", {
      reqId,
      method: c.req.method,
      path: c.req.path,
      status,
      ms: Math.round((performance.now() - start) * 10) / 10,
    });
  };
}
