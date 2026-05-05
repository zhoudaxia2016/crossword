import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(currentDir, "dist");
const resultsRoot = path.resolve(currentDir, "../results");
const tasksRoot = path.resolve(currentDir, "../tasks/fill-grid");
const port = Number(process.env.PORT || 4173);
const isDev = process.env.NODE_ENV !== "production";

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function readSummary(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return data.summary ?? undefined;
  } catch {
    return undefined;
  }
}

function listJsonFilesRecursive(root) {
  const files = [];

  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const fullPath = path.join(dir, name);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        walk(fullPath);
      } else if (name.endsWith(".json")) {
        files.push(fullPath);
      }
    }
  }

  if (fs.existsSync(root)) {
    walk(root);
  }

  return files;
}

function buildManifest() {
  const records = [];
  if (!fs.existsSync(resultsRoot)) {
    return records;
  }

  for (const timestamp of fs.readdirSync(resultsRoot).sort()) {
    const timestampDir = path.join(resultsRoot, timestamp);
    if (!fs.statSync(timestampDir).isDirectory()) continue;

    for (const model of fs.readdirSync(timestampDir).sort()) {
      const modelDir = path.join(timestampDir, model);
      if (!fs.statSync(modelDir).isDirectory()) continue;

      for (const fullPath of listJsonFilesRecursive(modelDir)) {
        const fileName = path.relative(modelDir, fullPath).replace(/\\/g, "/");
        const result = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        const taskKey = result.taskKey ?? fileName.replace(/\.json$/u, "");
        const taskId = result.taskId;
        const puzzles = Array.isArray(result.puzzles) ? result.puzzles : [];
        const playable = puzzles.some(
          (puzzle) => puzzle && Array.isArray(puzzle.entries) && puzzle.entries.length > 0,
        );
        const invalidReason = playable ? undefined : result.summary?.firstIssue || "invalid";
        records.push({
          id: `${timestamp}/${model}/${fileName}`,
          timestamp,
          model,
          fileName,
          taskId,
          taskKey,
          taskName: result.taskName ?? taskKey.split("/").at(-1),
          resultUrl: `/api/results/files/${timestamp}/${model}/${fileName}`,
          taskUrl: `/api/tasks/files/${taskKey}.json`,
          playable,
          invalidReason,
          summary: readSummary(fullPath),
        });
      }
    }
  }

  return records;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".js"
        ? "text/javascript; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".json"
            ? "application/json; charset=utf-8"
            : "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function createRequestHandler(vite) {
  return async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/results/index") {
      sendJson(res, 200, buildManifest());
      return;
    }

    if (pathname.startsWith("/api/results/files/")) {
      const relativePath = pathname.replace("/api/results/files/", "");
      const filePath = path.join(resultsRoot, relativePath);
      if (!filePath.startsWith(resultsRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        sendText(res, 404, "Not found");
        return;
      }
      serveFile(res, filePath);
      return;
    }

    if (pathname.startsWith("/api/tasks/files/")) {
      const relativePath = pathname.replace("/api/tasks/files/", "");
      const filePath = path.join(tasksRoot, relativePath);
      if (!filePath.startsWith(tasksRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        sendText(res, 404, "Not found");
        return;
      }
      serveFile(res, filePath);
      return;
    }

    if (vite) {
      vite.middlewares(req, res, () => {
        sendText(res, 404, "Not found");
      });
      return;
    }

    let filePath = path.join(distRoot, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!filePath.startsWith(distRoot)) {
      sendText(res, 403, "Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distRoot, "index.html");
    }

    if (!fs.existsSync(filePath)) {
      sendText(res, 404, "Build output not found. Run npm run build first.");
      return;
    }

    serveFile(res, filePath);
  };
}

async function main() {
  const vite = isDev
    ? await createViteServer({
        configFile: path.join(currentDir, "vite.config.ts"),
        root: currentDir,
        server: { middlewareMode: true },
        appType: "spa",
      })
    : null;

  const server = http.createServer(createRequestHandler(vite));
  server.listen(port, () => {
    console.log(`Crossword review server: http://localhost:${port}`);
  });
}

main();
