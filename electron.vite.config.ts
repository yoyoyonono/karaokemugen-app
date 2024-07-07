import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
	main: {
		build: {
			lib: {
				entry: 'src/index.ts',
			},
		},
		plugins: [externalizeDepsPlugin()],
	},
	preload: {
		build: {
			lib: {
				entry: 'src/electron/preload.ts',
			},
		},
		plugins: [externalizeDepsPlugin()],
	},
	renderer: {
		root: 'kmfrontend/',
		build: {
			rollupOptions: {
				input: 'kmfrontend/index.html',
			},
			sourcemap: true,
		},
		plugins: [nodePolyfills(), react(), legacy()],
		server: {
			port: 3000,
			proxy: {
				'/avatars': 'http://localhost:1337',
				'/previews': 'http://localhost:1337',
				'/api': 'http://localhost:1337',
			},
		},
	},
});
