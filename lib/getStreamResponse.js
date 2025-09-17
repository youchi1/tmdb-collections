const getManifest = require("./getManifest");
const { getMovieDetailsImdbId, getBelongsToCollection } = require("./getTmdb");

// This solution provides links to all collections without filtering (adult or one part collections...)
// to apply filtering, calling processCollectionDetails would be needed, which would result to a lot of TMDB API requests
// behaviour is not consistent this way, but I think it is not a big deal
async function getStreamResponse(req) {
  try {
    const imdbId = req.params.id;
    const config = req.config || {};
    const manifest = await getManifest(config);
    const collectionPrefix = manifest.idPrefixes[0];

    //try to get it from cache (caching in getTmdb.js)
    // console.log("trying to get it from cache");
    let collection = await getBelongsToCollection(imdbId);

    //if cached, but not part of collection, return empty
    if (collection === "npoc") {
      return [];
    }

    //if not cached, get it and cache it under imdbId
    if (!collection) {
      //   console.log("not cached, getting it and caching it under imdbId");
      collection = await getMovieDetailsImdbId(imdbId);
    }

    //if not part of collection, return empty
    if (!collection?.id) {
      //   console.log("not part of collection");
      return [];
    }

    return {
      streams: [
        {
          name: "TMDB Collections",
          description: `📚 "${collection.name}"\nMovie is part of 👆\nClick and go to the collection`,
          externalUrl:
            (req.headers["origin"]?.includes("web.stremio.com") ? "https://web.stremio.com/#" : "stremio://") +
            `/detail/movie/${collectionPrefix}${collection.id}`,
        },
      ],
    };
  } catch (error) {
    console.error("Error in stream endpoint:", error.code, error.message, error.stack);
    return [];
  }
}

module.exports = getStreamResponse;
