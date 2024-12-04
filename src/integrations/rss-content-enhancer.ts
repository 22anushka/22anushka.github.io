import type { AstroIntegration } from "astro";
import * as fs from "fs/promises";
import * as path from "path";
import sanitizeHtml from "sanitize-html";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { LAST_BUILD_TIME } from "../constants";

const rssContentEnhancer = (): AstroIntegration => {
  return {
    name: "rss-content-enhancer",
    hooks: {
      "astro:build:done": async () => {
        const distDir = "dist";
        const tempDir = "./tmp/rss-cache";
        const rssPath = path.join(distDir, "rss.xml");

        // Create temp directory if it doesn't exist
        await fs.mkdir(tempDir, { recursive: true });

        // Read and parse RSS XML
        const rssContent = await fs.readFile(rssPath, "utf-8");

        const parserOptions = {
          ignoreAttributes: false,
          attributeNamePrefix: "",
          textNodeName: "#text",
          arrayMode: false, // Do not wrap elements in arrays
        };

        const parser = new XMLParser(parserOptions);
        const rssData = parser.parse(rssContent);

        // Extract base URL from channel link
        const baseUrl = rssData.rss.channel.link.replace(/\/$/, ""); // Remove trailing slash if present

        // Ensure items are in an array
        const items = Array.isArray(rssData.rss.channel.item)
          ? rssData.rss.channel.item
          : [rssData.rss.channel.item];

        // Process each item
        for (const item of items) {
          const encodedSlug = item.link.split("/").pop();
          const slug = decodeURIComponent(encodedSlug);
          const htmlPath = path.join(distDir, "posts", slug, "index.html");

          try {
            const htmlContent = await fs.readFile(htmlPath, "utf-8");

            const lastUpdated = item.lastUpdatedTimestamp;
            if (!lastUpdated) {
              continue;
            }

            const cachePath = path.join(tempDir, `${slug}.html`);

            // Check cache
            let shouldUpdate = true;

            // Check if cache exists
            try {
              await fs.access(cachePath);

              // If cache exists and LAST_BUILD_TIME exists, use it to determine if we need to update
              if (LAST_BUILD_TIME) {
                const lastBuildTime = new Date(LAST_BUILD_TIME);
                shouldUpdate = new Date(lastUpdated) > lastBuildTime;
              }
            } catch {
              // Cache doesn't exist, need to sanitize
              shouldUpdate = true;
            }

            if (shouldUpdate) {
              // Extract main content (assuming it's in <main> tag)
              const mainMatch = htmlContent.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
              if (mainMatch) {
                const mainContent = mainMatch[1];

                // Remove autogenerated sections
                const contentWithoutExtra = mainContent
                  .replace(/<div[^>]*id="autogenerated-post-comments"[^>]*>[\s\S]*?<\/div>/gi, "")
                  .replace(/<div[^>]*id="autogenerated-media-links"[^>]*>[\s\S]*?<\/div>/gi, "")
                  .replace(
                    /<details[^>]*id="autogenerated-external-links"[^>]*>[\s\S]*?<\/details>/gi,
                    "",
                  );

                // Sanitize HTML and fix image paths
                const cleanContent = sanitizeHtml(contentWithoutExtra, {
                  allowedTags: [
                    // Document sections
                    "address",
                    "article",
                    "aside",
                    "footer",
                    "header",
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                    "h5",
                    "h6",
                    "hgroup",
                    "main",
                    "nav",
                    "section",

                    // Block text content
                    "blockquote",
                    "dd",
                    "div",
                    "dl",
                    "dt",
                    "figcaption",
                    "figure",
                    "hr",
                    "li",
                    "main",
                    "ol",
                    "p",
                    "pre",
                    "ul",
                    "details",
                    "summary",

                    // Inline text
                    "a",
                    "abbr",
                    "b",
                    "bdi",
                    "bdo",
                    "br",
                    "cite",
                    "code",
                    "data",
                    "dfn",
                    "em",
                    "i",
                    "kbd",
                    "mark",
                    "q",
                    "rb",
                    "rp",
                    "rt",
                    "rtc",
                    "ruby",
                    "s",
                    "samp",
                    "small",
                    "span",
                    "strong",
                    "sub",
                    "sup",
                    "time",
                    "u",
                    "var",
                    "wbr",

                    // Table content
                    "caption",
                    "col",
                    "colgroup",
                    "table",
                    "tbody",
                    "td",
                    "tfoot",
                    "th",
                    "thead",
                    "tr",

                    // Images
                    "img",
                  ],
                  allowedAttributes: {
                    a: ["href", "title", "target"],
                    img: ["src", "alt", "title"],
                    td: ["align", "valign"],
                    th: ["align", "valign", "colspan", "rowspan"],
                  },
                  disallowedTagsMode: "completelyDiscard",
                  transformTags: {
                    aside: (tagName, attribs) => {
                      // Remove the TOC container aside and all its contents
                      if (attribs.class?.includes("toc-container")) {
                        return { tagName: false }; // This will remove the element and all its contents
                      }
                      return { tagName, attribs };
                    },
                    details: (tagName, attribs, innerHTML = "") => {
                      // Convert details to div, preserving inner content
                      return {
                        tagName: "div",
                        attribs: {},
                      };
                    },
                    summary: (tagName, attribs, innerHTML = "") => {
                      // Convert summary to div
                      return {
                        tagName: "div",
                        attribs: {},
                      };
                    },
                    div: (tagName, attribs, innerHTML = "") => {
                      // Remove table of contents div
                      if (attribs.class?.includes("table-of-contents")) {
                        return { tagName: false }; // This will remove the element and all its contents
                      }
                      // Remove empty divs
                      return innerHTML.trim() ? { tagName, attribs } : { tagName: "", attribs: {} };
                    },
                    span: (tagName, attribs, innerHTML = "") => {
                      // If span has data-popover-target, convert to link
                      if (attribs["data-popover-target"]) {
                        const href = attribs["data-href"];

                        // Remove spans that link to anchors
                        if (href?.startsWith("#")) {
                          return { tagName: "", attribs: {} };
                        }

                        // Convert to link if it's a post link
                        if (href?.startsWith("/posts/")) {
                          // Remove sr-only span from content
                          const cleanContent = innerHTML
                            .replace(/<span class="sr-only">.*?<\/span>/g, "")
                            .trim();

                          return {
                            tagName: "a",
                            attribs: {
                              href: `${baseUrl}${href}`,
                            },
                            text: cleanContent || href, // fallback to href if content is empty
                          };
                        }
                      }

                      // Remove empty spans unless they have specific attributes we want to keep
                      if (!innerHTML.trim() && !attribs["data-popover-target"]) {
                        return { tagName: "", attribs: {} };
                      }

                      // Keep non-empty spans
                      return innerHTML.trim() ? { tagName, attribs } : { tagName: "", attribs: {} };
                    },
                    img: (tagName, attribs) => {
                      // Remove Notion icon images
                      if (attribs.src?.startsWith("https://www.notion.so/icons/")) {
                        return false;
                      }
                      // Remove custom emoji images
                      if (attribs.alt?.startsWith("custom emoji with name ")) {
                        return false;
                      }
                      // Keep other images
                      if (attribs.src && attribs.src.startsWith("/notion/")) {
                        return {
                          tagName,
                          attribs: {
                            ...attribs,
                            src: `${baseUrl}${attribs.src}`,
                          },
                        };
                      }
                      return {
                        tagName: "img",
                        attribs,
                      };
                    },
                  },
                  exclusiveFilter: function (frame) {
                    // Remove any remaining empty elements except specific ones
                    const keepTags = ["br", "hr", "img"];
                    return (
                      !keepTags.includes(frame.tag) &&
                      !frame.text.trim() &&
                      !Object.keys(frame.attribs).length
                    );
                  },
                });

                // Remove the first h1 (title)
                const contentWithoutTitle = cleanContent.replace(/<h1[^>]*>.*?<\/h1>/i, "");

                // Cache the cleaned content
                await fs.writeFile(cachePath, contentWithoutTitle);

                // Add content tag to RSS item
                item.content = contentWithoutTitle;

                // If description is empty, generate from content
                if (!item.description?.trim()) {
                  // Remove HTML tags and get plain text
                  const plainText = contentWithoutTitle.replace(/<[^>]+>/g, "").trim();
                  // Get first 50 characters and add ellipsis
                  item.description = plainText.slice(0, 50) + (plainText.length > 50 ? "..." : "");
                }
              }
            } else {
              // Use cached version
              const cachedContent = await fs.readFile(cachePath, "utf-8");
              item.content = cachedContent;

              // If description is empty, generate from cached content
              if (!item.description?.trim()) {
                const plainText = cachedContent.replace(/<[^>]+>/g, "").trim();
                item.description = plainText.slice(0, 50) + (plainText.length > 50 ? "..." : "");
              }
            }
          } catch (error) {
            console.error(`Error processing ${slug}:`, error);
          }
        }

        // Update the items back to the channel
        // Build the RSS object
        const rssObject = {
          rss: {
            "@version": "2.0",
            channel: {
              title: rssData.rss.channel.title,
              description: rssData.rss.channel.description,
              link: rssData.rss.channel.link,
              lastBuildDate: rssData.rss.channel.lastBuildDate,
              ...(rssData.rss.channel.author && { author: rssData.rss.channel.author }),
              item: items.map((item) => ({
                title: item.title,
                link: item.link,
                guid: {
                  "@isPermaLink": "true",
                  "#": item.link,
                },
                description: item.description,
                pubDate: item.pubDate,
                lastUpdatedTimestamp: item.lastUpdatedTimestamp,
                ...(item.category && {
                  category: Array.isArray(item.category) ? item.category : [item.category],
                }),
                ...(item.content && { content: item.content }),
              })),
            },
          },
        };

        // Build and save the updated RSS
        const builderOptions = {
          ignoreAttributes: false,
          format: true,
          suppressEmptyNode: true,
          suppressBooleanAttributes: false,
          attributeNamePrefix: "@",
          parseTagValue: false,
          textNodeName: "#",
        };

        const builder = new XMLBuilder(builderOptions);
        const updatedRss = builder.build(rssObject);

        // Add XML declaration and stylesheet
        const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
        const styleSheet = '<?xml-stylesheet href="/rss-styles.xsl" type="text/xsl"?>\n';
        const finalXml = xmlDeclaration + styleSheet + updatedRss;

        await fs.writeFile(rssPath, finalXml);
      },
    },
  };
};

export default rssContentEnhancer;
