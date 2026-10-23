#!/usr/bin/env python3
"""Development-only post-migration tests. Default read-only; explicit approval for fixtures."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import codespace_restore as reviewed
import migration_plan as m
import phase5_plan as p

MIGRATION_COMMIT='0477c1c14e39dbfee8cf6cd05018ca217ce710cf'


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit',required=True)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--execute',action='store_true')
    mode.add_argument('--verify-only',action='store_true')
    parser.add_argument('--approval')
    args=parser.parse_args(argv)
    reviewed.main(['--reviewed-commit',args.reviewed_commit])
    d=reviewed.setup; r=reviewed.restore_plan
    c=d.endpoint(os.environ['ODDGRID_DEV_DATABASE_URL'],r.DEV_REF,development=True)
    if c['PGUSER']!='postgres.'+r.DEV_REF or not c['PGHOST'].endswith('.pooler.supabase.com'):
        raise ValueError('Development Session Pooler required')
    pw=os.environ['ODDGRID_DEV_DB_PASSWORD']
    source=d.read_bundle(Path.home()/'oddgrid-schema-private')[1]['catalog']
    # Original migration evidence remains unchanged, bound to its own reviewed commit.
    m.verify(d,c,pw,source,m.folder()/'execution.json',MIGRATION_COMMIT)
    wanted=m.expected()
    # Read-only permission prerequisite for PostgreSQL's real isolationtester.
    if d.psql(c,pw,"BEGIN READ ONLY; SELECT has_function_privilege(current_user,'pg_catalog.pg_isolation_test_session_is_blocked(integer,integer[])','EXECUTE'); ROLLBACK;")!='t':
        raise ValueError('isolationtester wait observation privilege unavailable')
    if d.psql(c,pw,"BEGIN READ ONLY; SELECT pg_has_role(current_user,'authenticated','SET') AND pg_has_role(current_user,'service_role','SET'); ROLLBACK;")!='t':
        raise ValueError('Existing role simulation privileges required; do not grant them')
    p.runtime_guard(c,pw)  # read-only, before the exclusive intent or ANY fixture write
    # All auth hooks are included in the exact managed snapshot; real helper bodies,
    # RLS and grants are pinned by the migrated catalogue comparison above.
    state=m.inspect_state(d,c,pw,source)
    path=m.folder()/'phase5-execution.json'
    if args.verify_only:
        m.check_private(path)
        evidence=json.loads(path.read_text())
        if evidence.get('project_ref')!=r.DEV_REF or evidence.get('reviewed_commit')!=args.reviewed_commit or evidence.get('migration_commit')!=MIGRATION_COMMIT or evidence.get('migration_sha')!=m.MIGRATION_SHA or evidence.get('expected_sha')!=m.EXPECTED_SHA or evidence.get('before')!=state or evidence.get('completed',[])[-1:]!=['13 schedules, success-only cleanup and independent verification']:
            raise ValueError('Phase5 evidence incomplete or mismatched; investigate read-only')
        print('Independent Phase5 completion evidence, empty migrated schema and managed/auth/sequence state verified read-only')
        return
    if path.exists(): raise ValueError('Prior phase5 intent exists; read-only investigation only')
    for case in p.CASES:
        if not p.golden(case).is_file(): raise ValueError('Reviewed isolated transcripts required')
    if not args.execute:
        print('Phase5 readiness passed; read-only only, no fixtures created')
        return
    if args.approval!='test-checkout:'+r.DEV_REF: raise ValueError('Exact checkout test approval required')
    if state['auth_count']!='0': raise ValueError('No real auth users allowed during synthetic tests')
    # Exclusive durable intent is written BEFORE the first database fixture write.
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as out:
        json.dump(dict(project_ref=r.DEV_REF,reviewed_commit=args.reviewed_commit,
          migration_commit=MIGRATION_COMMIT,migration_sha=m.MIGRATION_SHA,expected_sha=m.EXPECTED_SHA,
          before=state,completed=[]),out)
    def save(stage):
        value=json.loads(path.read_text()); value['completed'].append(stage)
        d.write_private(path,json.dumps(value))
    d.psql(c,pw,p.functional(wanted),readonly=False)
    m.verify(d,c,pw,source,m.folder()/'execution.json',MIGRATION_COMMIT)
    save('functional rollback and fresh verification')
    env=d.child_env(c,pw,False)
    env['PGAPPNAME']='oddgrid-phase5-isolation'
    env['PGOPTIONS']='-c statement_timeout=20000 -c lock_timeout=15000 -c idle_in_transaction_session_timeout=30000'
    def run(spec):
        # One schedule per process. No retry; timeout leaves evidence and stops.
        return subprocess.run(p.docker_command(),input=spec,text=True,capture_output=True,env=env,timeout=120)
    def record(case,output): d.write_private(m.folder()/('phase5-'+case+'.txt'),output)
    def sql(query): return d.psql(c,pw,query,readonly=False)
    p.run_schedules(run,sql,wanted,d.state_guard(require_baseline=True),record)
    m.verify(d,c,pw,source,m.folder()/'execution.json',MIGRATION_COMMIT)
    if m.inspect_state(d,c,pw,source)!=state: raise ValueError('Managed/auth/sequence state changed')
    save('13 schedules, success-only cleanup and independent verification')
    print('Phase5 functional and multi-session checks passed; no fixtures remain; no payment functions invoked')


if __name__=='__main__':
    try: main()
    except Exception:
        print('Phase5 stopped. Do not retry or reset. Inspect private evidence and Development read-only; no automatic recovery writes attempted.',file=sys.stderr)
        sys.exit(1)
