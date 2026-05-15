FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV CLASSROOM_HOST=0.0.0.0
ENV CLASSROOM_PORT=8000
ENV CLASSROOM_DATA_DIR=/data

WORKDIR /app

COPY server.py README.md ./
COPY static ./static

RUN useradd --create-home --shell /usr/sbin/nologin classpulse \
    && mkdir -p /data \
    && chown -R classpulse:classpulse /app /data

USER classpulse

EXPOSE 8000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).read()"

CMD ["python", "server.py"]
