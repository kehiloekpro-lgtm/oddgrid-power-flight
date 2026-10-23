import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

cloud=Path(__file__).resolve().parents[1]/'cloud'
sys.path.insert(0,str(cloud))
spec=importlib.util.spec_from_file_location('rehearse_wrapper',cloud/'codespace_rehearse.py')
c=importlib.util.module_from_spec(spec); spec.loader.exec_module(c)


class RehearsalWrapper(unittest.TestCase):
    def test_default_calls_only_readiness_and_independent_verify(self):
        with patch.object(c.reviewed,'main') as checks, patch.object(c.reviewed.setup,'main') as action:
            c.main(['--reviewed-commit','a'*40])
        self.assertEqual(checks.call_count,2)
        self.assertIn('--verify-only',checks.call_args.args[0])
        action.assert_not_called()

    def test_wrong_approval_never_runs_rehearsal(self):
        with patch.object(c.reviewed,'main'), patch.object(c.reviewed.setup,'main') as action:
            with self.assertRaises(ValueError):
                c.main(['--reviewed-commit','a'*40,'--execute','--approval','rehearse:wrong'])
        action.assert_not_called()

    def test_failed_verification_stops_before_execution(self):
        with patch.object(c.reviewed,'main',side_effect=[None,ValueError('drift')]), patch.object(c.reviewed.setup,'main') as action:
            with self.assertRaises(ValueError):
                c.main(['--reviewed-commit','a'*40,'--execute','--approval','rehearse:'+c.reviewed.restore_plan.DEV_REF])
        action.assert_not_called()
