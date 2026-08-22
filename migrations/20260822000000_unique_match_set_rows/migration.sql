WITH ranked_sets AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY match_id, set_integer
      ORDER BY
        CASE set_status
          WHEN 'in_progress' THEN 3
          WHEN 'completed' THEN 2
          WHEN 'not_started' THEN 1
          ELSE 0
        END DESC,
        (team_a_score + team_b_score) DESC,
        updated_at DESC,
        created_at DESC,
        id DESC
    ) AS row_number
  FROM set_table
)
DELETE FROM set_table
WHERE id IN (
  SELECT id
  FROM ranked_sets
  WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "set_table_match_id_set_integer_unique"
ON "set_table" ("match_id", "set_integer");
