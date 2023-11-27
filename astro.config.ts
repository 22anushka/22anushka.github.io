import { defineConfig } from "astro/config";
import fs from "fs";
//NOT USING MDX
// import mdx from "@astrojs/mdx";
// import remarkUnwrapImages from "remark-unwrap-images";
// import { remarkReadingTime } from "./src/utils/remark-reading-time";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import prefetch from "@astrojs/prefetch";
// import { astroImageTools } from "astro-imagetools";

import { CUSTOM_DOMAIN, BASE_PATH, HIDE_UNDERSCORE_SLUGS_IN_LISTS } from "./src/constants";
const getSite = function () {
  if (CUSTOM_DOMAIN) {
    return new URL(BASE_PATH, `https://${CUSTOM_DOMAIN}`).toString();
  }
  if (process.env.VERCEL && process.env.VERCEL_URL) {
    return new URL(BASE_PATH, `https://${process.env.VERCEL_URL}`).toString();
  }
  if (process.env.CF_PAGES) {
    if (process.env.CF_PAGES_BRANCH !== 'main') {
      return new URL(BASE_PATH, process.env.CF_PAGES_URL).toString();
    }
    return new URL(BASE_PATH, `https://${new URL(process.env.CF_PAGES_URL).host.split('.').slice(1).join('.')}`).toString();
  }
  if (process.env.GITHUB_PAGES) {
    return new URL(process.env.BASE || BASE_PATH, `https://${CUSTOM_DOMAIN}`).toString();
  }
  return new URL(BASE_PATH, 'http://localhost:4321').toString();
};

import CoverImageDownloader from './src/integrations/cover-image-downloader';
import CustomIconDownloader from './src/integrations/custom-icon-downloader';
import FeaturedImageDownloader from './src/integrations/featured-image-downloader';
import PublicNotionCopier from './src/integrations/public-notion-copier';
import CSSWriter from './src/integrations/theme-constants-to-css';

import robotsTxt from "astro-robots-txt";

import config from "./constants-config.json";
const key_value_from_json = { ...config };

export default defineConfig({
  site: getSite(),
  base: process.env.BASE || BASE_PATH,
  redirects: key_value_from_json["REDIRECTS"] ? key_value_from_json["REDIRECTS"] : {},
  integrations: [
    // mdx({}),
    tailwind({
      applyBaseStyles: false
    }), sitemap({
      filter: page => {
        console.log(page);
        if (page.includes("/_") && HIDE_UNDERSCORE_SLUGS_IN_LISTS) {
          console.log('Excluding page from sitemap:', page);
          return false;
        }
        return true;
      }
    }), prefetch(),
    // astroImageTools,
    CoverImageDownloader(), CustomIconDownloader(), FeaturedImageDownloader(), PublicNotionCopier(), CSSWriter(), robotsTxt()],
  image: {
    domains: ["webmention.io"]
  },
  vite: {
    plugins: [rawFonts([".ttf"])],
    optimizeDeps: {
      exclude: ["@resvg/resvg-js"]
    }
  }
});

function rawFonts(ext: Array<string>) {
  return {
    name: "vite-plugin-raw-fonts",
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore:next-line
    transform(_, id) {
      if (ext.some(e => id.endsWith(e))) {
        const buffer = fs.readFileSync(id);
        return {
          code: `export default ${JSON.stringify(buffer)}`,
          map: null
        };
      }
    }
  };
}
