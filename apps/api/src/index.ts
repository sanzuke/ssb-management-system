import { createDb } from "@ssb/db";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { createMailer } from "./mail";
import { createMailboxAdmin } from "./mailboxes";
import { createPusher } from "./push";
import { sendSessionReminders } from "./session-reminders";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const logger = createLogger();
const pusher = createPusher(db, env, logger);
const app = createApp(db, env, {
  logger,
  mailer: createMailer(env),
  mailboxes: env.MAILBOX_SOCKET && env.MAILBOX_DOMAIN ? createMailboxAdmin({ socketPath: env.MAILBOX_SOCKET, domain: env.MAILBOX_DOMAIN }) : null,
  pusher,
});

// Pengingat "latihan 30 menit lagi" untuk pelatih: pekerjaan berkala di luar createApp, jadi tes API tidak ikut menjalankannya.
if (pusher) {
  let running = false;
  setInterval(async () => {
    // Satu putaran dalam satu waktu: putaran yang lambat tidak boleh ditumpuk putaran berikutnya.
    if (running) return;
    running = true;
    try {
      await sendSessionReminders({ db, pusher, logger });
    } catch (e) {
      logger.log("error", "putaran pengingat latihan gagal", { error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = false;
    }
  }, 60_000);
} else {
  logger.log("info", "push dinonaktifkan: FCM_SERVICE_ACCOUNT belum diisi");
}

export default { port: env.PORT, fetch: app.fetch };
