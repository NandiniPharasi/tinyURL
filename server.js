const express = require("express");
const { Pool } = require("pg");
const { customAlphabet } = require("nanoid");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
// app.use(
//   helmet({
//     contentSecurityPolicy: {
//       useDefaults: true,
//       directives: {
//         "script-src": [
//           "'self'",
//           "'unsafe-inline'",
//           "https://cdn.tailwindcss.com",
//         ],
//         "script-src-elem": [
//           "'self'",
//           "'unsafe-inline'",
//           "https://cdn.tailwindcss.com",
//         ],
//       },
//     },
//   })
// );





app.get("/code/:code", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "code.html"));
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
  })
);


app.use(express.static("public"));

// DB connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});



// nanoid generator
const nanoid = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  7
);


// Health check
app.get("/healthz", (req, res) => {
  res.json({ ok: true,
           "version" : "1.0"});
});

// Create short URL
app.post("/api/links", async (req, res) => {
  try {
    const { url, customCode } = req.body;

    if (!url) return res.status(400).json({ error: "URL is required" });

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    let code = customCode || nanoid();

    // Check collision
    const exists = await pool.query("SELECT code FROM links WHERE code=$1", [
      code,
    ]);

    if (exists.rowCount > 0)
      return res.status(409).json({ error: "Code already exists" });

    const result = await pool.query(
      "INSERT INTO links (code, url) VALUES ($1, $2) RETURNING *",
      [code, url]
    );

    res.json({
      code,
      shortUrl: `${process.env.BASE_URL}/${code}`,
      url,
      created_at: result.rows[0].created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});



// List all links
app.get("/api/links", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT code, url, created_at, visits FROM links ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Link stats
app.get("/api/links/:code/stats", async (req, res) => {
  try {
    const { code } = req.params;

    const linkRes = await pool.query("SELECT * FROM links WHERE code=$1", [
      code,
    ]);

    if (linkRes.rowCount === 0)
      return res.status(404).json({ error: "Not found" });

    const link = linkRes.rows[0];

    const clicksRes = await pool.query(
      "SELECT occurred_at, ip, user_agent, referrer FROM clicks WHERE link_id=$1 ORDER BY occurred_at DESC",
      [link.id]
    );

    res.json({
      code: link.code,
      url: link.url,
      visits: link.visits,
      clicks: clicksRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete link
app.delete("/api/links/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const delRes = await pool.query("DELETE FROM links WHERE code=$1", [code]);

    if (delRes.rowCount === 0)
      return res.status(404).json({ error: "Not found" });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// app.get("/code/:code", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "code.html"));
// });

// Redirect short URL
app.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;

    const linkRes = await pool.query("SELECT * FROM links WHERE code=$1", [
      code,
    ]);

    if (linkRes.rowCount === 0)
      return res.status(404).send("Short URL not found");

    const link = linkRes.rows[0];

    // Record click
    await pool.query(
      "INSERT INTO clicks (link_id, ip, user_agent, referrer) VALUES ($1,$2,$3,$4)",
      [
        link.id,
        req.ip,
        req.headers["user-agent"],
        req.headers.referer || null,
      ]
    );

    // Update visits count
    await pool.query("UPDATE links SET visits = visits + 1 WHERE id=$1", [
      link.id,
    ]);

    // Redirect
    res.redirect(302, link.url);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TinyURL server running on port ${PORT}`);
});

