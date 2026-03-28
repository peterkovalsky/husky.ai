// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.ASTRO_BASE_PATH || "/",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    format: "directory",
  },
});
