# Deployment do Brico2 (lusorae.pt — Hostinger VPS)

Stack **100% Docker**: MongoDB + FastAPI + Caddy (serve o React e faz
reverse-proxy de `/api`, com HTTPS automático via Let's Encrypt).

```
Internet :80/:443
   │
   ▼
┌──────────────────────────────────────┐
│ Caddy (container "web")              │
│  • HTTPS automático (Let's Encrypt)  │
│  • /        → React estático (/srv)  │
│  • /api/*   → backend:8001           │
└───────────────┬──────────────────────┘
                │ rede interna Docker
        ┌───────┴────────┐
        ▼                ▼
   backend (FastAPI)   mongo (MongoDB 7)
```

## 🚀 Primeira instalação (3 comandos no terminal do VPS)

```bash
git clone https://github.com/PulseBreakPT/Brico2.git brico2-app
cd brico2-app
sudo SITE_DOMAIN=lusorae.pt ACME_EMAIL=dr.stormania@gmail.com bash deploy/hostinger-setup.sh
```

O setup instala o Docker (se faltar), gera `deploy/.env.production` com
segredos seguros, faz build de tudo e instala o comando global `brico2`.

> ⚠️ **Portas 80/443**: se o stack do LusoraeCrime (ou outro) estiver a correr
> neste VPS, o setup deteta e pede para o parares primeiro (não apaga dados):
> `docker compose -p lusoraecrime down`

> ⚠️ **DNS**: `lusorae.pt` (e `www.lusorae.pt`, se quiseres) têm de apontar
> para o IP do VPS antes de correres o setup, senão o Let's Encrypt não
> consegue emitir o certificado.

## 🔄 Atualizar o site (puxar o PR merge mais recente e fazer deploy)

Depois de fazeres merge de um PR no GitHub, no terminal do VPS:

```bash
sudo brico2            # atualiza e reconstrói só o que mudou (backend e/ou frontend)
sudo brico2 backend    # força só a API
sudo brico2 web        # força só o frontend
sudo brico2 all        # força os dois, mesmo sem alterações relevantes
```

O comando faz `git fetch origin main` + `git reset --hard origin/main`
(fica exatamente com o último merge em `main`) e, por omissão, só reconstrói
o(s) serviço(s) cujos ficheiros mudaram desde a última vez — muito mais
rápido quando um PR só mexe no backend ou só no frontend.

Alternativa sem o comando global:

```bash
bash deploy/auto-deploy.sh              # main
bash deploy/auto-deploy.sh --branch X   # outra branch
```

## 📧 Ativar o envio de emails (Gmail)

**Opção A — SMTP com palavra-passe de aplicação (recomendada, 2 min):**

1. Ativa a verificação em 2 passos na conta Google.
2. Gera uma palavra-passe de aplicação em https://myaccount.google.com/apppasswords
3. No VPS, edita `deploy/.env.production` e preenche `GMAIL_SMTP_USER` e
   `GMAIL_SMTP_APP_PASSWORD` (os espaços da palavra-passe são ignorados).
4. `sudo brico2 backend`
5. Verifica sem enviar nada: `curl http://127.0.0.1:8001/api/gmail/test`
   → deve responder `"Login SMTP válido — nenhum email foi enviado."`

Nunca expira e dispensa o botão "Ligar Gmail". Tem prioridade sobre a opção B.

**Opção B — OAuth (Google Cloud Console):**

1. Em https://console.cloud.google.com/apis/credentials cria credenciais
   OAuth 2.0 do tipo **Aplicação Web**.
2. Adiciona o redirect URI: `https://lusorae.pt/api/oauth/gmail/callback`
3. No VPS, edita `deploy/.env.production` e preenche `GOOGLE_CLIENT_ID` e
   `GOOGLE_CLIENT_SECRET`.
4. `sudo brico2 backend`
5. No site, liga a conta Gmail (botão "Ligar Gmail").

## 🤖 Ativar as funcionalidades de IA (opcional)

Preenche `OPENAI_API_KEY` em `deploy/.env.production` e corre
`sudo brico2 backend`. Sem chave, o resto do site funciona normalmente.

## 💾 Backups do MongoDB

```bash
sudo bash deploy/scripts/backup-mongo.sh
```

Cron diário às 03:30:

```bash
echo '30 3 * * * root bash /root/brico2-app/deploy/scripts/backup-mongo.sh >> /var/log/brico2-backup.log 2>&1' \
  | sudo tee /etc/cron.d/brico2-backup
```

## 🧰 Comandos úteis

```bash
cd brico2-app/deploy
docker compose --env-file .env.production ps            # estado
docker compose --env-file .env.production logs -f       # logs (tudo)
docker compose --env-file .env.production logs -f backend
docker compose --env-file .env.production restart       # reiniciar
docker compose --env-file .env.production down          # parar (dados ficam nos volumes)
curl http://127.0.0.1:8001/api/                         # testar API do host
```

## Conteúdo desta pasta

| Ficheiro | Função |
|----------|--------|
| `hostinger-setup.sh` | Setup completo num comando (instala Docker, gera segredos, build + arranque, instala o comando `brico2`) |
| `docker-compose.yml` | Stack completo: `mongo` + `backend` + `web` (Caddy) + `autoheal` |
| `Caddyfile` | Config do Caddy (SPA + proxy `/api` + HTTPS automático) |
| `frontend/Dockerfile` | Build multi-stage do React → servido pelo Caddy |
| `backend/Dockerfile` | Imagem de produção do FastAPI |
| `backend/requirements.production.txt` | Dependências Python de produção (subconjunto mínimo) |
| `.env.production.example` | Template/documentação das variáveis de ambiente |
| `auto-deploy.sh` | Deploy manual (git pull + rebuild), alternativa ao comando `brico2` |
| `scripts/backup-mongo.sh` | Backup do MongoDB com retenção de 14 dias |
