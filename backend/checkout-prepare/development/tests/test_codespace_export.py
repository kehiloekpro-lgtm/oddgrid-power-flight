"""Codespaces context tests: no GitHub or database connections."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('codespace_export', BASE / 'cloud/codespace_export.py')
cloud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cloud)
REVISION = 'a' * 40


class CodespaceExportSafety(unittest.TestCase):
    def environment(self):
        return {'CODESPACES': 'true', 'GITHUB_REPOSITORY': cloud.REPOSITORY,
                'ODDGRID_SOURCE_DATABASE_URL': f'postgresql://postgres@db.{cloud.SOURCE}.supabase.co/postgres'}

    def test_clean_reviewed_source_codespace_allowed(self):
        cloud.validate_context(self.environment(), REVISION, REVISION, cloud.BRANCH, '')

    def test_wrong_workspace_commit_branch_edits_and_source_endpoint_rejected(self):
        for key, value in [('CODESPACES','false'), ('GITHUB_REPOSITORY','other/repo'),
                           ('ODDGRID_DEV_DB_PASSWORD','unneeded'),
                           ('ODDGRID_SOURCE_DATABASE_URL',f'postgresql://postgres@db.{cloud.DEVELOPMENT}.supabase.co/postgres')]:
            env = self.environment(); env[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                cloud.validate_context(env, REVISION, REVISION, cloud.BRANCH, '')
        for reviewed, head, branch, dirty in [(REVISION,'b'*40,cloud.BRANCH,''),
                                               ('main',REVISION,cloud.BRANCH,''),
                                               (REVISION,REVISION,'main',''),
                                               (REVISION,REVISION,cloud.BRANCH,' M modified.py')]:
            with self.subTest(branch=branch,dirty=dirty), self.assertRaises(ValueError):
                cloud.validate_context(self.environment(), reviewed, head, branch, dirty)

    def test_default_preflight_never_connects_or_prompts(self):
        with patch.dict(cloud.os.environ,self.environment(),clear=True), \
                patch.object(cloud.subprocess,'check_output',side_effect=[REVISION,cloud.BRANCH,'']), \
                patch.object(cloud.shutil,'which',return_value='/cloud/tool'), \
                patch.object(cloud.setup,'run',return_value='Docker healthy'), \
                patch.object(cloud.setup,'main') as export:
            cloud.main(['--reviewed-commit',REVISION])
            export.assert_not_called()

    def test_missing_credentials_never_enters_existing_exporter(self):
        with patch.dict(cloud.os.environ,self.environment(),clear=True), \
                patch.object(cloud.subprocess,'check_output',side_effect=[REVISION,cloud.BRANCH,'']), \
                patch.object(cloud.shutil,'which',return_value='/cloud/tool'), \
                patch.object(cloud.setup,'run',return_value='Docker healthy'), \
                patch.object(cloud.setup,'main') as export:
            with self.assertRaises(ValueError): cloud.main(['--reviewed-commit',REVISION,'--execute','--approval',cloud.ACK])
            export.assert_not_called()

    def test_manual_devcontainer_has_no_database_or_frontend_startup(self):
        root = BASE.parents[2]
        config = json.loads((root/'.devcontainer/oddgrid-export/devcontainer.json').read_text())
        for key in ['postCreateCommand','postStartCommand','postAttachCommand','initializeCommand']:
            self.assertNotIn(key,config)
        self.assertIn('ghcr.io/devcontainers/features/docker-in-docker:4.1.3',config['features'])
        self.assertNotIn('secrets',config)
        self.assertEqual(config['otherPortsAttributes']['onAutoForward'],'ignore')


if __name__ == '__main__': unittest.main()
