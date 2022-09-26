import { dialog, globalShortcut, systemPreferences } from 'electron';
import i18next from 'i18next';

import { getConfig } from '../lib/utils/config';
import { next, pausePlayer, playPlayer, prev, stopPlayer } from '../services/player';
import { getState } from '../utils/state';

export async function registerShortcuts() {
	if (process.platform === 'darwin') {
		if (getConfig().App.FirstRun)
			await dialog.showMessageBox({
				title: i18next.t('PERMISSIONS_KEYBOARD_INFO_MACOS.TITLE'),
				message: i18next.t('PERMISSIONS_KEYBOARD_INFO_MACOS.MESSAGE'),
			});
		systemPreferences.isTrustedAccessibilityClient(true);
	}
	globalShortcut.register('MediaPlayPause', () => {
		getState().player.playerStatus === 'play' ? pausePlayer() : playPlayer().catch(() => {});
	});
	globalShortcut.register('MediaNextTrack', () => {
		next().catch(() => {});
	});
	globalShortcut.register('MediaPreviousTrack', () => {
		prev().catch(() => {});
	});
	globalShortcut.register('MediaStop', () => {
		stopPlayer().catch(() => {});
	});
}

export function unregisterShortcuts() {
	globalShortcut.unregisterAll();
}
