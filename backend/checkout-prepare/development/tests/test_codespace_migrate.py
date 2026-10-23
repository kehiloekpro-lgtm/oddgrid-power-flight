import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

cloud=Path(__file__).resolve().parents[1]/'cloud'
sys.path.insert(0,str(cloud))
spec=importlib.util.spec_from_file_location('migrate_wrapper',cloud/'codespace_migrate.py')
c=importlib.util.module_from_spec(spec); spec.loader.exec_module(c)
SHA='a'*40
ENV={'ODDGRID_DEV_DATABASE_URL':f'postgresql://postgres.{c.reviewed.restore_plan.DEV_REF}@aws-1-fixture.pooler.supabase.com:5432/postgres','ODDGRID_DEV_DB_PASSWORD':'synthetic'}


class PermanentWrapper(unittest.TestCase):
    def run_mode(self,extra,exists=False):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ,ENV),patch.object(c.reviewed,'main') as checks,patch.object(c.plan,'expected',return_value={}),patch.object(c.plan,'folder',return_value=Path(tmp)),patch.object(c.reviewed.setup,'read_bundle',return_value=('',{'catalog':{}})),patch.object(c.plan,'verify') as verify,patch.object(c.reviewed.setup,'main') as action:
            if exists: (Path(tmp)/'execution.json').write_text('{}')
            c.main(['--reviewed-commit',SHA]+extra)
            return checks.call_args_list,action.call_args,verify.call_args

    def test_default_read_only(self):
        checks,action,verify=self.run_mode([])
        self.assertEqual(len(checks),2)
        self.assertIsNone(action); self.assertIsNone(verify)

    def test_verify_never_applies_or_requires_old_baseline(self):
        checks,action,verify=self.run_mode(['--verify-only'],True)
        self.assertEqual(len(checks),1)
        self.assertIsNone(action); self.assertIsNotNone(verify)

    def test_wrong_approval_rejected(self):
        with self.assertRaises(ValueError): self.run_mode(['--execute','--approval','apply-migration:wrong'])

    def test_existing_execution_evidence_rejects_retry(self):
        with self.assertRaises(ValueError): self.run_mode(['--execute','--approval','apply-migration:'+c.reviewed.restore_plan.DEV_REF],True)

    def test_exact_approved_operation_only(self):
        _,action,_=self.run_mode(['--execute','--approval','apply-migration:'+c.reviewed.restore_plan.DEV_REF])
        self.assertEqual(action.args[0][0],'apply-migration')
        self.assertIn('--reviewed-commit',action.args[0])
