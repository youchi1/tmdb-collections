const { addon } = require("./index.js");
const { parseConfig } = require("./lib/utils");
const { initializeBuffering } = require("./lib/bufferCatalogs");
const config = parseConfig("{}"); //load default config
const PORT = process.env.PORT || 5600;
const isDevelopment = process.argv.includes("--dev");
const buffer = process.argv.includes("--buffer");

// create local server
addon.listen(PORT, () => {
  console.log(`Addon active on port ${PORT}`);

  // Only run buffering in production environment
  if (isDevelopment && !buffer) {
    console.log("Buffering disabled in development mode");
  } else if (PORT == 5000) {
    // beamup deployment server test runs on port 5000, which should be terminated (including buffering/schedule) due to container removal after the test is completed. But for some reason buffering continues and is scheduled. Which causes duplicated bufferings with the ones from the production run (port 5285).
    // this workaroung prevents the duplicated bufferings. Could not find more universal solution. Works nicely also on server restarts.
    console.log("Buffering disabled on port 5000");
  } else {
    console.log("Starting catalog buffering system...");
    initializeBuffering(PORT, config)
      .then(() => {
        console.log("Initial catalog buffering completed");
      })
      .catch((error) => {
        console.error("Failed to initialize catalog buffering:", error);
      });
  }
});
