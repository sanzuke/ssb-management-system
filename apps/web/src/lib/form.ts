import { createSignal } from "solid-js";
import { ApiError } from "./api";

/** Penanganan kirim formulir: status sibuk, pesan umum, dan pesan per kolom dari API. */
export function createSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [fields, setFields] = createSignal<Record<string, string>>({});

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError("");
    setFields({});
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === "validation" ? "Periksa kembali isian Anda." : err.message);
        setFields(err.fields);
      } else {
        setError("Tidak bisa terhubung ke server. Periksa sambungan internet Anda, lalu coba lagi.");
      }
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, fields, submit, setError };
}

/** Tujuan pengalihan yang aman: hanya jalur di situs ini. */
export const safeNext = (s: unknown) => (typeof s === "string" && s.startsWith("/") && !s.startsWith("//") ? s : "/");
