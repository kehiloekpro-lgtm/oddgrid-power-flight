#!/usr/bin/env python3
"""Actual PRIVATE baseline in network-disabled disposable PostgreSQL; never hosted.
Run in existing export Codespace. Full output stays private, only PASS labels escape.
No checkout migration, payment function or order-finalization invocation.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database_setup as d
import restore_plan as r


def main():
    folder = Path.home()/'oddgrid-schema-private'
    d.verify_private_bundle(folder)
    raw, manifest = d.read_bundle(folder)
    if manifest['schema_sha256'] != r.BASELINE_SHA: raise ValueError('Reviewed baseline required')
    name='oddgrid-restore-isolated-'+uuid.uuid4().hex[:12]
    report=folder.parent/'oddgrid-restore-isolated-results.txt'
    env={k:v for k,v in os.environ.items() if k in {'PATH','HOME','DOCKER_HOST','DOCKER_CONTEXT','XDG_RUNTIME_DIR'}}
    transcript=[]
    def run(args,text=None,check=True):
        result=subprocess.run(args,input=text,text=True,capture_output=True,env=env,timeout=120)
        if result.returncode:
            transcript.append(result.stderr)
            if check: raise RuntimeError('Isolated command failed; private report only')
        return result
    def sql(text,user='isolated_admin',check=True):
        return run(['docker','exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d','postgres'],text,check)
    def inventory():
        return json.loads(sql((d.HERE/'catalog.sql').read_text().replace(":'schema_csv'","'private,public'")).stdout)
    try:
        run(['docker','run','--detach','--name',name,'--network','none','--cpus','1','--memory','768m',
             '--read-only','--tmpfs','/var/lib/postgresql/data','--tmpfs','/var/run/postgresql','--tmpfs','/tmp',
             '--env','POSTGRES_USER=isolated_admin','--env','POSTGRES_DB=postgres',
             '--env','POSTGRES_HOST_AUTH_METHOD=trust',d.DUMP_IMAGE])
        for _ in range(60):
            ready=run(['docker','exec',name,'pg_isready','-U','isolated_admin','-d','postgres'],check=False)
            if ready.returncode==0: break
            time.sleep(0.25)
        else: raise RuntimeError('Isolated PostgreSQL not ready')
        source=manifest['catalog']
        bootstrap=''
        for role in source['roles']:
            bootstrap += 'CREATE ROLE '+r.ident(role)+' NOLOGIN;\n'
        bootstrap+='ALTER ROLE postgres LOGIN; ALTER DATABASE postgres OWNER TO postgres;\n'
        bootstrap+='CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin; CREATE SCHEMA extensions;\n'
        bootstrap+='CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,created_at timestamptz DEFAULT now()); ALTER TABLE auth.users OWNER TO supabase_auth_admin;\n'
        bootstrap+="CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';\nGRANT USAGE ON SCHEMA auth TO postgres,anon,authenticated,service_role; GRANT SELECT,REFERENCES,TRIGGER ON auth.users TO postgres;\n"
        # Synthetic managed auth sentinel demonstrates unrelated triggers survive.
        bootstrap+="CREATE FUNCTION auth.oddgrid_test_sentinel() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END'; CREATE TRIGGER unrelated_managed_auth_hook BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION auth.oddgrid_test_sentinel();\n"
        bootstrap+='REVOKE ALL ON SCHEMA public FROM PUBLIC;\n'
        for a in next(s for s in source['schemas'] if s['name']=='public')['acl']:
            bootstrap+='GRANT '+a[1]+' ON SCHEMA public TO '+('PUBLIC' if a[0]=='PUBLIC' else r.ident(a[0]))+(' WITH GRANT OPTION' if a[2] else '')+';\n'
        for owner,schema,kind,grants in source['default_acls']:
            for grantee,privilege,grantable in grants:
                bootstrap+='ALTER DEFAULT PRIVILEGES FOR ROLE '+r.ident(owner)+' IN SCHEMA '+r.ident(schema)+' GRANT '+privilege+' ON '+{'S':'SEQUENCES','f':'FUNCTIONS','r':'TABLES'}[kind]+' TO '+('PUBLIC' if grantee=='PUBLIC' else r.ident(grantee))+(' WITH GRANT OPTION' if grantable else '')+';\n'
        sql(bootstrap)
        target=inventory()
        # pg_dump references only auth.users/auth.uid outside application schemas.
        # Supabase vault is not available in the official PostgreSQL image. Hosted
        # extension inventories were matched read-only; do not claim this fixture
        # is a complete Supabase runtime. Builder still executes all real app DDL.
        target['extensions']=source['extensions']
        context=json.loads(sql(r.context_sql(),user='postgres').stdout)
        context['project_ref']=r.DEV_REF
        plan,skipped=r.build(raw,manifest,target,r.guards(context),d)
        # A genuine final verification failure must roll back ALL application DDL.
        bad=plan.replace(r.HOOK[3]+';',r.HOOK[3]+';\nALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;',1)
        if sql(bad,user='postgres',check=False).returncode==0: raise AssertionError('Tampered plan unexpectedly committed')
        if inventory()['relations']: raise AssertionError('Failed transaction left application objects')
        if json.loads(sql(r.context_sql(),user='postgres').stdout)['managed_snapshot'] != context['managed_snapshot']:
            raise AssertionError('Failed transaction changed managed objects')
        print('PASS: verification failure rolls back application DDL, ACLs and auth attachment',flush=True)
        sql(plan,user='postgres')
        restored=inventory()
        keys=['schemas','functions','relations','enums','sequences','constraints','indexes','triggers','policies','default_acls','managed_custom_triggers','managed_policies']
        mismatch=[k for k in keys if restored[k]!=source[k]]
        if mismatch: raise AssertionError('Catalog mismatch: '+','.join(mismatch))
        print('PASS: actual exported baseline executes as non-superuser postgres; all catalog comparison keys match',flush=True)
        # Repeating the same restore is rejected, leaves verified baseline intact.
        if sql(plan,user='postgres',check=False).returncode==0: raise AssertionError('Repeat restore unexpectedly accepted')
        if inventory()!=restored: raise AssertionError('Repeat restore changed baseline')
        print('PASS: repeated restore rejected without changing verified baseline',flush=True)
        # Test PUBLIC and inherited anon/authenticated EXECUTE independently of ACL
        # text. Source review confirmed anon/authenticated have no inherited roles.
        for f in source['functions']:
            expected={a[0] for a in f['acl']}
            for role in ['anon','authenticated']:
                expr="SELECT has_function_privilege("+r.literal(role)+",p.oid,'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))="+r.literal(f['name'])+';'
                actual=sql(expr,user='postgres').stdout.strip()=='t'
                if actual != (role in expected or 'PUBLIC' in expected): raise AssertionError('Effective EXECUTE mismatch')
        print('PASS: all 26 anon/authenticated effective function EXECUTE checks match source, including intended PUBLIC access',flush=True)
        sql("BEGIN; INSERT INTO auth.users(id,raw_user_meta_data) VALUES ('00000000-0000-4000-8000-000000000123','{\"first_name\":\"Isolated\",\"last_name\":\"Only\"}'); DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000123' AND first_name='Isolated' AND last_name='Only') THEN RAISE EXCEPTION 'Auth hook failed'; END IF; END$$; ROLLBACK;")
        if 'unrelated_managed_auth_hook' not in sql("SELECT tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal;").stdout:
            raise AssertionError('Unrelated managed trigger missing')
        print('PASS: real auth hook creates profile in rolled-back synthetic transaction; unrelated managed hook preserved',flush=True)
        sql(d.empty_records_guard(['public','private']),user='postgres')
        print('PASS: no customer/payment/order records retained; no payment or checkout functions invoked',flush=True)
        transcript.append('PASS: all isolated restoration checks. Skipped reviewed managed DDL: '+str(skipped))
        print('LIMIT: auth.uid and managed auth schema are isolated stand-ins; hosted restore remains unexecuted.',flush=True)
    finally:
        run(['docker','rm','--force',name],check=False)
        d.write_private(report,'\n'.join(transcript)+'\n')


if __name__=='__main__':
    try: main()
    except Exception:
        print('FAIL: isolated restore; sanitized status only. Review private oddgrid-restore-isolated-results.txt.',file=sys.stderr)
        sys.exit(1)
