import { createApp } from 'vue';
import App from './ui/App.vue';
import { ensureLogin } from './game/net.js';
import './style.css';

// Mount the UI first: the engine looks up the minimap canvas the UI renders.
createApp(App).mount('#ui');
// Sign-in starts right away, so the Google button shows while the 3D engine is still downloading.
const login = ensureLogin();
login.catch(() => {});
import('./game/engine.js').then(({ start }) => start(login));
