import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('restore_wrapper',Path(__file__).resolve().parents[1]/'cloud/codespace_restore.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SHA='a'*40
ENV={'ODDGRID_DEV_DATABASE_URL':f'postgresql://postgres@db.{c.restore_plan.DEV_REF}.supabase.co:5432/postgres','ODDGRID_DEV_DB_PASSWORD':'synthetic-never-used'}


class Wrapper(unittest.TestCase):
    def run_wrapper(self,extra):
        with patch.object(c.restore_plan,'verify_manifest'),patch.object(c.setup,'read_bundle',return_value=('',{})),patch.dict(os.environ,ENV,clear=True),patch.object(c.setup,'verify_private_bundle',return_value=c.restore_plan.BASELINE_SHA),patch.object(c.subprocess,'run',side_effect=[SimpleNamespace(stdout=SHA),SimpleNamespace(stdout='integration/supabase-demo-product'),SimpleNamespace(stdout='')]),patch.object(c.setup,'main') as execute:
            c.main(['--reviewed-commit',SHA]+extra)
            return execute.call_args

    def test_preflight_never_connects(self): self.assertIsNone(self.run_wrapper([]))

    def test_approval_required(self):
        with self.assertRaises(ValueError): self.run_wrapper(['--execute','--approval','restore:wrong'])

    def test_exact_approved_development_operation(self):
        call=self.run_wrapper(['--execute','--approval','restore:'+c.restore_plan.DEV_REF])
        self.assertEqual(call.args[0][0],'restore')
        self.assertIn(c.restore_plan.BASELINE_SHA,call.args[0])
        self.assertIn('restore:'+c.restore_plan.DEV_REF,call.args[0])

    def test_verify_only_uses_read_only_action(self):
        call=self.run_wrapper(['--verify-only'])
        self.assertEqual(call.args[0][0],'verify-baseline')
        self.assertNotIn('--execute',call.args[0])

    def test_original_endpoint_rejected(self):
        with patch.dict(ENV,{'ODDGRID_DEV_DATABASE_URL':f'postgresql://postgres@db.{c.setup.SOURCE_REF}.supabase.co:5432/postgres'}):
            with self.assertRaises(ValueError): self.run_wrapper([])


if __name__=='__main__': unittest.main()
