import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CheckTextColor',
      fileName: (format) => `check-text-color.${format === 'es' ? 'js' : 'umd.cjs'}`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // 将 html2canvas 打包进产物，不设为 external
      external: [],
      output: {
        globals: {},
      },
    },
    sourcemap: false,
    minify: 'esbuild',
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
});
