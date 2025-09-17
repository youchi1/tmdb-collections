const { getFanart } = require("./getFanart");
const { getMovieDetails } = require("./getTmdb");
const { processCollectionDetails } = require("./processCollectionDetails");

async function getMetaResponse(req) {
  const config = req.config;
  const startTime = process.hrtime();
  const collectionId = req.params.id.split(".")[1];

  // Return null if collectionId is not a valid number
  // meta for 'tmdb:' prefix used in tmdb-addon sometimes requested, which causes an server crash (strange, because while testing, prefix filtering works)
  if (!collectionId || isNaN(collectionId)) {
    return { meta: [] };
  }

  // Get the base collection
  const collection = await processCollectionDetails(collectionId, config);

  // somehow are requested collection IDs which exist in the collections list, but not in collection details API endpoint, even though getCatalogRespons should not return these collections
  if (!collection) {
    return { meta: [] };
  }

  try {
    // Apply translations
    collection.videos = collection.videosTmp.map((video) => {
      // Find the translation for the configured language
      const translation = video.translations?.find((t) => t.iso_639_1 === config.language);

      return {
        ...video,
        title: translation?.title || video.title,
        overview: video.ratings + (translation?.description || video.overview),
      };
    });

    // Clean up videosTmp if no longer needed
    delete collection.videosTmp;

    // Get both collection logo and thumbnails in parallel
    await Promise.all([
      // Get and apply collection logo directly
      (async () => {
        const logoUrl = await getFanart(collectionId, "hdmovielogo").then((data) => {
          return data?.hdmovielogo
            ?.filter((logo) => {
              return data?.hdmovielogo?.some((l) => l.lang === config.language)
                ? logo.lang === config.language
                : logo.lang === "en" || logo.lang?.trim() === null;
            })
            ?.sort((a, b) => b.likes - a.likes)[0]?.url;
        });

        // Set collection logo directly if there is one
        if (logoUrl) {
          collection.logo = logoUrl;
        }
      })(),

      // Get collection movies thumbnails and apply them directly
      (async () => {
        await Promise.all(
          //...in parallel
          collection.videos.map(async (video) => {
            let thumbnailUrl = null;

            if (video.id) {
              // Try to get fanart thumbnail
              thumbnailUrl = await getFanart(video.tmdbId, "moviethumb").then((data) => {
                return data?.moviethumb
                  ?.filter((thumb) => {
                    return data.moviethumb?.some((t) => t.lang === config.language)
                      ? thumb.lang === config.language
                      : thumb.lang === "en" || thumb.lang?.trim() === null;
                  })
                  ?.sort((a, b) => b.likes - a.likes)[0]?.url;
              });
            }

            //fallback to logo or backdrop image if no fanart is found
            if (!thumbnailUrl) {
              thumbnailUrl = await getMovieDetails(video.tmdbId).then((data) => {
                return (
                  "https://image.tmdb.org/t/p/w780" +
                  (data?.logos
                    ?.filter((logo) => {
                      return data?.logos?.some((l) => l.iso_639_1 === config.language)
                        ? logo.iso_639_1 === config.language
                        : logo.iso_639_1 === "en" || logo.iso_639_1?.trim() === null;
                    })
                    ?.sort((a, b) => b.vote_average - a.vote_average)[0]?.logo || video.thumbnail)
                );
              });
            }

            // Apply thumbnail directly to the video object
            video.thumbnail = thumbnailUrl;
            video.id = video.id || "ttx" + video.episode; //for some reason, android TVs had issues with some movies being without id

            delete video.tmdbId;
            delete video.translations;
            delete video.poster;
          }),
        );
      })(),
    ]);
  } catch (error) {
    console.error(
      `Error in getMetaResponse for lang: "${config.language}", type: "${req.params.type}", id: "${collectionId}":`,
      "error code: " + error.code,
      "error message: " + error.message,
      "error stack: " + error.stack,
    );
    return { meta: [] };
  }

  const endTime = process.hrtime(startTime);
  const milliseconds = endTime[0] * 1000 + endTime[1] / 1000000;
  console.log(
    `Metadata request for lang: "${config.language}", type: "${req.params.type}", id: "${collectionId}", name: "${
      collection.nameEN
    }"\nfetching time: ${milliseconds.toFixed(2)}ms`,
  );

  delete collection.nameEN;

  return { meta: collection };
}

module.exports = getMetaResponse;
