# Cloud tooling only. No repository scripts, database credentials or network DB calls at build time.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 postgresql-client ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
# pg_dump itself runs in the existing Supabase CLI's Postgres container (source major 17).
# psql above is only a metadata client; no local PostgreSQL server is installed/started.
RUN test "$(dpkg --print-architecture)" = amd64 \
    && mkdir /tmp/oddgrid-cli \
    && curl --fail --silent --show-error --location \
       'https://github.com/supabase/cli/releases/download/v2.121.0/supabase_2.121.0_linux_amd64.tar.gz' \
       --output /tmp/oddgrid-cli/cli.tar.gz \
    && cd /tmp/oddgrid-cli \
    && echo '4b481189efbdc57cf2d37bdee5f1a0d29574314398564b32a6dfb76c0fcf275f  cli.tar.gz' | sha256sum --check --status \
    && tar -xzf cli.tar.gz supabase \
    && install -m 0755 supabase /usr/local/bin/supabase \
    && supabase db dump --help >/dev/null \
    && supabase link --help >/dev/null \
    && rm -rf /tmp/oddgrid-cli
USER vscode
