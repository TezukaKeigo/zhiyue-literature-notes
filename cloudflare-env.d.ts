declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AI?: Ai;
    AUTH_MODE?: "local" | "sites";
  }
}
