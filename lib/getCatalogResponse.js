const qs = require("querystring");
const { getSearch } = require("./searchTmdb");
const { discoverXCollections } = require("./discoverTmdb");
const { processCollectionDetails } = require("./processCollectionDetails");
const { cacheWrapSearch, cacheWrapCollectionDetails } = require("./cache");
const getManifest = require("./getManifest");

// Catalog processing function that can be used both for HTTP requests and prebuffering
async function getCatalogResponse(req) {
  const config = req.config || {};
  const manifest = await getManifest(config);
  const collectionPrefix = manifest.idPrefixes[0];
  const startTime = process.hrtime();
  const extra = req.params.extra ? qs.parse(req.params.extra) : {};

  //catalogs special default genre handling in cases where discoveOnly=true, reason described in getManifest.js
  // goal is to align with standard non-genre catalog request
  if (extra.genre == "Default") {
    delete extra.genre;
  }

  const genre = manifest.catalogs.find((c) => c.id === req.params.id)?.extra[0]?.genres.find((g) => g.name === extra.genre);
  extra.genreId = genre?.id;

  const cacheKey = JSON.stringify({
    id: req.params.id, //catalog
    search: extra.search, //search query
    genreId: extra.genreId, //genre
  });
  const logIdentifier = 'lang: "' + config.language + '", ' + cacheKey;
  let sortCollectionsBy = "popularity"; //popularity is better than imdbRating for searching
  let collections = [];

  // Ignore skip requests - this is a workaround to avoid triggering skip requests
  // or when search query is longer than 30 characters - AI search etc.
  if (extra.skip) {
    // console.log("Ignoring request with skip parameter");
    return { metas: [] };
  } else if (extra.search?.replace(/collection/gi, "").trim().length > 30) {
    // console.log("Ignoring request with search query longer than 30 characters");
    return { metas: [] };
  }

  config.cacheType = null;

  if (extra.search) {
    collections = await cacheWrapSearch(cacheKey, async () => {
      return getSearch(extra.search);
    });
  } else {
    // console.log("discovering collections for catalog:", req.params.id);
    // Discover collections with parameters based on catalog type
    const discoverParams = { "vote_count.gte": 100 }; //defaults

    switch (req.params.id) {
      case `${collectionPrefix}popular`:
        extra.genre ? (discoverParams.with_genres = extra.genreId) : null;
        discoverParams.sort_by = "popularity.desc";
        discoverParams["vote_average.gte"] = 7;
        discoverParams["vote_count.gte"] = 20;
        sortCollectionsBy = "popularity";
        break;

      case `${collectionPrefix}topRated`:
        extra.genre ? (discoverParams.with_genres = extra.genreId) : null;
        if (!extra.genre) {
          discoverParams["vote_count.gte"] = 13000;
        } else if (extra.genreId === 10402 || extra.genreId === 10770 || extra.genreId === 10752) {
          //Music, TV Movie, War
          discoverParams["vote_count.gte"] = 300;
        } else if (extra.genreId === 99 || extra.genreId === 36 || extra.genreId === 37) {
          //Documentary, History, Western
          //default
        } else {
          discoverParams["vote_count.gte"] = 3000;
        }

        discoverParams.sort_by = "vote_average.desc";
        sortCollectionsBy = "imdbRating";
        break;

      case `${collectionPrefix}newReleases`:
        extra.genre ? (discoverParams.with_genres = extra.genreId) : null;
        discoverParams.sort_by = "release_date.desc";
        // Get movies from last year
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        discoverParams["primary_release_date.gte"] = oneYearAgo.toISOString().split("T")[0];
        discoverParams["vote_count.gte"] = 5;
        discoverParams["vote_average.gte"] = 5;
        sortCollectionsBy = "latestReleaseDate";
        break;

      case `${collectionPrefix}topRatedByCountry`:
        discoverParams.with_origin_country = extra.genreId;
        if (["AR", "CZ", "CH", "NZ", "PT", "RO", "IL", "ZA", "SK", "UA"].includes(extra.genreId)) {
          //these countries have very few movies/collections, they can be not that popular on TMDB
          discoverParams["vote_count.gte"] = 1;
        } else if (["AT", "MX", "NL", "PL", "NO", "LT", "MT", "NL", "PL", "HK", "SE", "KR"].includes(extra.genreId)) {
          //these countries have some movies/collections, they can be not that popular on TMDB
          discoverParams["vote_count.gte"] = 15;
        } else if (["US", "GB", "FR"].includes(extra.genreId)) {
          //these countries have more movies/collections, they are popular on TMDB
          discoverParams["vote_count.gte"] = 500;
        } else {
          //medium
          discoverParams["vote_count.gte"] = 30;
        }
        discoverParams.sort_by = "vote_count.desc";
        sortCollectionsBy = "imdbRating";
        // config.cacheType = "sqlite";
        break;

      case `${collectionPrefix}topRatedByCompany`:
        discoverParams.with_companies = extra.genreId;
        discoverParams["vote_count.gte"] = 0; //genre?.vote_count;
        discoverParams.sort_by = "vote_count.desc";
        sortCollectionsBy = "imdbRating";
        // config.cacheType = "sqlite";
        break;
    }

    collections = await cacheWrapCollectionDetails("discover:" + cacheKey, async () => {
      return discoverXCollections(discoverParams);
    });
  }

  if (collections.length === 0) {
    console.log(`Catalog request for type "${req.params.type}", ${logIdentifier}\nno collections found`);
    return { metas: [] };
  }

  // Process collections with caching
  const processCollections = async (collections, config) => {
    // Process all collections in parallel
    const promises = collections.map((collectionId) => processCollectionDetails(collectionId, config));

    const results = (await Promise.all(promises))
      .map((collection) => {
        delete collection?.videosTmp;
        return collection;
      })
      .filter(Boolean);

    return results.sort((a, b) => (b[sortCollectionsBy] || 0) - (a[sortCollectionsBy] || 0));
  };

  const metas = (await processCollections(collections, config)).filter(
    (collection) =>
      (config.enableAdultContent || (!config.enableAdultContent && !collection?.adult)) && collection?.moreThanOneReleasedPart,
  );

  const endTime = process.hrtime(startTime);
  const milliseconds = endTime[0] * 1000 + endTime[1] / 1000000;
  console.log(`Catalog request for type "${req.params.type}", ${logIdentifier}\nfetching time: ${milliseconds.toFixed(2)}ms`);

  return { metas };
}

module.exports = getCatalogResponse;
