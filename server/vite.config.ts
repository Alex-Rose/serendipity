import path from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  appType: "custom",
  // The public page, cards and styles are shared with the static site in ../web.
  resolve: {
    alias: [
      // ../web/src/fonts.ts imports the fonts; resolve them from this package.
      { find: /^@fontsource-variable\/(.*)$/, replacement: path.join(root, "node_modules/@fontsource-variable/$1") },
    ],
  },
  server: {
    fs: { allow: [path.resolve(root, "..")] },
  },
  build: {
    // Keep fonts etc. as files; the CSP doesn't allow data: fonts.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: path.join(root, "index.html"),
        manage: path.join(root, "manage.html"),
        dashboard: path.join(root, "dashboard.html"),
      },
    },
  },
});
