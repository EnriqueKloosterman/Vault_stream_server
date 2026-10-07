import { classifyVideo, subtitleKeyFor } from './parser.js';

describe('parser.classifyVideo', () => {
  it('clasifica una película con año y tags', () => {
    const result = classifyVideo(
      'Movies/Inception (2010)/Inception.2010.1080p.BluRay.x264.mp4',
    );
    expect(result.kind).toBe('movie');
    if (result.kind === 'movie') {
      expect(result.title).toBe('Inception');
      expect(result.year).toBe(2010);
      expect(result.folderPath).toBe('Movies/Inception (2010)');
    }
  });

  it('clasifica episodio con SxxEyy en carpeta de serie', () => {
    const result = classifyVideo(
      'Series/Breaking Bad/Season 1/Breaking.Bad.S01E05.720p.mp4',
    );
    expect(result.kind).toBe('series');
    if (result.kind === 'series') {
      expect(result.seriesTitle).toBe('Breaking Bad');
      expect(result.season).toBe(1);
      expect(result.episode).toBe(5);
    }
  });

  it('detecta serie por carpeta genérica y patrón 1x02', () => {
    const result = classifyVideo('Shows/The Office/The Office 1x02.mp4');
    expect(result.kind).toBe('series');
    if (result.kind === 'series') {
      expect(result.seriesTitle).toBe('The Office');
      expect(result.season).toBe(1);
      expect(result.episode).toBe(2);
    }
  });

  it('detecta serie Temporada/Capítulo en español', () => {
    const result = classifyVideo(
      'Series/El Internado/Temporada 2/El.Internado.S02E04.mp4',
    );
    expect(result.kind).toBe('series');
    if (result.kind === 'series') {
      expect(result.seriesTitle).toBe('El Internado');
      expect(result.season).toBe(2);
      expect(result.episode).toBe(4);
    }
  });

  it('serie solo por nombre de archivo (sin carpetas)', () => {
    const result = classifyVideo('SomeShow S02E03.mp4');
    expect(result.kind).toBe('series');
    if (result.kind === 'series') {
      expect(result.seriesTitle).toBe('SomeShow');
      expect(result.season).toBe(2);
      expect(result.episode).toBe(3);
    }
  });

  it('no confunde 1920x1080 con código de episodio', () => {
    const result = classifyVideo('Movie.1920x1080.sample.mp4');
    expect(result.kind).toBe('movie');
  });

  it('extrae número de episodio con patrón guiones', () => {
    const result = classifyVideo('TV/Mislitas/01 - 05.mp4');
    expect(result.kind).toBe('series');
    if (result.kind === 'series') {
      expect(result.episode).toBe(5);
      expect(result.season).toBe(1);
    }
  });

  it('numero episodios con prefijo NNN_Título dentro de serie', () => {
    const result = classifyVideo(
      'series/animacion/he-man/001_Diamond_Ray_of_Disappearance.mp4',
    );
    expect(result.kind).toBe('series');
    if (result.kind === 'series') {
      expect(result.seriesTitle).toBe('he-man');
      expect(result.season).toBe(1);
      expect(result.episode).toBe(1);
      expect(result.episodeTitle).toBe('Diamond Ray of Disappearance');
    }
  });

  it('numero episodios del doble dígito y limpia el título', () => {
    const result = classifyVideo(
      'series/animacion/he-man/012_The_Time_Corridor.mp4',
    );
    expect(result.kind).toBe('series');
    if (result.kind === 'series') {
      expect(result.episode).toBe(12);
      expect(result.episodeTitle).toBe('The Time Corridor');
    }
  });
});

describe('parser.subtitleKeyFor', () => {
  const subs = [
    'Movies/Inception/Inception.2010.srt',
    'Series/Show/Season 1/Show.S01E01.srt',
  ];

  it('empareja por misma ruta (case-insensitive)', () => {
    expect(
      subtitleKeyFor(
        'Movies/Inception/Inception.2010.MP4',
        subs,
      ),
    ).toBe('Movies/Inception/Inception.2010.srt');
  });

  it('empareja por basename en otra carpeta', () => {
    expect(
      subtitleKeyFor('other/Show.S01E01.mp4', subs),
    ).toBe('Series/Show/Season 1/Show.S01E01.srt');
  });

  it('devuelve undefined si no hay subtítulo', () => {
    expect(subtitleKeyFor('Movies/Other/movie.mp4', subs)).toBeUndefined();
  });
});
