#!/usr/bin/env python3
"""Development READ ONLY. Prints sanitized evidence/verification; never runs tests."""
import argparse
import json
import os
from pathlib import Path
import codespace_restore as reviewed
import migration_plan as m
import launch_audit as a


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit',required=True)
    args=parser.parse_args(argv)
    reviewed.main(['--reviewed-commit',args.reviewed_commit])
    d=reviewed.setup; r=reviewed.restore_plan
    c=d.endpoint(os.environ['ODDGRID_DEV_DATABASE_URL'],r.DEV_REF,development=True)
    pw=os.environ['ODDGRID_DEV_DB_PASSWORD']
    report=a.evidence(m.folder())
    wanted=a.protected_catalogue(m.expected())
    checks={}
    def check(name,operation):
        try: checks[name]=bool(operation())
        except Exception: checks[name]=False
    check('post_security_catalogue_and_empty_app',lambda: d.psql(c,pw,'BEGIN READ ONLY;'+d.state_guard(require_baseline=True)+d.assert_catalog_sql(wanted)+m.effective_acl_sql()+d.empty_records_guard(['public','private'])+'ROLLBACK;') is not None)
    check('effective_profile_column_privileges',lambda:a.valid_profile_privileges(json.loads(d.psql(c,pw,a.profile_privileges_sql()))))
    original=json.loads((m.folder()/'execution.json').read_text())
    if original.get('project_ref')!=r.DEV_REF or original.get('commit')!='0477c1c14e39dbfee8cf6cd05018ca217ce710cf' or original.get('baseline_sha')!=r.BASELINE_SHA or original.get('migration_sha')!=m.MIGRATION_SHA or original.get('expected_sha')!=m.EXPECTED_SHA:
        raise ValueError('Original migration evidence binding mismatch')
    source=d.read_bundle(Path.home()/'oddgrid-schema-private')[1]['catalog']
    state=m.inspect_state(d,c,pw,source)
    checks['auth_count_matches_original']=state['auth_count']==original['state']['auth_count']
    checks['sequences_match_original']=state['sequences']==original['state']['sequences']
    checks['managed_fingerprint_matches_original']=state['managed']==original['state']['managed']
    report['managed_changed_components']=[k for k in state['managed'] if state['managed'][k]!=original['state']['managed'].get(k)]
    report['checks']=checks
    report['current_development']='VERIFIED' if all(checks.values()) else 'FAILED: preserve evidence and investigate differences read-only'
    print(json.dumps(report,sort_keys=True,indent=2))
    print('Current integrity verification does NOT certify the failed original Phase5 test run.')
    if not all(checks.values()): raise SystemExit(1)


if __name__=='__main__':
    try: main()
    except Exception:
        print('Read-only launch audit failed; no cleanup, retry, migration or fixture writes attempted. Raw diagnostics suppressed.')
        raise SystemExit(1)
