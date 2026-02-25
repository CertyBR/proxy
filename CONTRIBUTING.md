# Contribuindo com o Certy Proxy

Obrigado por contribuir.

## Escopo deste projeto

Este repositório contém apenas o proxy de segurança do Certy (Cloudflare Worker).
Mudanças aqui devem ser pequenas, objetivas e com foco em segurança/rede.

## Setup local

```bash
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

## Fluxo recomendado

1. Faça fork do repositório.
2. Crie uma branch (`feat/...`, `fix/...`, `chore/...`, `docs/...`).
3. Rode validação local:
   - `bun run check`
4. Abra um Pull Request com:
   - objetivo da mudança
   - impacto em segurança/comportamento do proxy
   - exemplo de request/response quando aplicável

## Regras importantes

- Não commitar `.dev.vars` ou segredos.
- Evitar mudanças fora do escopo do proxy.
- Manter o comportamento padrão de rotas/métodos explicitamente documentado no PR.
