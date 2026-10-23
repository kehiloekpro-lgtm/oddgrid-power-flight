#!/usr/bin/env python3
"""Actual PRIVATE baseline in network-disabled disposable PostgreSQL; never hosted.
Run in existing export Codespace. Full output stays private, only PASS labels escape.
Optional checkout migration rehearsal is isolated and rolled back. Never invokes
payment functions or order finalization.
"""
import json
import argparse
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
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rehearse', action='store_true', help='Also run the existing rollback-only checkout suite in this disposable database')
    parser.add_argument('--prepare-migration',action='store_true',help='Generate private expected catalogue and test permanent migration only in this disposable database')
    parser.add_argument('--phase5',action='store_true',help='Post-migration functional and real multi-session isolationtester tests, never hosted')
    parser.add_argument('--generate-phase5-expected',action='store_true',help='Record synthetic isolationtester transcripts in this disposable database only')
    args=parser.parse_args()
    if args.phase5: args.prepare_migration=True
    if args.generate_phase5_expected and not args.phase5: raise ValueError('Isolated phase5 required')
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
            ready=sql("SELECT current_setting('listen_addresses') <> '';",check=False)
            if ready.returncode==0 and ready.stdout.strip()=='t': break
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
        canonical=lambda v: sorted(json.dumps(x,sort_keys=True) for x in v)
        mismatch=[k for k in keys if canonical(restored[k])!=canonical(source[k])]
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
        if args.rehearse:
            # Hosted auth.uid definition inspected read-only, reproduced here solely
            # for synthetic JWT claims. No real Auth service or credentials exist.
            sql("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$; GRANT INSERT ON auth.users TO postgres; GRANT service_role TO postgres;")
            managed_before=json.loads(sql(r.context_sql(),user='postgres').stdout)['managed_snapshot']
            sql(d.rehearsal_sql(source),user='postgres')
            sql('BEGIN READ ONLY;'+d.assert_catalog_sql(source)+d.empty_records_guard(['private','public'])+'ROLLBACK;',user='postgres')
            if json.loads(sql(r.context_sql(),user='postgres').stdout)['managed_snapshot'] != managed_before:
                raise AssertionError('Rehearsal changed managed stand-ins')
            if sql('SELECT count(*) FROM auth.users;').stdout.strip() != '0':
                raise AssertionError('Rehearsal retained auth fixture')
            print('PASS: actual private baseline migration and checkout suite; full rollback, auth/profile cleanup and managed stand-ins unchanged',flush=True)
        if args.prepare_migration:
            import migration_plan as mp
            before_context=json.loads(sql(r.context_sql(),user='postgres').stdout)['managed_snapshot']
            # Derive the complete expected catalogue by executing the exact bytes
            # only in this network-disabled disposable database, then roll back.
            migrated=sql('BEGIN;'+d.transaction_body(d.MIGRATION.read_text(),'COMMIT')+
                         (d.HERE/'catalog.sql').read_text().replace(":'schema_csv'","'private,public'").replace('BEGIN READ ONLY;','').replace('COMMIT;','')+'ROLLBACK;',user='postgres').stdout
            wanted=mp.canonical(json.loads(migrated))
            # Independently constrain the delta; never bless unrelated changes.
            for key in ['schemas','enums','sequences','triggers','policies','default_acls','managed_custom_triggers','managed_policies']:
                if mp.canonical(source)[key]!=wanted[key]: raise AssertionError('Unexpected migration delta: '+key)
            before_functions={f['name']:f for f in source['functions']}
            after_functions={f['name']:f for f in wanted['functions']}
            changed=[n for n in before_functions.keys()|after_functions.keys() if before_functions.get(n)!=after_functions.get(n)]
            if len(after_functions)!=len(before_functions)+2 or any(not n.startswith(('private.create_checkout_from_cart(','public.checkout_prepare_bridge(','private.finalize_order_from_payment(')) for n in changed):
                raise AssertionError('Unexpected function changes')
            before_relations={t['name']:t for t in source['relations']}
            after_relations={t['name']:t for t in wanted['relations']}
            if before_relations.keys()!=after_relations.keys(): raise AssertionError('Unexpected relation changes')
            for n,t in before_relations.items():
                u=after_relations[n]
                if n in ['public.checkout_items','public.order_items']:
                    if u['columns'][:-2]!=t['columns'] or [x[0] for x in u['columns'][-2:]]!=['variant_id','variant_name']:
                        raise AssertionError('Unexpected snapshot columns')
                    u=dict(u,columns=t['columns'])
                if u!=t: raise AssertionError('Unexpected relation/ACL/RLS changes')
            if len(wanted['constraints'])!=len(source['constraints'])-1 or len(wanted['indexes'])!=len(source['indexes'])+1:
                raise AssertionError('Unexpected uniqueness delta')
            plan=mp.build(d,source,wanted,before_context)
            bad=plan.replace(d.assert_catalog_sql(wanted),'ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;'+d.assert_catalog_sql(wanted),1)
            if sql(bad,user='postgres',check=False).returncode==0: raise AssertionError('Bad migration committed')
            sql('BEGIN READ ONLY;'+d.assert_catalog_sql(source)+d.empty_records_guard(['private','public'])+'ROLLBACK;',user='postgres')
            print('PASS: injected pre-commit verification failure rolls back complete permanent migration',flush=True)
            import tempfile
            from unittest.mock import patch
            with tempfile.TemporaryDirectory(prefix='oddgrid-permanent-isolated-') as tmp:
                local=Path(tmp)
                d.write_private(local/'expected.json',json.dumps(wanted,sort_keys=True,separators=(',',':')))
                def isolated_psql(connection,password,query,readonly=True):
                    return sql(query,user='postgres').stdout.strip()
                with patch.object(mp,'folder',return_value=local),patch.object(d,'psql',side_effect=isolated_psql):
                    mp.apply(d,{},'unused',source,local/'execution.json','a'*40)
                    mp.verify(d,{},'unused',source,local/'execution.json','a'*40)
                print('PASS: actual apply implementation and separate read-only verifier use independent connections and bound private evidence',flush=True)
            sql(mp.verify_sql(d,wanted),user='postgres')
            if json.loads(sql(r.context_sql(),user='postgres').stdout)['managed_snapshot']!=before_context:
                raise AssertionError('Managed state changed')
            if sql(plan,user='postgres',check=False).returncode==0: raise AssertionError('Already migrated database accepted')
            # Independent verifier must reject privilege drift, rolled back locally.
            bad_acl='BEGIN; GRANT EXECUTE ON FUNCTION public.checkout_prepare_bridge(uuid,text,text,text,text,text,text,text,text,text,character,uuid,uuid) TO anon;'+d.assert_catalog_sql(wanted)+'ROLLBACK;'
            if sql(bad_acl,user='postgres',check=False).returncode==0: raise AssertionError('Verifier accepted ACL drift')
            sql(mp.verify_sql(d,wanted),user='postgres')
            mp.folder().mkdir(mode=0o700,exist_ok=True)
            path=mp.folder()/'expected.json'
            if path.exists() and mp.digest(json.loads(path.read_text()))!=mp.digest(wanted): raise AssertionError('Private expectation already differs')
            if not path.exists(): d.write_private(path,json.dumps(wanted,sort_keys=True,separators=(',',':')))
            print('PASS: isolated permanent commit, independent full-definition/effective-ACL verifier, repeat rejection and managed-state preservation',flush=True)
            print('EXPECTED_CATALOG_SHA256: '+mp.digest(wanted),flush=True)
        if args.phase5:
            import phase5_plan as p5
            import launch_audit as audit
            # Development now includes the separately applied security correction.
            # Reproduce it only in this disposable database; retain the historical
            # checkout-only private expectation and migration receipt unchanged.
            security=(d.HERE.parent/'migrations/20261023_002_protect_profile_role.sql').read_text()
            sql('BEGIN;'+security+'COMMIT;',user='postgres')
            wanted=audit.protected_catalogue(wanted)
            sql('BEGIN READ ONLY;'+d.assert_catalog_sql(wanted)+'ROLLBACK;',user='postgres')
            matrix=json.loads(sql(audit.profile_privileges_sql(),user='postgres').stdout)
            if not audit.valid_profile_privileges(matrix): raise AssertionError('Profile column privileges differ')
            sql("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$; GRANT INSERT ON auth.users TO postgres; GRANT service_role,authenticated TO postgres;")
            sql(p5.functional(wanted),user='postgres')
            sql(mp.verify_sql(d,wanted),user='postgres')
            if sql('SELECT count(*) FROM auth.users;').stdout.strip()!='0': raise AssertionError('Auth fixture remains')
            print('PASS: existing functional suite plus actual staff/admin/customer helper assertions; rollback verified',flush=True)
            def tester(spec):
                return run(['docker','exec','-i',name,p5.TESTER,'dbname=postgres user=postgres'],spec,check=False)
            def record(case,output): transcript.append('SCHEDULE '+case+'\n'+output)
            p5.run_schedules(tester,lambda q:sql(q,user='postgres'),wanted,d.state_guard(require_baseline=True),record,args.generate_phase5_expected)
            sql(mp.verify_sql(d,wanted),user='postgres')
            print('PASS: all real multi-session schedules and deterministic cleanup; empty migrated catalogue retained',flush=True)
        transcript.append('PASS: all isolated restoration checks. Skipped reviewed managed DDL: '+str(skipped))
        print('LIMIT: Auth schema/services and managed extensions are not fully reproduced; no hosted rehearsal executed.',flush=True)
    finally:
        run(['docker','rm','--force',name],check=False)
        d.write_private(report,'\n'.join(transcript)+'\n')


if __name__=='__main__':
    try: main()
    except Exception:
        print('FAIL: isolated restore; sanitized status only. Review private oddgrid-restore-isolated-results.txt.',file=sys.stderr)
        sys.exit(1)
