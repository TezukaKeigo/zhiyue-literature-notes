import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: "chatgpt" | "cloudflare";
  signOutPath: string;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";
const CF_ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";
const CF_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const CF_ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

type AccessJwtHeader = { alg?: unknown; kid?: unknown };
type AccessJwtPayload = {
  aud?: unknown;
  email?: unknown;
  exp?: unknown;
  iss?: unknown;
  nbf?: unknown;
};

type AccessJwk = JsonWebKey & { kid?: string };
type AccessJwks = { keys?: AccessJwk[] };

let cachedAccessKeys:
  | { issuer: string; expiresAt: number; keys: AccessJwk[] }
  | undefined;

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
    provider: "chatgpt",
    signOutPath: chatGPTSignOutPath("/"),
  };
}

export async function getAuthenticatedUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const chatGPTUserId = requestHeaders.get(USER_ID_HEADER);
  const chatGPTEmail = requestHeaders.get(USER_EMAIL_HEADER);

  if (chatGPTUserId && chatGPTEmail) {
    const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
    const fullName =
      encodedFullName &&
      requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
        ? safeDecodeURIComponent(encodedFullName)
        : null;

    return {
      userId: chatGPTUserId,
      displayName: fullName ?? chatGPTEmail,
      email: chatGPTEmail,
      fullName,
      provider: "chatgpt",
      signOutPath: chatGPTSignOutPath("/"),
    };
  }

  const accessEmail = requestHeaders.get(CF_ACCESS_EMAIL_HEADER)?.trim().toLocaleLowerCase();
  const accessJwt = requestHeaders.get(CF_ACCESS_JWT_HEADER);
  if (!accessEmail || !accessJwt) return null;

  const verifiedEmail = await verifyCloudflareAccessJwt(accessJwt);
  if (!verifiedEmail || verifiedEmail !== accessEmail) return null;

  const displayName = verifiedEmail.split("@")[0] || verifiedEmail;
  return {
    userId: `cloudflare:${verifiedEmail}`,
    displayName,
    email: verifiedEmail,
    fullName: null,
    provider: "cloudflare",
    signOutPath: CF_ACCESS_LOGOUT_PATH,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function verifyCloudflareAccessJwt(token: string): Promise<string | null> {
  const teamDomain = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const expectedAudience = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !expectedAudience) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let jwtHeader: AccessJwtHeader;
  let payload: AccessJwtPayload;
  try {
    jwtHeader = JSON.parse(decodeBase64UrlText(parts[0])) as AccessJwtHeader;
    payload = JSON.parse(decodeBase64UrlText(parts[1])) as AccessJwtPayload;
  } catch {
    return null;
  }

  if (jwtHeader.alg !== "RS256" || typeof jwtHeader.kid !== "string") return null;
  if (payload.iss !== teamDomain || !audienceMatches(payload.aud, expectedAudience)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 30) return null;
  if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;

  try {
    const keys = await getAccessKeys(teamDomain);
    const jwk = keys.find((key) => key.kid === jwtHeader.kid);
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeBase64UrlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? payload.email.trim().toLocaleLowerCase() : null;
  } catch {
    return null;
  }
}

async function getAccessKeys(issuer: string): Promise<AccessJwk[]> {
  if (cachedAccessKeys && cachedAccessKeys.issuer === issuer && cachedAccessKeys.expiresAt > Date.now()) {
    return cachedAccessKeys.keys;
  }

  const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("无法获取 Cloudflare Access 公钥");
  const body = (await response.json()) as AccessJwks;
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cachedAccessKeys = { issuer, keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return keys;
}

function normalizeTeamDomain(value: string | undefined): string | null {
  const raw = value?.trim().replace(/\/$/, "");
  if (!raw) return null;
  const withProtocol = raw.startsWith("https://") ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".cloudflareaccess.com")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function audienceMatches(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.includes(expected));
}

function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value));
}

function decodeBase64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
