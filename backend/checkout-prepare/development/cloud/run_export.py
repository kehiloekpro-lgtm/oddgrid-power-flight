#!/usr/bin/env python3
"""Single-purpose, source-read-only entry point for a private manual Actions job.
Never dispatch this with credentials until separately approved. No development DB access.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('database_setup', BASE / 'database_setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
SOURCE = 'izixhjstwfgywbgrnrey'
DEVELOPMENT = 'ogbnpvroaafgpnlxeftw'
ACK = 'export-schema-only:izixhjstwfgywbgrnrey'


def validate_context(env, event, head):
    repository = event.get('repository', {})
    expected = env.get('EXPORT_RUNNER_REPOSITORY', '')
    if (env.get('GITHUB_ACTIONS') != 'true' or env.get('GITHUB_EVENT_NAME') != 'workflow_dispatch'
            or repository.get('private') is not True or not expected
            or repository.get('full_name') != expected or env.get('GITHUB_REPOSITORY') != expected
            or expected == 'kehiloekpro-lgtm/oddgrid-power-flight'):
        raise ValueError('Requires the explicitly configured private utility repository and manual event')
    if env.get('GITHUB_REF') != 'refs/heads/' + repository.get('default_branch', ''):
        raise ValueError('Run the reviewed utility workflow from its default branch only')
    inputs = event.get('inputs', {})
    if inputs.get('approval') != ACK:
        raise ValueError('Separate source-export authorization acknowledgement is required')
    revision = inputs.get('source_revision', '')
    if not re.fullmatch('[0-9a-f]{40}', revision) or head != revision:
        raise ValueError('Checkout must match the exact reviewed source revision')
    if SOURCE != setup.SOURCE_REF or DEVELOPMENT == SOURCE:
        raise ValueError('Project identity constants differ')
    setup.endpoint(env.get('SOURCE_DATABASE_URL', ''), SOURCE)
    setup.schemas(inputs.get('schemas', 'public,private'))
    return inputs


def main():
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=setup.ROOT, text=True).strip()
    inputs = validate_context(os.environ, event, head)
    # Do not prompt or accidentally inherit credentials for development.
    if not os.environ.get('ODDGRID_SOURCE_DB_PASSWORD'):
        raise ValueError('Missing source-only Actions secrets')
    if os.environ.get('ODDGRID_DEV_DB_PASSWORD'):
        raise ValueError('Development credentials must not be supplied to this export job')
    bundle = Path(os.environ['RUNNER_TEMP']).resolve() / 'oddgrid-schema-private'
    setup.main(['export', '--source-url', os.environ['SOURCE_DATABASE_URL'],
                '--schemas', inputs.get('schemas', 'public,private'), '--bundle', str(bundle)])
    # No schema text or database errors are emitted to logs. Artifacts are private and short-lived.
    setup.write_private(bundle / 'cloud-provenance.json', json.dumps({
        'source_ref': SOURCE, 'intended_development_ref': DEVELOPMENT,
        'source_revision': head, 'runner_repository': os.environ['GITHUB_REPOSITORY'],
        'run_id': os.environ['GITHUB_RUN_ID'], 'run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
        'scope': 'schema-only export; no hosted writes or migration execution',
    }, indent=2) + '\n')


if __name__ == '__main__':
    try: main()
    except Exception:
        # Never leak SQL, credentials, URLs, or raw tool diagnostics to Actions logs.
        print('Source export stopped; no artifact will be uploaded. Check reviewed setup and secret configuration.', file=sys.stderr)
        sys.exit(1)
