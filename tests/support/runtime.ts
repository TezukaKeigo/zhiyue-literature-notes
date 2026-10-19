// Test-only binding adapter. Production imports still resolve to Cloudflare.
export const env: { DB?: D1Database; AI?: Ai; AUTH_MODE: "local" | "sites" } = {
  AUTH_MODE: "local",
};
