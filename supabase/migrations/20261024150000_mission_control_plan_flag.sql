-- Mission control: tell "applied for a plan" apart from "only signed up".
do $do$
declare f text;
begin
  select pg_get_functiondef('public.mission_control_map'::regproc) into f;
  f := replace(f, $a$'account', c.account_status,$a$, $a$'account', c.account_status,
        'applied', nullif(btrim(coalesce(c.plan_name, '')), '') is not null
                   or exists (select 1 from public.service_requests s where s.client_id = c.id),$a$);
  if position('''applied''' in f) = 0 then
    raise exception 'mission_control_map: anchor not found';
  end if;
  execute f;
end
$do$;
