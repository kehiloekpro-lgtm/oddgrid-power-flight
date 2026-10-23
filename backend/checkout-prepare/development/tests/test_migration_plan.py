import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import database_setup as d
import migration_plan as p


class MigrationPlan(unittest.TestCase):
    def test_atomic_boundaries_and_verify_before_commit(self):
        source={'relations':[{'name':'public.z','kind':'r'},{'name':'private.a','kind':'r'}]}
        with patch.object(d,'assert_catalog_sql',side_effect=['SELECT 1;','SELECT 2;']):
            sql=p.build(d,source,{}, {})
        parts=[d.leading_sql(x).strip().upper() for x in d.sql_parts(sql)]
        self.assertEqual(parts[0],'BEGIN;')
        self.assertEqual(parts[-1],'COMMIT;')
        self.assertEqual(parts.count('COMMIT;'),1)
        self.assertEqual(parts.count('BEGIN;'),1)
        self.assertLess(sql.index('LOCK TABLE private.a'),sql.index('LOCK TABLE public.z'))
        self.assertLess(sql.index('SELECT 2;'),sql.rindex('COMMIT;'))
        self.assertNotRegex(sql,r'(?i)(?:SELECT|PERFORM|CALL)\s+private\.(?:create_payment_attempt|finalize_order_from_payment)\s*\(')

    def test_sql_failure_is_not_retried_and_receipt_is_retained(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); receipt=root/'execution.json'
            with patch.object(p,'folder',return_value=root), patch.object(p,'expected',return_value={}), patch.object(p,'inspect_state',return_value={'managed':{}}), patch.object(p,'build',return_value='BEGIN;COMMIT;'), patch.object(d,'assert_catalog_sql',return_value='SELECT 1;'), patch.object(d,'psql',side_effect=['',d.CommandFailure('network_unavailable',2),'']) as sql, patch.object(p,'verify') as verify:
                with self.assertRaises(d.CommandFailure): p.apply(d,{},'synthetic',{},receipt,'a'*40)
                self.assertEqual(sql.call_count,2)
                self.assertTrue(receipt.exists())
                verify.assert_not_called()
                with self.assertRaises(FileExistsError): p.apply(d,{},'synthetic',{},receipt,'a'*40)
                self.assertEqual(sql.call_count,3)  # read-only precheck only on repeat

    def test_expected_catalogue_tampering_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); path=root/'expected.json'; path.write_text('{}'); path.chmod(0o600)
            with patch.object(p,'folder',return_value=root),self.assertRaises(ValueError): p.expected()

    def test_verification_is_read_only_and_checks_effective_grants(self):
        with patch.object(d,'assert_catalog_sql',return_value='SELECT 1;'):
            sql=p.verify_sql(d,{})
        self.assertTrue(sql.startswith('BEGIN READ ONLY;'))
        self.assertTrue(sql.endswith('ROLLBACK;'))
        self.assertIn('has_function_privilege',sql)
        self.assertNotIn('readonly=False',sql)

    def test_canonical_preserves_nested_column_order(self):
        catalog={k:[] for k in p.KEYS}; catalog['relations']=[{'name':'x','columns':['a','b']}]
        original=p.digest(p.canonical(catalog))
        catalog['relations'][0]['columns'].reverse()
        self.assertNotEqual(original,p.digest(p.canonical(catalog)))
