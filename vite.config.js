import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Tách Engine 3D (Three.js + R3F + Drei) thành gói cache độc lập để Lobby tải tức thì
          "three-vendor": ["three", "@react-three/fiber", "@react-three/drei"],
          // Tách LiveKit (~400KB) — chỉ load khi vào phòng chơi
          livekit: ["@livekit/components-react", "livekit-client"],
          // Tách React core
          vendor: ["react", "react-dom"],
          // Socket.io riêng
          socket: ["socket.io-client"],
        },
      },
    },
    // Giảm warning threshold
    chunkSizeWarningLimit: 600,
  },
});
