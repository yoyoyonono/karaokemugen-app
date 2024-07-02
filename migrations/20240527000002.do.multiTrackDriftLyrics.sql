ALTER TABLE kara
ADD lyrics_infos jsonb;

UPDATE kara
SET lyrics_infos = (
	  SELECT jsonb_build_array(
        jsonb_build_object('version', 'Default') ||
        jsonb_build_object('subfile', subfile) ||
        jsonb_build_object('announce_position_x', announce_position_x) ||
        jsonb_build_object('announce_position_y', announce_position_y) 
    )
);

ALTER TABLE kara
DROP COLUMN announce_position_x;

ALTER TABLE kara
DROP COLUMN announce_position_y;

ALTER TABLE kara
DROP COLUMN subfile;