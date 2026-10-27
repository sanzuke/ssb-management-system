import { z } from "zod";

/** Bagian lokal alamat email akademi: huruf kecil, angka, titik, strip, garis bawah; 2 sampai 31 karakter. */
export const mailboxNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{1,30}$/, "Huruf kecil, angka, titik, strip, atau garis bawah; 2 sampai 31 karakter");

export const mailboxCreateSchema = z.object({ name: mailboxNameSchema });
export type MailboxCreateInput = z.infer<typeof mailboxCreateSchema>;

/** Akun yang dipakai sistem dan tidak boleh dihapus (admin: pemilik surat penting; noreply: pengirim SSB App). */
export const MAILBOX_NO_DELETE: readonly string[] = ["admin", "noreply"];
/** Akun yang sandinya tidak boleh direset dari SSB App (noreply dipakai SSB App untuk login SMTP). */
export const MAILBOX_NO_RESET: readonly string[] = ["noreply"];

export type MailboxAccount = { name: string; address: string; canDelete: boolean; canReset: boolean };
export type MailboxList = {
  /** false bila server ini tidak punya pengelola email (mis. lingkungan dev). */
  enabled: boolean;
  domain: string;
  /** Alamat webmail untuk membaca surat; kosong bila tidak ada. */
  webmailUrl: string;
  accounts: MailboxAccount[];
};
/** Sandi hanya dikirim sekali, saat akun dibuat atau sandinya direset. */
export type MailboxCredential = { address: string; password: string };
