require("dotenv").config();
const fanart = new (require("fanart.tv"))(process.env.FANART_API_KEY);
const { cacheWrapCollectionDetails } = require("./cache");

async function getFanart(ID, imageType) {
  //ID = imdbId or tmdbId
  try {
    return await cacheWrapCollectionDetails(`${imageType}:${ID}`, async () => {
      const data = await fanart.movies.get(ID);

      // Return null if no data or no images of specified type
      if (!data || !data[imageType] || !data[imageType].length) {
        return null;
      }

      const fanartData = {
        imdb_id: data.imdb_id,
        tmdb_id: data.tmdb_id,
        ...(imageType === "hdmovielogo" && {
          hdmovielogo: data.hdmovielogo.map((logo) => ({
            lang: logo.lang === "cz" ? "cs" : logo.lang,
            url: logo.url.replace(/^http:/, "https:"), //fix at least for Windows
            likes: logo.likes,
          })),
        }),
        ...(imageType === "moviethumb" && {
          moviethumb: data.moviethumb.map((thumb) => ({
            lang: thumb.lang === "cz" ? "cs" : thumb.lang,
            url: thumb.url.replace(/^http:/, "https:"), //fix at least for Windows
            likes: thumb.likes,
          })),
        }),
      };

      // console.log(fanartData);

      return fanartData;
    });
  } catch (error) {
    if (!error.message.includes("404")) {
      //404 = not found
      console.error(`Error getting fanart for ${ID} (${imageType}): ${error}`);
    }
    return null;
  }
}

module.exports = { getFanart };
