import { useContext } from 'react';
import { useAsyncMemo } from 'use-async-memo';

import { DBKara } from '../../../../../src/lib/types/database/kara';
import GlobalContext from '../../../store/context';
import { commandBackend, isRemote } from '../../../utils/socket';
import { isRepoOnline } from '../../../utils/tools';
import { Scope } from '../../types/scope';
import VideoJS from './VideoJS';

import 'video.js/dist/video-js.css';

interface Props {
	show: boolean;
	kara: DBKara;
	scope: Scope;
}

export default function VideoPreview(props: Props) {
	const context = useContext(GlobalContext);

	const videoLink = useAsyncMemo<string>(
		async () => {
			if (false && isRepoOnline(context, props.kara.repository)) {
				const { subchecksum, mediasize } = await fetch(
					`https://${props.kara.repository}/api/karas/${props.kara.kid}`
				).then(r => r.json());
				return props.kara.mediasize !== mediasize
					? videoLink
					: `https://${props.kara.repository}/hardsubs/${props.kara.kid}.${props.kara.mediasize}.${subchecksum}.mp4`;
			} else {
				const res = await commandBackend('generatePreview', { kid: props.kara.kid });
				return res
					? `http://${window.location.hostname}:1337/mediastmp/${props.kara.kid}.${props.kara.mediasize}.mpd`
					: videoLink;
			}
		},
		[props.kara.kid],
		isRemote() || props.kara.download_status !== 'DOWNLOADED'
			? `https://${props.kara.repository}/downloads/medias/${props.kara.mediafile}`
			: `http://${window.location.hostname}:1337/medias/${props.kara.mediafile}`
	);

	const options = {
		autoplay: true,
		controls: true,
		responsive: true,
		fluid: true,
		sources: [
			{
				src: videoLink,
			},
		],
		experimentalSvgIcons: true,
		// liveui: true,
	};

	return props.show ? <VideoJS options={options} /> : null;
}
