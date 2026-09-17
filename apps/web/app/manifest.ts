import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Pop In Solutions CRM", short_name: "Pop In CRM", description: "Business CRM, accounting, HR, attendance, assets, and projects.", start_url: "/dashboard", display: "standalone", background_color: "#f6f9ff", theme_color: "#171717", icons: [] };
}
