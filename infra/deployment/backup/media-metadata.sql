SELECT
    ma.id::text AS asset_id,
    lower(ma.checksum_sha256) AS asset_checksum_sha256,
    ma.byte_size::bigint AS asset_byte_size,
    ma.private_storage_key AS private_storage_key,
    COALESCE(mv.variant, '') AS variant,
    COALESCE(lower(mv.checksum_sha256), '') AS variant_checksum_sha256,
    COALESCE(mv.byte_size, 0)::bigint AS variant_byte_size,
    COALESCE(mv.public_storage_key, '') AS public_storage_key,
    COALESCE(
        (
            SELECT rr.status
            FROM rights_record rr
            WHERE rr.asset_id = ma.id
            ORDER BY rr.version DESC, rr.valid_until DESC, rr.id DESC
            LIMIT 1
        ),
        ''
    ) AS rights_status
FROM media_asset ma
LEFT JOIN media_variant mv ON mv.asset_id = ma.id
ORDER BY ma.id, mv.variant;
