import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aurora Wrapper",
    short_name: "Aurora",
    description: "Aurora runtime shell.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef4fb",
    theme_color: "#eef4fb"
  }
}
