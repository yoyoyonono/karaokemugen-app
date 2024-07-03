ALTER TABLE kara
ADD lyrics_infos jsonb;

ALTER TABLE kara
DROP COLUMN announce_position_x;

ALTER TABLE kara
DROP COLUMN announce_position_y;

ALTER TABLE kara
DROP COLUMN subfile;

ALTER TABLE playlist_content
ADD selected_version TEXT;

UPDATE playlist_content
SET selected_version='Default';