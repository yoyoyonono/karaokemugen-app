import fs from 'fs/promises';
import { v4 as uuidV4 } from 'uuid';

import { ImportBaseFile, ImportKaraObject } from '../types/repo.js';
import { basename, dirname, extname, resolve } from 'path';
import { supportedFiles, tagTypes } from '../lib/utils/constants.js';
import { addTag, getTags } from './tag.js';
import { ErrorKM } from '../lib/utils/error.js';
import { fileExists } from '../lib/utils/files.js';
import { convertLangTo2B } from '../lib/utils/langs.js';
import { KaraFileV4 } from '../lib/types/kara.js';
import { createKara } from './karaCreation.js';
import { getRepo } from './repo.js';

/** Determine names from folder to import from and tempalte */
export async function findFilesToImport(dirName: string, template: string): Promise<ImportBaseFile[]> {
	const dir = await fs.readdir(dirName);
	const files: ImportBaseFile[] = [];
	for (const file of dir) {
		const ext = extname(file).substring(1);
		if (supportedFiles.audio.includes(ext) || supportedFiles.video.includes(ext)) {
			const mediafile = resolve(dirName, file);
			files.push(translateKaraTemplate(mediafile, template));
		}
	}
	return files;
}

function translateKaraTemplate(mediafile: string, template: string): ImportBaseFile {
	const unfill = (
		fileTemplate: string,
		file: string,
		match = file.match(new RegExp(fileTemplate.replace(/{[^}]+\}/g, s => `(?<${s.slice(1, -1)}>.+)`)))
	) => match && match.groups;
	const ext = extname(mediafile).substring(1);
	const fileWithoutExt = basename(mediafile, `.${ext}`);
	const karaObj = unfill(template, fileWithoutExt) as ImportKaraObject;
	return {
		directory: dirname(mediafile),
		oldFile: mediafile,
		newFile: karaObj,
		tags: {},
	};
}

/** Analyze import base files, create missing tags in database and return the karas object with its TIDs */
async function populateTags(baseKaras: ImportBaseFile[], repoDest: string): Promise<ImportBaseFile[]> {
	// We'll do a first pass to gather all tags, see which ones do exist and create those who don't
	const tags = await getTags({});
	const tagPromises = [];
	const tagCache = new Map();
	for (const i in baseKaras) {
		if ({}.hasOwnProperty.call(baseKaras, i)) {
			const kara = baseKaras[i];
			for (const key in Object.keys(kara.newFile)) {
				// These too are ignored, they're not tags.
				if (key === 'title' || key === 'year') continue;
				// We assume that if there are several items in a tag they're separated by ,
				// Like "Axelle Red, Kyo - Dernière Danse Remix"
				const items = kara.newFile[key].split(',');
				items.forEach((_, i2) => (items[i2] = items[i2].trim()));
				for (const item of items) {
					let tag = tagCache.get(item);
					if (!tag) tag = tags.content.find(t => t.name === item && t.types.includes(tagTypes[key]));
					let tid = '';
					if (tag) {
						tid = tag.tid;
					} else {
						tid = uuidV4();
						tagPromises.push(
							await addTag({
								name: item,
								tid,
								types: [tagTypes[key]],
								repository: repoDest,
							})
						);
					}
					if (!kara.tags[key]) kara.tags[key] = [];
					kara.tags[key].push(tid);
				}
			}
		}
	}
	return baseKaras;
}

async function importBaseKara(karaObj: ImportBaseFile, repoDest: string) {
	const mediafile = karaObj.oldFile;
	// We have our kara and its informations, now let's play guessing games.
	// Reject song if it has no title.
	if (!karaObj.newFile.title) throw new ErrorKM('IMPORT_NO_TITLE_ERROR', 400);
	// Determine if file has a subtitle we can use
	const dir = dirname(mediafile);
	const basefile = basename(mediafile, extname(mediafile));
	let subfile = '';
	for (const ext of supportedFiles.lyrics) {
		const possibleSubfile = resolve(dir, `${basefile}.${ext}`);
		if (await fileExists(possibleSubfile)) {
			subfile = possibleSubfile;
			break;
		}
	}
	// Default language
	// Determine if we can convert it to a ISO code
	const language = karaObj.newFile.langs ? convertLangTo2B(karaObj.newFile.langs[0]) : 'eng';
	const date = new Date();
	const kara: KaraFileV4 = {
		meta: {},
		header: {
			version: 4,
			description: 'Karaoke Mugen Karaoke Data File',
		},
		medias: [
			{
				filename: mediafile,
				version: 'Default',
				duration: 0,
				filesize: 0,
				loudnorm: '',
				default: true,
				lyrics: [
					subfile
						? {
								filename: subfile,
								version: 'Default',
								default: true,
							}
						: undefined,
				],
			},
		],
		data: {
			kid: uuidV4(),
			year: karaObj.newFile.year,
			titles: {},
			titles_default_language: language,
			ignoreHooks: false,
			created_at: date.toISOString(),
			modified_at: date.toISOString(),
			tags: karaObj.tags,
			repository: repoDest,
		},
	};
	kara.data.titles[language] = karaObj.newFile.title;
	await createKara(
		{
			kara,
		},
		dir
	);
}

export async function importBase(source: string, template: string, type: 'file' | 'dir', repoDest: string) {
	getRepo(repoDest);
	let files = [];
	if (type === 'dir') {
		files = await findFilesToImport(source, template);
	} else {
		files = [translateKaraTemplate(source, template)];
	}
	files = await populateTags(files, repoDest);
	for (const file of files) {
		await importBaseKara(file, repoDest);
	}
}
