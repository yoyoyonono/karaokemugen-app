import fs from 'fs/promises';
import { resolve } from 'path';

const repo = 'app/karaokebase/karaokes';

const karas = await fs.readdir(repo);
for (const karaFile of karas) {
	const data = await fs.readFile(resolve(repo, karaFile), 'utf-8');
	const json = JSON.parse(data);
	json.data.songname = karaFile.replaceAll('.kara.json', '');
	json.data = sortJSON(json.data);
	json.medias[0] = sortJSON(json.medias[0]);
	if (json.medias[0].lyrics[0]) {
		delete json.medias[0].lyrics[0].subchecksum;
		json.medias[0].lyrics[0] = sortJSON(json.medias[0].lyrics[0]);
	}
	delete json.medias[0].audiogain;
	delete json.data.title;
	await fs.writeFile(resolve(repo, karaFile), JSON.stringify(json, null, 2), 'utf-8');
}

function sortJSON(obj) {
	const objOrdered = {};
	Object.keys(obj)
		.sort()
		.forEach(key => {
			objOrdered[key] = obj[key];
		});
	return objOrdered;
}
