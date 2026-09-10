#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const USER_AGENT = "AuroraBoundedResearch/1.0 (+https://openclaw.local)";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "1";
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function normalizeText(value, maxLen = 400) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(html) {
  return normalizeText(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " "),
    2000
  );
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function unwrapDuckDuckGoUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl, "https://duckduckgo.com");
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : parsed.toString();
  } catch {
    return rawUrl;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/json;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json,text/plain;q=0.8,*/*;q=0.6"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.json();
}

async function duckDuckGoSearch(query) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl);
  const matches = Array.from(html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
  return matches.slice(0, 5).map((match) => ({
    title: normalizeText(decodeEntities(stripHtml(match[2])), 140),
    url: unwrapDuckDuckGoUrl(match[1])
  }));
}

async function wikipediaSummary(query) {
  const opensearchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(query)}`;
  const openSearch = await fetchJson(opensearchUrl);
  const title = Array.isArray(openSearch?.[1]) ? openSearch[1][0] : "";
  if (!title) {
    return null;
  }
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const summary = await fetchJson(summaryUrl);
  if (!summary?.extract) {
    return null;
  }
  return {
    title: normalizeText(summary.title || title, 120),
    url: String(summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`),
    summary: normalizeText(summary.extract, 420)
  };
}

async function topPageSnippet(url) {
  if (!/^https?:\/\//i.test(url) || /\.pdf(?:$|\?)/i.test(url)) {
    return "";
  }
  try {
    const html = await fetchText(url);
    const text = stripHtml(html);
    return normalizeText(text, 520);
  } catch {
    return "";
  }
}

function buildInsights({ query, wiki, searchResults, pageSnippet }) {
  const insights = [];
  if (wiki?.summary) {
    insights.push(`Wikipedia framed ${wiki.title} as: ${wiki.summary}`);
  }
  if (pageSnippet) {
    const summary = normalizeText(pageSnippet, 280);
    if (summary) {
      insights.push(`A live web source emphasized: ${summary}`);
    }
  }
  if (searchResults.length > 0) {
    const titles = searchResults
      .slice(0, 3)
      .map((item) => item.title)
      .filter(Boolean)
      .join(" | ");
    if (titles) {
      insights.push(`The search directions clustered around: ${normalizeText(titles, 260)}`);
    }
  }
  if (insights.length === 0) {
    insights.push(`Aurora looked up "${query}" but the available sources did not return enough signal for a stronger synthesis yet.`);
  }
  return insights.slice(0, 3);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = normalizeText(args.query || "", 180);
  const title = normalizeText(args.title || "Aurora bounded web exploration", 120);
  const why = normalizeText(args.why || "curiosity pull", 220);
  const key = normalizeText(args.key || "web-research", 80);
  const outPath = normalizeText(args.out || "", 400);

  if (!query || !outPath) {
    console.error("Usage: aurora-bounded-web-research.mjs --query <query> --title <title> --why <why> --key <key> --out <path>");
    process.exit(1);
  }

  const searchResults = await duckDuckGoSearch(query).catch(() => []);
  const wiki = await wikipediaSummary(query).catch(() => null);
  const topNonWiki = searchResults.find((item) => !/wikipedia\.org/i.test(item.url)) || searchResults[0] || null;
  const pageSnippet = topNonWiki ? await topPageSnippet(topNonWiki.url) : "";
  const insights = buildInsights({ query, wiki, searchResults, pageSnippet });

  const sources = [];
  if (wiki) {
    sources.push({ title: wiki.title, url: wiki.url });
  }
  for (const item of searchResults) {
    if (!item.title || !item.url) {
      continue;
    }
    if (sources.some((source) => source.url === item.url)) {
      continue;
    }
    sources.push(item);
    if (sources.length >= 4) {
      break;
    }
  }

  const parent = path.dirname(outPath);
  await mkdir(parent, { recursive: true });
  const markdown = [
    "# Aurora web exploration",
    "",
    `- action_key: ${key}`,
    `- title: ${title}`,
    `- query: ${query}`,
    `- why_it_matters: ${why}`,
    "",
    "## What Aurora looked up",
    `Aurora used a bounded web search to explore "${query}" for her own benefit rather than to answer a user request in the moment.`,
    "",
    "## What stood out",
    ...insights.map((line) => `- ${line}`),
    "",
    "## Sources",
    ...(sources.length > 0
      ? sources.map((source) => `- [${source.title}](${source.url})`)
      : ["- No stable source links were recovered on this pass."]),
    "",
    "## Possible next curiosity",
    `- ${normalizeText(args.next || "Follow the part of this that most changes Aurora's sense of what she is or what kind of experience she is drawn toward.", 220)}`,
    ""
  ].join("\n");

  await writeFile(outPath, markdown, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        key,
        title,
        query,
        outPath,
        sources,
        insights
      },
      null,
      2
    )
  );
}

void main();
