import './common.scss';
import './utils/electron';
import './utils/i18n';
import './utils/isoLanguages';
import './utils/polyfills';
import './utils/socket';

import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import GlobalStateProvider from './store/GlobalStateProvider';

const container = document.getElementById('mountpoint');
const root = createRoot(container);

root.render(
	<GlobalStateProvider>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</GlobalStateProvider>
);
