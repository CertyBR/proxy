# Certy Proxy

Proxy do Certy em Cloudflare Workers.

Este projeto é um componente auxiliar de segurança entre o frontend e o backend, reduzindo exposição direta da VPS.

## Links

- Site: https://certy.com.br/
- Repositório: https://github.com/CertyBR/certy.com.br
- Patrocinador: [ZeroCert](https://zerocert.com.br)

## Mantenedores Chefes

- André Ribas ([@RibasSu](https://github.com/RibasSu))
- Sarah Maia ([@sarahsec](https://github.com/sarahsec))

## O que o proxy faz

- Encaminha somente rotas permitidas:
  - `/health`
  - `/api/v1/certificates/*`
- Permite somente métodos `GET`, `POST`, `OPTIONS`.
- Aplica CORS por allowlist (`ALLOWED_ORIGINS`).
- Encaminha cabeçalhos essenciais para o backend.
- Injeta token compartilhado opcional (`X-Certy-Proxy-Token`) para bloquear acesso direto ao backend.
- Força `Cache-Control: no-store` nas respostas proxied.

## Variáveis

Use `.dev.vars` no ambiente local (não versionado):

```bash
cp .dev.vars.example .dev.vars
```

Campos:

- `BACKEND_ORIGIN`: origem do backend (ex.: `http://127.0.0.1:8080` em dev)
- `ALLOWED_ORIGINS`: origens permitidas do frontend (separadas por vírgula)
- `PROXY_SHARED_TOKEN`: token opcional (recomendado)

## Desenvolvimento

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

## Scripts

```bash
bun run dev     # wrangler dev
bun run check   # tsc --noEmit
bun run deploy  # wrangler deploy
```

## Integração com backend

Defina o mesmo token no backend:

```env
PROXY_SHARED_TOKEN=<mesmo token do worker>
```

Se o backend estiver sem token, acesso direto continua possível.

## Contribuições

Guia rápido em [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licença

MIT. Veja [LICENSE](./LICENSE).
