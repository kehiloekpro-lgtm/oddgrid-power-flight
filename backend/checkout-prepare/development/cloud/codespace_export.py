#!/usr/bin/env python3
"""Manual browser Codespaces entry point. Default: local preflight, no DB connection.
Reuses the existing source-only exporter; no restore/migration action is exposed.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('database_setup', BASE / 'database_setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
REPOSITORY = 'kehiloekpro-lgtm/oddgrid-power-flight'
BRANCH = 'integration/supabase-demo-product'
SOURCE = 'izixhjstwfgywbgrnrey'
DEVELOPMENT = 'ogbnpvroaafgpnlxeftw'
ACK = 'export-schema-only:' + SOURCE


def validate_context(env, reviewed, head, branch, dirty):
    if env.get('CODESPACES') != 'true' or env.get('GITHUB_REPOSITORY') != REPOSITORY:
        raise ValueError('Use your browser Codespace for the exact OddGrid repository')
    if branch != BRANCH or not re.fullmatch('[0-9a-f]{40}', reviewed) or head != reviewed or dirty:
        raise ValueError('Requires a clean integration branch at the exact reviewed commit')
    if SOURCE != setup.SOURCE_REF or SOURCE == DEVELOPMENT:
        raise ValueError('Project references do not match the reviewed source-only export')
    if env.get('ODDGRID_DEV_DB_PASSWORD'):
        raise ValueError('Do not supply development credentials to the export workspace')
    setup.endpoint(env.get('ODDGRID_SOURCE_DATABASE_URL', ''), SOURCE)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit', required=True)
    parser.add_argument('--schemas', default='public,private')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--execute', action='store_true')
    mode.add_argument('--verify-only', action='store_true')
    parser.add_argument('--approval')
    args = parser.parse_args(argv)
    def git(*options):
        return subprocess.check_output(['git', *options], cwd=setup.ROOT, text=True).strip()
    validate_context(os.environ, args.reviewed_commit, git('rev-parse', 'HEAD'),
                     git('branch', '--show-current'), git('status', '--porcelain', '--untracked-files=no'))
    setup.schemas(args.schemas)
    if args.verify_only:
        sha = setup.verify_private_bundle(Path.home() / 'oddgrid-schema-private')
        print('Verified private schema.sql, manifest.json and managed-schema-attachments.sql. SHA256: ' + sha)
        return
    for command in ('python3', 'psql', 'docker'):
        if not shutil.which(command): raise ValueError('Missing cloud tool: ' + command)
    # Tool discovery and Docker health are local-only; no source connection at preflight.
    env = {k: v for k, v in os.environ.items() if k not in {
        'ODDGRID_SOURCE_DB_PASSWORD', 'SUPABASE_ACCESS_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'}}
    setup.run(['docker', 'info'], env)
    if not args.execute or args.approval != ACK:
        print('Preflight passed; no database connection or export attempted. Supply the reviewed execution acknowledgement to export.')
        return
    if not os.environ.get('ODDGRID_SOURCE_DB_PASSWORD'):
        raise ValueError('Configure source-only Codespaces secrets; no password prompts are used')
    # Neither GitHub token nor development credentials are needed by the database exporter.
    os.environ.pop('GITHUB_TOKEN', None)
    os.environ.pop('GH_TOKEN', None)
    setup.main(['export', '--source-url', os.environ['ODDGRID_SOURCE_DATABASE_URL'],
                '--schemas', args.schemas, '--bundle', str(Path.home() / 'oddgrid-schema-private')])


if __name__ == '__main__':
    try: main()
    except setup.ExportFailure as error:
        print(str(error) + '; sanitized report: ~/oddgrid-export-status.json', file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('Codespace export stopped: stage=workspace-preflight category=preflight_guard; raw diagnostics suppressed.', file=sys.stderr)
        sys.exit(1)
