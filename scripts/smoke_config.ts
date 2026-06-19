export const DEFAULT_BJC_API_PORT = 3001;
export const DEFAULT_BJC_API_BASE_URL = `http://127.0.0.1:${DEFAULT_BJC_API_PORT}`;

type EnvLike = Record<string, string | undefined>;

export function resolveSmokeBaseUrl(env: EnvLike): string {
  return env.BJC_SMOKE_BASE_URL ?? env.BJC_API_BASE_URL ?? DEFAULT_BJC_API_BASE_URL;
}

export function portHintFromUrl(url: URL): number {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === "https:" ? 443 : 80;
}
