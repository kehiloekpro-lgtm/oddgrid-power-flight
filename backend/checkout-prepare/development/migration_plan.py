"""Pinned Development-only migration planning and independent read-only verification."""
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
import restore_plan as r

MIGRATION_SHA = '87a0aa1b344f6820703af1b3fea6e35b50f8e4dce9339ba7ec0e915cb1dc583d'
EXPECTED_SHA = 'PENDING_ISOLATED_GENERATION'
KEYS = ('schemas','functions','relations','enums','sequences','constraints','indexes','triggers','policies','default_acls','managed_custom_triggers','managed_policies')


def canonical(catalog):
    return {k: sorted(catalog[k], key=lambda v: json.dumps(v,sort_keys=True,separators=(',',':'))) for k in KEYS}


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def folder(): return Path.home()/'oddgrid-migration-private'


def check_commit(commit,root):
    def git(*args): return subprocess.run(['git',*args],cwd=root,text=True,capture_output=True,check=True).stdout.strip()
    if not commit or not re.fullmatch('[0-9a-f]{40}',commit) or git('rev-parse','HEAD')!=commit or git('branch','--show-current')!='integration/supabase-demo-product' or git('status','--porcelain'):
        raise ValueError('Exact clean reviewed integration commit required')


def check_private(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
        raise ValueError('Private migration evidence file required')


def expected():
    path=folder()/'expected.json'
    check_private(path)
    value=json.loads(path.read_text())
    if digest(value)!=EXPECTED_SHA:
        raise ValueError('Exact isolated expected catalogue required')
    return value


def inspect_state(d,c,pw,source):
    managed=json.loads(d.psql(c,pw,r.context_sql()))['managed_snapshot']
    seq=' UNION ALL '.join('SELECT jsonb_build_array('+r.literal(x[0])+','+r.literal(x[1])+',last_value,is_called) FROM '+r.ident(x[0])+'.'+r.ident(x[1]) for x in source['sequences'])
    values=d.psql(c,pw,'BEGIN READ ONLY;'+seq+';ROLLBACK;') if seq else ''
    auth=d.psql(c,pw,'BEGIN READ ONLY;SELECT count(*) FROM auth.users;ROLLBACK;')
    return {'managed':managed,'sequences':values,'auth_count':auth}


def verify_sql(d,wanted):
    # Catalogue comparison includes exact bodies, owners, definer flags, search
    # paths, ACLs, generated expressions, all indexes, RLS and reviewed auth hook.
    return ('BEGIN READ ONLY;'+d.state_guard(require_baseline=True)+d.assert_catalog_sql(wanted)+
            d.empty_records_guard(['private','public'])+effective_acl_sql()+'ROLLBACK;')


def effective_acl_sql():
    return """DO $effective$ DECLARE f record; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles a CROSS JOIN pg_roles b WHERE a.rolname IN ('anon','authenticated') AND a.oid<>b.oid AND pg_has_role(a.oid,b.oid,'MEMBER')) THEN RAISE EXCEPTION 'Unexpected inherited browser role'; END IF;
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND p.proname IN ('create_checkout_from_cart','finalize_order_from_payment')) OR (n.nspname='public' AND p.proname='checkout_prepare_bridge') LOOP
  IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') OR NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected effective checkout execution privileges'; END IF;
 END LOOP;
 END; $effective$;"""


def build(d,source,wanted,managed):
    if hashlib.sha256(d.MIGRATION.read_bytes()).hexdigest()!=MIGRATION_SHA:
        raise ValueError('Reviewed migration checksum mismatch')
    locks='\n'.join('LOCK TABLE '+t['name']+' IN ACCESS EXCLUSIVE MODE;' for t in sorted(source['relations'],key=lambda t:t['name']) if t['kind'] in ('r','p'))
    # Preserve managed state before/after, excluding only the already-existing
    # reviewed auth hook, whose exact definition/enablement is compared separately.
    guard="DO $managed$ BEGIN IF ("+r.MANAGED_SNAPSHOT+") IS DISTINCT FROM "+r.literal(json.dumps(managed))+"::jsonb THEN RAISE EXCEPTION 'Managed state changed'; END IF; END; $managed$;"
    return ("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';"+
            d.state_guard(require_baseline=True)+locks+d.assert_catalog_sql(source)+
            d.empty_records_guard(['private','public'])+guard+
            d.transaction_body(d.MIGRATION.read_text(),'COMMIT')+
            d.assert_catalog_sql(wanted)+effective_acl_sql()+d.empty_records_guard(['private','public'])+guard+'COMMIT;')


def verify(d,c,pw,source,receipt):
    check_private(receipt)
    before=json.loads(receipt.read_text())
    if before['project_ref']!=r.DEV_REF or before['baseline_sha']!=r.BASELINE_SHA or before['migration_sha']!=MIGRATION_SHA or before['expected_sha']!=EXPECTED_SHA:
        raise ValueError('Migration evidence binding mismatch')
    d.psql(c,pw,verify_sql(d,expected()))
    if inspect_state(d,c,pw,source)!=before['state']:
        raise ValueError('Managed/auth/sequence state differs; stop and investigate')
    print('Independent migrated definitions, effective ACLs, RLS, auth hook, empty application records and managed/auth/sequence state verified read-only')


def apply(d,c,pw,source,receipt,commit):
    wanted=expected()
    d.psql(c,pw,'BEGIN READ ONLY;'+d.assert_catalog_sql(source)+d.empty_records_guard(['private','public'])+'ROLLBACK;')
    state=inspect_state(d,c,pw,source)
    plan=build(d,source,wanted,state['managed'])
    folder().mkdir(mode=0o700,exist_ok=True)
    if folder().is_symlink() or folder().stat().st_mode & 0o077:
        raise ValueError('Private migration evidence directory required')
    evidence={'project_ref':r.DEV_REF,'baseline_sha':r.BASELINE_SHA,'migration_sha':MIGRATION_SHA,'expected_sha':EXPECTED_SHA,'commit':commit,'state':state}
    # Exclusive evidence file prevents retries after a failed/ambiguous connection.
    fd=os.open(receipt,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as out: json.dump(evidence,out)
    d.psql(c,pw,plan,readonly=False)
    verify(d,c,pw,source,receipt)  # fresh read-only connections, never replay writes
