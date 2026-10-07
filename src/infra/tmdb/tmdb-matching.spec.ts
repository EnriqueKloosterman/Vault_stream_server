import {
  findBestMatch,
  normalizeTitle,
  scoreCandidate,
  TMDB_EXCEPTIONS,
  type TmdbCandidate,
} from './tmdb-matching.js';

function candidate(overrides: Partial<TmdbCandidate> = {}): TmdbCandidate {
  return {
    id: 1,
    name: 'Inception',
    aliases: [],
    releaseDate: '2010-07-16',
    posterPath: '/abc.jpg',
    backdropPath: '/def.jpg',
    overview: 'Un ladrón entra en sueños.',
    language: 'en',
    voteCount: 30000,
    ...overrides,
  };
}

describe('normalizeTitle', () => {
  it('quita acentos, mayúsculas y símbolos', () => {
    expect(normalizeTitle('  Orgullo y Prejuicio  (2005) ')).toBe(
      'orgullo y prejuicio 2005',
    );
    expect(normalizeTitle('El-señor-de-los-anillos')).toBe(
      'el senor de los anillos',
    );
  });
});

describe('scoreCandidate', () => {
  it('premia el título exacto', () => {
    expect(scoreCandidate(candidate(), { title: 'Inception' })).toBeGreaterThan(80);
  });

  it('bonifica el año esperado', () => {
    const exact = scoreCandidate(candidate(), { title: 'Inception', year: 2010 });
    const mismatched = scoreCandidate(candidate(), { title: 'Inception', year: 1999 });
    expect(exact).toBe(mismatched + 45);
  });

  it('rechaza títulos sin relación', () => {
    expect(scoreCandidate(candidate(), { title: 'Futurama' })).toBe(0);
  });

  it('matchea por alias aunque el name esté en otro idioma', () => {
    const es = candidate({
      name: 'He-Man y los Amos del Universo',
      aliases: ['He-Man and the Masters of the Universe'],
      releaseDate: '1983-09-05',
    });
    expect(
      scoreCandidate(es, {
        title: 'He-Man and the Masters of the Universe',
        year: 1983,
      }),
    ).toBeGreaterThan(80);
  });
});

describe('findBestMatch', () => {
  it('devuelve match exacto por título y año', () => {
    const match = findBestMatch(
      [
        candidate({ id: 9, name: 'Inception Movie', releaseDate: '2013-01-01' }),
        candidate(),
      ],
      { title: 'Inception', year: 2010 },
    );
    expect(match?.candidate.id).toBe(1);
    expect(match?.confidence).toBe('exact');
  });

  it('acepta título exacto sin año esperado', () => {
    const match = findBestMatch([candidate()], { title: 'Inception' });
    expect(match?.confidence).toBe('exact');
  });

  it('descarta el candidato si el año difiere', () => {
    expect(
      findBestMatch(
        [candidate({ id: 2, name: 'Inception', releaseDate: '1998-05-01' })],
        { title: 'Inception', year: 2010 },
      ),
    ).toBeNull();
  });

  it('la excepción fuerza "he-man" a He-Man y los Amos del Universo (931)', () => {
    const match = findBestMatch(
      [
        candidate({
          id: 931,
          name: 'He-Man y los Amos del Universo',
          aliases: ['He-Man and the Masters of the Universe'],
          releaseDate: '1983-09-05',
        }),
      ],
      { title: 'he-man' },
    );
    expect(match?.candidate.id).toBe(931);
    expect(match?.confidence).toBe('confident');
  });

  it('confía en coincidencia parcial con año correcto', () => {
    const match = findBestMatch(
      [
        candidate({
          id: 3,
          name: 'The Dark Knight Rises',
          releaseDate: '2012-07-20',
        }),
      ],
      { title: 'The Dark Knight', year: 2012 },
    );
    expect(match?.candidate.id).toBe(3);
    expect(match?.confidence).toBe('confident');
  });

  it('rechaza coincidencias demasiado débiles', () => {
    expect(
      findBestMatch(
        [candidate({ id: 4, name: 'Space 1999', releaseDate: '1975-01-01' })],
        { title: 'Space', year: 1999 },
      ),
    ).toBeNull();
  });

  it('devuelve null sin candidatos', () => {
    expect(findBestMatch([], { title: 'Inception' })).toBeNull();
  });

  describe('excepciones', () => {
    const title = 'Falsa Positiva';

    afterEach(() => {
      delete TMDB_EXCEPTIONS[normalizeTitle(title)];
    });

    it('skip descarta aunque haya coincidencia', () => {
      TMDB_EXCEPTIONS[normalizeTitle(title)] = { skip: true };
      const match = findBestMatch([candidate({ name: title })], { title });
      expect(match).toBeNull();
    });

    it('tmdbId fuerza un id concreto', () => {
      TMDB_EXCEPTIONS[normalizeTitle(title)] = { tmdbId: 7 };
      const match = findBestMatch(
        [
          candidate({ id: 6, name: title }),
          candidate({ id: 7, name: `${title} 2`, releaseDate: '1999-01-01' }),
        ],
        { title, year: 1999 },
      );
      expect(match?.candidate.id).toBe(7);
    });
  });
});