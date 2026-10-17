import { createServer } from "node:http";

const headers = { "content-type": "application/json" };

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/ping") {
    res.writeHead(200, headers);
    res.end('{"ok":true}');
    return;
  }
  if (req.method === "POST" && req.url === "/echo") {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      res.writeHead(200, headers);
      res.end(JSON.stringify(JSON.parse(Buffer.concat(chunks).toString())));
    });
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
