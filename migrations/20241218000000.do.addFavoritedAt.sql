ALTER TABLE favorites ADD COLUMN IF NOT EXISTS favorited_at TIMESTAMPTZ;

UPDATE favorites SET favorited_at = NOW();

