const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "prompts.json");
const RESOURCE_FILE = path.join(DATA_DIR, "resources.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ prompts: [] }, null, 2));
  }
}

function ensureResourceFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(RESOURCE_FILE)) {
    fs.writeFileSync(RESOURCE_FILE, JSON.stringify({ resources: [], tracks: [] }, null, 2));
  }
}

function readData() {
  ensureDataFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return Array.isArray(parsed.prompts) ? parsed : { prompts: [] };
  } catch (error) {
    return { prompts: [] };
  }
}

function readResourcesData() {
  ensureResourceFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(RESOURCE_FILE, "utf8"));
    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
    const resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    return { resources, tracks };
  } catch (error) {
    return { resources: [], tracks: [] };
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      sendJson(response, 404, { error: "File not found." });
      return;
    }

    response.writeHead(200, { "Content-Type": contentType });
    response.end(buffer);
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function validatePromptInput(input) {
  const title = String(input.title || "").trim();
  const author = String(input.author || "").trim();
  const model = String(input.model || "").trim();
  const category = String(input.category || "").trim();
  const summary = String(input.summary || "").trim();
  const prompt = String(input.prompt || "").trim();
  const notes = String(input.notes || "").trim();
  const remixSourceId = input.remixSourceId ? String(input.remixSourceId) : null;
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
    : [];

  if (!title || !author || !model || !category || !summary || !prompt || !notes || tags.length === 0) {
    return { error: "Missing required prompt fields." };
  }

  return {
    value: {
      title,
      author,
      model,
      category,
      summary,
      prompt,
      notes,
      remixSourceId,
      tags,
    },
  };
}

async function handleApi(request, response, pathname) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });
    response.end();
    return;
  }

  if (pathname === "/api/health" && request.method === "GET") {
    const data = readData();
    const resourceData = readResourcesData();
    sendJson(response, 200, {
      promptCount: data.prompts.length,
      resourceCount: resourceData.resources.length,
      status: "ok",
      trackCount: resourceData.tracks.length,
    });
    return;
  }

  if (pathname === "/api/prompts" && request.method === "GET") {
    const data = readData();
    sendJson(response, 200, data);
    return;
  }

  if (pathname === "/api/resources" && request.method === "GET") {
    const data = readResourcesData();
    sendJson(response, 200, data);
    return;
  }

  if (pathname === "/api/prompts" && request.method === "POST") {
    let body;

    try {
      body = await readRequestBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    const validation = validatePromptInput(body);

    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    const { value } = validation;
    const data = readData();
    const now = new Date().toISOString();
    const createdPrompt = {
      id: `${slugify(value.title)}-${Date.now()}`,
      title: value.title,
      category: value.category,
      author: value.author,
      handle: "@community",
      model: value.model,
      summary: value.summary,
      prompt: value.prompt,
      notes: value.notes,
      tags: value.tags,
      stars: 1,
      copies: 0,
      remixes: value.remixSourceId ? 1 : 0,
      updatedAt: now,
      source: "community",
    };

    if (value.remixSourceId) {
      const sourcePrompt = data.prompts.find((prompt) => prompt.id === value.remixSourceId);

      if (sourcePrompt) {
        sourcePrompt.remixes += 1;
      }
    }

    data.prompts = [createdPrompt, ...data.prompts];
    writeData(data);
    sendJson(response, 201, { prompt: createdPrompt });
    return;
  }

  const useMatch = pathname.match(/^\/api\/prompts\/([^/]+)\/use$/);
  if (useMatch && request.method === "POST") {
    const promptId = decodeURIComponent(useMatch[1]);
    const data = readData();
    const prompt = data.prompts.find((entry) => entry.id === promptId);

    if (!prompt) {
      sendJson(response, 404, { error: "Prompt not found." });
      return;
    }

    prompt.copies += 1;
    writeData(data);
    sendJson(response, 200, { prompt });
    return;
  }

  const starMatch = pathname.match(/^\/api\/prompts\/([^/]+)\/star$/);
  if (starMatch && request.method === "POST") {
    let body;

    try {
      body = await readRequestBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }

    const delta = Number(body.delta);
    if (![1, -1].includes(delta)) {
      sendJson(response, 400, { error: "Star delta must be 1 or -1." });
      return;
    }

    const promptId = decodeURIComponent(starMatch[1]);
    const data = readData();
    const prompt = data.prompts.find((entry) => entry.id === promptId);

    if (!prompt) {
      sendJson(response, 404, { error: "Prompt not found." });
      return;
    }

    prompt.stars = Math.max(0, prompt.stars + delta);
    writeData(data);
    sendJson(response, 200, { prompt });
    return;
  }

  sendJson(response, 404, { error: "Endpoint not found." });
}

function handleStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.resolve(ROOT, `.${requestedPath}`);

  if (!resolvedPath.startsWith(ROOT)) {
    sendJson(response, 403, { error: "Forbidden path." });
    return;
  }

  fs.stat(resolvedPath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(response, 404, { error: "Page not found." });
      return;
    }

    sendFile(response, resolvedPath);
  });
}

ensureDataFile();
ensureResourceFile();

const server = http.createServer(async (request, response) => {
  const currentUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const pathname = decodeURIComponent(currentUrl.pathname);

  if (pathname.startsWith("/api/")) {
    await handleApi(request, response, pathname);
    return;
  }

  handleStatic(response, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`PromptFoundry server running at http://${HOST}:${PORT}`);
});
