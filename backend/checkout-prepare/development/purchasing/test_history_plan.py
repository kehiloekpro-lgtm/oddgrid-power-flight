import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
path=Path(__file__).with_name('prepare_history.py')
spec=importlib.util.spec_from_file_location('history',path);h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class HistoryPlanTests(unittest.TestCase):
 def test_records_original_sql_as_data_without_replaying_it(self):
  with patch.object(h.d,'assert_catalog_sql',return_value='SELECT 1;'):
   sql=h.build({},'SELECT dangerous_should_not_execute();')
  self.assertEqual(sql.count('dangerous_should_not_execute'),1)
  self.assertIn("ARRAY['SELECT dangerous_should_not_execute();']::text[]",sql)
  self.assertIn('LOCK TABLE supabase_migrations.schema_migrations',sql)
  self.assertIn("version='20261023120135'",sql)
  self.assertIn("version='20261021000100'",sql)
  self.assertIn('Profile protection drift',sql)
  self.assertTrue(sql.startswith('BEGIN;'))
  self.assertTrue(sql.endswith('COMMIT;\n'))
 def test_private_expected_catalogue_required(self):
  with patch.object(h.d,'assert_catalog_sql',side_effect=ValueError('expected required')):
   with self.assertRaises(ValueError):h.build({},'')
if __name__=='__main__':unittest.main()
