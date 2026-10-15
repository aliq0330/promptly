// Static server for the Next export under /promptly (GitHub Pages basePath).
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("../../out", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };
export function serve(port = 4173) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!p.startsWith("/promptly")) { res.writeHead(404); return res.end(); }
    p = p.slice("/promptly".length) || "/";
    let file = path.join(root, p);
    const tryFiles = [file, file + ".html", path.join(file, "index.html")];
    const hit = tryFiles.find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!hit) { res.writeHead(404, { "content-type": "text/html" }); return res.end(fs.readFileSync(path.join(root, "404.html"))); }
    res.writeHead(200, { "content-type": types[path.extname(hit)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(hit));
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
