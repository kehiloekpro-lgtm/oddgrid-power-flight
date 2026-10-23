"""Read-only evidence and narrowly scoped post-security catalogue audit."""
import copy
import hashlib
import json
import migration_plan as m

ORIGINAL_TEST_COMMIT='13dcbf60b0d9e200a96d00dd35d364e07b4a6391'


def protected_catalogue(original):
    """Expected TABLE ACL delta from the reviewed role correction, not new DDL.

    Historical catalog.sql omits attacl; column permissions require the independent
    effective privilege matrix below. Never bless a fresh hosted inventory as truth.
    """
    result=copy.deepcopy(original)
    profiles=next(t for t in result['relations'] if t['name']=='public.profiles')
    for role in ('anon','authenticated'):
        if profiles['acl'].count([role,'UPDATE',False])!=1:
            raise ValueError('Unexpected original profile ACL')
        profiles['acl'].remove([role,'UPDATE',False])
    return result


def evidence(folder):
    result={}
    for name in ('execution.json','phase5-execution.json'):
        path=folder/name
        if not path.exists(): result[name]={'present':False}; continue
        m.check_private(path)
        value=json.loads(path.read_text())
        result[name]={'present':True,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            **{k:value[k] for k in ('project_ref','commit','reviewed_commit','migration_commit','baseline_sha','migration_sha','expected_sha','completed') if k in value}}
    import phase5_plan as p
    matches={}
    for case in p.CASES:
        path=folder/('phase5-'+case+'.txt')
        if not path.exists(): matches[case]='MISSING'; continue
        m.check_private(path)
        # Original writer adds a separating newline followed by stderr. Compare
        # stdout against the exact reviewed synthetic transcript; do not strip
        # arbitrary errors or normalize away meaningful missing/extra lines.
        actual=path.read_text()
        wanted=p.golden(case).read_text()
        matches[case]='MATCH' if actual.endswith('\n') and p.normalize_output(actual[:-1])==wanted else 'MISMATCH_OR_STDERR'
    result['transcripts']=matches
    receipt=result.get('phase5-execution.json',{})
    bound=(receipt.get('project_ref')=='ogbnpvroaafgpnlxeftw' and receipt.get('migration_commit')=='0477c1c14e39dbfee8cf6cd05018ca217ce710cf' and receipt.get('migration_sha')==m.MIGRATION_SHA and receipt.get('expected_sha')==m.EXPECTED_SHA)
    result['original_phase5_complete']=bool(bound and receipt.get('reviewed_commit')==ORIGINAL_TEST_COMMIT and receipt.get('completed',[])[-1:]==['13 schedules, success-only cleanup and independent verification'] and all(v=='MATCH' for v in matches.values()))
    return result


def profile_privileges_sql():
    return """BEGIN READ ONLY; SELECT jsonb_agg(jsonb_build_object('role',r.role,'column',a.attname,'update',has_column_privilege(r.role,'public.profiles',a.attname,'UPDATE')) ORDER BY r.role,a.attnum)
 FROM pg_attribute a CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role'),('postgres')) r(role)
 WHERE a.attrelid='public.profiles'::regclass AND a.attnum>0 AND NOT a.attisdropped; ROLLBACK;"""


def valid_profile_privileges(rows):
    allowed={'first_name','last_name','phone'}
    columns={r['column'] for r in rows}
    if columns!={'id','role','first_name','last_name','phone','created_at','updated_at'}: return False
    if len(rows)!=28: return False
    if {(r['role'],r['column']) for r in rows}!={(r,c) for r in ('anon','authenticated','service_role','postgres') for c in columns}: return False
    return all(r['update']==(r['role'] in ('postgres','service_role') or (r['role']=='authenticated' and r['column'] in allowed)) for r in rows)
