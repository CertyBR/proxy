interface Env {
  BACKEND_ORIGIN: string;
  ALLOWED_ORIGINS?: string;
  PROXY_SHARED_TOKEN?: string;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "OPTIONS"]);
const ALLOWED_PATH_PREFIXES = ["/api/v1/certificates", "/health"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (!isPathAllowed(requestUrl.pathname)) {
      return jsonError("Rota não permitida no proxy.", 404);
    }

    const origin = request.headers.get("Origin");
    const corsOrigin = resolveCorsOrigin(origin, env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return handlePreflight(request, corsOrigin);
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return withCors(
        jsonError("Método não permitido no proxy.", 405),
        corsOrigin
      );
    }

    const backendOrigin = normalizeBackendOrigin(env.BACKEND_ORIGIN);
    if (!backendOrigin) {
      return withCors(
        jsonError("BACKEND_ORIGIN inválido no Worker.", 500),
        corsOrigin
      );
    }

    const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, backendOrigin);
    const upstreamHeaders = buildUpstreamHeaders(request, env.PROXY_SHARED_TOKEN);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.method === "GET" ? undefined : request.body,
      redirect: "manual",
      cf: {
        cacheEverything: false
      }
    });

    return withCors(copyResponse(upstreamResponse), corsOrigin);
  }
};

function isPathAllowed(pathname: string): boolean {
  return ALLOWED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function normalizeBackendOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function resolveCorsOrigin(origin: string | null, allowedOriginsRaw?: string): string | null {
  if (!origin) return null;

  const allowedOrigins = (allowedOriginsRaw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedOrigins.includes("*")) return origin;
  if (allowedOrigins.includes(origin)) return origin;
  return null;
}

function handlePreflight(request: Request, corsOrigin: string | null): Response {
  if (!corsOrigin) {
    return jsonError("Origin não permitida.", 403);
  }

  const requestedMethod = request.headers.get("Access-Control-Request-Method");
  if (requestedMethod && !ALLOWED_METHODS.has(requestedMethod.toUpperCase())) {
    return jsonError("Método não permitido no preflight.", 405);
  }

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", corsOrigin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return new Response(null, { status: 204, headers });
}

function buildUpstreamHeaders(request: Request, proxyToken?: string): Headers {
  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  const accept = request.headers.get("Accept");
  const userAgent = request.headers.get("User-Agent");
  const authorization = request.headers.get("Authorization");
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");

  if (contentType) headers.set("Content-Type", contentType);
  if (accept) headers.set("Accept", accept);
  if (userAgent) headers.set("User-Agent", userAgent);
  if (authorization) headers.set("Authorization", authorization);
  if (cfConnectingIp) headers.set("X-Forwarded-For", cfConnectingIp);
  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Certy-Proxy", "cloudflare-worker");

  if (proxyToken && proxyToken.trim().length > 0) {
    headers.set("X-Certy-Proxy-Token", proxyToken.trim());
  }

  return headers;
}

function copyResponse(upstreamResponse: Response): Response {
  const headers = new Headers(upstreamResponse.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.delete("server");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
}

function withCors(response: Response, corsOrigin: string | null): Response {
  const headers = new Headers(response.headers);
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Vary", "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
