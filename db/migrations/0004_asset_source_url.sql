-- Where a provider output was fetched from (a fal.media URL). Later stages pass it back to the
-- provider (keyframe -> image-to-video) instead of re-uploading the file. Not a secret: fal media URLs are unsigned.
alter table assets add column source_url text check (source_url is null or source_url ~ '^https://');
grant update (source_url) on assets to feista_worker;
