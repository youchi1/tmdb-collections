const { initMovieDb, getCollectionIDsFromMovieIDs, handleTmdbError } = require("./getTmdb");
let moviedb = null;
(async () => (moviedb = await initMovieDb()))();

async function discoverCollections(parameters, fromPage = 1, toPage = 5) {
  try {
    // 1. Fetch movies from all pages in parallel
    const pagePromises = [];
    for (let page = fromPage; page <= toPage; page++) {
      pagePromises.push(
        moviedb.discoverMovie({ ...parameters, page }).catch((err) => {
          handleTmdbError(err, `Error during discovering movie page ${page}:`);
          return { results: [] };
        }),
      );
    }

    const pagesResults = await Promise.all(pagePromises);

    // Collect all movie IDs
    const movieIds = new Set(
      pagesResults.flatMap((response) => (response.results ? response.results.map((movie) => movie.id) : [])),
    );

    if (movieIds.size === 0) {
      return [];
    }

    // 2. Split movie IDs into chunks for parallel processing
    const chunkSize = 20; // Process 20 movies at a time
    const movieIdChunks = [...movieIds].reduce((chunks, id, index) => {
      const chunkIndex = Math.floor(index / chunkSize);
      if (!chunks[chunkIndex]) chunks[chunkIndex] = [];
      chunks[chunkIndex].push(id);
      return chunks;
    }, []);

    // Process each chunk in parallel
    const chunkResults = await Promise.all(movieIdChunks.map((chunk) => getCollectionIDsFromMovieIDs(chunk)));

    // 3. Combine all collection IDs into a single unique set
    const allCollectionIds = new Set(chunkResults.flatMap((collectionIds) => [...collectionIds]));

    return { totalPages: pagesResults[0].total_pages, collectionIds: [...allCollectionIds] };
  } catch (err) {
    console.error(`Discover:`, err);
    return [];
  }
}

async function discoverXCollections(parameters, minCollections = 100, maxPage = 99) {
  try {
    const PAGE_CHUNK = 25; // Number of pages to fetch in each attempt
    let collections = [];
    let currentStartPage = 1;
    let newCollections = {};
    newCollections.totalPages = PAGE_CHUNK; //initial value

    while (collections.length < minCollections && currentStartPage <= maxPage && currentStartPage <= newCollections.totalPages) {
      const endPage = Math.min(currentStartPage + PAGE_CHUNK - 1, maxPage, newCollections.totalPages);
      newCollections = await discoverCollections(parameters, currentStartPage, endPage);

      // Add new unique collections
      collections = [...new Set([...collections, ...newCollections.collectionIds])];

      // if last chunked pages returned no collections, break cycle
      if (newCollections.collectionIds.length === 0) {
        break;
      }

      currentStartPage = endPage + 1;
    }
    console.log("collections.length:", collections.length);

    return collections;
  } catch (err) {
    console.error(`Extended discover:`, err);
    return [];
  }
}

module.exports = {
  discoverCollections,
  discoverXCollections,
};
