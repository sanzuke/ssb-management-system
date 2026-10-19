import { createDb } from "@ssb/db";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { createMailer } from "./mail";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const app = createApp(db, env, { mailer: createMailer(env) });

export default { port: env.PORT, fetch: app.fetch };
