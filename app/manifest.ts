import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Motion Fuel Analyzer",
        short_name: "Fuel Analyzer",
        icons: [
            { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        theme_color: "#0B1324",
        background_color: "#F7F9FC",
        display: "standalone",
    };
}
