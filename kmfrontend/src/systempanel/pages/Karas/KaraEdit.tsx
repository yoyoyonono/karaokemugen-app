import { Layout } from 'antd';
import i18next from 'i18next';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DBKara } from '../../../../../src/lib/types/database/kara';
import { addListener, removeListener } from '../../../utils/electron';
import { commandBackend } from '../../../utils/socket';
import Title from '../../components/Title';
import KaraForm from './KaraForm';

function KaraEdit() {
	const navigate = useNavigate();
	const { kid } = useParams();

	const [kara, setKara] = useState<DBKara>();
	const [loaded, setLoaded] = useState(false);

	const saveNew = async kara => {
		try {
			await commandBackend('createKara', kara, true, 300000);
			addListener();
			navigate('/system/karas');
		} catch (e) {
			// already display
		}
	};

	const saveUpdate = async kara => {
		try {
			await commandBackend('editKara', kara, true, 300000);
			addListener();
			navigate('/system/karas');
		} catch (e) {
			// already display
		}
	};

	const loadKara = async () => {
		removeListener();
		if (kid) {
			const res = await commandBackend('getKara', { kid }, true);
			setKara(res);
		}
		setLoaded(true);
	};

	const handleCopy = async (kid, repo) => {
		await commandBackend('copyKaraToRepo', { repo, kid }, true);
		navigate('/system/karas');
	};

	const handleDelete = async (kid: string) => {
		try {
			await commandBackend('deleteKaras', { kids: [kid] }, true);
			navigate('/system/karas/');
		} catch (e) {
			// already display
		}
	};

	useEffect(() => {
		loadKara();
	}, []);

	return (
		<>
			<Title
				title={i18next.t(kid ? 'HEADERS.KARAOKE_EDIT.TITLE' : 'HEADERS.KARAOKE_NEW.TITLE')}
				description={i18next.t(kid ? 'HEADERS.KARAOKE_EDIT.DESCRIPTION' : 'HEADERS.KARAOKE_NEW.DESCRIPTION')}
			/>
			<Layout.Content>
				{loaded && (
					<KaraForm
						kara={kara}
						save={kid ? saveUpdate : saveNew}
						handleCopy={handleCopy}
						handleDelete={handleDelete}
					/>
				)}
			</Layout.Content>
		</>
	);
}

export default KaraEdit;
