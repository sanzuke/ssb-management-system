import type { APIEvent } from "@solidjs/start/server";

// Meneruskan /api/** ke API. Pengalihan (302) dari API, mis. ke Google, harus sampai
// ke browser apa adanya, jadi redirect tidak boleh diikuti di sini.
const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function forward({ request }: APIEvent) {
  const url = new URL(request.url);
  const target = `${API_URL}${url.pathname.replace(/^\/api/, "")}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const res = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
  });
  const out = new Headers(res.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
