import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "태환 & 선영 가계부",
    short_name: "커플 가계부",
    description: "태환과 선영이 함께 쓰는 커플 가계부",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf2f8",
    theme_color: "#ec4899",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
