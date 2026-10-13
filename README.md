# Palavra do Dia

Devocional bíblico diário gerado por IA. Um devocional por dia, igual para todo mundo:
o primeiro acesso do dia (horário de Brasília) gera o texto, e os demais leem a cópia guardada.

- `public/index.html` — a página
- `netlify/functions/palavra.mts` — gera e guarda o devocional (`GET /api/palavra`)

## Publicar no Netlify

1. No Netlify: **Add new project → Import an existing project → GitHub** e escolha este repositório.
2. Em **Project configuration → Environment variables**, crie `ANTHROPIC_API_KEY` com sua chave da API da Anthropic (escopo: Functions).
3. Faça um novo deploy.

## Rodar localmente

```sh
npm install
ANTHROPIC_API_KEY=... npx netlify dev
```
