#!/usr/bin/env python3
"""Prepare a PRIVATE, non-executing history-only plan. Never connects or runs SQL."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database_setup as d
import migration_plan as m
import launch_audit as a
import restore_plan as r
VERSION='20261021000100'
NAME='secure_variant_checkout'

def build(wanted,statement):
    # Catalog exact match includes checkout bodies, indexes, ACLs, RLS, auth hook.
    locks='\n'.join('LOCK TABLE '+table['name']+' IN SHARE ROW EXCLUSIVE MODE;' for table in sorted(wanted.get('relations',[]),key=lambda table:table['name']) if table['kind'] in ('r','p'))
    return ("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';\n"+
      d.state_guard(require_baseline=True)+locks+
      "LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\n"+
      d.assert_catalog_sql(wanted)+m.effective_acl_sql()+d.empty_records_guard(['public','private'])+
      "DO $profile$ BEGIN IF EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role'),('postgres')) r(role) WHERE a.attrelid='public.profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,'public.profiles',a.attname,'UPDATE') IS DISTINCT FROM (r.role IN ('service_role','postgres') OR (r.role='authenticated' AND a.attname IN ('first_name','last_name','phone')))) THEN RAISE EXCEPTION 'Profile protection drift'; END IF; END; $profile$;\n"+
      "DO $history$ BEGIN IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>1 OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023120135' AND name='protect_profile_role_least_privilege_20261023') OR EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='"+VERSION+"') THEN RAISE EXCEPTION 'Not the reviewed empty pre-history state'; END IF; END; $history$;\n"+
      "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ("+
      r.literal(VERSION)+","+r.literal(NAME)+",ARRAY["+r.literal(statement)+"]::text[]);\n"+
      d.assert_catalog_sql(wanted)+m.effective_acl_sql()+d.empty_records_guard(['public','private'])+"COMMIT;\n")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit',required=True)
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[4]
    def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
    if git('rev-parse','HEAD')!=args.reviewed_commit or git('branch','--show-current')!='implementation/development-purchasing' or git('status','--porcelain'):
        raise ValueError('Clean reviewed implementation branch required')
    if hashlib.sha256(d.MIGRATION.read_bytes()).hexdigest()!=m.MIGRATION_SHA:
        raise ValueError('Migration checksum mismatch')
    bundle=Path.home()/'oddgrid-schema-private'
    d.read_bundle(bundle)
    if hashlib.sha256((bundle/'schema.sql').read_bytes()).hexdigest()!=r.BASELINE_SHA:
        raise ValueError('Reviewed baseline mismatch')
    receipt=m.folder()/'execution.json';m.check_private(receipt)
    original=json.loads(receipt.read_text())
    if (original.get('project_ref'),original.get('commit'),original.get('migration_sha'),original.get('expected_sha'),original.get('baseline_sha'))!=(r.DEV_REF,'0477c1c14e39dbfee8cf6cd05018ca217ce710cf',m.MIGRATION_SHA,m.EXPECTED_SHA,r.BASELINE_SHA):
        raise ValueError('Original migration evidence mismatch')
    path=m.folder()/'purchasing-history-plan.sql'
    if path.exists():raise ValueError('Plan already exists; preserve and review')
    wanted=a.protected_catalogue(m.expected())
    plan=build(wanted,d.MIGRATION.read_text())
    d.write_private(path,plan)
    print('Private history-only plan prepared; SHA-256 '+hashlib.sha256(plan.encode()).hexdigest())
    print('NOT EXECUTED. Separately verify exact Development Session Pooler endpoint and approve execution. SQL alone cannot prove hosted project identity.')
if __name__=='__main__':
    try:main()
    except Exception:
        print('History preparation stopped; no connection or SQL execution attempted.',file=sys.stderr)
        raise SystemExit(1)
