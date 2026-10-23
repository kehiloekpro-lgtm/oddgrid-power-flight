#!/usr/bin/env python3
"""Development permanent migration only. Default: read-only readiness. Never retry writes."""
import argparse
import hashlib
import os
from pathlib import Path
import sys
import codespace_restore as reviewed
import migration_plan as plan


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit',required=True)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--execute',action='store_true')
    mode.add_argument('--verify-only',action='store_true')
    parser.add_argument('--approval')
    args=parser.parse_args(argv)
    reviewed.main(['--reviewed-commit',args.reviewed_commit])
    s=reviewed.setup; r=reviewed.restore_plan
    if hashlib.sha256(s.MIGRATION.read_bytes()).hexdigest()!=plan.MIGRATION_SHA:
        raise ValueError('Reviewed migration checksum mismatch')
    c=s.endpoint(os.environ['ODDGRID_DEV_DATABASE_URL'],r.DEV_REF,development=True)
    if c['PGUSER']!='postgres.'+r.DEV_REF or not c['PGHOST'].endswith('.pooler.supabase.com'):
        raise ValueError('Verified Development Session Pooler required')
    plan.expected()
    receipt=plan.folder()/'execution.json'
    source=s.read_bundle(Path.home()/'oddgrid-schema-private')[1]['catalog']
    if args.verify_only:
        plan.verify(s,c,os.environ['ODDGRID_DEV_DB_PASSWORD'],source,receipt,args.reviewed_commit)
        return
    reviewed.main(['--reviewed-commit',args.reviewed_commit,'--verify-only'])
    if receipt.exists(): raise ValueError('Previous execution evidence exists; investigate read-only, never retry')
    if not args.execute:
        print('Permanent migration readiness passed; read-only only, no migration or fixtures executed')
        return
    approval='apply-migration:'+r.DEV_REF
    if args.approval!=approval: raise ValueError('Exact permanent migration approval required')
    s.main(['apply-migration','--dev-ref',r.DEV_REF,'--dev-url',os.environ['ODDGRID_DEV_DATABASE_URL'],
            '--bundle',str(Path.home()/'oddgrid-schema-private'),'--reviewed-sha256',r.BASELINE_SHA,
            '--reviewed-commit',args.reviewed_commit,'--execute','--approval',approval])


if __name__=='__main__':
    try: main()
    except Exception:
        print('Migration/verification stopped. Outcome may require read-only investigation. No retry, reset or recovery writes attempted; sensitive diagnostics suppressed.',file=sys.stderr)
        sys.exit(1)
