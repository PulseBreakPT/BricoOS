# =============================================================================
# Brico2 backend — Dockerfile de produção
# =============================================================================
# Python 3.11 slim + uvicorn com 1 worker único.
# =============================================================================

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 brico2 \
    && useradd --system --uid 1001 --gid brico2 --home /app --shell /usr/sbin/nologin brico2

WORKDIR /app

COPY deploy/backend/requirements.production.txt /app/requirements.txt
# SETUPTOOLS_USE_DISTUTILS=stdlib: o http-ece (dependência do pywebpush, para
# as notificações push) ainda usa um setup.py com a opção "install_layout" do
# distutils antigo, que o setuptools mais recente já não reconhece
# (AttributeError: install_layout) — confirmado a reproduzir e a corrigir
# com esta variável, que devolve o distutils "clássico" só para o build.
RUN pip install --upgrade pip setuptools wheel \
    && SETUPTOOLS_USE_DISTUTILS=stdlib pip install -r /app/requirements.txt

# Integração de IA (opcional): vem do index próprio do Emergent. Se o index
# estiver indisponível o build NÃO falha — a app arranca na mesma e apenas as
# funcionalidades de IA ficam indisponíveis (exigem OPENAI_API_KEY de qualquer
# forma).
RUN pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/ \
    || echo "AVISO: emergentintegrations não instalado — funcionalidades de IA desativadas."

COPY --chown=brico2:brico2 backend/ /app/

USER brico2

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/api/', timeout=3).status==200 else 1)"

# 1 worker único: o startup corre migrate()/ensure_indexes() uma única
# vez — escalar para >1 worker duplicaria esse trabalho.
CMD ["uvicorn", "server:app", \
     "--host", "0.0.0.0", \
     "--port", "8001", \
     "--workers", "1", \
     "--proxy-headers", \
     "--forwarded-allow-ips", "*", \
     "--access-log", \
     "--log-level", "info"]
