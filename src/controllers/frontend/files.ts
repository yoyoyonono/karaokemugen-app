import { Router } from 'express';
import { promises as fs } from 'fs';
import multer from 'multer';
import { resolve } from 'path';
import { Socket } from 'socket.io';
import { v4 as uuidV4 } from 'uuid';

import { APIMessage } from '../../lib/services/frontend.js';
import { APIData } from '../../lib/types/api.js';
import { resolvedPath, resolvedPathRepos } from '../../lib/utils/config.js';
import { createPreview } from '../../lib/utils/ffmpeg.js';
import { fileExists, resolveFileInDirs } from '../../lib/utils/files.js';
import logger from '../../lib/utils/logger.js';
import { SocketIOApp } from '../../lib/utils/ws.js';
import { getKara } from '../../services/kara.js';
import { openLyricsFile, showLyricsInFolder, showMediaInFolder } from '../../services/karaManagement.js';
import { adminToken } from '../../utils/constants.js';
import { runChecklist } from '../middlewares.js';
import { requireHTTPAuth, requireValidUser } from '../middlewaresHTTP.js';

let count = 0;

export default function filesController(router: Router) {
	const upload = multer({ dest: resolvedPath('Temp') });
	router.route('/importFile').post(requireHTTPAuth, requireValidUser, upload.single('file'), (req, res: any) => {
		res.status(200).send(JSON.stringify(req.file));
	});
	router.route('/generatePreview').get(async (req, res: any) => {
		try {
			const numberSegment = +req.query?.startSegment || 0;
			const media = await getKara(req.query?.kid?.toString(), adminToken);
			const hardsubFile = `hardsub_video.m3u8`;
			const framesFileName = `frames.txt`;
			const segmentFileName = hardsubFile.replace(/\.m3u8/, `${numberSegment}.ts`);
			const mediaPath = (
				await resolveFileInDirs(media.mediafile, resolvedPathRepos('Medias', media.repository))
			)[0];
			let subPath = null;
			if (media.subfile) {
				subPath = (await resolveFileInDirs(media.subfile, resolvedPathRepos('Lyrics', media.repository)))[0];
			}

			const fontsDir = resolvedPathRepos('Fonts', media.repository)[0];

			const previewDir = resolve(resolvedPath('Temp'), 'medias', media.kid, media.mediasize?.toString());
			await fs.mkdir(previewDir, { recursive: true });

			const segmentFile = resolve(previewDir, segmentFileName);
			const framesFile = resolve(previewDir, framesFileName);

			const frames = (await fs.readFile(framesFile, 'utf8')).split('\n');
			const startSegment = +frames[numberSegment];
			const endSegment = +frames[numberSegment + 1] || null;

			const kid = media.kid;
			const loudnorm = media.loudnorm;

			const outputVideoSegmentFile = `/mediastmp/${kid}/${media.mediasize}/hardsub_video${numberSegment}.ts`;
			if (await fileExists(segmentFile)) return res.redirect(outputVideoSegmentFile);
			const assPath = subPath ? `${kid}.ass` : null;
			if (subPath) await fs.copyFile(subPath, assPath);
			await fs.mkdir(previewDir, { recursive: true });
			const tmpDir = resolve(previewDir, 'tmp');
			await fs.mkdir(tmpDir, { recursive: true });
			const outputFileTmp = resolve(tmpDir, hardsubFile);
			const segmentFileTmp = resolve(tmpDir, segmentFileName);
			try {
				await new Promise<void>(res => {
					function wait() {
						if (count <= 0) {
							return res();
						}
						setTimeout(wait, 50);
					}
					wait();
				});
				count++;
				await createPreview(
					mediaPath,
					assPath,
					fontsDir,
					outputFileTmp.replace(/\.m3u8/, '.dummym3u8'), //we don't want this file, we want the one generated in createHls
					loudnorm,
					'video',
					numberSegment,
					startSegment,
					endSegment
				);
				fs.rename(segmentFileTmp, segmentFile);
				if (assPath) await fs.unlink(assPath);
			} catch (err) {
				throw err;
			} finally {
				count--;
			}
			res.redirect(outputVideoSegmentFile);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
}

export function filesSocketController(router: SocketIOApp) {
	router.route('importFile', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'user', 'closed');
		try {
			const extension = req.body.extension ? `.${req.body.extension}` : '';
			const filename = `${uuidV4()}${extension}`;
			const fullPath = resolve(resolvedPath('Temp'), filename);
			await fs.writeFile(fullPath, req.body.buffer);
			return {
				filename: fullPath,
			};
		} catch (err) {
			logger.error('Unable to write received file', { service: 'API', obj: err });
			return { code: 500 };
		}
	});

	router.route('openLyricsFile', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'closed');
		try {
			return await openLyricsFile(req.body.kid);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});

	router.route('showLyricsInFolder', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'closed');
		try {
			return await showLyricsInFolder(req.body.kid);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});

	router.route('showMediaInFolder', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'closed');
		try {
			return await showMediaInFolder(req.body.kid);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
}
