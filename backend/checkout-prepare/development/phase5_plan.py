"""Controlled post-migration tests. No hosted operation is executed on import."""
import hashlib
import json
import re
import subprocess
from pathlib import Path
import database_setup as d
import migration_plan as m

HERE = Path(__file__).resolve().parent
IMAGE = d.DUMP_IMAGE
TESTER = '/usr/lib/postgresql/17/lib/pgxs/src/test/isolation/isolationtester'
P = 'a1000000-0000-4000-8000-000000000001'
V = 'a2000000-0000-4000-8000-000000000001'
C = 'a3000000-0000-4000-8000-000000000001'
C2 = 'a3000000-0000-4000-8000-000000000002'
K = 'a5000000-0000-4000-8000-000000000001'

# Reuse six deterministic schedules verbatim. The seventh (deliberate tuple/cart
# lock inversion with retry) is deferred: deadlock victim selection is not stable.
CASES = {
 'same_key': ('first_begin first_prepare retry_begin retry_prepare first_commit retry_commit',1,600,2,300),
 'price_after': ('first_begin first_prepare price_begin price_update first_commit price_commit',1,600,2,300),
 'price_before': ('price_begin price_update first_begin first_prepare price_commit first_commit',1,800,2,400),
 'quantity_after': ('first_begin first_prepare edit_begin edit_quantity first_commit edit_commit retry_begin retry_prepare retry_commit',1,600,2,300),
 'cross_cart_key': ('first_begin first_prepare foreign_begin foreign_prepare first_commit foreign_commit',1,600,2,300),
 'quantity_before': ('edit_begin edit_quantity first_begin first_prepare edit_commit first_commit',1,900,3,300),
 'different_keys': ('first_begin first_prepare retry_begin other_prepare first_commit retry_commit',2,600,2,300),
 'availability_after': ('first_begin first_prepare price_begin unavailable first_commit price_commit',1,600,2,300),
 'availability_before': ('price_begin unavailable first_begin first_prepare price_commit first_commit',0,0,0,0),
 'insert_after': ('first_begin first_prepare edit_begin insert_item first_commit edit_commit',1,600,2,300),
 'insert_before': ('edit_begin insert_item first_begin first_prepare edit_commit first_commit',1,700,2,300),
 'delete_after': ('first_begin first_prepare edit_begin delete_item first_commit edit_commit',1,600,2,300),
 'wrong_guest': ('first_begin first_prepare retry_begin wrong_prepare first_commit retry_commit',1,600,2,300),
}


def functional(source):
    locks=''.join('LOCK TABLE '+t['name']+' IN ACCESS EXCLUSIVE MODE;' for t in sorted(source['relations'],key=lambda t:t['name']) if t['kind'] in ('r','p'))
    body=d.transaction_body((d.TESTS/'checkout.sql').read_text(),'ROLLBACK')
    staff=(HERE/'tests/real_staff.sql').read_text()
    # Inject while existing pg_temp.prepare/assert/reject helpers and owner cart exist.
    marker='-- Changed-cart key reuse rejected;'
    if body.count(marker)!=1: raise ValueError('Existing functional suite changed')
    body=body.replace(marker,staff+'\n'+marker)
    return ("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';"+
            d.state_guard(require_baseline=True)+locks+d.assert_catalog_sql(source)+
            d.empty_records_guard(['public','private'])+
            "SET LOCAL oddgrid.supabase_development_test='yes';"+
            (d.TESTS/'before-migration.sql').read_text()+body+'ROLLBACK;')


def spec(case,guard):
    schedule,count,total,qty,price=CASES[case]
    original=(d.TESTS/'checkout-concurrency.spec').read_text()
    # Explicit source-format guards prevent silently dropping changed coverage.
    setup=original.split('setup\n{\n',1)[1].split('\n}\nteardown',1)[0]
    old=""" DO $$ BEGIN
   IF current_database() <> 'oddgrid_checkout_isolated' THEN
     RAISE EXCEPTION 'Dedicated isolated database required';
   END IF;
 END $$;"""
    if setup.count(old)!=1: raise ValueError('Existing isolation guard changed')
    setup=setup.replace(old,guard,1)
    sessions=original.split('session "first"',1)[1].split('# Retry waits',1)[0]
    # Never emit random checkout UUIDs into expected results.
    sessions=re.sub(r'(SELECT public\.checkout_prepare_bridge\([^;]+\));',r'\1 IS NOT NULL AS prepared;',sessions)
    template=sessions.split('step "retry_prepare" { ',1)[1].split(' }',1)[0]
    other=template.replace(K,'a5000000-0000-4000-8000-000000000002')
    wrong=template.replace('a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002')
    sessions=sessions.replace('step "retry_commit"',f'step "other_prepare" {{ {other} }}\nstep "wrong_prepare" {{ {wrong} }}\nstep "retry_commit"')
    sessions=sessions.replace('step "price_commit"',f"step \"unavailable\" {{ UPDATE public.product_variants SET availability='available_to_order' WHERE id='{V}'; }}\nstep \"price_commit\"")
    sessions=sessions.replace('step "edit_commit"',f"step \"insert_item\" {{ INSERT INTO public.cart_items(cart_id,product_id,quantity) VALUES ('{C}','{P}',1); }}\nstep \"delete_item\" {{ DELETE FROM public.cart_items WHERE cart_id='{C}'; }}\nstep \"edit_commit\"")
    # Each invocation runs exactly one schedule; omit unused steps/sessions rather
    # than suppressing diagnostics from isolationtester.
    selected=set(schedule.split())
    active=[]
    for block in re.split(r'(?=session ")','session "first"'+sessions):
        if not block.strip(): continue
        header=block.split('\n',1)[0]
        steps=[match.group(0) for match in re.finditer(r'step "([^\"]+)" \{[^}]*\}',block) if match.group(1) in selected]
        if steps: active.append(header+'\n'+'\n'.join(steps))
    sessions='\n\n'.join(active)
    invariant=f"""DO $$ BEGIN
 IF (SELECT count(*) FROM public.checkout_sessions) <> {count} OR EXISTS (
 SELECT 1 FROM public.checkout_sessions cs WHERE cs.cart_id <> '{C}' OR cs.subtotal <> {total}
 OR cs.total_amount <> cs.subtotal OR cs.currency <> 'USD' OR cs.shipping_amount<>0 OR cs.tax_amount<>0 OR cs.discount_amount<>0
 OR cs.subtotal IS DISTINCT FROM (SELECT sum(line_total) FROM public.checkout_items i WHERE i.checkout_session_id=cs.id)
 OR (SELECT count(*) FROM public.checkout_items i WHERE i.checkout_session_id=cs.id) <> {2 if case=='insert_before' else 1})
 OR EXISTS (SELECT 1 FROM public.checkout_items WHERE variant_id IS NOT NULL AND
 (variant_id <> '{V}' OR variant_name <> 'Selected' OR unit_price <> {price} OR quantity <> {qty}))
 OR EXISTS(SELECT 1 FROM public.checkout_items GROUP BY checkout_session_id,product_id,variant_id HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Phase5 duplicate/partial/incorrect snapshot'; END IF;
 END $$;"""
    return ('setup\n{\nBEGIN;'+setup+'\nCOMMIT;\n}\nteardown\n{\n'+invariant+'\n}\n'+sessions+
            '\npermutation '+' '.join('"'+s+'"' for s in schedule.split())+'\n')


def cleanup_sql(source):
    # Normal success path ONLY, never called on unexpected runner output/failure.
    return ('BEGIN; SET LOCAL lock_timeout=\'5s\';'+d.assert_catalog_sql(source)+
        f"DELETE FROM public.checkout_items WHERE checkout_session_id IN (SELECT id FROM public.checkout_sessions WHERE cart_id IN ('{C}','{C2}'));"+
        f"DELETE FROM public.checkout_sessions WHERE cart_id IN ('{C}','{C2}');"+
        f"DELETE FROM public.cart_items WHERE cart_id IN ('{C}','{C2}'); DELETE FROM public.carts WHERE id IN ('{C}','{C2}');"+
        f"DELETE FROM public.product_variants WHERE id='{V}'; DELETE FROM public.products WHERE id='{P}';"+
        d.empty_records_guard(['public','private'])+'COMMIT;')


def docker_command():
    # Secret VALUES never appear in argv. Docker takes only these env variable names.
    return ['docker','run','--rm','-i','--network','host','--read-only','--cap-drop','ALL',
            '--security-opt','no-new-privileges','--user','postgres']+sum((['-e',k] for k in
            ['PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT','PGAPPNAME','PGOPTIONS']),[])+['--entrypoint',TESTER,IMAGE,'dbname=postgres']


def golden(case): return HERE/'tests/phase5_expected'/f'{case}.out'


def validate_errors(case,output):
    allowed={
      'quantity_after':['Idempotency key reused with a changed cart'],
      'cross_cart_key':['Idempotency key reused with different checkout details'],
      'availability_before':['Cart contains invalid or unavailable products'],
      'wrong_guest':['Cart not found or unauthorized'],
    }.get(case,[])
    errors=re.findall(r'ERROR:\s*([^\n]+)',output)
    if errors!=allowed: raise RuntimeError('Unexpected SQL errors; stop without cleanup')
    if '<waiting ...>' not in output: raise RuntimeError('Expected blocking not observed')


def run_schedules(run,sql,source,guard,record,generate=False):
    for case in CASES:
        sql('BEGIN READ ONLY;'+d.assert_catalog_sql(source)+d.empty_records_guard(['public','private'])+'ROLLBACK;')
        result=run(spec(case,guard))
        record(case,result.stdout+'\n'+result.stderr)
        if result.returncode or result.stderr.strip(): raise RuntimeError('Isolation runner failed; stop without cleanup')
        validate_errors(case,result.stdout)
        if generate:
            # This option is used only by the network-disabled isolated driver.
            golden(case).parent.mkdir(exist_ok=True)
            golden(case).write_text(result.stdout)
        elif result.stdout!=golden(case).read_text():
            raise RuntimeError('Concurrency transcript differs; stop without cleanup')
        sql(cleanup_sql(source))
        print('PASS concurrency schedule: '+case,flush=True)
