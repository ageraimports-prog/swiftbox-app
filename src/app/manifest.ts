import type { MetadataRoute } from "next";

/**
 * Web App Manifest — also the file Bubblewrap reads when it generates the
 * Android (Trusted Web Activity) project for Google Play.
 *
 * Play-relevant fields, do not remove:
 *   id       — stable PWA identity. Changing it makes Chrome treat this as a
 *              different app and breaks the installed-app link.
 *   scope    — URLs inside scope stay inside the app shell; anything outside
 *              (wa.me, tel:) opens in a Custom Tab. Must cover every route.
 *   maskable — Android crops icons to the device's shape. icon-512-maskable
 *              keeps the mark inside the inner 80% safe circle; the "any" icon
 *              does not. They must stay two separate files.
 *   shortcuts — become Android long-press shortcuts on the home-screen icon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Swiftbox: Package Forwarding",
    short_name: "Swiftbox",
    description:
      "Pre-alert, track and pay for your Miami-to-Trinidad packages. Get your free Swiftbox Miami address, follow every package from the warehouse to collection, and settle invoices from your phone.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0E1114",
    theme_color: "#0E1114",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity", "shopping"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New pre-alert",
        short_name: "Pre-alert",
        description: "Tell us a package is on its way",
        url: "/dashboard/prealerts/new",
        icons: [{ src: "/icons/shortcut-prealert.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "My packages",
        short_name: "Packages",
        description: "Track every package",
        url: "/dashboard/packages",
        icons: [{ src: "/icons/shortcut-packages.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Invoices",
        short_name: "Invoices",
        description: "See what you owe",
        url: "/dashboard/invoices",
        icons: [{ src: "/icons/shortcut-invoices.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
