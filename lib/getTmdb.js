const { MovieDb } = require("moviedb-promise");
const { HttpMethod } = require("moviedb-promise/dist/types");
const { genres } = require("../Public/genres");
const { countries } = require("../Public/countries");
require("dotenv").config();
const { cacheWrapMovieDetails, cacheWrapOthers } = require("./cache");

let moviedb = null;
let initializationPromise = null;

// Initialize moviedb immediately
initMovieDb();

function handleTmdbError(err, errorText) {
  if (err.response?.status != 404 && !err.message?.includes("404")) {
    console.error(`${errorText}: ${err.response?.status} - ${err.response?.data?.status_message}`, {
      error: err.message,
      stack: err.stack,
    });
  }
}

async function initMovieDb() {
  // If already initializing, return the existing promise
  if (initializationPromise) {
    // console.log("MovieDB already initializing, reusing existing promise");
    return initializationPromise;
  }

  // If already initialized, return the existing instance
  if (moviedb) {
    // console.log("MovieDB already initialized, reusing existing instance");
    return moviedb;
  }

  // Create a single initialization promise
  initializationPromise = (async () => {
    console.log(`[${new Date().toISOString()}] Initializing MovieDB`);
    moviedb = new MovieDb(process.env.TMDB_API_KEY, "https://api.themoviedb.org/3/", 15); //requestsPerSecondLimit = 25, as default = 50 sometimes results in 429 (official limit is around 50)
    return moviedb;
  })();

  return initializationPromise;
}

async function getGenres(language = "en") {
  if (language === "en") {
    return Promise.resolve(genres);
  }

  try {
    const response = await cacheWrapOthers(`genres:${language}`, async () => {
      return await moviedb.genreMovieList({ language });
    });
    if (!response || !response.genres || response.genres.some((genre) => genre.name === null)) {
      return Promise.resolve(genres);
    }
    return response.genres;
  } catch (err) {
    handleTmdbError(err, "Error getting genres");
    return [];
  }
}

async function getCountries(language = "en") {
  try {
    let filteredCountries = null;

    if (language === "en") {
      filteredCountries = countries;
    } else {
      // TMDB API does support localized country names, but moviedb-promise countries() method is broken
      // We use makeRequest directly to bypass the bug in the library
      const response = await cacheWrapOthers(`countries:${language}`, async () => {
        return await moviedb.makeRequest(HttpMethod.Get, "configuration/countries", { language });
      });

      if (!response || response.some((country) => country.name === null)) {
        filteredCountries = countries;
      } else {
        filteredCountries = response;
      }
    }

    // Filter and map the countries to include only the specified english_name values
    // Countries sorted by movie production count from the-numbers.com (highest to lowest)
    const countryOrder = [
      "United States of America", // 26,458 movies
      "United Kingdom", // 5,029 movies
      "France", // 4,976 movies
      "China", // 3,473 movies
      "India", // 3,146 movies
      "Germany", // 2,524 movies
      "Japan", // 2,509 movies
      "Italy", // 2,436 movies
      "South Korea", // 2,334 movies
      "Spain", // 2,303 movies
      "Canada", // 2,221 movies
      "Russia", // 1,680 movies
      "Turkey", // 1,553 movies
      "Australia", // 1,223 movies
      "Argentina", // 969 movies
      "Brazil", // 797 movies
      "Mexico", // 744 movies
      "Netherlands", // 687 movies
      "Hong Kong", // 561 movies
      "Czech Republic", // 500 movies
      "Poland", // 427 movies
      "Sweden", // 409 movies
      "Switzerland", // 350 movies
      "New Zealand", // 348 movies
      "Norway", // 283 movies
      "Portugal", // 279 movies
      "Romania", // 279 movies
      "Israel", // 251 movies
      "South Africa", // 222 movies
      "Slovakia", // 212 movies
      "Ukraine", // 101 movies
    ];

    return filteredCountries
      .filter((country) => countryOrder.includes(country.english_name))
      .sort((a, b) => {
        const indexA = countryOrder.indexOf(a.english_name);
        const indexB = countryOrder.indexOf(b.english_name);
        return indexA - indexB;
      })
      .map((country) => ({
        id: country.iso_3166_1,
        name: country.native_name,
        english_name: country.english_name,
      }));
  } catch (err) {
    handleTmdbError(err, "Error getting countries");
    return [];
  }
}

async function getBelongsToCollection(imdbId, belongsToCollection) {
  return cacheWrapOthers(
    "BtC" + imdbId,
    async () => {
      return belongsToCollection;
    },
    { ttl: 2 * 24 * 60 * 60 * 1000 },
  );
}

async function getMovieDetailsImdbId(imdbId) {
  return await moviedb
    .movieInfo({ id: imdbId })
    .then((movie) => {
      //cache it under imdbId for stream route
      return getBelongsToCollection(
        movie.imdb_id,
        movie.belongs_to_collection ? { id: movie.belongs_to_collection?.id, name: movie.belongs_to_collection?.name } : "npoc",
      ); // npoc = not part of collection
    })
    .catch((err) => {
      // console.log(err);
      handleTmdbError(err, `Error getting movie details for ${imdbId}`);
      return null;
    });
}

async function getMovieDetails(movieId) {
  return cacheWrapMovieDetails(movieId, async () => {
    return await moviedb
      .movieInfo({ id: movieId, append_to_response: "translations,images" })
      .then((movie) => {
        //cache it under imdbId for stream route
        if (movie.imdb_id) {
          getBelongsToCollection(
            movie.imdb_id,
            movie.belongs_to_collection
              ? { id: movie.belongs_to_collection?.id, name: movie.belongs_to_collection?.name }
              : "npoc",
          ); // npoc = not part of collection
        }

        return {
          id: movie.id,
          imdb_id: movie.imdb_id,
          genres: movie.genres,
          belongs_to_collection: { id: movie.belongs_to_collection?.id, name: movie.belongs_to_collection?.name },
          translations: movie.translations?.translations
            ?.filter(
              (translation) =>
                translation.iso_639_1 !== "en" && (translation.data.overview?.trim() || translation.data.title?.trim()),
            ) //filter out english translations, they are returned in collection by default
            .map((translation) => ({
              iso_639_1: translation.iso_639_1,
              description: translation.data.overview,
              title: translation.data.title,
            })),
          posters: movie.images?.posters
            ?.filter((image) => image.iso_639_1 !== "en" && image.iso_639_1?.trim() && image.file_path) //filter out english posters, they are returned in collection by default
            .map((image) => ({
              iso_639_1: image.iso_639_1,
              poster: image.file_path,
              // aspect_ratio: image.aspect_ratio,
              vote_average: image.vote_average,
            })),
          logos: movie.images?.logos
            ?.filter((image) => image.file_path && image.aspect_ratio >= 1 && image.aspect_ratio <= 2)
            .map((image) => ({
              iso_639_1: image.iso_639_1,
              logo: image.file_path,
              // aspect_ratio: image.aspect_ratio,
              vote_average: image.vote_average,
            })),
        };
      })
      .catch((err) => {
        // console.log(err);
        handleTmdbError(err, `Error getting movie details for ${movieId}`);
        return null;
      });
  });
}

async function getCollectionDetails(collectionId) {
  return await moviedb
    .collectionInfo({ id: collectionId, append_to_response: "translations,images" })
    .then((res) => {
      res.parts.sort((a, b) => {
        // If both dates are missing, maintain original order
        if (!a.release_date && !b.release_date) return 0;
        // Put missing dates at the beginning (treat as future)
        if (!a.release_date) return 1;
        if (!b.release_date) return -1;
        // Sort by date if both exist
        return new Date(a.release_date) - new Date(b.release_date);
      });
      return res;
    })
    .catch((err) => {
      handleTmdbError(err, `Error getting collection details for ${collectionId}`);
      return null;
    });
}

async function getCollectionIDsFromMovieIDs(movieIds) {
  // Process all movies in parallel
  const movieDetails = await Promise.all(movieIds.map((movieId) => getMovieDetails(movieId)));

  // Create Set directly from filtered collection IDs
  return new Set(
    movieDetails.filter((movie) => movie && movie.belongs_to_collection?.id).map((movie) => movie.belongs_to_collection.id),
  );
}

// Export the initialized instance getter
module.exports = {
  initMovieDb,
  getMovieDetails,
  getCollectionDetails,
  getCollectionIDsFromMovieIDs,
  getMovieDetailsImdbId,
  getBelongsToCollection,
  getGenres,
  getCountries,
  handleTmdbError,
};
