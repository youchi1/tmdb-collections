const configDefaults = {
  language: "en",
  catalogList: ["popular", "topRated", "newReleases", "topRatedByCountry", "topRatedByCompany"],
  discoverOnly: { popular: false, topRated: false, newReleases: false, topRatedByCountry: true, topRatedByCompany: true },
  enableSearch: true,
  enableAdultContent: false,
  enableCollectionFromMovie: true,
};

// Parse configuration from URL
function parseConfig(config) {
  try {
    const configParsed = JSON.parse(config);

    // Filter out any catalogs not in configDefaults.catalogList
    if (configParsed.catalogList) {
      configParsed.catalogList = configParsed.catalogList.filter((catalog) => configDefaults.catalogList.includes(catalog));
    }

    return { ...configDefaults, ...configParsed };
  } catch (error) {
    // console.error("Error parsing config JSON:", error.message);
    return { ...configDefaults }; // Return defaults if parsing fails
  }
}

module.exports = { parseConfig };
