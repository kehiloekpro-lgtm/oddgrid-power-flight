"""Build an atomic restoration from the reviewed private bundle. Never executes SQL."""
import json
import re

DEV_REF = 'ogbnpvroaafgpnlxeftw'
BASELINE_SHA = '88f212dc644104e7a7b3a7c256badb8a35ecc4baa7a4d27a00d57d5006bb0354'
HOOK = ['auth', 'users', 'on_auth_user_created',
        'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()', 'O']


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def acl_reset_sql(functions):
    # Objects are new, postgres-owned application functions. Remove ambient direct
    # grants to EVERY existing role, including PUBLIC, then replay exact source ACLs.
    # This also checks effective inherited access by comparing role memberships in
    # preflight; no membership or managed object permissions are changed here.
    payload = literal(json.dumps(functions))
    return """DO $acl$ DECLARE f jsonb; a jsonb; r record; fn regprocedure; BEGIN
 FOR f IN SELECT * FROM jsonb_array_elements(""" + payload + """::jsonb) LOOP
   SELECT p.oid::regprocedure INTO STRICT fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))=f->>'name'
      AND p.proowner='postgres'::regrole;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
   FOR r IN SELECT rolname FROM pg_roles WHERE rolname <> 'postgres' LOOP
     EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,r.rolname);
   END LOOP;
   FOR a IN SELECT * FROM jsonb_array_elements(f->'acl') LOOP
     IF a->>1 <> 'EXECUTE' THEN RAISE EXCEPTION 'Unreviewed function privilege'; END IF;
     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s%s',fn,
       CASE WHEN a->>0='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(a->>0) END,
       CASE WHEN (a->>2)::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
   END LOOP;
 END LOOP;
END; $acl$;
"""


def build(raw, manifest, target, context, setup):
    source = manifest['catalog']
    if manifest['schema_sha256'] != BASELINE_SHA or setup.digest(raw) != BASELINE_SHA:
        raise ValueError('Only the exact reviewed schema export may be restored')
    if manifest['schemas'] != ['private', 'public'] or source['managed_custom_triggers'] != [HOOK] or source['managed_policies']:
        raise ValueError('Unreviewed schema or managed attachment')
    if context['project_ref'] != DEV_REF or context['current_user'] != 'postgres':
        raise ValueError('Exact Development project and postgres required')
    if not context['auth_trigger_privilege'] or not context['auth_reference_privilege'] or context['hook_exists']:
        raise ValueError('Auth attachment permissions/collision require review')
    if context['unsafe_memberships'] or context['role_elevation']:
        raise ValueError('Inherited role access differs from reviewed least-privilege environment')
    if any(r['owner'] != 'postgres' for r in source['functions'] + source['relations']):
        raise ValueError('Non-application ownership requires review')
    if not set(source['roles']).issubset(target['roles']):
        raise ValueError('Required baseline roles missing')
    # public is a pre-existing Supabase schema, not an application object to replace.
    public = [s for s in source['schemas'] if s['name'] == 'public']
    if public != [s for s in target['schemas'] if s['name'] == 'public']:
        raise ValueError('Existing public schema owner/ACL differs; preserve and review')
    managed = [a for a in source['default_acls'] if a[0] != 'postgres']
    if managed != [a for a in target['default_acls'] if a[0] != 'postgres']:
        raise ValueError('Managed default privileges differ; do not change them')
    if any(a[0] != 'supabase_admin' or a[1] != 'public' for a in managed):
        raise ValueError('Unreviewed managed default privilege owner/scope')
    if source['server_major'] > target['server_major'] or any(e not in target['extensions'] for e in source['extensions']):
        raise ValueError('PostgreSQL/extension incompatibility')
    parts = []
    skipped = {'public_schema': 0, 'managed_defaults': 0}
    for part in setup.sql_parts(setup.schema_sql(raw)):
        head = setup.leading_sql(part).strip()
        if re.match(r'ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public"\s+(?:GRANT|REVOKE)\b', head):
            skipped['managed_defaults'] += 1
            continue
        if re.match(r'(?:CREATE SCHEMA IF NOT EXISTS "public";|ALTER SCHEMA "public" OWNER TO "pg_database_owner";|COMMENT ON SCHEMA "public" IS |(?:GRANT|REVOKE)\b[^;]*\bON SCHEMA "public"(?=\s|;))', head):
            skipped['public_schema'] += 1
            continue
        # Reject any unsupported reserved-role operation rather than skipping it.
        if head.startswith('ALTER DEFAULT PRIVILEGES') and not head.startswith('ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" '):
            raise ValueError('Unreviewed default privilege operation')
        if re.match(r'(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|DATABASE|EXTENSION|EVENT|SERVER)\b', head):
            raise ValueError('Managed/global object operation rejected')
        parts.append(part)
    if skipped['managed_defaults'] != 12:
        raise ValueError('Reviewed managed-default statement count changed')
    # Target ambient table/sequence defaults must not add named grants absent from
    # pg_dump ACLs. Reset only postgres-owned per-schema defaults, then replay the
    # unmodified dump's own postgres default privileges at its end.
    prelude = ''
    for owner, schema, kind, grants in target['default_acls']:
        if owner != 'postgres' or schema != 'public': continue
        noun = {'r': 'TABLES', 'S': 'SEQUENCES', 'f': 'FUNCTIONS'}[kind]
        for grantee in sorted({a[0] for a in grants} - {'postgres'}):
            prelude += f'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON {noun} FROM ' + ('PUBLIC' if grantee == 'PUBLIC' else ident(grantee)) + ';\n'
    # Whole transaction is unobservable until verified COMMIT; any failure closes
    # the connection with ON_ERROR_STOP and rolls back ALL DDL and ACL changes.
    sql = 'BEGIN;\nSET LOCAL lock_timeout=\'10s\';\n'
    sql += "SELECT pg_advisory_xact_lock(hashtextextended('oddgrid-development-baseline',0));\n"
    sql += setup.state_guard(require_empty=True, names=['private','public'])
    sql += context['transaction_guard']
    sql += prelude + '\n' + '\n'.join(parts) + '\n'
    sql += acl_reset_sql(source['functions'])
    # CREATE TRIGGER enables an ordinary trigger automatically. Do not issue
    # ALTER TABLE auth.users ENABLE TRIGGER: that requires managed table ownership.
    sql += HOOK[3] + ';\n'
    sql += setup.assert_catalog_sql(source) + '\n' + context['post_guard']
    sql += setup.empty_records_guard(['private','public']) + '\nCOMMIT;\n'
    return sql, skipped


# System catalogs only. No auth/application rows or credentials are inspected.
MANAGED_SNAPSHOT = """SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(jsonb_build_array(n.oid,n.nspname,n.nspowner,n.nspacl) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname NOT IN ('private') AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('public','private','information_schema') AND n.nspname !~ '^pg_'),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND n.nspname NOT IN ('public','private','information_schema') AND n.nspname !~ '^pg_'),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,md5(pg_get_functiondef(p.oid))) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p') AND n.nspname NOT IN ('public','private','information_schema') AND n.nspname !~ '^pg_'),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid,t.tgrelid,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('public','private','information_schema') AND n.nspname !~ '^pg_' AND NOT (t.tgisinternal AND EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_namespace kn ON kn.oid=k.connamespace WHERE k.oid=t.tgconstraint AND kn.nspname IN ('public','private'))) AND NOT (n.nspname='auth' AND c.relname='users' AND t.tgname='on_auth_user_created')),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(k.oid,pg_get_constraintdef(k.oid)) ORDER BY k.oid) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname NOT IN ('public','private','information_schema') AND n.nspname !~ '^pg_'),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(schemaname,indexname,indexdef) ORDER BY schemaname,indexname) FROM pg_indexes WHERE schemaname NOT IN ('public','private','information_schema') AND schemaname !~ '^pg_'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p WHERE schemaname NOT IN ('public','private')),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM pg_roles r),
 'memberships',(SELECT jsonb_agg(to_jsonb(a) ORDER BY roleid,member,grantor) FROM pg_auth_members a),
 'extensions',(SELECT jsonb_agg(to_jsonb(e) ORDER BY oid) FROM pg_extension e),
 'managed_defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d WHERE defaclrole<>'postgres'::regrole OR defaclnamespace=0)
)"""


def context_sql():
    return """BEGIN READ ONLY;
SELECT jsonb_build_object('current_user',current_user,
 'auth_trigger_privilege',has_table_privilege('postgres','auth.users','TRIGGER'),
 'auth_reference_privilege',has_column_privilege('postgres','auth.users','id','REFERENCES'),
 'hook_exists',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created'),
 'unsafe_memberships',EXISTS(SELECT 1 FROM pg_roles a CROSS JOIN pg_roles b WHERE a.rolname IN ('anon','authenticated') AND a.oid<>b.oid AND pg_has_role(a.oid,b.oid,'MEMBER')),
 'role_elevation',EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)),
 'managed_snapshot',(""" + MANAGED_SNAPSHOT + "));\nCOMMIT;"


def guards(context):
    baseline = literal(json.dumps(context['managed_snapshot']))
    # Recheck the inspected managed state under the write transaction, preventing
    # a silent change between preparation and execution. Never lock auth rows.
    start = "DO $managed$ BEGIN IF (" + MANAGED_SNAPSHOT + ") IS DISTINCT FROM " + baseline + "::jsonb THEN RAISE EXCEPTION 'Managed state changed before restoration'; END IF;\n"
    start += "IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created') THEN RAISE EXCEPTION 'Auth hook already exists'; END IF; END; $managed$;\n"
    end = "DO $managed$ BEGIN IF (" + MANAGED_SNAPSHOT + ") IS DISTINCT FROM " + baseline + "::jsonb THEN RAISE EXCEPTION 'Managed state changed during restoration'; END IF; END; $managed$;\n"
    context['transaction_guard'], context['post_guard'] = start, end
    return context
