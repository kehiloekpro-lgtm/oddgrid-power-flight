import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import launch_audit as a
import phase5_plan as p


class LaunchAudit(unittest.TestCase):
    def test_pooler_identity_or_ignored_timeouts_cannot_authorize_fixtures(self):
        good={'transport_pid_matches_server':True,'statement_timeout':'20s','lock_timeout':'15s','idle_timeout':'30s','read_only':'on'}
        p.validate_runtime(good)
        for key,value in [('transport_pid_matches_server',False),('statement_timeout','2min'),('lock_timeout','0'),('idle_timeout','0')]:
            with self.assertRaises(ValueError): p.validate_runtime({**good,key:value})

    def test_profile_delta_is_only_two_reviewed_grants_and_not_input_mutation(self):
        old={'relations':[{'name':'public.profiles','acl':[['anon','UPDATE',False],['authenticated','UPDATE',False],['postgres','UPDATE',False]]}]}
        new=a.protected_catalogue(old)
        self.assertEqual(new['relations'][0]['acl'],[['postgres','UPDATE',False]])
        self.assertEqual(len(old['relations'][0]['acl']),3)
        with self.assertRaises(ValueError): a.protected_catalogue(new)

    def test_complete_evidence_requires_every_exact_transcript_and_no_stderr(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            f=root/'phase5-execution.json'
            f.write_text(json.dumps({'project_ref':'ogbnpvroaafgpnlxeftw','migration_commit':'0477c1c14e39dbfee8cf6cd05018ca217ce710cf','migration_sha':a.m.MIGRATION_SHA,'expected_sha':a.m.EXPECTED_SHA,'reviewed_commit':a.ORIGINAL_TEST_COMMIT,'completed':['13 schedules, success-only cleanup and independent verification']})); f.chmod(0o600)
            self.assertFalse(a.evidence(root)['original_phase5_complete'])
            for case in p.CASES:
                f=root/('phase5-'+case+'.txt'); f.write_text(p.golden(case).read_text()+'\n'); f.chmod(0o600)
            self.assertTrue(a.evidence(root)['original_phase5_complete'])
            f.write_text(f.read_text()+'unexpected stderr\n')
            self.assertFalse(a.evidence(root)['original_phase5_complete'])

    def test_exact_effective_column_matrix_and_missing_roles_rejected(self):
        columns=['id','role','first_name','last_name','phone','created_at','updated_at']
        rows=[{'role':r,'column':c,'update':r in ['postgres','service_role'] or (r=='authenticated' and c in ['first_name','last_name','phone'])} for r in ['anon','authenticated','service_role','postgres'] for c in columns]
        self.assertTrue(a.valid_profile_privileges(rows))
        rows[8]['update']=True  # authenticated role column must remain denied
        self.assertFalse(a.valid_profile_privileges(rows))

    def test_sanitized_missing_evidence_is_not_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            result=a.evidence(Path(tmp))
            self.assertFalse(result['original_phase5_complete'])
            self.assertTrue(all(v=='MISSING' for v in result['transcripts'].values()))
