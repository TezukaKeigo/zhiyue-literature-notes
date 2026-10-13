export const PASSWORD_ITERATIONS = 310_000;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

export async function createPasswordHash(password: string): Promise<{
  hash: string;
  salt: string;
  iterations: number;
}> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hashBytes = await derivePassword(password, saltBytes, PASSWORD_ITERATIONS);
  return {
    hash: toBase64Url(hashBytes),
    salt: toBase64Url(saltBytes),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  try {
    const actual = await derivePassword(password, fromBase64Url(salt), iterations);
    const expected = fromBase64Url(expectedHash);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createSessionToken(): Promise<{
  token: string;
  tokenHash: string;
  expiresAt: number;
}> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(bytes);
  return {
    token,
    tokenHash: await hashSessionToken(token),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toBase64Url(new Uint8Array(digest));
}

export function createSessionCookie(token: string): string {
  return `zhiyue_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return "zhiyue_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase().slice(0, 254) : "";
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function derivePassword(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
