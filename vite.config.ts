import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const youtubeKey = env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY || env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(youtubeKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
      'process.env.YOUTUBE_API_KEY': JSON.stringify(youtubeKey)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
