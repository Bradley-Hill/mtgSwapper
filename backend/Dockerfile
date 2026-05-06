# ── Stage: base Python image ──────────────────────────────────────────────────
# python:3.12-slim is a minimal Debian-based image with Python pre-installed.
# Must be 3.12+ — Django 6.0.4 requires Python >=3.12.
# Slim saves ~200MB vs the full image.
FROM python:3.12-slim

# ── System dependencies ───────────────────────────────────────────────────────
# libpq-dev / gcc: needed to compile psycopg2 from source if the binary wheel
#   isn't available for the exact platform (belt-and-suspenders).
# libgl1 / libglib2.0-0 / libsm6 / libxext6: required by OpenCV (used by PaddleOCR)
#   PaddleOCR is our OCR engine for card scanning, and it depends on cv2.
# We clean up the apt cache immediately to keep the image layer small.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ─────────────────────────────────────────────────────────
# All subsequent commands run from here inside the container.
WORKDIR /app

# ── Python dependencies ───────────────────────────────────────────────────────
# Copy requirements first (before the rest of the code) so Docker can cache
# this layer. If you only change app code, Docker reuses the pip install layer
# and the build is much faster.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
COPY . .

# ── Static files ──────────────────────────────────────────────────────────────
# collectstatic gathers all static files (Django admin CSS/JS etc.) into the
# STATIC_ROOT directory so WhiteNoise can serve them.
# --noinput skips the "are you sure?" confirmation prompt.
RUN python manage.py collectstatic --noinput

# ── Port ──────────────────────────────────────────────────────────────────────
# Render injects the PORT env var at runtime. We expose 8000 as a convention
# (Render overrides this automatically).
EXPOSE 8000

# ── Start command ─────────────────────────────────────────────────────────────
# gunicorn is the production WSGI server.
# --bind 0.0.0.0:$PORT  → listen on all interfaces, port from Render's env var
# --workers 2           → 2 worker processes (good for a free-tier single CPU)
# --timeout 120         → allow up to 120s for slow requests (OCR can be slow)
# config.wsgi:application → the WSGI entry point Django generated in config/wsgi.py
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 120 config.wsgi:application"]
