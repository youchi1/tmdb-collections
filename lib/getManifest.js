const { getGenres } = require("./getTmdb");
const { getCountries } = require("./getTmdb");
const { productionCompanies } = require("../Public/productionCompanies");
const dev = process.argv.includes("--dev") == 1 ? "Dev" : "";
const version = "2.2.1";

console.log("[manifest.js] Module being loaded, version:", version);

async function getManifest(config) {
  const genres = await getGenres(config.language);
  const genreNames = genres.map((genre) => genre.name);
  const countries = await getCountries(config.language);
  const countryNames = countries.map((country) => country.name);
  const productionCompanyNames = productionCompanies.map((company) => company.name);

  config.enableSearch === true && !config.catalogList.includes("search") ? config.catalogList.push("search") : null; //add search to catalogList if enabled

  // Start with empty catalogs array if catalogList is provided, otherwise use default catalogs
  let catalogs = [];

  if (config.catalogList) {
    config.catalogList.forEach((catalogId) => {
      const catalog = {
        type: "collections",
        id: `${dev}ctmdb.${catalogId}`,
        name:
          dev +
          catalogId //newReleases to New Releases
            .split(/(?=[A-Z])/)
            .join(" ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/\b\w/g, (c) => c.toUpperCase()),
      };

      let genreObject = null;
      let genreList = null;
      let nonGenreList = null;

      if (catalogId === "topRatedByCountry") {
        nonGenreList = 1;
        config.discoverOnly[catalogId] = true; //enforced default
        genreObject = countries;
        genreList = countryNames;
      } else if (catalogId === "topRatedByCompany") {
        nonGenreList = 1;
        config.discoverOnly[catalogId] = true; //enforced default
        genreObject = productionCompanies;
        genreList = productionCompanyNames;
      } else {
        genreObject = genres;
        genreList = genreNames;
      }

      //change extra for search catalog
      catalog.extra =
        catalogId === "search"
          ? [
              {
                name: "search",
                isRequired: true,
                genres: genreObject, //not used by Stremio, it is here for other code logic
              },
            ]
          : [
              {
                name: "genre",
                isRequired: config.discoverOnly[catalogId], //set catalog to be visible only in discover section
                options: config.discoverOnly[catalogId] === true && nonGenreList !== 1 ? ["Default", ...genreList] : genreList, //add default option to the genre options if discoverOnly is true...this setting in addition to showing catalog only in discover also removes Default option from the genre options
                genres: genreObject, //not used by Stremio, it is here for other code logic
              },
            ];

      catalogs.push(catalog);
    });
  }

  return {
    id: "org.stremio.tmdbcollections" + dev,
    version: version,
    name: "TMDB Collections" + dev,
    description:
      "Addon lets you explore TMDB Collections, which are essentially grouped movie series. Discover collections featuring newly released movies or browse catalogs of popular and top-rated collections. You can filter by genre or search collections by actor, director, writer, movie or collection name in any language.",
    types: ["movie", "collections"],
    resources: [
      "catalog",
      { name: "meta", types: ["movie"], idPrefixes: [`${dev}ctmdb.`] },
      ...(config.enableCollectionFromMovie ? [{ name: "stream", types: ["movie"], idPrefixes: ["tt"] }] : []),
    ],
    idPrefixes: [`${dev}ctmdb.`], //addon doesn't need this in this "resource" setup, but there is other logic built on top of this
    behaviorHints: {
      configurable: true,
    },
    favicon: "https://github.com/youchi1/tmdb-collections/raw/main/Images/favicon.png",
    logo: "https://github.com/youchi1/tmdb-collections/raw/main/Images/logo.png",
    background: "https://github.com/youchi1/tmdb-collections/raw/main/Images/bg.png",
    catalogs: catalogs,
    genres: genres, // for the code in getCatalogResponse.js
  };
}

module.exports = getManifest;
