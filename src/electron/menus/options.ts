import i18next from 'i18next';

import { getConfig, setConfig } from '../../lib/utils/config';
import { MenuItemBuilderFunction } from '../../types/electron';
import { getState } from '../../utils/state';
import { urls } from './';

const builder: MenuItemBuilderFunction = (options) => {
	const { isMac, layout } = options;
	const isReduced = layout === 'REDUCED';
	if (isReduced) {
		return null;
	}
	return {
		label: i18next.t('MENU_OPTIONS'),
		visible: !isMac,
		submenu: [
			{
				label: i18next.t('MENU_OPTIONS_CHECKFORUPDATES'),
				type: 'checkbox',
				checked: getConfig().Online.Updates.App,
				visible: !getState().forceDisableAppUpdate,
				click: () => {
					setConfig({Online: {Updates: { App: !getConfig().Online.Updates.App}}});
				}
			},
			!isReduced ? { type: 'separator' } : null,
			{
				label: i18next.t('MENU_OPTIONS_OPERATORCONFIG'),
				accelerator: 'CmdOrCtrl+T',
				click: urls.operatorOptions
			},
			{
				label: i18next.t('MENU_OPTIONS_SYSTEMCONFIG'),
				accelerator: 'CmdOrCtrl+G',
				click: urls.systemOptions
			},
		]
	};
};

export default builder;