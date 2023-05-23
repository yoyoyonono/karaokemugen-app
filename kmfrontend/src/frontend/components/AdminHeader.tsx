import i18next from 'i18next';
import { merge } from 'lodash';
import { useContext, useEffect, useState } from 'react';
import { render } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';

import { CurrentSong } from '../../../../src/types/playlist';
import { PublicPlayerState } from '../../../../src/types/state';
import KLogo from '../../assets/Klogo.png';
import { logout } from '../../store/actions/auth';
import { showModal } from '../../store/actions/modal';
import GlobalContext from '../../store/context';
import { commandBackend, getSocket } from '../../utils/socket';
import { displayMessage, expand, isNonStandardPlaylist } from '../../utils/tools';
import KmAppHeaderDecorator from './decorators/KmAppHeaderDecorator';
import RadioButton from './generic/RadioButton';
import PlayCurrentModal from './modals/PlayCurrentModal';
import ProfilModal from './modals/ProfilModal';
import Tutorial from './modals/Tutorial';
import UsersModal from './modals/UsersModal';

interface IProps {
	currentPlaylist: PlaylistElem;
	powerOff: (() => void) | undefined;
	adminMessage: () => void;
	putPlayerCommando: (event: any) => void;
}

function AdminHeader(props: IProps) {
	const context = useContext(GlobalContext);
	const [dropDownSettings, setDropDownSettings] = useState(false);
	const [dropDownMenu, setDropDownMenu] = useState(false);
	const [statusPlayer, setStatusPlayer] = useState<PublicPlayerState>();
	const location = useLocation();
	const navigate = useNavigate();

	const closeDropdownMenu = (e: MouseEvent) => {
		if (!(e.target as Element).closest('.klogo') && !(e.target as Element).closest('.dropdown-menu')) {
			setDropDownMenu(false);
		}
		if (!(e.target as Element).closest('.dropdown-settings') && !(e.target as Element).closest('.dropdown-menu')) {
			setDropDownSettings(false);
		}
	};

	const playerUpdate = (data: PublicPlayerState) => {
		let val = data.volume;
		const base = 100;
		const pow = 0.76;
		val = val / base;
		if (!isNaN(val)) data.volume = base * Math.pow(val, 1 / pow);
		setStatusPlayer(oldState => {
			const state = { ...oldState };
			return merge(state, data);
		});
	};

	const toggleProfileModal = () => {
		setDropDownMenu(!dropDownMenu);
		// Prohibit online user editing when online is unavailable
		// onlineAvailable is undefined for local users
		if (context.globalState.auth.data.onlineAvailable !== false) {
			showModal(context.globalDispatch, <ProfilModal scope="admin" />);
		} else {
			displayMessage('warning', i18next.t('ERROR_CODES.USER_ONLINE_NOINTERNET'), 5000);
		}
	};

	const toggleUsersModal = () => {
		setDropDownMenu(!dropDownMenu);
		showModal(context.globalDispatch, <UsersModal scope="admin" />);
	};

	const saveOperatorAdd = (songVisibility: boolean) => {
		const data = expand('Playlist.MysterySongs.AddedSongVisibilityAdmin', songVisibility);
		commandBackend('updateSettings', { setting: data }).catch(() => {});
	};

	const changePublicInterfaceMode = (value: number) => {
		const data = expand('Frontend.Mode', value);
		commandBackend('updateSettings', { setting: data }).catch(() => {});
	};

	const changeLiveComments = (liveComments: boolean) => {
		const data = expand('Player.LiveComments', liveComments);
		commandBackend('updateSettings', { setting: data }).catch(() => {});
	};

	const play = (event: any) => {
		if (
			props.currentPlaylist &&
			(!statusPlayer || statusPlayer?.playerStatus === 'stop') &&
			context.globalState.frontendContext.playlistInfoLeft.plaid !== props.currentPlaylist?.plaid &&
			context.globalState.frontendContext.playlistInfoRight.plaid !== props.currentPlaylist?.plaid &&
			(!isNonStandardPlaylist(context.globalState.frontendContext.playlistInfoLeft.plaid) ||
				!isNonStandardPlaylist(context.globalState.frontendContext.playlistInfoRight.plaid))
		) {
			showModal(
				context.globalDispatch,
				<PlayCurrentModal
					currentPlaylist={props.currentPlaylist}
					displayedPlaylist={context.globalState.frontendContext.playlistInfoRight}
				/>
			);
		} else {
			props.putPlayerCommando(event);
		}
	};

	const getPlayerStatus = async () => {
		try {
			const result = await commandBackend('getPlayerStatus');
			playerUpdate(result);
		} catch (e) {
			// already display
		}
	};

	useEffect(() => {
		if (context.globalState.auth.isAuthenticated) {
			getPlayerStatus();
		}
		getSocket().on('playerStatus', playerUpdate);
		document.getElementById('root').addEventListener('click', closeDropdownMenu);
		return () => {
			getSocket().off('playerStatus', playerUpdate);
			document.getElementById('root')?.removeEventListener('click', closeDropdownMenu);
		};
	}, []);

	const setVolume = event => {
		setStatusPlayer(oldState => {
			const state = { ...oldState };
			state.volume = event.target.value;
			return state;
		});
		props.putPlayerCommando(event);
	};

	const changePitch = changeValue => {
		setStatusPlayer(oldState => {
			const state = { ...oldState };
			const newValue = (changeValue && oldState.pitch + changeValue) || 0; // Reset if parameter is null
			state.pitch = newValue <= 3 && newValue >= -3 ? newValue : oldState.pitch; // Limit possible pitch values
			state.speed = 100; // reset speed
			return state;
		});
	};

	const changeSpeed = changeValue => {
		setStatusPlayer(oldState => {
			const state = { ...oldState };
			const newValue = changeValue === null ? 100 : state.speed + changeValue; // Reset if parameter is null
			state.speed = newValue <= 200 && newValue >= 25 ? newValue : state.speed; // Limit possible speed values
			state.pitch = 0; // reset pitch
			return state;
		});
	};

	return (
		<KmAppHeaderDecorator mode="admin">
			{location.pathname.includes('/options') ? (
				<button title={i18next.t('BACK_PLAYLISTS')} className="btn btn-dark" onClick={() => navigate('/admin')}>
					<i className="fas fa-fw fa-long-arrow-alt-left" />
				</button>
			) : null}
			<div className="dropdown-settings">
				<button
					className="btn btn-dark"
					type="button"
					title={i18next.t('ADMIN_HEADER.QUICK_ACCESS')}
					onClick={() => setDropDownSettings(!dropDownSettings)}
				>
					<i className="fas fa-fw fa-sliders-h" />
				</button>
				{dropDownSettings ? (
					<ul className="dropdown-menu">
						<li title={i18next.t('SETTINGS.KARAOKE.ADDED_SONG_VISIBILITY_ADMIN_TOOLTIP')}>
							<label>
								{i18next.t('SETTINGS.KARAOKE.ADDED_SONG_VISIBILITY_ADMIN_SHORT')}
								&nbsp;
								<i className="far fa-question-circle" />
							</label>
							<RadioButton
								buttons={[
									{
										label: i18next.t('SETTINGS.KARAOKE.ADDED_SONG_VISIBILITY_NORMAL_OPTION'),
										active: context?.globalState.settings.data.config?.Playlist?.MysterySongs
											.AddedSongVisibilityAdmin,
										activeColor: '#3c5c00',
										onClick: () => saveOperatorAdd(true),
										description: i18next.t('SETTINGS.KARAOKE.ADDED_SONG_VISIBILITY_ADMIN_OFF'),
									},
									{
										label: i18next.t('SETTINGS.KARAOKE.ADDED_SONG_VISIBILITY_MYSTERY_OPTION'),
										active: !context?.globalState.settings.data.config?.Playlist?.MysterySongs
											.AddedSongVisibilityAdmin,
										activeColor: '#880500',
										onClick: () => saveOperatorAdd(false),
										description: i18next.t('SETTINGS.KARAOKE.ADDED_SONG_VISIBILITY_ADMIN_ON'),
									},
								]}
							/>
						</li>
						<li title={i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_TOOLTIP')}>
							<label>
								{i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_SHORT')}
								&nbsp;
								<i className="far fa-question-circle" />
							</label>
							<RadioButton
								buttons={[
									{
										label: i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_CLOSED_SHORT'),
										active: context?.globalState.settings.data.config?.Frontend?.Mode === 0,
										activeColor: '#880500',
										onClick: () => changePublicInterfaceMode(0),
										description: i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_CLOSED'),
									},
									{
										label: i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_LIMITED_SHORT'),
										active: context?.globalState.settings.data.config?.Frontend?.Mode === 1,
										activeColor: '#a36700',
										onClick: () => changePublicInterfaceMode(1),
										description: i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_LIMITED'),
									},
									{
										label: i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_OPEN_SHORT'),
										active: context?.globalState.settings.data.config?.Frontend?.Mode === 2,
										activeColor: '#3c5c00',
										onClick: () => changePublicInterfaceMode(2),
										description: i18next.t('SETTINGS.INTERFACE.WEBAPPMODE_OPEN'),
									},
								]}
							/>
						</li>
						{context?.globalState.settings.data.config?.Karaoke?.StreamerMode?.Twitch?.Enabled ? (
							<li title={i18next.t('SETTINGS.PLAYER.LIVE_COMMENTS_TOOLTIP')}>
								<label>
									{i18next.t('SETTINGS.PLAYER.LIVE_COMMENTS')}
									&nbsp;
									<i className="far fa-question-circle" />
								</label>
								<RadioButton
									buttons={[
										{
											label: i18next.t('YES'),
											active: context?.globalState.settings.data.config?.Player?.LiveComments,
											activeColor: '#3c5c00',
											onClick: () => changeLiveComments(true),
										},
										{
											label: i18next.t('NO'),
											active: !context?.globalState.settings.data.config?.Player?.LiveComments,
											activeColor: '#880500',
											onClick: () => changeLiveComments(false),
										},
									]}
								/>
							</li>
						) : null}
					</ul>
				) : null}
			</div>

			<div className={`btn btn-dark splitValueButton speedControl`} id="speedControl">
				{statusPlayer?.speed === 100 && <i className={'icon fa-solid fa-gauge'}></i>}
				{statusPlayer?.speed > 100 && <i className={'icon fa-solid fa-gauge-high'}></i>}
				{statusPlayer?.speed < 100 && <i className={'icon fa-solid fa-gauge-high mirrored-horiz'}></i>}
				<div className={'modifier-buttons'}>
					<button
						title={i18next.t('SPEED_DOWN')}
						id="speedDown"
						className={'button-filled'}
						onMouseDown={_ => changeSpeed(-25)}
						data-namecommand="setSpeed"
						value={statusPlayer?.speed}
						onClick={props.putPlayerCommando}
					>
						-
					</button>
					<button
						title={i18next.t('SPEED_RESET')}
						id="speedReset"
						onMouseDown={_ => changeSpeed(null)}
						data-namecommand="setSpeed"
						value={statusPlayer?.speed}
						onClick={props.putPlayerCommando}
					>
						{(statusPlayer?.speed / 100).toFixed(2)}x
					</button>
					<button
						title={i18next.t('SPEED_UP')}
						id="speedUp"
						className={'button-filled'}
						onMouseDown={_ => changeSpeed(+25)}
						data-namecommand="setSpeed"
						value={statusPlayer?.speed}
						onClick={props.putPlayerCommando}
					>
						+
					</button>
				</div>
			</div>

			<div className={`btn btn-dark splitValueButton pitchControl`} id="pitchControl">
				{statusPlayer?.pitch === 0 && <i className={'icon fa-solid fa-braille'}></i>}
				{statusPlayer?.pitch > 0 && <i className={'icon fa-solid fa-arrow-up-right-dots'}></i>}
				{statusPlayer?.pitch < 0 && <i className={'icon fa-solid fa-arrow-up-right-dots mirrored-vert'}></i>}

				<div className={'modifier-buttons'}>
					<button
						title={i18next.t('PITCH_DOWN')}
						id="pitchDown"
						className={'button-filled'}
						onMouseDown={_ => changePitch(-1)}
						data-namecommand="setPitch"
						value={statusPlayer?.pitch}
						onClick={props.putPlayerCommando}
					>
						-
					</button>
					<button
						title={i18next.t('PITCH_RESET')}
						id="pitchReset"
						onMouseDown={_ => changePitch(null)}
						data-namecommand="setPitch"
						value={statusPlayer?.pitch}
						onClick={props.putPlayerCommando}
					>
						{statusPlayer?.pitch}
					</button>
					<button
						title={i18next.t('PITCH_UP')}
						id="pitchUp"
						className={'button-filled'}
						onMouseDown={_ => changePitch(+1)}
						data-namecommand="setPitch"
						value={statusPlayer?.pitch}
						onClick={props.putPlayerCommando}
					>
						+
					</button>
				</div>
			</div>

			<div className="header-group controls">
				{statusPlayer?.stopping || statusPlayer?.streamerPause ? (
					<button
						title={i18next.t('STOP_NOW')}
						id="stopNow"
						data-namecommand="stopNow"
						className="btn btn-danger stopButton"
						onClick={props.putPlayerCommando}
					>
						<i className="fas fa-fw fa-stop" />
					</button>
				) : (
					<button
						title={i18next.t('STOP_AFTER')}
						id="stopAfter"
						data-namecommand="stopAfter"
						className="btn btn-danger-low stopButton"
						onClick={props.putPlayerCommando}
					>
						<i className="fas fa-fw fa-stop" />
					</button>
				)}
				<button
					title={i18next.t('PREVIOUS_SONG')}
					id="prev"
					data-namecommand="prev"
					className="btn btn-default"
					onClick={props.putPlayerCommando}
					disabled={(statusPlayer?.currentSong as CurrentSong)?.pos === 1}
				>
					<i className="fas fa-fw fa-fast-backward" />
				</button>
				<button
					title={i18next.t('PLAY_PAUSE')}
					id="status"
					data-namecommand={statusPlayer && statusPlayer.playerStatus === 'play' ? 'pause' : 'play'}
					className="btn btn-primary"
					onClick={play}
				>
					{statusPlayer?.playerStatus === 'play' ? (
						<i className="fas fa-fw fa-pause" />
					) : (
						<i className="fas fa-fw fa-play" />
					)}
				</button>
				<button
					title={i18next.t('NEXT_SONG')}
					id="skip"
					data-namecommand="skip"
					className="btn btn-default"
					onClick={props.putPlayerCommando}
					disabled={(statusPlayer?.currentSong as CurrentSong)?.pos === props.currentPlaylist?.karacount}
				>
					<i className="fas fa-fw fa-fast-forward" />
				</button>
				<button
					title={i18next.t('REWIND')}
					id="goTo"
					data-namecommand="goTo"
					defaultValue="0"
					className="btn btn-danger-low rewindButton"
					onClick={props.putPlayerCommando}
				>
					<i className="fas fa-fw fa-undo-alt" />
				</button>
			</div>

			<button
				title={i18next.t('MESSAGE')}
				id="adminMessage"
				className="btn btn-dark messageButton"
				onClick={props.adminMessage}
			>
				<i className="fas fa-fw fa-comment" />
			</button>

			<div className="btn-tile-group displayModifierButtons" id="displayModifierButtons">
				<button
					title={i18next.t(statusPlayer?.showSubs ? 'HIDE_SUBS' : 'SHOW_SUBS')}
					id="showSubs"
					data-namecommand={statusPlayer?.showSubs ? 'hideSubs' : 'showSubs'}
					className={`btn btn-tile btn-dark subtitleButton ${
						statusPlayer?.showSubs ? 'hideSubs' : 'showSubs'
					}`}
					onClick={props.putPlayerCommando}
				>
					<span className="fa-stack">
						<i className="fas fa-fw fa-closed-captioning fa-stack-1x" />
						<i className="fas fa-fw fa-ban fa-stack-2x" style={{ color: '#943d42', opacity: 0.7 }} />
					</span>
					<span className="fa-stack">
						<i className="fas fa-fw fa-closed-captioning" />
					</span>
				</button>
				<button
					title={i18next.t(statusPlayer?.blurVideo ? 'BLURVIDEO_UNBLUR' : 'BLURVIDEO_BLUR')}
					id="blurVideo"
					data-namecommand={statusPlayer?.blurVideo ? 'unblurVideo' : 'blurVideo'}
					className={`btn btn-tile btn-dark ${statusPlayer?.blurVideo ? 'unblurVideo' : 'blurVideo'}`}
					onClick={props.putPlayerCommando}
				>
					<i className={`fas fa-fw ${statusPlayer?.blurVideo ? 'fa-hand' : 'fa-hand-sparkles'}`} />
				</button>
			</div>

			<button type="button" title={i18next.t('MUTE_UNMUTE')} className="btn btn-dark volumeButton">
				<div
					id="mute"
					data-namecommand={statusPlayer?.volume === 0 || statusPlayer?.mute ? 'unmute' : 'mute'}
					onClick={props.putPlayerCommando}
				>
					{statusPlayer?.volume === 0 || statusPlayer?.mute ? (
						<i className="fas fa-fw fa-volume-mute" />
					) : statusPlayer?.volume > 66 ? (
						<i className="fas fa-fw fa-volume-up" />
					) : statusPlayer?.volume > 33 ? (
						<i className="fas fa-fw fa-volume-down" />
					) : (
						<i className="fas fa-fw fa-volume-off" />
					)}
				</div>
				{statusPlayer ? (
					<input
						title={i18next.t('VOLUME_LEVEL')}
						data-namecommand="setVolume"
						id="volume"
						value={statusPlayer.volume}
						type="range"
						onInput={setVolume}
					/>
				) : null}
			</button>
			<div className="dropdown">
				<button className="btn btn-dark klogo" type="button" onClick={() => setDropDownMenu(!dropDownMenu)}>
					<img src={KLogo} alt="Karaoke Mugen logo" />
				</button>
				{dropDownMenu ? (
					<ul className="dropdown-menu">
						<li>
							<a
								href={`/admin${location.pathname.includes('/options') ? '' : '/options'}`}
								onClick={e => {
									e.preventDefault();
									navigate(`/admin${location.pathname.includes('/options') ? '' : '/options'}`);
									setDropDownMenu(!dropDownMenu);
								}}
							>
								{location.pathname.includes('/options') ? (
									<>
										<i className="fas fa-fw fa-list-ul" />
										&nbsp;{i18next.t('CL_PLAYLISTS')}
									</>
								) : (
									<>
										<i className="fas fa-fw fa-cog" />
										&nbsp;{i18next.t('OPTIONS')}
									</>
								)}
							</a>
						</li>
						<li>
							<div onClick={toggleProfileModal}>
								<i className="fas fa-fw fa-user" />
								&nbsp;{i18next.t('ACCOUNT')}
							</div>
						</li>
						<li>
							<div onClick={toggleUsersModal}>
								<i className="fas fa-fw fa-users" />
								&nbsp;{i18next.t('USERLIST')}
							</div>
						</li>
						<li>
							<div onClick={() => logout(context.globalDispatch)}>
								<i className="fas fa-fw fa-sign-out-alt" />
								&nbsp;{i18next.t('LOGOUT')}
							</div>
						</li>
						<li>
							<div
								onClick={() => {
									render(<Tutorial />, document.getElementById('tuto'));
									setDropDownMenu(!dropDownMenu);
								}}
							>
								<i className="fas fa-fw fa-question-circle" />
								&nbsp;{i18next.t('MODAL.TUTORIAL.TITLE')}
							</div>
						</li>
						<li>
							<a href="/welcome">
								<i className="fas fa-fw fa-home" />
								&nbsp;{i18next.t('HOME_BUTTON')}
							</a>
						</li>
						{props.powerOff ? (
							<li>
								<div onClick={props.powerOff}>
									<i className="fas fa-fw fa-power-off" />
									&nbsp;{i18next.t('SHUTDOWN')}
								</div>
							</li>
						) : null}
						<li className="buttonsMobileMenu">
							<div
								onClick={() => {
									props.adminMessage();
									setDropDownMenu(!dropDownMenu);
								}}
							>
								<i className="fas fa-fw fa-comment" />
								&nbsp;{i18next.t('MESSAGE')}
							</div>
						</li>
						<li className="buttonsMobileMenu">
							<div
								onClick={event => {
									props.putPlayerCommando(event);
									setDropDownMenu(!dropDownMenu);
								}}
								data-namecommand={statusPlayer?.showSubs ? 'hideSubs' : 'showSubs'}
								id="showSubs"
							>
								<i className="fas fa-fw fa-closed-captioning" />
								&nbsp;{i18next.t(statusPlayer?.showSubs ? 'HIDE_SUBS' : 'SHOW_SUBS')}
							</div>
						</li>
						<li className="buttonsMobileMenu">
							<div
								onClick={event => {
									props.putPlayerCommando(event);
									setDropDownMenu(!dropDownMenu);
								}}
								id="goTo"
								data-namecommand="goTo"
							>
								<i className="fas fa-fw fa-undo-alt" />
								&nbsp;{i18next.t('REWIND')}
							</div>
						</li>
						<li className="buttonsMobileMenuSmaller">
							<div
								onClick={event => {
									props.putPlayerCommando(event);
									setDropDownMenu(!dropDownMenu);
								}}
								id="mute"
								data-namecommand={statusPlayer?.volume === 0 || statusPlayer?.mute ? 'unmute' : 'mute'}
							>
								{statusPlayer?.volume === 0 || statusPlayer?.mute ? (
									<i className="fas fa-fw fa-volume-mute" />
								) : statusPlayer?.volume > 66 ? (
									<i className="fas fa-fw fa-volume-up" />
								) : statusPlayer?.volume > 33 ? (
									<i className="fas fa-fw fa-volume-down" />
								) : (
									<i className="fas fa-fw fa-volume-off" />
								)}
								&nbsp;{i18next.t('MUTE_UNMUTE')}
							</div>
						</li>
						<li className="buttonsMobileMenuSmaller">
							{statusPlayer?.stopping || statusPlayer?.streamerPause ? (
								<div
									onClick={event => {
										props.putPlayerCommando(event);
										setDropDownMenu(!dropDownMenu);
									}}
									id="stopNow"
									data-namecommand="stopNow"
								>
									<i className="fas fa-fw fa-stop" />
									&nbsp;{i18next.t('STOP_NOW')}
								</div>
							) : (
								<div
									onClick={event => {
										props.putPlayerCommando(event);
										setDropDownMenu(!dropDownMenu);
									}}
									id="stopAfter"
									data-namecommand="stopAfter"
								>
									<i className="fas fa-fw fa-stop" />
									&nbsp;{i18next.t('STOP_AFTER')}
								</div>
							)}
						</li>
					</ul>
				) : null}
			</div>
		</KmAppHeaderDecorator>
	);
}

export default AdminHeader;
