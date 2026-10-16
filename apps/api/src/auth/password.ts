// Bun.password memakai argon2id bawaan Bun, tanpa modul native tambahan.
export const hashPassword = (plain: string) => Bun.password.hash(plain, { algorithm: "argon2id" });

export const verifyPassword = (plain: string, hash: string) => Bun.password.verify(plain, hash);

/** Hash tiruan agar waktu login sama baik email ada maupun tidak. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("tidak-dipakai-untuk-login"));
