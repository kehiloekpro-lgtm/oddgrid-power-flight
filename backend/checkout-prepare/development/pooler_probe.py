"""Read-only libpq identity/timeout probe. No fixture SQL or connection strings in output."""
import ctypes
import ctypes.util
import json


def probe():
    path=ctypes.util.find_library('pq')
    if not path: raise RuntimeError('libpq unavailable')
    lib=ctypes.CDLL(path)
    signatures={
      'PQconnectdb':(ctypes.c_void_p,[ctypes.c_char_p]),
      'PQstatus':(ctypes.c_int,[ctypes.c_void_p]),
      'PQbackendPID':(ctypes.c_int,[ctypes.c_void_p]),
      'PQexec':(ctypes.c_void_p,[ctypes.c_void_p,ctypes.c_char_p]),
      'PQresultStatus':(ctypes.c_int,[ctypes.c_void_p]),
      'PQgetvalue':(ctypes.c_char_p,[ctypes.c_void_p,ctypes.c_int,ctypes.c_int]),
      'PQclear':(None,[ctypes.c_void_p]),
      'PQfinish':(None,[ctypes.c_void_p]),
    }
    for name,(result,args) in signatures.items():
        fn=getattr(lib,name); fn.restype=result; fn.argtypes=args
    connection=lib.PQconnectdb(b'')  # only validated/sanitized PG* process environment
    def execute(sql,rows=False):
        result=lib.PQexec(connection,sql.encode())
        try:
            if not result or lib.PQresultStatus(result)!=(2 if rows else 1):
                raise RuntimeError('Read-only libpq probe failed')
            return json.loads(lib.PQgetvalue(result,0,0).decode()) if rows else None
        finally:
            if result: lib.PQclear(result)
    try:
        if not connection or lib.PQstatus(connection)!=0: raise RuntimeError('Read-only connection failed')
        execute('BEGIN READ ONLY;')
        row=execute("SELECT jsonb_build_object('pid',pg_backend_pid(),'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout'),'idle_timeout',current_setting('idle_in_transaction_session_timeout'),'read_only',current_setting('transaction_read_only'))::text",True)
        execute('ROLLBACK;')
        return {'transport_pid_matches_server':lib.PQbackendPID(connection)==row.pop('pid'),**row}
    finally:
        if connection: lib.PQfinish(connection)
