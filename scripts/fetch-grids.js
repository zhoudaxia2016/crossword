import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractSlots } from "./constraint-graph.js";

const OUTPUT_DIR = join(process.cwd(), "grids");
const DEFAULT_COUNT = 20;
const DEFAULT_RETRIES = 3;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_DELAY_MS = 400;

function defaultMinEntryLength(size) {
  return size <= 6 ? 2 : 3;
}

function toFullWidthDigits(value) {
  return String(value).replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0));
}

function getBaseUrl(size) {
  const sizeText = `${toFullWidthDigits(size)}x${toFullWidthDigits(size)}クロスワード`;
  return `https://xn--pckua2c4hla2f.jp/${encodeURIComponent(sizeText)}/`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomDelayMs(baseDelayMs) {
  return baseDelayMs + Math.floor(Math.random() * baseDelayMs);
}

function fetchHtmlWithRetry(url, referer, retries = DEFAULT_RETRIES) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return execFileSync(
        "curl",
        [
          "-L",
          "--max-time",
          "20",
          "--compressed",
          "--http1.1",
          "-A",
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "-H",
          "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "-H",
          "Accept-Language: ja,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7",
          "-e",
          referer,
          "--retry",
          "2",
          "--retry-delay",
          "1",
          "--retry-all-errors",
          url,
        ],
        {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      lastError = error;
      console.error(`fetch failed (${attempt}/${retries}): ${url}`);
      if (attempt === retries) {
        break;
      }
    }
  }

  throw lastError;
}

function extractMatrixTable(html) {
  const match = html.match(/<table id="matrix-[^"]+" class="crossword-matrix">([\s\S]*?)<\/table>/i);
  if (!match) {
    throw new Error("crossword-matrix table not found");
  }
  return match[1];
}

function decodeHtml(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractTitle(html) {
  const title = html.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
  return decodeHtml(title.replace(/<[^>]+>/g, "").trim());
}

function parseGrid(html, size) {
  const tableHtml = extractMatrixTable(html);
  const rowMatches = [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  if (rowMatches.length !== size) {
    throw new Error(`expected ${size} rows, got ${rowMatches.length}`);
  }

  return rowMatches.map((rowMatch) => {
    const cellMatches = [...rowMatch[1].matchAll(/<td\b[^>]*class="([^"]+)"[^>]*>/gi)];
    if (cellMatches.length !== size) {
      throw new Error(`expected ${size} cells, got ${cellMatches.length}`);
    }

    return cellMatches.map((cellMatch) => (cellMatch[1].includes("cell-none") ? "#" : "."));
  });
}

function pageUrl(size, page) {
  const sizeText = `${toFullWidthDigits(size)}x${toFullWidthDigits(size)}クロスワード`;
  const pageText = `${sizeText}_ページ${page}`;
  return `${getBaseUrl(size)}${encodeURIComponent(pageText)}/`;
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;

  async function runOne() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runOne());
  await Promise.all(workers);
}

async function main() {
  const size = Number(process.argv[2] ?? 6);
  const count = Number(process.argv[3] ?? DEFAULT_COUNT);
  const concurrency = Number(process.argv[4] ?? DEFAULT_CONCURRENCY);
  const minEntryLength = Number(process.argv[5] ?? defaultMinEntryLength(size));

  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("size must be a positive integer");
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("count must be a positive integer");
  }
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("concurrency must be a positive integer");
  }
  if (!Number.isInteger(minEntryLength) || minEntryLength <= 0) {
    throw new Error("minEntryLength must be a positive integer");
  }

  const outputDir = join(OUTPUT_DIR, `site-${size}x${size}`);
  mkdirSync(outputDir, { recursive: true });
  const pages = Array.from({ length: count }, (_, index) => index + 1);

  await runWithConcurrency(pages, concurrency, async (page, index) => {
    const url = pageUrl(size, page);
    const shortName = `${size}x${size}-page-${String(page).padStart(3, "0")}.json`;
    const filename = join(outputDir, shortName);

    try {
      await sleep(randomDelayMs(DEFAULT_DELAY_MS + index * 20));
      const html = fetchHtmlWithRetry(url, getBaseUrl(size));
      const grid = parseGrid(html, size);
      const slots = extractSlots(grid, {
        minEntryLength,
        maxEntryLength: size,
      });
      const title = extractTitle(html);
      const output = {
        page,
        title,
        url,
        size,
        minEntryLength,
        grid,
        slots,
      };

      writeFileSync(filename, `${JSON.stringify(output, null, 2)}\n`, "utf8");
      console.log(`saved ${filename}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.split("\n")[0] : String(error);
      console.error(`skip ${shortName}: ${message}`);
    }
  });
}

await main();
