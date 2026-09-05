# EasyPanel — Coleta Campanha

> O painel está no **limite de projetos**. Os serviços ficaram no projeto existente **`campanha-360-ia`** (fora de `inteligencia-eleitora`). Quando houver slot, dá para mover para um projeto `coleta-campanha` dedicado.

## Serviços

| Serviço | Tipo | Acesso |
|---------|------|--------|
| `coleta-postgres` | PostgreSQL 16 | interno `coleta-postgres:5432` |
| `coleta-n8n` | App image `n8nio/n8n` | https://coleta-campanha-n8n.kxryyk.easypanel.host |
| `coleta-app` | App GitHub + Dockerfile | https://coleta-campanha-app.kxryyk.easypanel.host |

Repo: https://github.com/ftsmazzo/coleta-campanha

## Env do app

```
DATABASE_URL=postgresql://coleta:<senha>@coleta-postgres:5432/coleta
APP_URL=https://coleta-campanha-app.kxryyk.easypanel.host
OPENROUTER_API_KEY=<openrouter>
OPENROUTER_MODEL=anthropic/claude-sonnet-4
OPENROUTER_EXTRACT_MODEL=anthropic/claude-sonnet-4
OPENROUTER_SCHEMA_MODEL=google/gemini-2.5-flash
TZ=America/Sao_Paulo
FFMPEG_BIN=/usr/bin/ffmpeg
```

## Modelos OpenRouter

- Extração: `anthropic/claude-sonnet-4`
- Schema a partir de texto: `google/gemini-2.5-flash`
