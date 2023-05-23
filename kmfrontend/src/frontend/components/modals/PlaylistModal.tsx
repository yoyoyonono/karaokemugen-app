import './PlaylistModal.scss';

import i18next from 'i18next';
import { useContext, useState } from 'react';

import { closeModal } from '../../../store/actions/modal';
import { setSettings } from '../../../store/actions/settings';
import GlobalContext from '../../../store/context';
import { getPlaylistInfo, setPlaylistInfo } from '../../../utils/kara';
import { commandBackend } from '../../../utils/socket';
import { displayMessage } from '../../../utils/tools';

interface IProps {
	side: 'left' | 'right';
	mode: 'create' | 'edit';
}

function PlaylistModal(props: IProps) {
	const context = useContext(GlobalContext);
	const playlist = getPlaylistInfo(props.side, context);
	const [name, setName] = useState((props.mode === 'edit' && playlist?.name) || undefined);
	const [flagCurrent, setFlagCurrent] = useState(props.mode === 'edit' ? playlist?.flag_current : false);
	const [flagPublic, setFlagPublic] = useState(props.mode === 'edit' ? playlist?.flag_public : false);
	const [flagVisible, setFlagVisible] = useState(props.mode === 'edit' ? playlist?.flag_visible : true);
	const [flagWhitelist, setFlagWhitelist] = useState(props.mode === 'edit' ? playlist?.flag_whitelist : false);
	const [flagBlacklist, setFlagBlacklist] = useState(props.mode === 'edit' ? playlist?.flag_blacklist : false);
	const [flagSmart, setFlagSmart] = useState(props.mode === 'edit' ? playlist?.flag_smart : false);
	const [error, setError] = useState<string>();

	const createPlaylist = async () => {
		if (!name) {
			setError(i18next.t('MODAL.PLAYLIST_MODAL.NAME_MANDATORY'));
		} else {
			try {
				setError(undefined);
				const response = await commandBackend('createPlaylist', {
					name: name,
					flag_visible: flagVisible,
					flag_current: flagCurrent,
					flag_smart: flagSmart,
					flag_whitelist: flagWhitelist,
					flag_blacklist: flagBlacklist,
					flag_public: flagPublic,
				});
				setPlaylistInfo(props.side, context, response.plaid);
				closeModalWithContext();
			} catch (e) {
				// already display
			}
		}
	};

	const editPlaylist = async () => {
		if (!name) {
			setError(i18next.t('MODAL.PLAYLIST_MODAL.NAME_MANDATORY'));
		} else {
			setError(undefined);
			await commandBackend('editPlaylist', {
				name: name,
				flag_visible: flagVisible,
				flag_current: flagCurrent,
				flag_smart: flagSmart,
				flag_whitelist: flagWhitelist,
				flag_blacklist: flagBlacklist,
				flag_public: flagPublic,
				plaid: playlist.plaid,
			});
			setSettings(context.globalDispatch);
			closeModalWithContext();
		}
	};

	const toggleCurrent = () => {
		if (props.mode === 'edit' && playlist?.flag_current) {
			displayMessage('warning', i18next.t('MODAL.PLAYLIST_MODAL.CANNOT_CURRENT_PLAYLIST'), 4500, 'top-center');
		} else {
			setFlagCurrent(!flagCurrent);
			setFlagWhitelist(false);
			setFlagBlacklist(false);
		}
	};

	const togglePublic = () => {
		if (props.mode === 'edit' && playlist?.flag_public) {
			displayMessage('warning', i18next.t('MODAL.PLAYLIST_MODAL.CANNOT_PUBLIC'), 4500, 'top-center');
		} else {
			setFlagPublic(!flagPublic);
			setFlagWhitelist(false);
			setFlagBlacklist(false);
		}
	};

	const toggleSmart = () => {
		if (props.mode === 'edit') {
			displayMessage('warning', i18next.t('MODAL.PLAYLIST_MODAL.CANNOT_SMART'), 4500, 'top-center');
		} else {
			setFlagSmart(!flagSmart);
			setFlagWhitelist(false);
			setFlagBlacklist(false);
		}
	};

	const toggleBlacklist = () => {
		if (props.mode === 'edit' || flagCurrent || flagPublic) {
			displayMessage('warning', i18next.t('MODAL.PLAYLIST_MODAL.CANNOT_BLACKLIST'), 4500, 'top-center');
		} else {
			setFlagCurrent(false);
			setFlagPublic(false);
			setFlagSmart(true);
			setFlagWhitelist(false);
			setFlagBlacklist(!flagBlacklist);
		}
	};

	const toggleWhitelist = () => {
		if (props.mode === 'edit' || flagCurrent || flagPublic) {
			displayMessage('warning', i18next.t('MODAL.PLAYLIST_MODAL.CANNOT_WHITELIST'), 4500, 'top-center');
		} else {
			setFlagCurrent(false);
			setFlagPublic(false);
			setFlagSmart(true);
			setFlagWhitelist(!flagWhitelist);
			setFlagBlacklist(false);
		}
	};

	const closeModalWithContext = () => closeModal(context.globalDispatch);

	return (
		<div className="modal modalPage">
			<div className="modal-dialog">
				<div className="modal-content">
					<ul className="modal-header">
						<h4 className="modal-title">
							{props.mode === 'edit'
								? i18next.t('MODAL.PLAYLIST_MODAL.EDIT_PLAYLIST', {
										playlist: playlist?.name,
								  })
								: i18next.t('MODAL.PLAYLIST_MODAL.CREATE_PLAYLIST')}
						</h4>
					</ul>
					<div className="modal-body flex-direction-btns">
						<div>{i18next.t('MODAL.PLAYLIST_MODAL.NAME')}</div>
						<div className="form">
							<input
								type="text"
								autoFocus
								className="modal-input"
								defaultValue={name}
								onChange={event => setName(event.target.value)}
							/>
						</div>
						<label className="error">{error}</label>
						<div>
							<button className="btn btn-default" type="button" onClick={toggleCurrent}>
								<input
									type="checkbox"
									checked={flagCurrent}
									disabled={props.mode === 'edit' && playlist?.flag_current}
									onChange={toggleCurrent}
								/>
								<div className="btn-large-container">
									<div className="title">{i18next.t('MODAL.PLAYLIST_MODAL.CURRENT')}</div>
									<div className="desc">{i18next.t('MODAL.PLAYLIST_MODAL.CURRENT_DESC')}</div>
								</div>
							</button>
						</div>
						<div>
							<button className="btn btn-default" type="button" onClick={togglePublic}>
								<input
									type="checkbox"
									checked={flagPublic}
									disabled={props.mode === 'edit' && playlist?.flag_public}
									onChange={togglePublic}
								/>
								<div className="btn-large-container">
									<div className="title">{i18next.t('MODAL.PLAYLIST_MODAL.PUBLIC')}</div>
									<div className="desc">{i18next.t('MODAL.PLAYLIST_MODAL.PUBLIC_DESC')}</div>
								</div>
							</button>
						</div>
						<div>
							<button className="btn btn-default" type="button" onClick={toggleSmart}>
								<input
									type="checkbox"
									checked={flagSmart}
									disabled={props.mode === 'edit'}
									onChange={toggleSmart}
								/>
								<div className="btn-large-container">
									<div className="title">{i18next.t('MODAL.PLAYLIST_MODAL.SMART')}</div>
									<div className="desc">{i18next.t('MODAL.PLAYLIST_MODAL.SMART_DESC')}</div>
								</div>
							</button>
						</div>
						<div>
							<button className="btn btn-default" type="button" onClick={toggleBlacklist}>
								<input
									type="checkbox"
									checked={flagBlacklist}
									disabled={props.mode === 'edit' || flagCurrent || flagPublic}
									onChange={toggleBlacklist}
								/>
								<div className="btn-large-container">
									<div className="title">{i18next.t('MODAL.PLAYLIST_MODAL.BLACKLIST')}</div>
									<div className="desc">{i18next.t('MODAL.PLAYLIST_MODAL.BLACKLIST_DESC')}</div>
								</div>
							</button>
						</div>
						<div>
							<button className="btn btn-default" type="button" onClick={toggleWhitelist}>
								<input
									type="checkbox"
									checked={flagWhitelist}
									disabled={props.mode === 'edit' || flagCurrent || flagPublic}
									onChange={toggleWhitelist}
								/>
								<div className="btn-large-container">
									<div className="title">{i18next.t('MODAL.PLAYLIST_MODAL.WHITELIST')}</div>
									<div className="desc">{i18next.t('MODAL.PLAYLIST_MODAL.WHITELIST_DESC')}</div>
								</div>
							</button>
						</div>
						<div>
							<button
								className="btn btn-default"
								type="button"
								onClick={() => setFlagVisible(!flagVisible)}
							>
								<input
									type="checkbox"
									checked={flagVisible}
									onChange={() => setFlagVisible(!flagVisible)}
								/>
								<div className="btn-large-container">
									<div className="title">{i18next.t('MODAL.PLAYLIST_MODAL.VISIBLE')}</div>
									<div className="desc">{i18next.t('MODAL.PLAYLIST_MODAL.VISIBLE_DESC')}</div>
								</div>
							</button>
						</div>
					</div>
					<div className="modal-footer">
						<button
							type="button"
							className="btn btn-action btn-primary other"
							onClick={closeModalWithContext}
						>
							<i className="fas fa-times" /> {i18next.t('CANCEL')}
						</button>
						<button
							type="button"
							className="btn btn-action btn-default ok"
							onClick={props.mode === 'create' ? createPlaylist : editPlaylist}
						>
							<i className="fas fa-check" />{' '}
							{props.mode === 'create'
								? i18next.t('MODAL.PLAYLIST_MODAL.CREATE')
								: i18next.t('MODAL.PLAYLIST_MODAL.EDIT')}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default PlaylistModal;
