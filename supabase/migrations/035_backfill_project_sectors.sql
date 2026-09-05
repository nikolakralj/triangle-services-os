-- 035 — file the eighteen projects that were never filed
--
-- Every discovered project on record had sector_id null, so every sector tab
-- on the Signal Inbox showed an empty list. The filter was working correctly
-- on data that had never been classified: click "Data Centers" and seven data
-- centre projects vanish, because not one of them was in the sector.
--
-- The cause was in classifySector(), which matched a sector's own name words
-- against the text. "CATL and Stellantis Electric Vehicle Battery Factory"
-- contains none of the words in "Automotive & EV". The code now carries a
-- keyword list per sector slug; this repairs the rows that predate it.
--
-- Longest match wins, so a phrase beats a loose single word. Anything that
-- matches nothing stays null on purpose — an unclassified project is visible
-- under "All" and honest, a misfiled one is neither. Only null rows are
-- touched: a sector a human has already set is not something to overwrite.

with kw(slug, word) as (values
  ('data-centers','data cent'),('data-centers','datacent'),
  ('data-centers','rechenzentrum'),('data-centers','colocation'),
  ('data-centers','hyperscale'),('data-centers','server farm'),
  ('data-centers','gpu cluster'),('data-centers','ai cluster'),
  ('data-centers','megawatt it'),('data-centers','mw it'),
  ('automotive','automotive'),('automotive','electric vehicle'),
  ('automotive','vehicle'),('automotive','battery'),
  ('automotive','gigafactory'),('automotive','car plant'),
  ('automotive','ev plant'),('automotive','fahrzeug'),
  ('automotive','cell factory'),('automotive','powertrain'),
  ('steel-heavy-industry','steel'),('steel-heavy-industry','stahl'),
  ('steel-heavy-industry','smelter'),('steel-heavy-industry','blast furnace'),
  ('steel-heavy-industry','pickling'),('steel-heavy-industry','rolling mill'),
  ('steel-heavy-industry','foundry'),('steel-heavy-industry','hydrogen plant'),
  ('steel-heavy-industry','direct reduction'),('steel-heavy-industry','refinery'),
  ('steel-heavy-industry','petrochemical'),('steel-heavy-industry','pulp'),
  ('steel-heavy-industry','paper mill'),('steel-heavy-industry','cement'),
  ('hvac','hvac'),('hvac','commissioning'),('hvac','ventilation'),
  ('hvac','heating'),('hvac','cooling'),('hvac','chiller'),
  ('hvac','lüftung'),('hvac','klima'),('hvac','mechanical and electrical')
),
-- Computed in a CTE rather than a LATERAL: an UPDATE ... FROM LATERAL cannot
-- reference the target table from inside the subquery.
best as (
  select distinct on (d.id)
         d.id as project_id,
         s.id as sector_id
  from discovered_projects d
  join sectors s on s.organization_id = d.organization_id
  join kw k on k.slug = s.slug
  where d.sector_id is null
    and lower(
          coalesce(d.project_name, '') || ' ' ||
          coalesce(d.project_type, '') || ' ' ||
          coalesce(d.source_text, '')
        ) like '%' || k.word || '%'
  order by d.id, length(k.word) desc
)
update discovered_projects d
set sector_id = best.sector_id
from best
where d.id = best.project_id
  and d.sector_id is null;

NOTIFY pgrst, 'reload schema';
