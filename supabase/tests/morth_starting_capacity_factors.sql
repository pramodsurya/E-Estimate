-- Read-only regression assertions. No tariff or source data is modified.
do $test$
declare
  q jsonb; other jsonb; c text; y text; z text; rate numeric;
begin
  foreach c in array array['MORTH_PM_036','MORTH_SRC_439D2BEB5CFFDB611168'] loop
    q := public.morth_resource_starting_quote(c,'2026-27','zone_3','hire_total','hour');
    assert q->>'status' = 'priced';
    assert (q->>'rate')::numeric = 1846.30;
    assert (q#>>'{rate_detailed,hire_charge}')::numeric = 743.40;
    assert (q#>>'{rate_detailed,fuel_charge}')::numeric = 809.40;
    assert (q#>>'{rate_detailed,crew_charge}')::numeric = 293.50;
    assert (q->>'capacity_factor')::numeric = 1.5;
    assert q->'includes_fuel' = 'true'::jsonb and q->'includes_crew' = 'true'::jsonb;
    assert q->'is_published_sor_rate' = 'false'::jsonb;
    assert q->'requires_review' = 'true'::jsonb;
    assert (q->>'rate')::numeric =
      (q#>>'{rate_detailed,hire_charge}')::numeric +
      (q#>>'{rate_detailed,fuel_charge}')::numeric +
      (q#>>'{rate_detailed,crew_charge}')::numeric;
  end loop;
  foreach c in array array['MORTH_PM_035','MORTH_SRC_5395D38AAA3590B03A00'] loop
    q := public.morth_resource_starting_quote(c,'2026-27','zone_3','rate','hour');
    assert (q->>'rate')::numeric = 2363.90;
    assert (q->>'capacity_factor')::numeric = 2;
    assert (q#>>'{rate_detailed,crew_charge}')::numeric = 293.50;
  end loop;
  foreach y in array array['2025-26','2026-27'] loop
    foreach z in array array['zone_1','zone_2','zone_3'] loop
      q := public.morth_resource_starting_quote('MORTH_PM_036',y,z,'rate','Hour');
      other := public.sor_resource_quote('SOR-P01-T08-R0064',y,z,'rate','hour');
      assert q->>'status' = 'priced' and q->>'year' = y and q->>'zone' = z;
      rate := round((other#>>'{rate_detailed,hire_charge}')::numeric * 1.5,2)
        + round((other#>>'{rate_detailed,fuel_charge}')::numeric * 1.5,2)
        + (other#>>'{rate_detailed,crew_charge}')::numeric;
      assert (q->>'rate')::numeric = rate;
    end loop;
  end loop;
  q := public.morth_resource_starting_quote('MORTH_PM_036','2026-27','zone_3','fuel_charge','hour');
  assert (q->>'rate')::numeric = 809.40 and q->'includes_fuel' = 'false'::jsonb;
  q := public.morth_resource_starting_quote('MORTH_PM_036','2026-27','zone_3','crew_charge','hour');
  assert (q->>'rate')::numeric = 293.50;
  q := public.morth_resource_starting_quote('MORTH_PM_036','2099-00','zone_3','rate','hour');
  assert q->>'status' = 'starting_reference_unavailable' and q->'rate' = 'null'::jsonb;
  q := public.morth_resource_starting_quote('MORTH_PM_036','2026-27','zone_3','rate','day');
  assert q->>'status' = 'starting_reference_unavailable' and q->'rate' = 'null'::jsonb;
  q := public.morth_resource_starting_quote('MORTH_PM_036','2026-27','zone_3','capital_cost','hour');
  assert q->>'status' = 'starting_component_unavailable' and q->'rate' = 'null'::jsonb;
  q := public.morth_resource_starting_quote('not-a-resource','2026-27','zone_3','rate','hour');
  assert q->>'status' = 'starting_basis_missing' and q->'rate' = 'null'::jsonb;
  q := public.sor_resource_quote('SOR-P01-T08-R0064','2026-27','zone_3','rate','hour');
  assert (q->>'rate')::numeric = 1328.70, 'Published 8 kL SOR tariff is unchanged';
  q := public.sor_resource_quote('SOR-P02-T04-R0011','2026-27','zone_3','rate','hour');
  assert (q->>'rate')::numeric = 790, 'Exact 6 kL SOR tariff is unchanged';
  assert (select count(*) from public.analysis_resource where source_definition?'starting_rate_basis') = 4;
end $test$;
