import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

// The signed-in user. Lives only in an encrypted, httpOnly cookie: no database.
export type Session = { login: string; avatarUrl: string; token: string };

const COOKIE = "copilot_session";

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

// AES-256-GCM: iv(12) | tag(16) | ciphertext, base64url.
function seal(value: Session) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function unseal(raw: string): Session | null {
  try {
    const buf = Buffer.from(raw, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
}

export async function getSession() {
  const raw = (await cookies()).get(COOKIE)?.value;
  return raw ? unseal(raw) : null;
}

// maxAge follows the GitHub token: apps with expiring tokens issue 8-hour tokens.
export async function setSession(session: Session, maxAge = 60 * 60 * 24 * 7) {
  (await cookies()).set(COOKIE, seal(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}
