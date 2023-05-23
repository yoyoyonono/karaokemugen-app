import { Socket } from 'socket.io';

import { APIData } from '../../lib/types/api.js';
import { bools } from '../../lib/utils/constants.js';
import { check } from '../../lib/utils/validators.js';
import { SocketIOApp } from '../../lib/utils/ws.js';
import {
	addKaraToPlaylist,
	copyKaraToPlaylist,
	createAutoMix,
	createPlaylist,
	editPlaylist,
	editPLC,
	emptyPlaylist,
	exportPlaylist,
	exportPlaylistMedia,
	findPlaying,
	getKaraFromPlaylist,
	getPlaylistContents,
	getPlaylistContentsMicro,
	getPlaylistInfo,
	getPlaylists,
	importPlaylist,
	randomizePLC,
	removeKaraFromPlaylist,
	removePlaylist,
	shufflePlaylist,
} from '../../services/playlist.js';
import { vote } from '../../services/upvote.js';
import { APIMessage, errMessage } from '../common.js';
import { runChecklist } from '../middlewares.js';

export default function playlistsController(router: SocketIOApp) {
	router.route('createAutomix', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		const validationErrors = check(req.body, {
			filters: { presence: true },
			limitNumber: { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } },
		});
		if (!validationErrors) {
			// No errors detected
			try {
				return await createAutoMix(req.body, req.token.username);
			} catch (err) {
				const code = 'AUTOMIX_ERROR';
				errMessage(code, err);
				throw { code: err?.code || 500, message: APIMessage(err?.msg || code) };
			}
		} else {
			// Errors detected
			// Sending BAD REQUEST HTTP code and error object.
			throw { code: 400, message: validationErrors };
		}
	});

	router.route('getPlaylists', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		// Get list of playlists
		try {
			return await getPlaylists(req.token);
		} catch (err) {
			const code = 'PL_LIST_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});

	router.route('createPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		const validationErrors = check(req.body, {
			name: { presence: { allowEmpty: false } },
			flag_visible: { inclusion: bools },
			flag_public: { inclusion: bools },
			flag_current: { inclusion: bools },
			flag_smart: { inclusion: bools },
			flag_whitelist: { inclusion: bools },
			flag_blacklist: { inclusion: bools },
		});
		if (!validationErrors) {
			// No errors detected
			req.body.name = unescape(req.body.name.trim());

			// Now we add playlist
			try {
				return {
					plaid: await createPlaylist(req.body, req.token.username),
				};
			} catch (err) {
				const code = 'PL_CREATE_ERROR';
				errMessage(code, err);
				throw { code: err?.code || 500, message: APIMessage(code) };
			}
		} else {
			// Errors detected
			// Sending BAD REQUEST HTTP code and error object.
			throw { code: 400, message: validationErrors };
		}
	});
	router.route('getPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			const playlist = await getPlaylistInfo(req.body?.plaid, req.token);
			if (!playlist) throw { code: 404 };
			return playlist;
		} catch (err) {
			const code = 'PL_VIEW_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('editPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		// No errors detected
		if (req.body.name) req.body.name = unescape(req.body.name?.trim());

		// Now we add playlist
		try {
			return await editPlaylist(req.body?.plaid, req.body);
		} catch (err) {
			const code = 'PL_UPDATE_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('deletePlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		try {
			return await removePlaylist(req.body?.plaid);
		} catch (err) {
			const code = 'PL_DELETE_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(err?.msg || code) };
		}
	});
	router.route('emptyPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		// Empty playlist
		try {
			return await emptyPlaylist(req.body?.plaid);
		} catch (err) {
			const code = 'PL_EMPTY_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('exportPlaylistMedia', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		// Export all playlist kara medias to a local directory
		try {
			return await exportPlaylistMedia(req.body?.plaid, req.body?.exportDir);
		} catch (err) {
			const code = 'PL_EXPORT_MEDIA_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('findPlayingSongInPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			const index = await findPlaying(req.body?.plaid);
			return { index };
		} catch (err) {
			errMessage(null, err);
			throw { code: 500 };
		}
	});
	router.route('getPlaylistContents', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			return await getPlaylistContents(
				req.body?.plaid,
				req.token,
				req.body?.filter,
				req.langs,
				req.body?.from || 0,
				req.body?.size || 9999999,
				req.body?.random || 0,
				req.body?.orderByLikes
			);
		} catch (err) {
			const code = 'PL_VIEW_SONGS_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('getPlaylistContentsMicro', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			return await getPlaylistContentsMicro(req.body?.plaid, req.token);
		} catch (err) {
			const code = 'PL_VIEW_SONGS_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('addKaraToPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest');
		// add a kara to a playlist
		const validationErrors = check(req.body, {
			kids: { presence: true, uuidArrayValidator: true },
		});
		if (!validationErrors) {
			try {
				return await addKaraToPlaylist({
					kids: req.body.kids,
					requester: req.token.username,
					plaid: req.body.plaid,
					pos: req.body.pos,
				});
			} catch (err) {
				const code = 'PL_ADD_SONG_ERROR';
				errMessage(code, err);
				throw { code: err?.code || 500, message: APIMessage(code) };
			}
		} else {
			// Errors detected
			// Sending BAD REQUEST HTTP code and error object.
			throw { code: 400, message: validationErrors };
		}
	});
	router.route('copyKaraToPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		// add karas from a playlist to another
		const validationErrors = check(req.body, {
			plc_ids: { presence: true, numbersArrayValidator: true },
		});
		if (!validationErrors) {
			try {
				return await copyKaraToPlaylist(req.body.plc_ids, req.body.plaid, req.body.pos);
			} catch (err) {
				const code = 'PL_SONG_COPY_ERROR';
				errMessage(code, err);
				throw { code: err?.code || 500, message: APIMessage(code) };
			}
		} else {
			// Errors detected
			// Sending BAD REQUEST HTTP code and error object.
			throw { code: 400, message: validationErrors };
		}
	});
	router.route('deleteKaraFromPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest');
		const validationErrors = check(req.body, {
			plc_ids: { presence: true, numbersArrayValidator: true },
		});
		if (!validationErrors) {
			try {
				return await removeKaraFromPlaylist(req.body.plc_ids, req.token);
			} catch (err) {
				const code = 'PL_DELETE_SONG_ERROR';
				errMessage(code, err);
				throw err?.code ? err : APIMessage(code, err);
			}
		} else {
			// Errors detected
			// Sending BAD REQUEST HTTP code and error object.
			throw { code: 400, message: validationErrors };
		}
	});

	router.route('getPLC', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		try {
			return await getKaraFromPlaylist(req.body?.plc_id, req.token);
		} catch (err) {
			const code = 'PL_VIEW_CONTENT_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('editPLC', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		const validationErrors = check(req.body, {
			plc_ids: { numbersArrayValidator: true },
			flag_playing: { inclusion: bools },
			flag_free: { inclusion: bools },
			flag_visible: { inclusion: bools },
			flag_accepted: { inclusion: bools },
			flag_refused: { inclusion: bools },
		});
		if (!validationErrors) {
			try {
				return await editPLC(req.body.plc_ids, {
					pos: +req.body.pos,
					flag_playing: req.body.flag_playing,
					flag_free: req.body.flag_free,
					flag_visible: req.body.flag_visible,
					flag_accepted: req.body.flag_accepted,
					flag_refused: req.body.flag_refused,
				});
			} catch (err) {
				const code = 'PL_MODIFY_CONTENT_ERROR';
				errMessage(code, err);
				throw { code: err?.code || 500, message: APIMessage(code) };
			}
		} else {
			// Errors detected
			// Sending BAD REQUEST HTTP code and error object.
			throw { code: 400, message: validationErrors };
		}
	});
	router.route('randomizePLC', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		try {
			return await randomizePLC(req.body?.plc_ids);
		} catch (err) {
			errMessage(err.msg);
			throw { code: err?.code || 500, message: APIMessage(err.msg) };
		}
	});
	router.route('votePLC', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req, 'guest', 'limited');
		// Post an upvote
		try {
			return await vote(req.body?.plc_id, req.token.username, req.body?.downvote);
		} catch (err) {
			errMessage(err.msg);
			throw { code: err?.code || 500, message: APIMessage(err.msg) };
		}
	});
	router.route('exportPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		try {
			return await exportPlaylist(req.body?.plaid);
		} catch (err) {
			const code = 'PL_EXPORT_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
	router.route('importPlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		// Imports a playlist and its contents in an importable format (posted as JSON data)
		const validationErrors = check(req.body, {
			playlist: { isJSON: true },
		});
		if (!validationErrors) {
			try {
				const data = await importPlaylist(req.body.playlist, req.token.username);
				const response = {
					plaid: data.plaid,
					unknownRepos: data.reposUnknown,
				};
				return { code: 200, message: APIMessage('PL_IMPORTED', response) };
			} catch (err) {
				const code = 'PL_IMPORT_ERROR';
				errMessage(code, err);
				throw { code: err?.code || 500, message: APIMessage(code) };
			}
		} else {
			// Errors detected
			// Sending BAD REQUEST HTTP code and error object.
			throw { code: 400, message: validationErrors };
		}
	});
	router.route('shufflePlaylist', async (socket: Socket, req: APIData) => {
		await runChecklist(socket, req);
		try {
			return await shufflePlaylist(req.body?.plaid, req.body?.method, req.body?.fullShuffle);
		} catch (err) {
			const code = 'PL_SHUFFLE_ERROR';
			errMessage(code, err);
			throw { code: err?.code || 500, message: APIMessage(code) };
		}
	});
}
