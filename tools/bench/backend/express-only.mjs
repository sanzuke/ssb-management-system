import express from "express";

const app = express();
if (process.env.ETAG === "0") app.set("etag", false);
app.use(express.json());
app.get("/ping", (req, res) => res.json({ ok: true }));
app.post("/echo", (req, res) => res.json(req.body));
app.listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
