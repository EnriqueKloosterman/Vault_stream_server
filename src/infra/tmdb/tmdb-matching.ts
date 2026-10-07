export interface TmdbCandidate {
  id: number;
  name: string;
  /** Otros nombres del candidato (título localizado en otros idiomas + título original). */
  aliases: string[];
  releaseDate?: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  language?: string;
  voteCount: number;
}

export type MatchConfidence = 'exact' | 'confident';

export interface TmdbMatch {
  candidate: TmdbCandidate;
  score: number;
  confidence: MatchConfidence;
}

export interface MatchOptions {
  title: string;
  year?: number;
}

/**
 * Excepciones para falsos positivos conocidos. Clave: título normalizado.
 * - `skip: true` descarta siempre el título (no se consulta ni se guarda nada).
 * - `tmdbId` fuerza un id concreto de TMDB aunque el score no alcance el umbral.
 */
export const TMDB_EXCEPTIONS: Record<
  string,
  { skip?: boolean; tmdbId?: number }
> = {
  'he man': { tmdbId: 931 },
};

export function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function candidateYear(candidate: TmdbCandidate): number | undefined {
  const year = candidate.releaseDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? Number(year) : undefined;
}

function titleScore(name: string, title: string): number {
  const normalizedName = normalizeTitle(name);
  const normalizedTitle = normalizeTitle(title);
  if (normalizedName.length === 0 || normalizedTitle.length === 0) {
    return 0;
  }
  if (normalizedName === normalizedTitle) {
    return 100;
  }
  if (
    normalizedName.length >= 4 &&
    normalizedTitle.length >= 4 &&
    (normalizedName.includes(normalizedTitle) ||
      normalizedTitle.includes(normalizedName))
  ) {
    return 60;
  }
  return 0;
}

function candidateNames(candidate: TmdbCandidate): string[] {
  return [candidate.name, ...(candidate.aliases ?? [])].filter(
    (name) => name.length > 0,
  );
}

export function scoreCandidate(
  candidate: TmdbCandidate,
  options: MatchOptions,
): number {
  const base = candidateNames(candidate).reduce(
    (best, name) => Math.max(best, titleScore(name, options.title)),
    0,
  );
  if (base === 0) {
    return 0;
  }
  const year = candidateYear(candidate);
  let score = base;
  if (options.year !== undefined) {
    if (year === options.year) score += 20;
    else if (year !== undefined) score -= 25;
    else score -= 10;
  } else if (year !== undefined) {
    score -= 5;
  }
  return score;
}

export function findBestMatch(
  candidates: TmdbCandidate[],
  options: MatchOptions,
): TmdbMatch | null {
  const exception = TMDB_EXCEPTIONS[normalizeTitle(options.title)];
  if (exception?.skip) {
    return null;
  }

  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, options) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return null;
  }

  if (exception?.tmdbId !== undefined) {
    const forced = scored.find((entry) => entry.candidate.id === exception.tmdbId);
    if (!forced) {
      return null;
    }
    return {
      candidate: forced.candidate,
      score: forced.score,
      confidence: 'confident' as const,
    };
  }

  const year = candidateYear(best.candidate);
  const exactTitle = candidateNames(best.candidate).some(
    (name) => titleScore(name, options.title) === 100,
  );
  if (exactTitle && (options.year === undefined || year === options.year)) {
    return {
      candidate: best.candidate,
      score: best.score,
      confidence: 'exact' as const,
    };
  }

  if (best.score >= 80) {
    return {
      candidate: best.candidate,
      score: best.score,
      confidence: 'confident' as const,
    };
  }

  return null;
}