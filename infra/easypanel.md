# EasyPanel — projeto `coleta-campanha`

Projeto **separado** de `inteligencia-eleitora` / `inteligencia-eleitoral-brasil`.

## Serviços

| Serviço | Tipo | Acesso |
|---------|------|--------|
| `postgres` | PostgreSQL 16 | interno `coleta-campanha_postgres:5432` |
| `n8n` | App image `n8nio/n8n` | https://coleta-campanha-n8n.kxryyk.easypanel.host |
| `app` | App GitHub + Dockerfile | https://coleta-campanha-app.kxryyk.easypanel.host |

Repo: https://github.com/ftsmazzo/coleta-campanha

## Env do app

```
DATABASE_URL=postgresql://coleta:<senha>@coleta-campanha_postgres:5432/coleta
APP_URL=https://coleta-campanha-app.kxryyk.easypanel.host
OPENROUTER_API_KEY=<openrouter>
OPENROUTER_MODEL=anthropic/claude-sonnet-4
OPENROUTER_EXTRACT_MODEL=anthropic/claude-sonnet-4
OPENROUTER_SCHEMA_MODEL=google/gemini-2.5-flash
TZ=America/Sao_Paulo
```

## Modelos OpenRouter

- Extração de campos: `anthropic/claude-sonnet-4`
- Schema a partir de texto: `google/gemini-2.5-flash` (mais barato/rápido)
