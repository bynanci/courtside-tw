-- T045 remediation: replace the controlled public-web media requirement set.
--
-- article_revision_media is intentionally not writable destructively by the
-- application role. This narrowly scoped SECURITY DEFINER function lets the
-- repository replace only PUBLIC_WEB links for one revision while preserving
-- the table's direct UPDATE/DELETE privilege boundary.

CREATE OR REPLACE FUNCTION replace_public_article_revision_media(
    p_revision_id uuid,
    p_asset_ids jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_revision_id IS NULL OR jsonb_typeof(p_asset_ids) <> 'array' THEN
        RAISE EXCEPTION 'revision id and asset id array are required';
    END IF;

    DELETE FROM article_revision_media link
    WHERE link.article_revision_id = p_revision_id
      AND link.required_channel = 'PUBLIC_WEB'
      AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(p_asset_ids) AS requested(asset_id)
          WHERE requested.asset_id::uuid = link.asset_id
      );

    INSERT INTO article_revision_media (
        article_revision_id, asset_id, required_channel, position
    )
    SELECT p_revision_id, requested.asset_id::uuid, 'PUBLIC_WEB', requested.position
    FROM jsonb_array_elements_text(p_asset_ids) WITH ORDINALITY
        AS requested(asset_id, position)
    ON CONFLICT (article_revision_id, asset_id, required_channel)
    DO UPDATE SET position = EXCLUDED.position;
END;
$$;

REVOKE ALL ON FUNCTION replace_public_article_revision_media(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_public_article_revision_media(uuid, jsonb) TO courtside_app;
