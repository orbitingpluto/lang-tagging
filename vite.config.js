import { defineConfig } from 'vite';

export default defineConfig({
  root: "web-ui",
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  base: '/lang-tagging/'
});
