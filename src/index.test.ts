import { afterEach, describe, expect, test, vi } from "vitest";
import worker from "./index";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    BACKEND_ORIGIN: "https://backend.certy.test/base",
    ALLOWED_ORIGINS: "https://certy.com.br,https://www.certy.com.br",
    PROXY_SHARED_TOKEN: " shared-token ",
    ...overrides
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://proxy.certy.test${path}`, init);
}

async function json(response: Response): Promise<{ error?: string }> {
  return response.json();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("certy proxy worker", () => {
  test("rejects paths outside the proxy allowlist", async () => {
    const response = await worker.fetch(request("/admin"), env());

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Rota não permitida no proxy." });
  });

  test("rejects methods outside the proxy allowlist with CORS when origin is allowed", async () => {
    const response = await worker.fetch(
      request("/health", {
        method: "PUT",
        headers: {
          Origin: "https://certy.com.br"
        }
      }),
      env()
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://certy.com.br");
    expect(await json(response)).toEqual({ error: "Método não permitido no proxy." });
  });

  test("rejects requests when the backend origin is missing", async () => {
    const response = await worker.fetch(
      request("/health", {
        headers: {
          Origin: "https://certy.com.br"
        }
      }),
      env({ BACKEND_ORIGIN: "" })
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://certy.com.br");
    expect(await json(response)).toEqual({ error: "BACKEND_ORIGIN inválido no Worker." });
  });

  test("rejects requests when the backend origin is not a URL", async () => {
    const response = await worker.fetch(request("/health"), env({ BACKEND_ORIGIN: "not a url" }));

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(await json(response)).toEqual({ error: "BACKEND_ORIGIN inválido no Worker." });
  });

  test("proxies GET requests and hardens upstream responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 201,
        statusText: "Created",
        headers: {
          "Content-Type": "text/plain",
          Server: "upstream"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      request("/api/v1/certificates/check?host=example.com", {
        headers: {
          Origin: "https://www.certy.com.br"
        }
      }),
      env({ PROXY_SHARED_TOKEN: "   " })
    );

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("server")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://www.certy.com.br");
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://backend.certy.test/api/v1/certificates/check?host=example.com"), {
      method: "GET",
      headers: expect.any(Headers),
      body: undefined,
      redirect: "manual",
      cf: {
        cacheEverything: false
      }
    });
    const upstreamHeaders = fetchMock.mock.calls[0][1].headers as Headers;
    expect(upstreamHeaders.get("X-Certy-Proxy")).toBe("cloudflare-worker");
    expect(upstreamHeaders.get("X-Forwarded-Proto")).toBe("https");
    expect(upstreamHeaders.has("X-Certy-Proxy-Token")).toBe(false);
  });

  test("proxies POST requests with selected upstream headers and shared token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("created"));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ domain: "example.com" });

    await worker.fetch(
      request("/api/v1/certificates/sessions", {
        method: "POST",
        body,
        headers: {
          Origin: "https://certy.com.br",
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "vitest",
          Authorization: "Bearer browser-token",
          "CF-Connecting-IP": "203.0.113.10"
        }
      }),
      env()
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const upstreamHeaders = init.headers as Headers;
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(upstreamHeaders.get("Content-Type")).toBe("application/json");
    expect(upstreamHeaders.get("Accept")).toBe("application/json");
    expect(upstreamHeaders.get("User-Agent")).toBe("vitest");
    expect(upstreamHeaders.get("Authorization")).toBe("Bearer browser-token");
    expect(upstreamHeaders.get("X-Forwarded-For")).toBe("203.0.113.10");
    expect(upstreamHeaders.get("X-Certy-Proxy-Token")).toBe("shared-token");
  });

  test("allows preflight requests for configured origins", async () => {
    const response = await worker.fetch(
      request("/api/v1/certificates/sessions", {
        method: "OPTIONS",
        headers: {
          Origin: "https://certy.com.br",
          "Access-Control-Request-Method": "POST"
        }
      }),
      env()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://certy.com.br");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type,Authorization");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  test("allows preflight requests without an explicit requested method", async () => {
    const response = await worker.fetch(
      request("/health", {
        method: "OPTIONS",
        headers: {
          Origin: "https://certy.com.br"
        }
      }),
      env()
    );

    expect(response.status).toBe(204);
  });

  test("rejects preflight requests without an allowed origin", async () => {
    const response = await worker.fetch(
      request("/health", {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.test"
        }
      }),
      env()
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: "Origin não permitida." });
  });

  test("rejects non-local origins when the allowlist is undefined", async () => {
    const response = await worker.fetch(
      request("/health", {
        method: "OPTIONS",
        headers: {
          Origin: "https://certy.com.br"
        }
      }),
      env({ ALLOWED_ORIGINS: undefined })
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ error: "Origin não permitida." });
  });

  test("rejects preflight requests for blocked methods", async () => {
    const response = await worker.fetch(
      request("/health", {
        method: "OPTIONS",
        headers: {
          Origin: "https://certy.com.br",
          "Access-Control-Request-Method": "DELETE"
        }
      }),
      env()
    );

    expect(response.status).toBe(405);
    expect(await json(response)).toEqual({ error: "Método não permitido no preflight." });
  });

  test("allows local development origins only when the proxy request is local", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("local"));
    vi.stubGlobal("fetch", fetchMock);

    const localResponse = await worker.fetch(
      new Request("http://127.0.0.1:8787/health", {
        headers: {
          Origin: "http://localhost:5173"
        }
      }),
      env()
    );
    const remoteResponse = await worker.fetch(
      request("/health", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173"
        }
      }),
      env()
    );

    expect(localResponse.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(remoteResponse.status).toBe(403);
  });

  test("allows wildcard CORS origins", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("wildcard"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      request("/health", {
        headers: {
          Origin: "https://random.example"
        }
      }),
      env({ ALLOWED_ORIGINS: "*" })
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://random.example");
  });

  test("omits CORS headers when no origin is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(request("/health"), env());

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("handles malformed origin headers as blocked origins", async () => {
    const response = await worker.fetch(
      request("/health", {
        method: "OPTIONS",
        headers: {
          Origin: "://broken"
        }
      }),
      env()
    );

    expect(response.status).toBe(403);
  });
});
