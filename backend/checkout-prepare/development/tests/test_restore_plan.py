import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database_setup as d
import restore_plan as r


class RestorePlan(unittest.TestCase):
    def fixture(self):
        raw='CREATE SCHEMA public;\n' + '\n'.join('ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT EXECUTE ON FUNCTIONS TO "postgres";' for _ in range(12))
        src=dict(schemas=[dict(name='public',owner='pg_database_owner',acl=[])],roles=['postgres'],default_acls=[['supabase_admin','public','f',[]]],functions=[],relations=[],managed_custom_triggers=[r.HOOK],managed_policies=[],server_major=17,extensions=[])
        return raw, dict(schema_sha256=d.digest(raw),schemas=['private','public'],catalog=src), copy.deepcopy(src), dict(project_ref=r.DEV_REF,current_user='postgres',auth_trigger_privilege=True,auth_reference_privilege=True,hook_exists=False,unsafe_memberships=False,role_elevation=False,transaction_guard='-- before\n',post_guard='-- after\n')

    def build(self,raw,m,t,c):
        with patch.object(r,'BASELINE_SHA',d.digest(raw)): return r.build(raw,m,t,c,d)

    def test_order_no_managed_ddl_and_atomic_assertions(self):
        raw,m,t,c=self.fixture(); sql,skipped=self.build(raw,m,t,c)
        self.assertEqual(skipped['managed_defaults'],12)
        self.assertNotIn('FOR ROLE "supabase_admin"',sql)
        self.assertNotIn('CREATE SCHEMA IF NOT EXISTS "public"',sql)
        self.assertNotIn('ALTER TABLE "auth"',sql)
        self.assertLess(sql.index('DO $acl$'),sql.index(r.HOOK[3]))
        self.assertLess(sql.index(r.HOOK[3]),sql.index('Restored structure/ACLs differ'))
        self.assertTrue(sql.startswith('BEGIN;')); self.assertTrue(sql.endswith('COMMIT;\n'))
        self.assertIn('managed_custom_triggers',sql)

    def test_reject_wrong_baseline_target_and_managed_drift(self):
        raw,m,t,c=self.fixture()
        for key,value in [('project_ref',d.SOURCE_REF),('current_user','service_role'),('hook_exists',True),('unsafe_memberships',True),('role_elevation',True),('auth_trigger_privilege',False)]:
            changed=dict(c,**{key:value})
            with self.subTest(key=key), self.assertRaises(ValueError): self.build(raw,m,t,changed)
        for key,value in [('default_acls',[]),('schemas',[]),('roles',[])]:
            with self.subTest(key=key), self.assertRaises(ValueError): self.build(raw,m,dict(t,**{key:value}),c)
        with self.assertRaises(ValueError): r.build(raw,m,t,c,d)

    def test_reject_unreviewed_attachment_and_reserved_role_operations(self):
        raw,m,t,c=self.fixture(); m['catalog']['managed_custom_triggers']=[r.HOOK[:-1]+['D']]
        with self.assertRaises(ValueError): self.build(raw,m,t,c)
        raw,m,t,c=self.fixture(); raw+='\nALTER ROLE supabase_admin SUPERUSER;';m['schema_sha256']=d.digest(raw)
        with self.assertRaises(ValueError): self.build(raw,m,t,c)

    def test_acl_replay_and_source_public_access_preserved(self):
        sql=r.acl_reset_sql([dict(name='private.intended()',acl=[['PUBLIC','EXECUTE',False]])])
        self.assertIn('REVOKE ALL ON FUNCTION %s FROM PUBLIC',sql)
        self.assertIn("rolname <> 'postgres'",sql)
        self.assertIn("a->>0='PUBLIC' THEN 'PUBLIC'",sql)
        self.assertIn('WITH GRANT OPTION',sql)
        self.assertNotIn('ALTER ROLE',sql)

    def test_public_schema_privileges_are_preserved_not_replayed(self):
        raw,m,t,c=self.fixture();raw+='\nGRANT USAGE ON SCHEMA "public" TO "anon";\nALTER SCHEMA "public" OWNER TO "pg_database_owner";';m['schema_sha256']=d.digest(raw)
        sql,skipped=self.build(raw,m,t,c)
        self.assertEqual(skipped['public_schema'],3)
        self.assertNotIn('GRANT USAGE ON SCHEMA "public"',sql)

    def test_catalog_comparison_ignores_only_outer_row_order(self):
        _,m,_,_=self.fixture()
        sql=d.assert_catalog_sql(m['catalog'])
        self.assertIn('jsonb_array_elements(actual->\'constraints\')',sql)
        self.assertIn('jsonb_array_elements(expected->\'constraints\')',sql)
        self.assertIn('COLLATE "C"',sql)
        self.assertNotIn('jsonb_array_elements(actual->\'columns\')',sql)

    def test_original_and_other_projects_rejected_before_connection(self):
        for ref in [d.SOURCE_REF,'abcdefghijklmnopqrst']:
            with patch.object(d,'psql') as p, self.assertRaises(ValueError):
                d.main(['restore','--dev-ref',ref,'--dev-url',f'postgresql://postgres@db.{ref}.supabase.co:5432/postgres','--execute','--approval','restore:'+ref])
            p.assert_not_called()


if __name__=='__main__': unittest.main()
