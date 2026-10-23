#!/usr/bin/env python3
"""Development only. Read-only prerequisite probe; cannot create fixtures or retry tests."""
import argparse
import json
import os
import subprocess
import sys
import codespace_restore as reviewed


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit',required=True)
    args=parser.parse_args(argv)
    reviewed.main(['--reviewed-commit',args.reviewed_commit])
    d=reviewed.setup; ref=reviewed.restore_plan.DEV_REF
    connection=d.endpoint(os.environ['ODDGRID_DEV_DATABASE_URL'],ref,development=True)
    if connection['PGUSER']!='postgres.'+ref or not connection['PGHOST'].endswith('.pooler.supabase.com'):
        raise ValueError('Exact Development Session Pooler required')
    env=d.child_env(connection,os.environ['ODDGRID_DEV_DB_PASSWORD'],True)
    env['PGOPTIONS']='-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=15000 -c idle_in_transaction_session_timeout=30000'
    result=subprocess.run([sys.executable,'-c','import json,pooler_probe; print(json.dumps(pooler_probe.probe()))'],cwd=d.HERE,env=env,capture_output=True,text=True,timeout=45)
    if result.returncode: raise RuntimeError('Read-only probe failed; diagnostics suppressed')
    value=json.loads(result.stdout)
    print(json.dumps(value,sort_keys=True))
    if not value['transport_pid_matches_server']:
        print('BLOCKED: stock isolationtester uses transport backend IDs for server-side wait observation. Do not create fixtures through this route.')


if __name__=='__main__':
    try: main()
    except Exception:
        print('Read-only Development probe stopped; no fixture SQL or retry executed.',file=sys.stderr)
        sys.exit(1)
