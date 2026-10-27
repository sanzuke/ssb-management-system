import { createDb } from "@ssb/db";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { createMailer } from "./mail";
import { createMailboxAdmin } from "./mailboxes";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const app = createApp(db, env, {
  mailer: createMailer(env),
  mailboxes: env.MAILBOX_SOCKET && env.MAILBOX_DOMAIN ? createMailboxAdmin({ socketPath: env.MAILBOX_SOCKET, domain: env.MAILBOX_DOMAIN }) : null,
});

export default { port: env.PORT, fetch: app.fetch };
