"""Isolated synthetic pipeline tests; no source dump, Docker, CLI or database access."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('export_setup', BASE/'database_setup.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
INVENTORY = {'schemas':[{'name':'private'},{'name':'public'}],
             'schema_candidates':['private','public'],'server_major':17,
             'managed_policies':[],'managed_custom_triggers':[]}
URL = 'postgresql://postgres@db.'+m.SOURCE_REF+'.supabase.co/postgres'


class ExportPipeline(unittest.TestCase):
    def pipeline(self, root, failure=None, after=None):
        folder = root/'synthetic-export'
        def command(argv, env, text=None):
            if '--version' in argv:
                if failure == 'client': raise m.CommandFailure('docker_image_unavailable',125)
                return 'pg_dump (PostgreSQL) 17.6'
            self.assertEqual(argv[0], 'docker')
            self.assertNotIn('SUPABASE_ACCESS_TOKEN',env)
            self.assertEqual(env['PGSSLMODE'],'require')
            self.assertIn('default_transaction_read_only=on',env['PGOPTIONS'])
            if failure == 'dump': raise m.CommandFailure('network_unavailable',1)
            (folder/'schema.sql').write_text('INSERT INTO forbidden VALUES (1);' if failure == 'sql' else 'CREATE SCHEMA private;\nCREATE SCHEMA public;\n')
            return ''
        before = copy.deepcopy(INVENTORY)
        if failure == 'selection': before['schema_candidates'].append('needs_review')
        result = io.StringIO()
        with patch.object(m,'catalog',side_effect=[before,after or before]), \
                patch.object(m,'run',side_effect=command) as run, contextlib.redirect_stdout(result):
            try:
                m.export_schema(m.endpoint(URL,m.SOURCE_REF),'synthetic-password',['private','public'],folder)
                error = None
            except m.ExportFailure as caught: error = caught
        return folder,error,json.loads((root/'oddgrid-export-status.json').read_text()),result.getvalue(),run

    def test_complete_private_bundle_verified_and_checksum_matches(self):
        with tempfile.TemporaryDirectory() as root:
            folder,error,report,output,run = self.pipeline(Path(root))
            self.assertIsNone(error)
            sha = m.verify_private_bundle(folder)
            self.assertEqual(report['events'][-1],{'stage':'complete','status':'passed','schema_sha256':sha})
            self.assertIn(sha,output)
            self.assertEqual((folder/'schema.sql').stat().st_mode & 0o777,0o600)
            self.assertEqual((Path(root)/'oddgrid-export-status.json').stat().st_mode & 0o777,0o600)
            self.assertEqual(run.call_count,2)

    def test_failure_stage_survives_cleanup_and_stops_without_retries(self):
        for failure,stage in [('selection','schema-selection'),('client','pg-dump-client'),('dump','schema-dump'),('sql','schema-safety-validation')]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as root:
                folder,error,report,output,run = self.pipeline(Path(root),failure)
                self.assertEqual(error.stage,stage)
                self.assertEqual(report['events'][-1]['stage'],stage)
                self.assertEqual(report['events'][-1]['status'],'failed')
                self.assertFalse(folder.exists())
                self.assertNotIn('synthetic-password',json.dumps(report)+output)
                self.assertNotIn(URL,json.dumps(report)+output)
                self.assertLessEqual(run.call_count,2)

    def test_changed_metadata_rejects_and_removes_dump(self):
        after=copy.deepcopy(INVENTORY); after['schema_candidates'].append('new-schema')
        with tempfile.TemporaryDirectory() as root:
            folder,error,report,output,run=self.pipeline(Path(root),after=after)
            self.assertEqual(error.stage,'source-metadata-consistency')
            self.assertFalse(folder.exists())

    def test_existing_private_bundle_never_deleted(self):
        with tempfile.TemporaryDirectory() as root:
            folder=Path(root)/'synthetic-export'; folder.mkdir()
            (folder/'keep').write_text('existing')
            with self.assertRaises(m.ExportFailure),contextlib.redirect_stdout(io.StringIO()):
                m.export_schema({},'',['private','public'],folder)
            self.assertEqual((folder/'keep').read_text(),'existing')

    def test_command_has_no_credentials_or_destructive_or_data_flags(self):
        argv=m.schema_dump_command(Path('/private/synthetic'),['private','public'])
        self.assertIn('--schema-only',argv)
        self.assertIn('--strict-names',argv)
        self.assertIn(m.DUMP_IMAGE,argv)
        self.assertIn('--entrypoint',argv)
        for key in ['PGPASSWORD','PGSSLMODE','PGOPTIONS']: self.assertIn(key,argv)
        for forbidden in ['--no-owner','--no-acl','--no-privileges','--data-only','--clean','--create','--linked']:
            self.assertNotIn(forbidden,argv)
        self.assertFalse(any('postgresql://' in arg for arg in argv))

    def test_raw_subprocess_diagnostics_never_escape(self):
        raw='forbidden 403 postgresql://postgres:sensitive@host/db sb_secret_hidden'
        with patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess([],1,stdout=raw,stderr=raw)):
            with self.assertRaises(m.CommandFailure) as caught: m.run(['synthetic'],{})
        self.assertEqual(caught.exception.category,'permission_denied')
        self.assertNotIn(raw,str(caught.exception))
        self.assertFalse(hasattr(caught.exception,'stderr'))


if __name__=='__main__': unittest.main()
