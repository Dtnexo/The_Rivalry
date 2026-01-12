import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                register: resolve(__dirname, 'register.html'),
                home: resolve(__dirname, 'home.html'),
                game: resolve(__dirname, 'game.html'),
            },
        },
    },
});
