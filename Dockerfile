# ============================================================
# Stage 1: Builder — compile C extensions and install wheels
# ============================================================
FROM python:3.13-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential gcc g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements-docker.txt .

RUN pip install --no-cache-dir --prefix=/install \
        -r requirements-docker.txt


# ============================================================
# Stage 2: Runtime — lean production image
# ============================================================
FROM python:3.13-slim

# Minimal runtime libs (Pillow, PyMuPDF, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libsm6 libxext6 libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built packages from builder
COPY --from=builder /install /usr/local

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app
COPY . .

# Remove desktop-only / dev / unnecessary files
RUN rm -rf .venv .git .idea __pycache__ china_economy_game \
        *.pptx *.docx *.sql nul database_migration scripts

# Ensure data directories exist and are writable by appuser
RUN mkdir -p uploads uploads/ppt uploads/assignments uploads/learning_center \
        uploads/school_learning_center user_data user_backups security_backups \
        logs vector_db Knowledge_base \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8002

# Healthcheck using Python (no curl dependency in slim image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8002/health', timeout=3)"

CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8002", \
     "--timeout-keep-alive", "300", \
     "--workers", "1"]
