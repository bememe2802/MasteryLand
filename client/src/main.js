import { createApp } from 'vue';
import App from './ui/App.vue';
import './style.css';

// Mount the UI first: the engine looks up the minimap canvas the UI renders.
createApp(App).mount('#ui');
import('./game/engine.js').then(({ start }) => start());
