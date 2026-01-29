const express = require("express");
const path = require("path");
const addon = express();
const { parseConfig } = require("./lib/utils");
const getManifest = require("./lib/getManifest");
const getCatalogResponse = require("./lib/getCatalogResponse");
const getMetaResponse = require("./lib/getMetaResponse");
const getStreamResponse = require("./lib/getStreamResponse");

// Global CORS middleware - applies to ALL responses including errors
addon.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Response helper
const respond = function (res, data) {
  res.setHeader("Content-Type", "application/json");
  res.send(data);
};

addon.get("/", async function (_, res) {
  res.redirect("/configure");
});

// Configure endpoint - serve static files only for configure route
addon.get("/:config?/configure", async function (req, res) {
  res.sendFile(path.join(__dirname, "/Public/index.html"));
});

// Serve static files from Public directory
addon.use(express.static(path.join(__dirname, "Public")));

addon.get("/:config?/manifest.json", async function (req, res) {
  let config = parseConfig(req.params.config);
  const manifest = await getManifest(config);
  respond(res, manifest);
});

// Type validation middleware
addon.param("type", async function (req, res, next, val) {
  try {
    let config = parseConfig(req.params.config);
    const manifest = await getManifest(config);
    if (manifest.types.includes(val)) {
      //somehow 'series', which is not in the manifest as supported type, is being passed here from time to time
      next();
    } else {
      res.status(404).json({ error: "Type not supported" });
    }
  } catch (err) {
    console.error("Type validation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

addon.get("/:config/catalog/:type/:id/:extra?.json", async function (req, res) {
  req.config = parseConfig(req.params.config);
  const response = await getCatalogResponse(req);
  respond(res, response);
});

addon.get("/:config/meta/:type/:id.json", async function (req, res) {
  req.config = parseConfig(req.params.config);
  const response = await getMetaResponse(req);
  respond(res, response);
});

addon.get("/:config/stream/:type/:id.json", async function (req, res) {
  req.config = parseConfig(req.params.config);
  // console.log("headers", req.headers);
  const response = await getStreamResponse(req);
  respond(res, response);
});

// Global error handler - ensures CORS headers on error responses
addon.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = {
  addon,
  getCatalogResponse,
};
