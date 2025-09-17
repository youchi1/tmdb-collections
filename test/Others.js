require("dotenv").config();

(async () => {
  const response1 = await fetch(
    `https://api.themoviedb.org/3/movie/671?api_key=${process.env.TMDB_API_KEY}&append_to_response=images,translations` //harry potter
  );
  const data1 = await response1.json();

  const response2 = await fetch(
    `https://api.themoviedb.org/3/movie/tt0120737?api_key=${process.env.TMDB_API_KEY}&append_to_response=images,translations`
  );
  const data2 = await response2.json();

  const uniqueLanguages = [
    ...new Set(
      data1.translations.translations.map(
        (t) => t.iso_639_1,
        data2.translations.translations.map((t) => t.iso_639_1)
      )
    ),
  ];
  console.log("Unique languages:", uniqueLanguages);
  console.log("Log count:", uniqueLanguages.length);
})();
