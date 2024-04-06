import i18next from 'i18next';
import langs from 'langs';
import { intersectionWith, isEqual } from 'lodash';

import {
	deleteCriteria,
	insertCriteria,
	insertPlaylist,
	selectCriterias,
	selectKarasFromCriterias,
	truncateCriterias,
	updatePlaylistLastEditTime,
} from '../dao/playlist.js';
import { Criteria } from '../lib/types/playlist.js';
import { uuidRegexp } from '../lib/utils/constants.js';
import { ErrorKM } from '../lib/utils/error.js';
import logger, { profile } from '../lib/utils/logger.js';
import { isNumber } from '../lib/utils/validators.js';
import { emitWS } from '../lib/utils/ws.js';
import { adminToken } from '../utils/constants.js';
import Sentry from '../utils/sentry.js';
import { getState, setState } from '../utils/state.js';
import { downloadStatuses } from './download.js';
import { getKara } from './kara.js';
import {
	addKaraToPlaylist,
	editPLC,
	getPlaylistContentsMini,
	getPlaylistInfo,
	getPlaylists,
	removeKaraFromPlaylist,
} from './playlist.js';
import { getTag, getTags } from './tag.js';
import { DBPL } from '../types/database/playlist.js';

const service = 'SmartPlaylist';

export async function getCriterias(plaid: string, lang?: string, translate = true): Promise<Criteria[]> {
	try {
		profile('getCriterias');
		const c = await selectCriterias(plaid);
		if (!translate) return c;
		return await translateCriterias(c, lang);
	} catch (err) {
		logger.error(`Error getting criterias : ${err}`, { service });
		Sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('CRITERIAS_GET_ERROR');
	} finally {
		profile('getCriterias');
	}
}

export async function emptyCriterias(plaid: string) {
	try {
		profile('emptyCriterias');
		logger.debug('Wiping criterias', { service });
		const pl = await getPlaylistInfo(plaid);
		if (!pl) throw new ErrorKM('UNKNOWN_PLAYLIST', 404, false);
		await truncateCriterias(plaid);
		if (pl.flag_smart) {
			await updateSmartPlaylist(plaid);
			const isBlacklist = plaid === getState().blacklistPlaid;
			const isWhitelist = plaid === getState().whitelistPlaid;
			if (isBlacklist || isWhitelist) {
				updateAllSmartPlaylists(isBlacklist, isWhitelist);
			}
		}
	} catch (err) {
		logger.error(`Error emptying criterias for playlist ${plaid} : ${err}`, { service });
		Sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('CRITERIAS_EMPTY_ERROR');
	} finally {
		profile('emptyCriterias');
	}
}

export async function updateAllSmartPlaylists(skipBlacklist = false, skipWhitelist = false) {
	profile('updateAllSmartPlaylists');
	logger.info('Updating all smart playlists...', { service });
	const pls = await getPlaylists(adminToken);
	const updatePromises = [];
	// We need to update the whitelist first if it's smart, then the blacklist, then all others.
	const wl = pls.find(p => p.flag_whitelist && p.flag_smart);
	if (wl && !skipWhitelist) await updateSmartPlaylist(wl.plaid);
	const bl = pls.find(p => p.flag_blacklist && p.flag_smart);
	if (bl && !skipBlacklist) await updateSmartPlaylist(bl.plaid);
	if ((wl && !skipWhitelist) || (bl && !skipBlacklist)) emitWS('refreshLibrary');
	for (const pl of pls.filter(p => p.flag_smart && !p.flag_whitelist && !p.flag_blacklist)) {
		updatePromises.push(updateSmartPlaylist(pl.plaid));
	}
	await Promise.all(updatePromises);
	profile('updateAllSmartPlaylists');
}

export async function updateSmartPlaylist(plaid: string) {
	profile(`updateSmartPlaylist-${plaid}`);
	const pl = await getPlaylistInfo(plaid);
	if (!pl.flag_smart) {
		// Playlist is not smart! We're not throwing, simply returning.
		logger.info(`Playlist "${pl.name}" is not a smart one, skipping update`);
		return;
	}

	logger.info(`Updating smart playlist "${pl.name}"...`, { service });
	const [plc, list] = await Promise.all([
		getPlaylistContentsMini(plaid),
		selectKarasFromCriterias(plaid, pl.type_smart),
	]);

	// First we need to trim our list if a limit is in place
	if (pl.flag_smartlimit) {
		// First, sort by newest or oldest
		list.sort((a, b) => (a.created_at > b.created_at ? 1 : b.created_at > a.created_at ? -1 : 0));
		if (pl.smart_limit_order === 'newest') list.reverse();
		// Now let's trim that list!
		const trimmedListInfo = {
			songs: list.length,
			duration: list.reduce((a, b) => a + b.duration, 0),
		};
		// Time in pl.smart_limit_number is in minutes)
		const trimTarget = pl.smart_limit_type === 'duration' ? pl.smart_limit_number * 60 : pl.smart_limit_number;
		while (trimmedListInfo[pl.smart_limit_type] > trimTarget) {
			const lastSong = list.pop();
			if (pl.smart_limit_type === 'songs') trimmedListInfo.songs -= 1;
			if (pl.smart_limit_type === 'duration') trimmedListInfo.duration -= lastSong.duration;
		}
	}

	// We compare what we have in the playlist and what we have in the generated list, removing and adding songs without changing the order.

	const removedSongs = plc.filter(pc => !list.find(l => l.kid === pc.kid));
	const addedSongs = list.filter(l => !plc.find(pc => pc.kid === l.kid));
	const sameSongs = list.filter(l => plc.find(pc => pc.kid === l.kid));

	// We need to run through the addedSongs part and consolidate it
	// Because getKarasFromCriterias will give us the same song several times if it's from an UNION.
	const newMap = new Map<string, Criteria[]>();
	for (const song of addedSongs) {
		let criterias = newMap.get(song.kid);
		criterias ? (criterias = [].concat(criterias, song.criterias)) : (criterias = song.criterias);
		newMap.set(song.kid, criterias);
	}
	const newArray = Array.from(newMap, ([kid, criterias]) => ({ kid, criterias }));

	// Tricky part, we need to compare criterias between the list we got and the criterias stored in the PLC.
	const sameMap = new Map<string, Criteria[]>();
	for (const song of sameSongs) {
		let criterias = sameMap.get(song.kid);
		criterias ? (criterias = [].concat(criterias, song.criterias)) : (criterias = song.criterias);
		sameMap.set(song.kid, criterias);
	}
	// Now that we aggregated, we need to compare.
	const modifiedSongs = plc.filter(pc => {
		const songCriterias = sameMap.get(pc.kid);
		// No more criterias exist, it means the song got deleted by another criteria
		if (!songCriterias) return false;
		// If song has no criterias it has been added manually somehow.
		if (!pc.criterias) return false;
		// True if song has been modified
		return intersectionWith(songCriterias, pc.criterias, isEqual).length !== pc.criterias.length;
	});

	// Removed songs, that's simple.
	if (removedSongs.length > 0) {
		try {
			await removeKaraFromPlaylist(
				removedSongs.map(s => s.plcid),
				adminToken,
				false,
				true
			);
		} catch (err) {
			logger.warn(`Unable to remove karaokes from playlist "${pl.name}"`, { service, obj: err });
		}
	}
	if (addedSongs.length > 0) {
		try {
			await addKaraToPlaylist({
				kids: addedSongs.map(s => s.kid),
				requester: pl.username,
				plaid,
				ignoreQuota: true,
				refresh: false,
				criterias: newArray,
				visible: false,
			});
		} catch (err) {
			logger.warn(`Unable to add karaokes to playlist "${pl.name}"`, { service, obj: err });
		}
	}
	for (const song of modifiedSongs) {
		try {
			await editPLC(
				[song.plcid],
				{
					criterias: song.criterias,
				},
				false
			);
		} catch (err) {
			logger.warn(`Unable to edit PLCs in playlist "${pl.name}"`, { service, obj: err });
		}
	}
	updatePlaylistLastEditTime(plaid);
	emitWS('playlistContentsUpdated', plaid);
	emitWS('playlistInfoUpdated', plaid);
	profile(`updateSmartPlaylist-${plaid}`);
}

export async function removeCriteria(cs: Criteria[]) {
	try {
		profile('delCriteria');
		logger.debug('Deleting criterias', { service });
		const promises: Promise<any>[] = [];
		for (const c of cs) {
			promises.push(deleteCriteria(c));
		}
		await Promise.all(promises);
		const playlistsToUpdate = new Set<string>();
		for (const c of cs) {
			playlistsToUpdate.add(c.plaid);
		}
		if (playlistsToUpdate.has(getState().whitelistPlaid) || playlistsToUpdate.has(getState().blacklistPlaid)) {
			updateAllSmartPlaylists();
		} else {
			for (const plaid of playlistsToUpdate.values()) {
				updateSmartPlaylist(plaid);
			}
		}
	} catch (err) {
		logger.error(`Error removing criterias : ${err}`, { service });
		Sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('CRITERIAS_REMOVE_ERROR');
	} finally {
		profile('delCriteria');
	}
}

/** Add one or more criterias to smart playlists
 * I hereby declare this is one of the cursed functions of Karaoke Mugen
 */
export async function addCriteria(cs: Criteria[]) {
	try {
		profile('addCriteria');
		if (!Array.isArray(cs)) throw new ErrorKM('INVALID_DATA', 400, false);
		logger.info(`Adding criterias = ${JSON.stringify(cs)}`, { service });
		const playlistsFromDB = await getPlaylists(adminToken);
		const playlistsToUpdate = new Set<string>();
		const playlists = new Map<string, Criteria[]>();
		for (const c of cs) {
			// Dispatch criterias by playlist
			let criterias = playlists.get(c.plaid);
			if (!criterias) criterias = [];
			criterias.push(c);
			playlists.set(c.plaid, criterias);
			// Remember which smart playlists will need to be updated
			if (playlistsToUpdate.has(c.plaid)) continue;
			const pl = playlistsFromDB.find(p => p.plaid === c.plaid);
			if (!pl) throw new ErrorKM('UNKNOWN_PLAYLIST', 404, false);
			playlistsToUpdate.add(c.plaid);
		}
		// Get criterias for all playlists and merge them with the existing ones
		for (const plaid of playlists.keys()) {
			const pl = playlistsFromDB.find(p => p.plaid === plaid);
			const existingCriterias = await getCriterias(plaid, null, false);
			let criterias = playlists.get(plaid);
			criterias = [...criterias, ...existingCriterias];
			playlists.set(plaid, criterias);
			validateCriterias(criterias, pl);
		}
		await insertCriteria(cs);
		if (playlistsToUpdate.has(getState().whitelistPlaid) || playlistsToUpdate.has(getState().blacklistPlaid)) {
			updateAllSmartPlaylists();
		} else {
			for (const plaid of playlistsToUpdate.values()) {
				updateSmartPlaylist(plaid);
			}
		}
	} catch (err) {
		logger.error(`Error creating problematic smart playlist : ${err}`, { service });
		Sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('CRITERIAS_ADD_ERROR');
	} finally {
		profile('addCriteria');
	}
}

// Validate criterias from a playlist, throws on error
export function validateCriterias(criterias: Criteria[], pl: DBPL) {
	// Validation
	// BLC 1002 - 1002: 0
	// BLC 1003 - 1002: 1
	// Placed to true to check for multiples occurrences of the same type
	const duplicateC = new Set();
	for (const c of criterias) {
		if (c.type < 0 || c.type > 1008 || c.type === 1000) {
			logger.error(`Incorrect criteria type : ${c.type}`, { service });
			throw new ErrorKM('INVALID_DATA', 400, false);
		}
		if (c.type === 1006) {
			if (!downloadStatuses.includes(c.value)) {
				logger.error(`Incorrect criteria data for type ${c.type} : ${c.value}`, { service });
				throw new ErrorKM('INVALID_DATA', 400, false);
			}
		}
		if (c.type === 1001 || (c.type >= 1 && c.type < 1000)) {
			if (!c.value.match(uuidRegexp)) {
				logger.error(`Incorrect criteria data for type ${c.type} : ${c.value}`, { service });
				throw new ErrorKM('INVALID_DATA', 400, false);
			}
		}
		if (c.type === 1002 || c.type === 1003 || c.type === 1007 || c.type === 1008) {
			c.value = +c.value;
			if (!isNumber(c.value)) {
				logger.error(`Incorrect criteria data for type ${c.type} : ${c.value}`, { service });
				throw new ErrorKM('INVALID_DATA', 400, false);
			}
			if (duplicateC.has(c.type)) {
				logger.error(`Criteria type ${c.type} can only occur once`, { service });
				throw new ErrorKM('INVALID_DATA', 400, false);
			}
			duplicateC.add(c.type);
			// Only do opposing checks on INTERSECT smart playlists. On UNION ones someone can want songs older than 2023 and younger than 1982 on the same playlist.
			if (pl.type_smart === 'INTERSECT') {
				// c.type should be 1002 or 1003 for time, and 1007 or 1008 for year
				const opposingTimeC = c.type === 1002 ? 1003 : c.type === 1003 ? 1002 : null;
				const opposingYearC = c.type === 1007 ? 1008 : c.type === 1008 ? 1007 : null;
				const opposingC = criterias.find(c => c.type === opposingTimeC || c.type === opposingYearC);

				if (opposingC) {
					if (c.type === 1002 && c.value >= opposingC.value) {
						throw new ErrorKM('C_LONGER_THAN_CONFLICT', 409, false);
					} else if (c.type === 1003 && c.value <= opposingC.value) {
						throw new ErrorKM('C_SHORTER_THAN_CONFLICT', 409, false);
					} else if (c.type === 1007 && c.value >= opposingC.value) {
						throw new ErrorKM('C_AFTER_YEAR_CONFLICT', 409, false);
					} else if (c.type === 1008 && c.value <= opposingC.value) {
						throw new ErrorKM('C_BEFORE_YEAR_CONFLICT', 409, false);
					}
				}
			}
		}
	}
}

async function translateCriterias(cList: Criteria[], lang: string): Promise<Criteria[]> {
	// If lang is not provided, assume we're using node's system locale
	if (!lang) lang = getState().defaultLocale;
	// Test if lang actually exists in ISO639-1 format
	if (!langs.has('1', lang)) throw `Unknown language : ${lang}`;
	// We need to read the detected locale in ISO639-1
	const langObj = langs.where('1', lang);
	for (const i in cList) {
		if ({}.hasOwnProperty.call(cList, i)) {
			if (cList[i].type === 1) {
				// We just need to translate the tag name if there is a translation
				if (typeof cList[i].value !== 'string') throw `BLC value is not a string : ${cList[i].value}`;
				cList[i].value_i18n = cList[i].value;
			}
			if (cList[i].type >= 1 && cList[i].type <= 999) {
				// We need to get the tag name and then translate it if needed
				const tag = await getTag(cList[i].value).catch(() => {});
				tag ? (cList[i].value_i18n = tag.i18n[langObj['2B']] || tag.i18n.eng || tag.name) : (cList[i] = null);
			}
			if (cList[i].type === 1001) {
				// We have a kara ID, let's get the kara itself and append it to the value
				const kara = await getKara(cList[i].value, adminToken, lang);
				// If it doesn't exist anymore, remove the entry with null.
				kara ? (cList[i].value = kara) : (cList[i] = null);
			}
			// No need to do anything, values have been modified if necessary
		}
	}
	// Filter all nulls
	return cList.filter(blc => blc !== null);
}

export async function createProblematicSmartPlaylist() {
	try {
		const tags = await getTags({ type: 15 });
		const plaid = await insertPlaylist({
			name: i18next.t('PROBLEMATIC_SONGS'),
			created_at: new Date(),
			modified_at: new Date(),
			flag_visible: true,
			flag_smart: true,
			username: 'admin',
			type_smart: 'UNION',
		});
		const blcs: Criteria[] = [];

		for (const tag of tags.content) {
			blcs.push({
				plaid,
				type: tag.types[0],
				value: tag.tid,
			});
		}
		await addCriteria(blcs);
		await updateSmartPlaylist(plaid);
	} catch (err) {
		logger.error(`Error creating problematic smart playlist : ${err}`, { service });
		Sentry.error(err);
		throw err instanceof ErrorKM ? err : new ErrorKM('PROBLEMATIC_SMART_PLAYLIST_ERROR');
	}
}

// Actions took when a new whitelist is set
export function whitelistHook(plaid: string) {
	const oldWhitelistPlaylist_id = getState().whitelistPlaid;
	updatePlaylistLastEditTime(oldWhitelistPlaylist_id);
	emitWS('playlistInfoUpdated', oldWhitelistPlaylist_id);
	emitWS('refreshLibrary');
	setState({ whitelistPlaid: plaid });
}

// Actions took when a new blacklist is set
export function blacklistHook(plaid: string) {
	const oldBlacklistPlaylist_id = getState().blacklistPlaid;
	updatePlaylistLastEditTime(oldBlacklistPlaylist_id);
	emitWS('playlistInfoUpdated', oldBlacklistPlaylist_id);
	emitWS('refreshLibrary');
	setState({ blacklistPlaid: plaid });
}
