-- Technicians are "on the way" after Start job (In Progress) until they check in,
-- not from the moment they accept. 20261024140000 already contains this rule;
-- this step rewrote the first live version in place.
do $do$
declare f text;
begin
  for f in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('update_tech_location', 'clear_tech_location', 'my_technician_location', 'mission_control_technicians')
  loop
    f := replace(f, $a$lower(COALESCE(r.status, ''::text)) <> 'assigned'::text$a$, $a$lower(coalesce(r.status, '')) !~ '(progress|ongoing)'$a$);
    f := replace(f, $a$lower(coalesce(r.status, '')) <> 'assigned'$a$, $a$lower(coalesce(r.status, '')) !~ '(progress|ongoing)'$a$);
    f := replace(f, $a$lower(coalesce(NEW.status, '')) <> 'assigned'$a$, $a$lower(coalesce(NEW.status, '')) !~ '(progress|ongoing)'$a$);
    f := replace(f, $a$lower(coalesce(r.status, '')) = 'assigned'$a$, $a$lower(coalesce(r.status, '')) ~ '(progress|ongoing)'$a$);
    execute f;
  end loop;
end
$do$;
