# EasyPanel — Coleta Campanha

## Servidor correto (oficial)

| Item | Valor |
|------|--------|
| IP | **65.109.139.4** |
| EasyPanel | mesmo do Inteligência Eleitoral |
| Projeto | **`coleta-campanha`** (dedicado; fora de `inteligencia-eleitoral-brasil`) |

### Serviços

| Serviço | Tipo | URL |
|---------|------|-----|
| `coleta-app` | App (GitHub `ftsmazzo/coleta-campanha`) | https://coleta-campanha-app.se860g.easypanel.host |
| `coleta-n8n` | Image `n8nio/n8n` | https://coleta-campanha-n8n.se860g.easypanel.host |
| `coleta-postgres` | PostgreSQL 16 | interno `coleta-postgres:5432` / DB `coleta` |

OpenRouter / STT: variáveis no serviço `coleta-app` (mesma chave do ambiente IE neste servidor).

---

## Ambiente legado (não usar como oficial)

Criado por engano no EasyPanel **46.62.130.249**, projeto `campanha-360-ia`:

- https://coleta-campanha-app.kxryyk.easypanel.host
- https://coleta-campanha-n8n.kxryyk.easypanel.host

Pode permanecer para teste temporário. Remover só com autorização explícita.
