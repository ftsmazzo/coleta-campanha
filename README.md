# Coleta Campanha

App isolado para **coleta estruturada de dados operacionais de campanha** (texto + áudio longo).  
Destino futuro: módulo da **Inteligência Eleitoral** (`inteligencia-dados`). Não é fork do Orbe — só reutiliza a ideia de quebrar áudios longos antes do STT.

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind 4
- Drizzle + SQLite local via `@libsql/client` (`data/coleta.db`)
- ffmpeg-static (split de áudio)
- Claude opcional (`ANTHROPIC_API_KEY`) para schema a partir de texto e extração

## Subir local

```bash
cd coleta-campanha
cp .env.example .env.local
# configure DATABASE_URL (Postgres) e OPENROUTER_API_KEY
npm install
npm run db:seed
npm run dev
```

Abre em [http://localhost:3100](http://localhost:3100).

## Produção

- App: https://coleta-campanha-app.kxryyk.easypanel.host  
- n8n: https://coleta-campanha-n8n.kxryyk.easypanel.host  
- Detalhes: `infra/easypanel.md`

## O que já existe

1. **Campanhas** — UF, candidato, ano, cargo  
2. **Tipos de documento** — cole um checklist e vira schema (seções/campos)  
3. **Seed** — Campanha Amapá 2026 + tipo `onboarding_campanha` (briefing + ~40 papéis)  
4. **Coleta** — upload de áudio (split automático se longo), colar texto, extrair, revisar campo a campo, validar  

## Fluxo

```
checklist colado → tipo/schema
        ↓
campanha + tipo → coleta
        ↓
áudio/texto → (split se preciso) → extrair → UI de revisão → validar
```

## Áudio longo

`src/lib/audio/split-audio.ts` prepara o arquivo: mono 16 kHz 48 kbps e, se passar de ~16 min ou ~18 MB, corta em partes de ~12 min.

STT externo (n8n/Whisper) fica para o próximo passo — hoje você cola a transcrição após o prepare.

## Próximos passos naturais

- Webhook STT por parte (como no Orbe)
- Gravação in-browser
- Materializar contatos/papéis em tabelas consultáveis
- Export para a base da Inteligência Eleitoral
