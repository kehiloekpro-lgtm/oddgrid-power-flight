"""No network, credentials, Supabase CLI or database required."""
import importlib.util
from pathlib import Path
import os
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'database_setup.py'
spec = importlib.util.spec_from_file_location('database_setup', MODULE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
DEV = m.restore_plan.DEV_REF  # Deliberately synthetic test-only endpoint; never connected.
URL = f'postgresql://postgres@db.{DEV}.supabase.co:5432/postgres'


class SetupSafety(unittest.TestCase):
    def test_direct_and_session_pooler(self):
        self.assertEqual(m.endpoint(URL, DEV, True)['PGHOST'], f'db.{DEV}.supabase.co')
        self.assertEqual(m.endpoint(f'postgresql://postgres.{DEV}@aws-0-test.pooler.supabase.com:5432/postgres', DEV, True)['PGUSER'], 'postgres.' + DEV)

    def test_wrong_original_or_ambiguous_destination(self):
        cases = [
            (f'postgresql://postgres@db.{m.SOURCE_REF}.supabase.co/postgres', m.SOURCE_REF),
            (URL, m.SOURCE_REF), (URL.replace(DEV, 'z' * 20), DEV),
            (URL.replace('postgres@', 'postgres:secret@'), DEV),
            (URL + '?host=another', DEV), (URL + '#fragment', DEV),
            (URL.replace('5432', '6543'), DEV), (URL.replace('/postgres', '/other'), DEV),
            (f'postgresql://postgres.wrong@aws-0-test.pooler.supabase.com/postgres', DEV),
        ]
        for url, ref in cases:
            with self.subTest(url=url), self.assertRaises(ValueError): m.endpoint(url, ref, True)

    def test_no_connection_without_operation_bound_approval(self):
        for action in ['restore', 'rehearse', 'apply-migration', 'concurrency']:
            with self.subTest(action=action), patch.object(m, 'psql') as sql, patch.object(m.getpass, 'getpass') as password:
                m.main([action, '--dev-ref', DEV, '--dev-url', URL])
                sql.assert_not_called()
                password.assert_not_called()
            with patch.object(m, 'psql') as sql:
                m.main([action, '--dev-ref', DEV, '--dev-url', URL, '--execute', '--approval', 'restore:wrong'])
                sql.assert_not_called()

    def test_reject_managed_or_injected_schema(self):
        for value in ['public', 'public,private,auth', 'public,private,pg_catalog', 'public,private,x;DROP TABLE x']:
            with self.assertRaises(ValueError): m.schemas(value)
        self.assertEqual(m.schemas('public,private,custom'), ['custom', 'private', 'public'])

    def test_ambient_connection_redirects_and_passwords_removed(self):
        with patch.dict(os.environ, {'PGHOSTADDR': '127.0.0.1', 'PGSERVICE': 'production', 'PGPASSFILE': '/secret', 'SUPABASE_DB_PASSWORD': 'original'}):
            env = m.child_env(m.endpoint(URL, DEV, True), 'development-only', True)
        for key in ['PGHOSTADDR', 'PGSERVICE', 'PGPASSFILE', 'SUPABASE_DB_PASSWORD']:
            self.assertNotIn(key, env)
        self.assertEqual(env['PGPASSWORD'], 'development-only')
        self.assertIn('default_transaction_read_only=on', env['PGOPTIONS'])

    def test_dump_ddl_preserves_function_bodies_and_generated_columns(self):
        body = "CREATE FUNCTION public.f() RETURNS text LANGUAGE plpgsql AS $body$\nBEGIN\n-- unchanged\nRETURN 'x;--comment';\n\\restrict literal_in_body\nEND; $body$;"
        self.assertIn(body, m.schema_sql('\\restrict abc123\nCREATE SCHEMA public;\n' + body + '\n\\unrestrict abc123\n'))
        self.assertIn('CREATE SCHEMA IF NOT EXISTS', m.schema_sql('CREATE SCHEMA public;'))
        generated = 'CREATE TABLE public.t (q int, line_total numeric GENERATED ALWAYS AS (q * 2) STORED);'
        self.assertEqual(m.schema_sql(generated), generated)
        self.assertEqual(m.leading_sql('/* outer /* inner */ end */ -- line\n SET x=1;'), 'SET x=1;')

    def test_reject_data_commands_external_objects_psql_and_secrets(self):
        for sql in ['INSERT INTO x VALUES (1);', 'COPY x FROM stdin;', 'DO $$BEGIN NULL; END$$;',
                    'SELECT secret FROM auth.users;', 'CREATE ROLE customer;', 'CREATE SERVER x FOREIGN DATA WRAPPER y;',
                    'SET x=1;\n\\connect original', 'SET x=1\n\\gexec', '\\i hidden.sql',
                    "COMMENT ON TABLE x IS 'postgresql://postgres:secret@host/postgres';"]:
            with self.subTest(sql=sql), self.assertRaises(ValueError): m.schema_sql(sql)

    def test_concurrency_reuses_all_schedules_and_enforces_target_guard(self):
        original = (m.TESTS / 'checkout-concurrency.spec').read_text()
        adapted = m.development_concurrency_spec()
        self.assertEqual(original[original.index('session "first"'):], adapted[adapted.index('session "first"'):])
        self.assertIn("current_database() <> 'postgres'", adapted)
        self.assertIn("to_regclass('auth.users')", adapted)
        self.assertNotIn("IF current_database() <> 'oddgrid_checkout_isolated'", adapted)

    def test_schema_only_export_command_contract(self):
        source = MODULE.read_text()
        self.assertIn("'--schema-only'", source)
        self.assertIn('schema_dump_command', source)
        self.assertNotIn('"--data-only"', source)
        self.assertNotIn('"--role-only"', source)
        self.assertNotIn('"db", "push"', source)
        self.assertNotIn('"db", "reset"', source)
        self.assertNotIn('["supabase",', source)
        self.assertNotIn("'--no-owner'", source)
        self.assertNotIn("'--no-privileges'", source)

    def test_reuse_transaction_boundaries_and_no_execution_of_payment(self):
        migration = m.transaction_body(m.MIGRATION.read_text(), 'COMMIT')
        suite = m.transaction_body((m.TESTS / 'checkout.sql').read_text(), 'ROLLBACK')
        self.assertIn('CREATE OR REPLACE FUNCTION private.finalize_order_from_payment', migration)
        self.assertNotRegex(suite, r'(?i)(?:SELECT|PERFORM|CALL)\s+(?:private\.)?(?:create_payment_attempt|finalize_order_from_payment)\s*\(')
        self.assertIn('SAVEPOINT', suite)
        self.assertIn('oddgrid.supabase_development_test', suite)
        self.assertIn('require_empty', m.state_guard.__code__.co_varnames)
        self.assertIn('RAISE EXCEPTION', m.empty_records_guard(['public', 'private']))

    def test_rehearsal_locks_before_empty_guard_and_has_one_rollback_boundary(self):
        source={'relations':[{'name':'public.z','kind':'r'},{'name':'private.a','kind':'r'}]}
        with patch.object(m,'assert_catalog_sql',return_value='SELECT 1;'):
            sql=m.rehearsal_sql(source)
        self.assertLess(sql.index('LOCK TABLE private.a'),sql.index('LOCK TABLE public.z'))
        self.assertLess(sql.index('LOCK TABLE public.z'),sql.index('DO $empty$'))
        statements=[m.leading_sql(p).strip().upper() for p in m.sql_parts(sql)]
        self.assertEqual(statements[0],'BEGIN;')
        self.assertEqual(statements[-1],'ROLLBACK;')
        self.assertNotIn('COMMIT;',statements)
        self.assertEqual(statements.count('BEGIN;'),1)
        self.assertIn("SET LOCAL lock_timeout='5s'",sql)

    def test_rehearsal_refuses_another_development_project_before_connecting(self):
        other='x'*20
        with patch.object(m,'psql') as sql, self.assertRaises(ValueError):
            m.main(['rehearse','--dev-ref',other,'--dev-url',f'postgresql://postgres@db.{other}.supabase.co:5432/postgres','--execute','--approval','rehearse:'+other])
        sql.assert_not_called()


if __name__ == '__main__': unittest.main()
