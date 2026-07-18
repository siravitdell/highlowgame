interface TmdbMovieSummary {
  id: number;
  title: string;
}

interface TmdbPopularResponse {
  results: TmdbMovieSummary[];
}

interface TmdbMovieDetail {
  id: number;
  title: string;
  budget: number;
  revenue: number;
  poster_path: string | null;
}

export interface TmdbMovieItem {
  name: string;
  boxOffice: number;
  budget: number;
  imageUrl: string | null;
}

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

export async function fetchTopMovies(limit = 100): Promise<TmdbMovieItem[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error("TMDB_API_KEY is not set");
  }

  const pagesNeeded = Math.ceil(limit / 20);
  const summaries: TmdbMovieSummary[] = [];

  for (let page = 1; page <= pagesNeeded; page++) {
    const res = await fetch(
      `${TMDB_BASE}/movie/popular?api_key=${apiKey}&page=${page}`
    );
    if (!res.ok) {
      throw new Error(`TMDB API request failed: ${res.status}`);
    }
    const data = (await res.json()) as TmdbPopularResponse;
    summaries.push(...data.results);
  }

  const details = await Promise.all(
    summaries.slice(0, limit).map(async (movie) => {
      const res = await fetch(
        `${TMDB_BASE}/movie/${movie.id}?api_key=${apiKey}`
      );
      if (!res.ok) return null;
      return (await res.json()) as TmdbMovieDetail;
    })
  );

  return details
    .filter((m): m is TmdbMovieDetail => m !== null && m.budget > 0 && m.revenue > 0)
    .map((m) => ({
      name: m.title,
      boxOffice: m.revenue,
      budget: m.budget,
      imageUrl: m.poster_path ? `${TMDB_IMAGE_BASE}${m.poster_path}` : null,
    }));
}
