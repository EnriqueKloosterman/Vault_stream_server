const NOISE_TAGS = [
  '480p',
  '576p',
  '720p',
  '1080p',
  '1440p',
  '2160p',
  '4k',
  '8k',
  'bluray',
  'blu-ray',
  'bdrip',
  'brrip',
  'web-dl',
  'webdl',
  'webrip',
  'hdtv',
  'dvdrip',
  'dvd',
  'hdrip',
  'remux',
  'x264',
  'x265',
  'h264',
  'h265',
  'h\\.?264',
  'h\\.?265',
  'hevc',
  'avc',
  'aac',
  'ac3',
  'eac3',
  'dts',
  'ddp?5?\\.?1',
  'truehd',
  'atmos',
  'hdr',
  'hdr10',
  'dv',
  'sdr',
  'proper',
  'repack',
  'extended',
  'uncut',
  'unrated',
  'limited',
  'complete',
  'internal',
  'multi',
  'dual',
  'sub',
  'subs',
  'castellano',
  'espanol',
  'español',
  'ingl',
];

const NOISE_RE = new RegExp(
  `\\b(?:${NOISE_TAGS.join('|')})\\b`,
  'gi',
);

const GENERIC_FOLDER_RE =
  /^(?:series|shows?|tv|peliculas?|movies?|cartoons?|documentales?)$/i;

const SERIES_FOLDER_RE =
  /(?:^|[^a-z0-9])(?:series|shows?|tv|temporadas?|seasons?)(?:[^a-z0-9]|$)/i;

const SEASON_FOLDER_RE =
  /^(?:(?:season|temporada)\s*(\d{1,2})|(?:s|t)(\d{1,2})|(specials?|extras?))$/i;

export interface EpisodeCode {
  season: number;
  episode: number;
}

export type ParsedVideo =
  | {
      kind: 'series';
      seriesTitle: string;
      season: number;
      episode: number;
      episodeTitle: string;
      year?: number;
      folderPath: string;
    }
  | {
      kind: 'movie';
      title: string;
      year?: number;
      folderPath: string;
    };

function findEpisodeCode(text: string): EpisodeCode | null {
  const sxxeyy = /S(\d{1,2})E(\d{1,3})/i.exec(text);
  if (sxxeyy) {
    return { season: Number(sxxeyy[1]), episode: Number(sxxeyy[2]) };
  }
  const xnn = /(?:^|[^\d])(\d{1,2})x(\d{2,3})(?!\d)/i.exec(text);
  if (xnn) {
    return { season: Number(xnn[1]), episode: Number(xnn[2]) };
  }
  const dash = /(?:^|[\s.([])(\d{1,3})\s*-\s*(\d{1,3})(?![\d-])/.exec(text);
  if (dash) {
    return { season: Number(dash[1]), episode: Number(dash[2]) };
  }
  return null;
}

function extractYear(text: string): { year?: number; rest: string } {
  const match = /\b((?:19|20)\d{2})\b/.exec(text);
  if (!match) {
    return { rest: text };
  }
  return {
    year: Number(match[1]),
    rest: text.replace(match[0], ' '),
  };
}

function stripNoise(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(NOISE_RE, ' ')
    .replace(/[_\\.]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.\-–—]+|[\s.\-–—]+$/g, ' ')
    .trim();
}

function cleanEpisodeTitle(base: string, seriesTitle: string): string {
  let text = base
    .replace(/S\d{1,2}E\d{1,3}/gi, ' ')
    .replace(/(?:^|[^\d])(\d{1,2})x(\d{2,3})(?!\d)/gi, ' ')
    .replace(/(?:^|[\s.([])(\d{1,3})\s*-\s*(\d{1,3})(?![\d-])/g, ' ');

  if (seriesTitle) {
    const escaped = seriesTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), ' ');
  }

  const cleaned = stripNoise(text);
  return cleaned.length > 0 ? cleaned : '';
}

function findSeasonFolder(
  folders: string[],
): { number: number; index: number } | null {
  for (let i = folders.length - 1; i >= 0; i--) {
    const match = SEASON_FOLDER_RE.exec(folders[i].trim());
    if (!match) {
      continue;
    }
    if (match[1] !== undefined) {
      return { number: Number(match[1]), index: i };
    }
    if (match[2] !== undefined) {
      return { number: Number(match[2]), index: i };
    }
    return { number: 0, index: i };
  }
  return null;
}

function seriesTitleFromFolders(
  folders: string[],
  seasonIndex: number | null,
): string | null {
  let candidates = folders;
  if (seasonIndex !== null) {
    candidates = folders.slice(0, seasonIndex);
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const name = candidates[i].trim();
    if (name.length === 0 || GENERIC_FOLDER_RE.test(name)) {
      continue;
    }
    const { rest } = extractYear(name);
    return stripNoise(rest);
  }
  return null;
}

function seriesTitleFromFileName(base: string): string {
  const withoutCode = base
    .replace(/S\d{1,2}E\d{1,3}/gi, ' ')
    .replace(/(?:^|[^\d])(\d{1,2})x(\d{2,3})(?!\d)/gi, ' ')
    .replace(/(?:^|[\s.([])(\d{1,3})\s*-\s*(\d{1,3})(?![\d-])/g, ' ');
  const { rest } = extractYear(withoutCode);
  return stripNoise(rest);
}

export function classifyVideo(key: string): ParsedVideo {
  const segments = key.split('/').filter((s) => s.length > 0);
  const fileName = segments.pop() ?? '';
  const folders = segments;
  const base = fileName.replace(/\.[a-z0-9]{2,4}$/i, '');

  const codeFromName = findEpisodeCode(base);
  const codeFromPath = codeFromName ?? findEpisodeCode(folders.join('/'));
  const seasonFolder = findSeasonFolder(folders);
  const folderLooksSeries = folders.some(
    (f) => SERIES_FOLDER_RE.test(f) || /^(?:s|t)\d{1,2}$/i.test(f.trim()),
  );

  const isSeries =
    codeFromName !== null ||
    codeFromPath !== null ||
    seasonFolder !== null ||
    folderLooksSeries;

  const folderPath = folders.join('/');

  if (isSeries) {
    const titleFromFolders = seriesTitleFromFolders(
      folders,
      seasonFolder?.index ?? null,
    );
    const seriesTitle =
      titleFromFolders && titleFromFolders.length > 0
        ? titleFromFolders
        : seriesTitleFromFileName(base) || 'Serie';

    const season = codeFromPath?.season ?? seasonFolder?.number ?? 1;
    const episode =
      codeFromPath?.episode ??
      (() => {
        const dash = /(?:^|[\s.([])(\d{1,3})\s*-\s*(\d{1,3})(?![\d-])/.exec(
          base,
        );
        return dash ? Number(dash[2]) : 0;
      })();

    const episodeTitle = cleanEpisodeTitle(base, seriesTitle);
    const yearFromName = extractYear(base);
    const yearFromFolder =
      yearFromName.year === undefined && folders.length > 0
        ? extractYear(folders[folders.length - 1])
        : { year: undefined };

    return {
      kind: 'series',
      seriesTitle,
      season,
      episode,
      episodeTitle: episodeTitle.length > 0 ? episodeTitle : `Episodio ${episode}`,
      year: yearFromName.year ?? yearFromFolder.year,
      folderPath,
    };
  }

  const fromName = extractYear(base);
  const fromFolder =
    fromName.year === undefined && folders.length > 0
      ? extractYear(folders[folders.length - 1])
      : { year: undefined };
  const title = stripNoise(fromName.rest);

  return {
    kind: 'movie',
    title: title.length > 0 ? title : base.trim(),
    year: fromName.year ?? fromFolder.year,
    folderPath,
  };
}

export function subtitleKeyFor(
  videoKey: string,
  subtitleKeys: string[],
): string | undefined {
  const normalizedVideo = videoKey.replace(/\.[a-z0-9]{2,4}$/i, '');
  const wanted = normalizedVideo.toLowerCase();
  const sameFolder = subtitleKeys.find(
    (key) => key.replace(/\.[a-z0-9]{2,4}$/i, '').toLowerCase() === wanted,
  );
  if (sameFolder) {
    return sameFolder;
  }
  const wantedBase = normalizedVideo.split('/').pop()?.toLowerCase();
  if (!wantedBase) {
    return undefined;
  }
  return subtitleKeys.find(
    (key) => key.split('/').pop()?.replace(/\.srt$/i, '').toLowerCase() === wantedBase,
  );
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
