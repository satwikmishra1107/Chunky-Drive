import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],  server: {
    // During development, API calls go to the Worker running via `npm run dev` in ../worker.
    proxy: { "/api": "http://localhost:8787" },
  },
});
