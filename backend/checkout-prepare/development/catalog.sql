-- Metadata only. No application table rows, role passwords, keys or auth user records.
-- schema_csv is validated by database_setup.py before being passed to psql.
BEGIN READ ONLY;
SET LOCAL search_path = public, pg_catalog;
WITH selected AS (
 SELECT n.oid,n.nspname FROM pg_namespace n WHERE n.nspname=ANY(string_to_array(:'schema_csv',','))
), routines AS (
 SELECT p.*,n.nspname FROM pg_proc p JOIN selected n ON n.oid=p.pronamespace
 WHERE NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
), relations AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN selected n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p','v','m','S','f') AND NOT EXISTS
   (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
)
SELECT jsonb_build_object(
 'server_major',current_setting('server_version_num')::int / 10000,
 'auth_ready',to_regclass('auth.users') IS NOT NULL AND to_regprocedure('auth.uid()') IS NOT NULL,
 'schemas',coalesce((SELECT jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(ns.nspowner),'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(ns.nspacl,acldefault('n',ns.nspowner))) a)) ORDER BY n.nspname) FROM selected n JOIN pg_namespace ns ON ns.oid=n.oid),'[]'),
 'schema_candidates',coalesce((SELECT jsonb_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema','auth','storage','realtime','extensions','vault','graphql','graphql_public','supabase_functions','supabase_migrations','pgbouncer','net','cron') AND nspname NOT IN (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE n.nspname NOT IN ('public','private'))),'[]'),
 'extensions',coalesce((SELECT jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname) ORDER BY e.extname) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),'[]'),
 'roles',coalesce((SELECT jsonb_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_'),'[]'),
 'functions',coalesce((SELECT jsonb_agg(jsonb_build_object('name',format('%I.%I(%s)',nspname,proname,pg_get_function_identity_arguments(oid)), 'owner',pg_get_userbyid(proowner),'definer',prosecdef,'settings',proconfig,'body_md5',md5(btrim(regexp_replace(prosrc,'[[:space:]]+',' ','g'))),'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a)) ORDER BY nspname,proname,pg_get_function_identity_arguments(oid)) FROM routines),'[]'),
 'relations',coalesce((SELECT jsonb_agg(jsonb_build_object('name',format('%I.%I',nspname,relname),'kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'forced_rls',relforcerowsecurity,'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(relacl,acldefault(CASE WHEN relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,relowner))) a),'columns',(SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated,pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY attnum) FROM pg_attribute at LEFT JOIN pg_attrdef ad ON ad.adrelid=at.attrelid AND ad.adnum=at.attnum WHERE at.attrelid=r.oid AND attnum>0 AND NOT attisdropped)) ORDER BY nspname,relname) FROM relations r),'[]'),
 'constraints',coalesce((SELECT jsonb_agg(jsonb_build_array(n.nspname,c.conname,c.conrelid::regclass::text,pg_get_constraintdef(c.oid)) ORDER BY n.nspname,c.conrelid::regclass::text,c.conname) FROM pg_constraint c JOIN selected n ON n.oid=c.connamespace),'[]'),
 'indexes',coalesce((SELECT jsonb_agg(jsonb_build_array(schemaname,indexname,indexdef) ORDER BY schemaname,indexname) FROM pg_indexes WHERE schemaname=ANY(string_to_array(:'schema_csv',','))),'[]'),
 'triggers',coalesce((SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN selected n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal),'[]'),
 'policies',coalesce((SELECT jsonb_agg(jsonb_build_array(schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check) ORDER BY schemaname,tablename,policyname) FROM pg_policies WHERE schemaname=ANY(string_to_array(:'schema_csv',','))),'[]'),
 'default_acls',coalesce((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type,a.is_grantable) FROM aclexplode(d.defaclacl) a)) ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype) FROM pg_default_acl d JOIN selected n ON n.oid=d.defaclnamespace),'[]'),
 'managed_custom_triggers',coalesce((SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND n.nspname IN ('auth','storage','realtime') AND p.pronamespace IN (SELECT oid FROM selected)),'[]'),
 'managed_policies',coalesce((SELECT jsonb_agg(jsonb_build_array(schemaname,tablename,policyname) ORDER BY schemaname,tablename,policyname) FROM pg_policies WHERE schemaname IN ('auth','storage','realtime')),'[]')
);
COMMIT;
