import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* base: './' → 相对资源路径，适配静态 CDN 任意子路径托管 */
export default defineConfig({
  base: './',
  plugins: [react()],
});
