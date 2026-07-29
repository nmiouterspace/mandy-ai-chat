import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mandy AI Chat",
    short_name: "Mandy AI",
    description: "AI Chat cá nhân và Mandy English trên mọi thiết bị.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3ea",
    theme_color: "#16885a",
    orientation: "any",
    icons: [
      {
        src: "/mandy-ai-logo.png",
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
