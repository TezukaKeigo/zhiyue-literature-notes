import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { authSessions, userAccounts } from "../db/schema";
import { hashSessionToken } from "../lib/local-auth";

export type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  provider: "chatgpt" | "local";
  signOutPath: string;
};

export const SESSION_COOKIE_NAME = "zhiyue_session";

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<AuthenticatedUser | null> {
  const requestHeaders = await headers();
  return readChatGPTUser(requestHeaders);
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const requestHeaders = await headers();
  const chatGPTUser = readChatGPTUser(requestHeaders);
  if (chatGPTUser) return chatGPTUser;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;

  const tokenHash = await hashSessionToken(sessionToken);
  const now = Math.floor(Date.now() / 1000);
  const db = getDb();
  const [row] = await db
    .select({
      id: userAccounts.id,
      email: userAccounts.email,
      displayName: userAccounts.displayName,
    })
    .from(authSessions)
    .innerJoin(userAccounts, eq(authSessions.userId, userAccounts.id))
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, now)))
    .limit(1);

  if (!row) return null;
  return {
    userId: `account:${row.id}`,
    displayName: row.displayName,
    email: row.email,
    fullName: row.displayName,
    provider: "local",
    signOutPath: "/api/auth/logout",
  };
}

export async function isInitialRegistrationOpen(): Promise<boolean> {
  const db = getDb();
  const [account] = await db
    .select({ id: userAccounts.id })
    .from(userAccounts)
    .where(eq(userAccounts.bootstrapSlot, 1))
    .limit(1);
  return !account;
}

export async function requireChatGPTUser(returnTo: string): Promise<AuthenticatedUser> {
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

function readChatGPTUser(requestHeaders: Headers): AuthenticatedUser | null {
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

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || isReservedAuthPath(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function isReservedAuthPath(pathname: string): boolean {
  return pathname === SIGN_IN_PATH || pathname === SIGN_OUT_PATH || pathname === CALLBACK_PATH;
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
