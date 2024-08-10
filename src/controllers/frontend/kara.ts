import { promises as fs } from 'fs';
import path, { resolve } from 'path';
import { Socket } from 'socket.io';

import { validateMediaInfo } from '../../lib/dao/karafile.js';
import { APIMessage, errMessage } from '../../lib/services/frontend.js';
import { previewHooks, processUploadedMedia } from '../../lib/services/karaCreation.js';
import { APIData } from '../../lib/types/api.js';
import { TagTypeNum } from '../../lib/types/tag.js';
import { resolvedPath, resolvedPathRepos } from '../../lib/utils/config.js';
import { Timer } from '../../lib/utils/date.js';
import { ErrorKM } from '../../lib/utils/error.js';
import {
	abortAllMediaEncodingProcesses,
	createFrames as createFrames2,
	createPreview,
} from '../../lib/utils/ffmpeg.js';
import { fileExists, resolveFileInDirs } from '../../lib/utils/files.js';
import { check, isUUID } from '../../lib/utils/validators.js';
import { SocketIOApp } from '../../lib/utils/ws.js';
import { getKara, getKaraLyrics, getKaraMediaInfo, getKaras, getKMStats } from '../../services/kara.js';
import { createKara, editKara } from '../../services/karaCreation.js';
import { playSingleSong } from '../../services/karaEngine.js';
import {
	batchEditKaras,
	copyKaraToRepo,
	deleteMediaFile,
	embedAudioFileCoverArt,
	encodeMediaFileToRepoDefaults,
	removeKara,
} from '../../services/karaManagement.js';
import { addKaraToPlaylist } from '../../services/playlist.js';
import { runChecklist } from '../middlewares.js';

export default function karaController(router: SocketIOApp) {
	router.route('getKaras', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			return await getKaras({
				filter: req.body?.filter,
				lang: req.langs,
				from: +req.body?.from || 0,
				size: +req.body?.size || 9999999,
				order: req.body?.order,
				q: req.body?.q,
				username: req.token.username,
				random: req.body?.random,
				blacklist: req.body?.blacklist,
				parentsOnly: req.body?.parentsOnly,
				ignoreCollections: req.body?.ignoreCollections,
			});
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('createKara', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			await createKara(req.body);
			return { code: 200, message: APIMessage('KARA_CREATED') };
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('getKaraMediaInfo', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			return await getKaraMediaInfo(req.body.kid);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('validateMediaInfo', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			if (!req.body.mediaInfo || !req.body.repository) throw { code: 400 };
			return await validateMediaInfo(req.body.mediaInfo, req.body.repository);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('processUploadedMedia', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			const mediaInfo = await processUploadedMedia(req.body.filename, req.body.origFilename);
			return { ...mediaInfo, filePath: undefined };
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('embedAudioFileCoverArt', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			const mediaInfo = await embedAudioFileCoverArt(req.body.coverPictureFilename, {
				kid: req.body.kid,
				tempFileName: req.body.tempFilename,
			});
			return { ...mediaInfo, filePath: undefined };
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('encodeMediaFileToRepoDefaults', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			return await encodeMediaFileToRepoDefaults(
				req.body.kid,
				req.body.filename,
				req.body.repo,
				req.body.encodeOptions
			);
		} catch (err) {
			const errMessageCode = (err instanceof ErrorKM && err.message) || 'ENCODE_MEDIA_ERROR';
			errMessage(errMessageCode, err);
			throw { code: err?.code || 500, message: APIMessage(errMessageCode) };
		}
	});
	router.route('abortMediaEncoding', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			return abortAllMediaEncodingProcesses();
		} catch (err) {
			const code = 'ENCODE_MEDIA_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('previewHooks', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			return await previewHooks(req.body);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('getKara', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			return await getKara(req.body?.kid, req.token);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('deleteKaras', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		const validationErrors = check(req.body, {
			kids: { presence: true, uuidArrayValidator: true },
		});
		if (!validationErrors) {
			try {
				await removeKara(req.body.kids);
				return { code: 200, message: APIMessage('KARA_DELETED') };
			} catch (err) {
				throw { code: err.code || 500, message: APIMessage(err.message) };
			}
		}
		return null;
	});
	router.route('addKaraToPublicPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'open');
		// Add Kara to the playlist currently used depending on mode
		if (!isUUID(req.body.kids)) throw { code: 400 };
		try {
			return await addKaraToPlaylist({
				kids: req.body.kids,
				requester: req.token.username,
				throwOnMissingKara: true,
			});
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('editKara', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			await editKara(req.body);
			return { code: 200, message: APIMessage('KARA_EDITED') };
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('getKaraLyrics', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		if (!isUUID(req.body.kid)) throw { code: 400 };
		try {
			return await getKaraLyrics(req.body.kid);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('copyKaraToRepo', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		if (!isUUID(req.body.kid)) throw { code: 400 };
		try {
			await copyKaraToRepo(req.body.kid, req.body.repo);
			return { code: 200, message: APIMessage('SONG_COPIED') };
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
	router.route('playKara', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		return playSingleSong(req.body.kid);
	});
	router.route('editKaras', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		// This is async so we always return
		batchEditKaras(req.body.plaid, req.body.action, req.body.tid, +req.body.type as TagTypeNum).catch(() => {});
	});
	router.route('deleteMediaFile', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'admin', 'open');
		try {
			return await deleteMediaFile(req.body.file, req.body.repo);
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});

	router.route('getStats', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'closed');
		try {
			return await getKMStats();
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});

	router.route('generatePreview', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			const media = await getKara(req.body?.kid, req.token);
			const hardsubFile = `hardsub.m3u8`;
			const framesFileName = `frames.txt`;
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

			const outputFile = resolve(previewDir, hardsubFile);
			const framesFile = resolve(previewDir, framesFileName);

			const kid = media.kid;
			const loudnorm = media.loudnorm;

			if (await fileExists(outputFile)) return true;
			const assPath = subPath ? `${kid}.ass` : null;
			if (subPath) await fs.copyFile(subPath, assPath);
			try {
				const frames = await createFrames(mediaPath, framesFile);
				await createHls(media.duration, outputFile, kid, frames);
				createPreview(
					mediaPath,
					assPath,
					fontsDir,
					outputFile.replace(/\.m3u8$/, '_audio.m3u8'),
					loudnorm,
					'audio'
				).finally(async () => {
					if (assPath) await fs.unlink(assPath);
				});
				await new Timer(1000).wait();
				return true;
			} catch (err) {
				throw err;
			}
		} catch (err) {
			throw { code: err.code || 500, message: APIMessage(err.message) };
		}
	});
}

export async function createHls(duration: number, outputFile: string, kid: string, frames: number[]) {
	const outputVideoFile = outputFile.replace(/\.m3u8$/, '_video.m3u8');
	const outputAudioFile = outputFile.replace(/\.m3u8$/, '_audio.m3u8');

	await hlsFileVideo(outputVideoFile, i => `/api/generatePreview?startSegment=${i}&kid=${kid}`);
	await fs.writeFile(
		outputFile,
		`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="audio",URI="${path.basename(outputAudioFile)}"
#EXT-X-STREAM-INF:AUDIO="aac"
${path.basename(outputVideoFile)}
`
	);

	async function hlsFileVideo(outputFile: string, file: (i: number) => string) {
		const segments: { duration: number; file: string }[] = [];
		for (let i = 0; i < frames.length; i++) {
			const next = frames[i + 1] || duration;
			const segmentDuration = next - frames[i];
			segments.push({
				duration: segmentDuration,
				file: file(i),
			});
		}
		let maxSegmentDuration = Math.max(...segments.map(s => s.duration));

		let out = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:${Math.ceil(maxSegmentDuration)}
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
`;

		for (const { duration, file } of segments) {
			out += `#EXTINF:${duration}, nodesc\n`;
			out += `${file}\n`;
		}
		out += '#EXT-X-ENDLIST\n';
		await fs.writeFile(outputFile, out);
	}
}

export async function createFrames(mediaPath: string, outputFile: string): Promise<number[]> {
	const frames = await createFrames2(mediaPath);
	await fs.writeFile(outputFile, frames.join('\n'));
	return frames;
}
