-- Media stages re-store their own output on a retry of the same generation (upsert on storage_key).
grant update (bytes) on assets to feista_worker;
