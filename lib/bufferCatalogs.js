const getManifest = require("./getManifest");
const cron = require("node-cron");
const getCatalogResponse = require("./getCatalogResponse");

async function generateCatalogRequests(config) {
  const manifest = await getManifest(config); //no catalog config, gonna buffer all the catalogs
  const requests = [];

  // Get non-search catalogs from manifest
  const catalogs = manifest.catalogs.filter(
    (catalog) =>
      !catalog.id.endsWith("search") /*catalog.id.endsWith("topRatedByCountry") || catalog.id.endsWith("topRatedByCompany") */,
  );

  for (const catalog of catalogs) {
    // Add base catalog request
    if (!config.discoverOnly[catalog.id.split(".")[1]]) {
      //some catalogs are "discovery only" by default and locked
      requests.push({
        params: {
          type: "collections",
          id: catalog.id,
        },
      });
    }

    // Add requests with genre/country filters based on catalog's extra configuration
    if (catalog.extra && catalog.extra[0] && catalog.extra[0].name === "genre") {
      const options = catalog.extra[0].options;
      for (const option of options) {
        requests.push({
          params: {
            type: "collections",
            id: catalog.id,
            extra: `genre=${option}`,
          },
        });
      }
    }
  }

  return requests;
}

async function bufferCatalog(req) {
  try {
    // console.log(`Buffering catalog: ${req.params.id}${req.params.extra ? ` with ${req.params.extra}` : ""}`);
    await getCatalogResponse(req);
  } catch (error) {
    console.error(`Error buffering catalog ${req.params.id}:`, error.message);
  }
}

async function bufferAllCatalogs(config) {
  const startTimeBuffer = process.hrtime();
  console.log("Starting catalog buffer process...");
  const requests = await generateCatalogRequests(config);

  // Process catalogs sequentially
  for (const req of requests) {
    req.config = config;
    await bufferCatalog(req);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay between catalogs
  }
  const endTimeBuffer = process.hrtime(startTimeBuffer);
  const minutesBuffer = (endTimeBuffer[0] * 1000 + endTimeBuffer[1] / 1000000) / 60000;
  console.log(`Finished buffering all catalogs in: ${minutesBuffer.toFixed(2)} minutes`);
}

function initializeBuffering(PORT, config) {
  // Schedule the daily buffer - runs at 10:00
  cron.schedule("0 10 * * *", async () => {
    console.log(`Running scheduled catalog buffer...(port ${PORT})`);
    await bufferAllCatalogs(config);
  });

  // Initial buffer on startup
  console.log(`Initializing first catalog buffer...(port ${PORT})`);
  return bufferAllCatalogs(config).catch((error) => {
    console.error(`Error during initial catalog buffer: ${error.message}`);
  });
}

module.exports = {
  generateCatalogRequests,
  bufferAllCatalogs,
  initializeBuffering,
};
