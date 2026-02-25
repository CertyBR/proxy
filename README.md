# Certy Proxy (Cloudflare Workers)

Proxy entre frontend e backend para mascarar a VPS e aplicar uma camada adicional de segurança.

## O que ele faz

- Encaminha apenas rotas permitidas:
  - `/health`
  - `/api/v1/certificates/*`
- Restringe métodos para `GET`, `POST`, `OPTIONS`.
- Aplica CORS por allowlist (`ALLOWED_ORIGINS`).
- Injeta header secreto opcional para o backend:
  - `X-Certy-Proxy-Token: <PROXY_SHARED_TOKEN>`

## Configuração

1. Copie variáveis locais:

```bash
cp .dev.vars.example .dev.vars
```

2. Preencha:
- `BACKEND_ORIGIN` (URL pública do backend na VPS)
- `ALLOWED_ORIGINS` (origens do frontend)
- `PROXY_SHARED_TOKEN` (opcional, mas recomendado)

## Rodar local

```bash
bun install
bun run dev
```

## Deploy

```bash
bunx wrangler login
bunx wrangler secret put PROXY_SHARED_TOKEN
bun run deploy
```

## Integração com backend

No backend, configure o mesmo token:

```env
PROXY_SHARED_TOKEN=<mesmo token do worker>
```

Sem `PROXY_SHARED_TOKEN` no backend, o acesso direto continua liberado.
