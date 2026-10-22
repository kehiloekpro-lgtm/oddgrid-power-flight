# Cloud metadata client only; no server or database operations during build.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 postgresql-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# The export entry point runs immutable official PostgreSQL 17.6 pg_dump in a
# one-shot Docker container. Its --entrypoint bypasses PostgreSQL server init.
USER vscode
