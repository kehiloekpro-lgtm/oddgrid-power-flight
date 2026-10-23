#!/usr/bin/env python3
"""Development-only rehearsal. Default is read-only verification; never restores a baseline."""
import argparse
import os
import sys
from pathlib import Path
import codespace_restore as reviewed


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit', required=True)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--approval')
    args=parser.parse_args(argv)
    # Reuse exact HEAD/clean branch/private checksum/manifest/endpoint checks.
    reviewed.main(['--reviewed-commit', args.reviewed_commit])
    reviewed.main(['--reviewed-commit', args.reviewed_commit, '--verify-only'])
    if not args.execute:
        print('Rehearsal readiness passed; read-only checks only, no migration or fixtures executed.')
        return
    ref=reviewed.restore_plan.DEV_REF
    if args.approval != 'rehearse:'+ref:
        raise ValueError('Exact rehearsal approval required')
    reviewed.setup.main(['rehearse', '--dev-ref', ref,
        '--dev-url', os.environ['ODDGRID_DEV_DATABASE_URL'],
        '--bundle', str(Path.home()/'oddgrid-schema-private'),
        '--reviewed-sha256', reviewed.restore_plan.BASELINE_SHA,
        '--execute', '--approval', args.approval])


if __name__ == '__main__':
    try: main()
    except Exception:
        print('Rehearsal stopped. No retry or recovery attempted; inspect Development read-only. Raw SQL and credential diagnostics suppressed.', file=sys.stderr)
        sys.exit(1)
