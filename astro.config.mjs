import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://funiki.design',
  compressHTML: true,
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: 'auto',
  },
});