#!/usr/bin/env python3
"""Exact Development-only restore; preflight by default, explicit approved execution only."""
import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database_setup as setup
import restore_plan


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit',required=True)
    parser.add_argument('--execute',action='store_true')
    parser.add_argument('--approval')
    args=parser.parse_args(argv)
    def git(*parts):
        return subprocess.run(['git',*parts],cwd=setup.ROOT,text=True,capture_output=True,check=True).stdout.strip()
    if not re.fullmatch('[0-9a-f]{40}',args.reviewed_commit) or git('rev-parse','HEAD')!=args.reviewed_commit:
        raise ValueError('Reviewed commit mismatch')
    if git('branch','--show-current')!='integration/supabase-demo-product' or git('status','--porcelain'):
        raise ValueError('Clean integration branch required')
    folder=Path.home()/'oddgrid-schema-private'
    if setup.verify_private_bundle(folder)!=restore_plan.BASELINE_SHA:
        raise ValueError('Reviewed private baseline required')
    url=os.environ.get('ODDGRID_DEV_DATABASE_URL','')
    setup.endpoint(url,restore_plan.DEV_REF,development=True)
    if not os.environ.get('ODDGRID_DEV_DB_PASSWORD'):
        raise ValueError('Development Codespaces password secret missing')
    approval='restore:'+restore_plan.DEV_REF
    if not args.execute:
        print('Restore preflight passed; no database connection or write attempted.')
        return
    if args.approval!=approval: raise ValueError('Exact restoration approval required')
    setup.main(['restore','--dev-ref',restore_plan.DEV_REF,'--dev-url',url,
                '--bundle',str(folder),'--reviewed-sha256',restore_plan.BASELINE_SHA,
                '--execute','--approval',approval])


if __name__=='__main__':
    try: main()
    except Exception:
        print('Restore stopped; no raw credentials/SQL diagnostics emitted. Verify commit, private bundle and Development secret configuration; after an execution failure perform read-only state verification before any retry.',file=sys.stderr)
        sys.exit(1)
