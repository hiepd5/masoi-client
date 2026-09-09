import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Tách LiveKit (~400KB) — chỉ load khi vào phòng chơi
          livekit: ['@livekit/components-react', 'livekit-client'],
          // Tách React core
          vendor: ['react', 'react-dom'],
          // Socket.io riêng
          socket: ['socket.io-client'],
        },
      },
    },
    // Giảm warning threshold
    chunkSizeWarningLimit: 600,
  },
});
