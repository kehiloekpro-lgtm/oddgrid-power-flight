import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'cloud'))
import phase5_plan as p
import codespace_test_checkout as c


class Phase5(unittest.TestCase):
    def test_every_schedule_has_only_selected_steps_and_no_cleanup(self):
        import re
        for name,case in p.CASES.items():
            text=p.spec(name,'SELECT 1;')
            self.assertEqual(set(re.findall(r'step "([^"]+)"',text)),set(case[0].split()))
            teardown=text.split('teardown\n{',1)[1].split('\nsession',1)[0]
            self.assertNotIn('DELETE FROM',teardown)
            self.assertIn('Phase5 duplicate/partial/incorrect snapshot',teardown)
            self.assertNotRegex(text,r'(?:SELECT|PERFORM|CALL)\s+private\.(?:create_payment_attempt|finalize_order_from_payment)')

    def test_functional_atomic_rollback_and_real_staff(self):
        with patch.object(p.d,'assert_catalog_sql',return_value='SELECT 1;'):
            text=p.functional({'relations':[]})
        parts=[p.d.leading_sql(x).strip().upper() for x in p.d.sql_parts(text)]
        self.assertEqual(parts[0],'BEGIN;'); self.assertEqual(parts[-1],'ROLLBACK;')
        self.assertNotIn('COMMIT;',parts)
        self.assertNotIn('CREATE OR REPLACE FUNCTION private.is_staff_or_admin',text)
        self.assertIn("SET role='staff'",text)

    def test_error_zero_exit_is_not_a_pass_and_no_cleanup_on_failure(self):
        for output,err,code in [('ERROR: surprise','',0),('nothing','',0),('','network failed',1)]:
            with patch.object(p,'CASES',{'same_key':p.CASES['same_key']}),patch.object(p.d,'assert_catalog_sql',return_value='SELECT 1;'):
                calls=[]
                with self.assertRaises(RuntimeError):
                    p.run_schedules(lambda _:subprocess.CompletedProcess([],code,output,err),calls.append,{},'SELECT 1;',lambda *_:None)
                self.assertEqual(len(calls),1)  # read-only precheck, no cleanup

    def test_expected_rejections_are_exact(self):
        p.validate_errors('wrong_guest','<waiting ...>\nERROR:  Cart not found or unauthorized\n')
        with self.assertRaises(RuntimeError): p.validate_errors('same_key','<waiting ...>\nERROR: Cart not found or unauthorized\n')

    def test_docker_never_receives_credential_values_in_argv(self):
        command=p.docker_command()
        self.assertIn('PGPASSWORD',command)
        self.assertIn(p.IMAGE,command)
        self.assertNotIn('--privileged',command)

    def test_exact_transcript_required_before_cleanup(self):
        with patch.object(p,'CASES',{'same_key':p.CASES['same_key']}),patch.object(p.d,'assert_catalog_sql',return_value='SELECT 1;'):
            calls=[]
            output=p.golden('same_key').read_text().replace('t\n','f\n',1)
            with self.assertRaises(RuntimeError):
                p.run_schedules(lambda _:subprocess.CompletedProcess([],0,output,''),calls.append,{},'SELECT 1;',lambda *_:None)
            self.assertEqual(len(calls),1)

    def test_success_cleanup_is_scoped_and_verified_before_commit(self):
        with patch.object(p.d,'assert_catalog_sql',return_value='SELECT 1;'):
            sql=p.cleanup_sql({})
        self.assertTrue(sql.startswith('BEGIN;'))
        self.assertTrue(sql.endswith('COMMIT;'))
        self.assertIn("WHERE id='"+p.P+"'",sql)
        self.assertLess(sql.index('$empty$'),sql.rindex('COMMIT;'))
        self.assertNotRegex(sql,r'(?i)TRUNCATE|DELETE FROM auth|DELETE FROM public.profiles')

    def test_reviewed_transcripts_have_expected_errors_and_blocking(self):
        for case in p.CASES:
            text=p.golden(case).read_text()
            p.validate_errors(case,text)
            self.assertEqual(p.normalize_output(text),text)


class Phase5Wrapper(unittest.TestCase):
    def run_mode(self,extra,exists=False):
        with tempfile.TemporaryDirectory() as tmp,patch.object(c.reviewed,'main'),patch.dict(os.environ,{
          'ODDGRID_DEV_DATABASE_URL':'postgresql://postgres.'+c.reviewed.restore_plan.DEV_REF+'@aws-1-fixture.pooler.supabase.com:5432/postgres',
          'ODDGRID_DEV_DB_PASSWORD':'synthetic'}),patch.object(c.m,'folder',return_value=Path(tmp)),patch.object(c.m,'verify') as verify,patch.object(c.m,'expected',return_value={}),patch.object(c.m,'inspect_state',return_value={}),patch.object(c.reviewed.setup,'read_bundle',return_value=('',{'catalog':{}})),patch.object(c.reviewed.setup,'psql',return_value='t') as sql,patch.object(Path,'is_file',return_value=True):
            if exists: (Path(tmp)/'phase5-execution.json').write_text('{}')
            c.main(['--reviewed-commit','a'*40]+extra)
            return verify.call_args,sql.call_args_list

    def test_default_readonly_and_original_migration_evidence_binding(self):
        verify,sql=self.run_mode([])
        self.assertEqual(verify.args[-1],c.MIGRATION_COMMIT)
        self.assertTrue(all(x.kwargs.get('readonly',True) for x in sql))

    def test_wrong_approval_stops_before_writes(self):
        with self.assertRaises(ValueError): self.run_mode(['--execute','--approval','test-checkout:wrong'])

    def test_prior_intent_blocks_retry(self):
        with self.assertRaises(ValueError): self.run_mode([],True)
