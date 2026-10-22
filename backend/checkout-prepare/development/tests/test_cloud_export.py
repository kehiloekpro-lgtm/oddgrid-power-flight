"""Cloud export boundary tests. No service calls, credentials, or hosted database writes."""
import importlib.util
import json
import tempfile
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cloud_export', BASE / 'cloud/run_export.py')
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)
setup = cloud.setup
REVISION = 'a' * 40


class CloudExportSafety(unittest.TestCase):
    def context(self):
        repo = 'example/isolated-private-operations'
        return ({'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                 'GITHUB_REPOSITORY': repo, 'EXPORT_RUNNER_REPOSITORY': repo,
                 'GITHUB_REF': 'refs/heads/operations',
                 'SOURCE_DATABASE_URL': f'postgresql://postgres@db.{cloud.SOURCE}.supabase.co/postgres'},
                {'repository': {'private': True, 'full_name': repo, 'default_branch': 'operations'},
                 'inputs': {'approval': cloud.ACK, 'source_revision': REVISION, 'schemas': 'public,private'}})

    def test_private_manual_exact_revision_context(self):
        env, event = self.context()
        self.assertEqual(cloud.validate_context(env, event, REVISION)['source_revision'], REVISION)

    def test_public_wrong_repository_automatic_event_unapproved_or_wrong_revision_rejected(self):
        mutations = [
            ('event', 'private', False), ('env', 'GITHUB_ACTIONS', 'false'),
            ('env', 'GITHUB_EVENT_NAME', 'push'), ('env', 'GITHUB_REF', 'refs/heads/unreviewed'),
            ('env', 'GITHUB_REPOSITORY', 'different/repository'),
            ('env', 'EXPORT_RUNNER_REPOSITORY', ''),
            ('input', 'approval', ''), ('input', 'source_revision', 'main'),
            ('input', 'schemas', 'public,private,auth'),
            ('env', 'SOURCE_DATABASE_URL', f'postgresql://postgres@db.{cloud.DEVELOPMENT}.supabase.co/postgres'),
            ('env', 'SOURCE_DATABASE_URL', f'postgresql://postgres:password@db.{cloud.SOURCE}.supabase.co/postgres'),
        ]
        for kind, key, value in mutations:
            env, event = self.context()
            if kind == 'env': env[key] = value
            elif kind == 'input': event['inputs'][key] = value
            else: event['repository'][key] = value
            with self.subTest(kind=kind,key=key), self.assertRaises(ValueError):
                cloud.validate_context(env, event, REVISION)
        env, event = self.context()
        with self.assertRaises(ValueError): cloud.validate_context(env, event, 'b' * 40)

    def test_existing_public_storefront_never_runner(self):
        env, event = self.context()
        repo = 'kehiloekpro-lgtm/oddgrid-power-flight'
        env['GITHUB_REPOSITORY'] = env['EXPORT_RUNNER_REPOSITORY'] = repo
        event['repository']['full_name'] = repo
        with self.assertRaises(ValueError): cloud.validate_context(env, event, REVISION)

    def test_managed_trigger_actual_definition_and_enable_mode_preserved(self):
        definition = 'CREATE TRIGGER "on_auth_user_created" AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()'
        for mode, clause in [('O','ENABLE'), ('D','DISABLE'), ('A','ENABLE ALWAYS'), ('R','ENABLE REPLICA')]:
            inventory = {'managed_policies': [], 'managed_custom_triggers': [['auth','users','on_auth_user_created',definition,mode]]}
            sql = setup.managed_attachments(inventory)
            self.assertIn(definition + ';', sql)
            self.assertIn(f'ALTER TABLE "auth"."users" {clause} TRIGGER "on_auth_user_created";', sql)
            self.assertNotIn('CREATE TABLE', sql)
            self.assertNotIn('INSERT INTO', sql)

    def test_unhandled_managed_metadata_or_embedded_credentials_stop_export(self):
        with self.assertRaises(ValueError): setup.managed_attachments({'managed_policies': [['auth','users','unknown']], 'managed_custom_triggers': []})
        with self.assertRaises(ValueError): setup.managed_attachments({'managed_policies': [], 'managed_custom_triggers': [['auth','users','t','CREATE TRIGGER t','unknown']]})
        with self.assertRaises(ValueError): setup.managed_attachments({'managed_policies': [], 'managed_custom_triggers': [['auth','users','t',"CREATE TRIGGER t AFTER INSERT ON auth.users EXECUTE FUNCTION f('postgresql://postgres:secret@host/postgres')",'O']]})

    def test_export_sql_bytes_and_literal_line_endings_preserved(self):
        raw = "CREATE FUNCTION public.line_endings() RETURNS text LANGUAGE sql AS $$ SELECT 'one\r\ntwo'::text; $$;\r\n"
        with tempfile.TemporaryDirectory(prefix='oddgrid-unit-sql-') as folder:
            path = Path(folder)/'synthetic.sql'
            setup.write_private(path, raw)
            self.assertEqual(path.read_bytes(), raw.encode('utf-8'))
            self.assertEqual(setup.read_sql(path), raw)
            self.assertIn("SELECT 'one\r\ntwo'::text;", setup.schema_sql(raw))

    def test_attachment_bundle_tampering_rejected(self):
        # Synthetic unit fixture only; not a source schema export.
        with tempfile.TemporaryDirectory(prefix='oddgrid-unit-bundle-') as folder:
            folder = Path(folder)
            raw = 'CREATE SCHEMA public;'
            attachment = setup.managed_attachments({'managed_policies': [], 'managed_custom_triggers': []})
            (folder/'schema.sql').write_text(raw)
            (folder/'managed-schema-attachments.sql').write_text(attachment)
            (folder/'manifest.json').write_text(json.dumps({
                'source_ref': setup.SOURCE_REF, 'schema_sha256': setup.digest(raw),
                'managed_attachments_sha256': setup.digest(attachment)}))
            self.assertEqual(setup.read_bundle(folder)[0], raw)
            (folder/'managed-schema-attachments.sql').write_text(attachment + '-- tampered')
            with self.assertRaises(ValueError): setup.read_bundle(folder)

    def test_workflow_is_dormant_private_manual_export_only(self):
        workflow = (BASE / 'cloud/schema-export.workflow.yml').read_text()
        self.assertIn('workflow_dispatch:', workflow)
        for forbidden in ['  push:', '  pull_request:', '  schedule:', 'apply-migration', 'db push', 'db reset', 'ODDGRID_DEV_DB_PASSWORD']:
            self.assertNotIn(forbidden, workflow)
        self.assertIn('github.event.repository.private == true', workflow)
        self.assertIn('retention-days: 1', workflow)
        self.assertIn('persist-credentials: false', workflow)
        self.assertIn('if: always()', workflow)
        self.assertIn('permissions:\n  contents: read', workflow)
        self.assertFalse((setup.ROOT / '.github/workflows/oddgrid-schema-export.yml').exists())
        self.assertEqual(cloud.DEVELOPMENT, 'ogbnpvroaafgpnlxeftw')
        # This wrapper exposes no arbitrary action/input dispatch to the powerful old CLI.
        self.assertIn("setup.main(['export'", (BASE / 'cloud/run_export.py').read_text())


if __name__ == '__main__': unittest.main()
