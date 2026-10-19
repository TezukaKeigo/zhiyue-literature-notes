import { AsyncLocalStorage } from "node:async_hooks";

export const requests = new AsyncLocalStorage<Request>();

export async function headers() {
  const request = requests.getStore();
  if (!request) throw new Error("No test request context");
  return request.headers;
}

export async function cookies() {
  const values = new Map((await headers()).get("cookie")?.split(";").map((part) => {
    const separator = part.indexOf("=");
    return [part.slice(0, separator).trim(), part.slice(separator + 1)] as const;
  }) ?? []);
  return { get: (name: string) => values.has(name) ? { name, value: values.get(name)! } : undefined };
}
