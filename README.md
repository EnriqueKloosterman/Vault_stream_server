# Stream App — Backend

API REST del backend de **Stream App**: servicio personal de streaming de vídeo. Indexa archivos `.mp4` (+ subtítulos `.srt`) almacenados en **Cloudflare R2** (compatible S3), los organiza en catálogo de películas/series, los enriquece con metadatos de **TMDB**, sirve URLs firmadas para reproducción/descarga, sincroniza el progreso de visionado multi-dispositivo y gestiona descargas offline.

> Stack: **NestJS 12 + TypeScript (ESM) + Mongoose 9 + MongoDB + Passport-JWT + Cloudflare R2 (AWS SDK v3) + TMDB API + Vitest**.

---

## Índice

1. [Arquitectura](#1-arquitectura)
2. [Stack y dependencias](#2-stack-y-dependencias)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Configuración y variables de entorno](#4-configuración-y-variables-de-entorno)
5. [Puesta en marcha](#5-puesta-en-marcha)
6. [Seguridad, validación y rate-limit](#6-seguridad-validación-y-rate-limit)
7. [Autenticación (`/auth`)](#7-autenticación-auth)
8. [Usuarios (`/users`)](#8-usuarios-users)
9. [Librería y escaneo (`/library`, `/series`)](#9-librería-y-escaneo-library-series)
10. [Media — URLs firmadas (`/media`)](#10-media--urls-firmadas-media)
11. [Progreso (`/progress`)](#11-progreso-progress)
12. [Descargas offline (`/downloads`)](#12-descargas-offline-downloads)
13. [Mantenimiento](#13-mantenimiento)
14. [Infraestructura: R2 y TMDB](#14-infraestructura-r2-y-tmdb)
15. [Modelos de datos (MongoDB)](#15-modelos-de-datos-mongodb)
16. [Referencia completa de endpoints](#16-referencia-completa-de-endpoints)
17. [Scripts, tests y calidad](#17-scripts-tests-y-calidad)

---

## 1. Arquitectura

Modular por dominio, patrón **Controller → Service → Schema** de NestJS:

```
src/
├── main.ts                  # Bootstrap (CORS, ValidationPipe global, puerto)
├── app.module.ts            # Módulo raíz: Config, Mongoose, Throttler, Guards globales
├── app.controller.ts        # GET / (healthcheck público)
├── auth/                    # Registro, login, JWT, Passport strategy, guard global
├── users/                  # Perfil (/me) y borrado de cuenta
├── library/                # Catálogo + ScannerService (indexa R2) + EnrichmentService (TMDB) + parser de nombres
├── media/                  # Presigned URLs de vídeo y subtítulos
├── progress/               # Sincronización de progreso (last-write-wins)
├── downloads/              # Descargas offline con expiración
├── maintenance/            # Borrado en cascada + limpieza de huérfanos al arrancar
├── infra/
│   ├── r2/                 # S3Client + listAll + presignGet (Cloudflare R2)
│   └── tmdb/               # Cliente TMDB + algoritmo de matching (tmdb-matching.ts)
└── common/                 # @Public(), @CurrentUser(), CommonModule (placeholder)
```

Dependencias entre módulos:

- `AuthModule` → importa `UsersModule` + `LibraryModule` (dispara `scanAuto` en login/register).
- `DownloadsModule` → importa `LibraryModule` (valida propiedad del vídeo) + `InfraModule` (firma URL).
- `MediaModule` → importa `LibraryModule` + `InfraModule`.
- `UsersModule` → importa `MaintenanceModule` (borrado en cascada).
- `InfraModule` → provee `R2Service` y re-exporta `TmdbModule`.
- `LibraryModule` → importa `InfraModule` (R2 + TMDB), exporta `LibraryService, ScannerService`.

Flujo de datos típico:

1. `POST /auth/login` → JWT → `ScannerService.scanAuto()` (fire-and-forget, si `SCAN_AUTO_ON_LOGIN=true`).
2. `runScan()` lista objetos R2 (`R2_PREFIXES`), clasifica con `parser.ts`, hace upsert en `LibraryItem/Series/Season/Episode`, purga obsoletos y lanza `EnrichmentService` (TMDB).
3. Cliente consulta `GET /library`, `GET /series/:id`, reproduce vía `POST /media/presign` (URL firmada temporal) y sincroniza posición con `POST /progress`.

---

## 2. Stack y dependencias

| Paquete | Versión | Uso |
|---|---|---|
| `@nestjs/common,core,platform-express` | `^12` | Framework, DI, HTTP |
| `@nestjs/config` | `^12` | `ConfigModule.forRoot({isGlobal:true})`, `ConfigService` |
| `@nestjs/mongoose` + `mongoose` | `^12` / `^9.11` | ODM, schemas, índices |
| `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt` | `^12` / `^0.7` / `^4.0` | Firma/validación JWT (`Bearer`) |
| `bcryptjs` | `^3.0.3` | Hash `hash(pw,10)` / `compare` |
| `@nestjs/throttler` | `^6.7.1` | Rate-limit global + `@Throttle()` |
| `class-validator`, `class-transformer` | `^0.15` / `^0.5` | DTOs + `ValidationPipe` global |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | `^3.1146` | `S3Client`, `ListObjectsV2`, `getSignedUrl` contra R2 |
| `reflect-metadata`, `rxjs` | — | Base NestJS |

Dev: `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`, `@nestjs/mau`, `typescript ^6`, `vitest ^4` (+ `@vitest/coverage-v8`, `vite-tsconfig-paths`), `supertest`, `oxlint`, `prettier`, `source-map-support`.

---

## 3. Estructura del proyecto

```
backend/
├── src/                    # Código fuente (70 ficheros incl. *.spec.ts)
│   ├── auth/               # auth.module/controller/service, jwt.strategy, jwt-auth.guard, dto/
│   ├── users/              # users.module/controller/service, schemas/user.schema.ts
│   ├── library/            # library.controller, series.controller, library/scanner/enrichment.service,
│   │                       # parser.ts, dto/library-query.dto.ts, schemas/ (library-item, series, season, episode)
│   ├── media/              # media.module/controller/service, dto/media.dto.ts
│   ├── progress/           # progress.module/controller/service, dto/progress.dto.ts, schemas/watch-progress.schema.ts
│   ├── downloads/          # downloads.module/controller/service, dto/downloads.dto.ts, schemas/download.schema.ts
│   ├── maintenance/        # maintenance.module/service
│   ├── infra/r2/           # r2.service.ts
│   ├── infra/tmdb/         # tmdb.module/service, tmdb-matching.ts
│   └── common/decorators/  # public.decorator.ts, current-user.decorator.ts
├── test/app.e2e-spec.ts    # Test e2e (Supertest)
├── .env / .env.example     # Configuración local / plantilla
├── nest-cli.json, tsconfig*.json, vitest.config.ts, vitest.config.e2e.ts
├── package.json            # Scripts y dependencias (type: module → ESM, imports con .js)
└── dist/                   # Salida de `nest build`
```

Notas:

- ESM puro (`"type": "module"`): los imports internos usan extensión `.js` (`./app.module.js`).
- Sin prefijo global de API: las rutas son tal cual (`/auth`, `/library`, …). Para versionar, añadir `app.setGlobalPrefix('api')` en `main.ts`.
- Sin Swagger/OpenAPI, sin `helmet`, sin `cookie-parser`.

---

## 4. Configuración y variables de entorno

Copiar la plantilla y completar:

```bash
cp .env.example .env
```

| Variable | Requerida | Defecto | Dónde se usa |
|---|---|---|---|
| `PORT` | No | `3000` | `src/main.ts` — `app.listen(process.env.PORT ?? 3000)` |
| `NODE_ENV` | No | `development` | Informativa |
| `MONGODB_URI` | **Sí** | — | `src/app.module.ts` — `MongooseModule.forRootAsync({uri})` |
| `JWT_SECRET` | **Sí** | — | `auth.module.ts`, `jwt.strategy.ts` (`getOrThrow`) — firma y validación |
| `JWT_EXPIRES_IN` | No | `30m` | `JwtModule.registerAsync({signOptions.expiresIn})` |
| `R2_ACCOUNT_ID` | No* | — | Documentativa (forma parte de `R2_ENDPOINT`) |
| `R2_ENDPOINT` | **Sí** | — | `infra/r2/r2.service.ts` — ej. `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | **Sí** | — | Credenciales `S3Client` |
| `R2_SECRET_ACCESS_KEY` | **Sí** | — | Credenciales `S3Client` |
| `R2_BUCKET_NAME` | **Sí** | — | Bucket de vídeos |
| `R2_REGION` | No | `auto` | Región del `S3Client` (R2 usa `auto`) |
| `R2_PREFIXES` | No | `''` | CSV de raíces de escaneo, ej. `Movies,Series` |
| `PRESIGN_TTL_SECONDS` | No | `600` | TTL de URLs firmadas (`R2Service.presignGet`) |
| `SCAN_AUTO_ON_LOGIN` | No | `true` | `scanner.service.ts` — auto-escaneo en login/register |
| `TMDB_API_KEY` | **Sí** | — | `infra/tmdb/tmdb.service.ts` — búsqueda de carátulas/sinopsis |
| `DOWNLOAD_EXPIRY_DAYS` | No | `7` (código usa const `7d`) | Documentativa; la expiración real está hardcodeada a 7 días en `downloads.service.ts` |

---

## 5. Puesta en marcha

Requisitos: **Node ≥ 22** (usa `fetch` nativo + `AbortSignal.timeout`), **MongoDB** local o remoto, bucket **R2** con API key de TMDB.

```bash
# 1. Instalar
npm install

# 2. Configurar
cp .env.example .env   # editar valores

# 3. Desarrollo (watch)
npm run start:dev

# 4. Producción
npm run build
npm run start:prod     # node dist/main

# Debug
npm run start:debug
```

---

## 6. Seguridad, validación y rate-limit

Definido en `src/app.module.ts` + `src/main.ts`:

- **JWT global**: `JwtAuthGuard` registrado como `APP_GUARD`. Todo endpoint exige `Authorization: Bearer <token>` salvo `@Public()` en `GET /` y `AuthController`. El guard usa `Reflector.getAllAndOverride(IS_PUBLIC_KEY)`.
  - Estrategia `passport-jwt`: token del header Bearer, `secretOrKey = JWT_SECRET`, `ignoreExpiration: false`. `validate({sub,email})` → `req.user = {userId, email}` (extraíble con `@CurrentUser()`).
- **Throttling global**: `ThrottlerModule.forRoot([{ttl: 60_000, limit: 100}])` + `ThrottlerGuard` como `APP_GUARD` → 100 req/min por IP. `AuthController` lo endurece a **10 req/min** (`@Throttle({default:{ttl:60_000, limit:10}})`) anti-fuerza bruta.
- **Validación global**: `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})` → se eliminan props no decoradas, **400 si llega prop extra**, y se transforman tipos (`page`/`limit` string→number, DTOs anidados).
- **CORS**: `app.enableCors()` sin opciones (abierto). Endurecer en prod: `enableCors({origin:[...]})`.
- **Passwords**: `bcryptjs` con salt rounds `10`; `passwordHash` con `select:false` (solo se lee con `.select('+passwordHash')` en login). Emails normalizados a minúsculas (`lowercase:true` + `toLowerCase()` en `findByEmail`).

---

## 7. Autenticación (`/auth`)

Archivos: `auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts`, `dto/register.dto.ts`, `dto/login.dto.ts`.

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| `POST` | `/auth/register` | `RegisterDto` | `201 {access_token}` |
| `POST` | `/auth/login` | `LoginDto` | `200 {access_token}` (con `@HttpCode(200)`) |

DTOs:

- `RegisterDto`: `email: @IsEmail()`, `password: @IsString() @MinLength(8) @MaxLength(72)`.
- `LoginDto`: `email: @IsEmail()`, `password: @IsString() @IsNotEmpty()`.

Lógica (`auth.service.ts`):

- `register`: `findByEmail` → `409 'El email ya está registrado'` si existe; `hash(password,10)`; `usersService.create(email, hash)` (mapea error Mongo `11000` a 409 por condición de carrera); dispara `scannerService.scanAuto(userId).catch(()=>undefined)` fire-and-forget; firma JWT `{sub:userId, email}`.
- `login`: `findByEmail` + `compare` → `401 'Credenciales inválidas'` si falla; también dispara `scanAuto`; firma JWT.

---

## 8. Usuarios (`/users`)

`@Controller('users')` — todo protegido por JWT global. `users.service.ts` + `schemas/user.schema.ts` + `maintenance` para borrado.

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/users/me` | `{id, email}` (desde `@CurrentUser()`, sin ir a BD) |
| `DELETE` | `/users/me` | `{deleted:boolean}` — borrado en cascada vía `MaintenanceService.cascadeDeleteUser` |

Servicio: `create(email,passwordHash)`, `findByEmail(email)` (lowercase + `select('+passwordHash')`), `findById(id)`. Schema `User`: `email` único/lowercase/trim, `passwordHash` (`select:false`), `timestamps:true`.

---

## 9. Librería y escaneo (`/library`, `/series`)

El módulo central. Controladores: `library.controller.ts` (`@Controller('library')`), `series.controller.ts` (`@Controller('series')`).

| Método | Ruta | Query/Body | Respuesta |
|---|---|---|---|
| `GET` | `/library` | `LibraryQueryDto`: `page? (≥1, def 1)`, `limit? (1–100, def 20)`, `type? ('movie'\|'series')`, `q? (≤200 chars)` | `{items, total, page, limit}` ordenado por `title` |
| `POST` | `/library/scan` | `ScanDto`: `{prefixes?: string[]}` | `{status:'started'}` inmediato (escaneo en background) |
| `GET` | `/library/status` | — | `{scanning:boolean, processed:number, total?:number, lastScanAt?:Date}` (estado en memoria) |
| `GET` | `/library/:id` | `id` (MongoId) | `LibraryItem` o `404 'Recurso no encontrado'` |
| `GET` | `/series/:id` | `id` (MongoId) | `{series, seasons:{season, episodes[]}[]}` o `404 'Serie no encontrada'` |

> `GET /library/status` debe declararse antes que `GET /library/:id` (ya lo está) para no ser capturado por el parámetro.

### ScannerService — cómo indexa R2

Estado en memoria: `Map<userId, ScanStatus>` (se pierde al reiniciar).

1. `scan(userId, prefixes?)`: si ya hay escaneo en curso retorna `{status:'started'}`; si no, marca `scanning:true` y lanza `runScan()` sin esperar (`void ...catch(...)`).
2. `scanAuto(userId)`: solo escanea si `SCAN_AUTO_ON_LOGIN ?? 'true' === 'true'`. Se invoca en login/register.
3. `runScan()`:
   - Raíces = `prefixes` del body o `R2Service.prefixes` (de `R2_PREFIXES`).
   - `listAll()` por raíz → separa `*.mp4` (vídeos) y `*.srt` (subtítulos).
   - Por cada vídeo: `upsertVideo()` + `processed++`.
   - `pruneStale()`: borra `LibraryItem`/`Episode` cuyo `r2Key` cuelgue de las raíces escaneadas pero ya no exista en R2 (`$nin: seen`); luego borra `Season` sin episodios y `Series` sin seasons ni items.
   - Al final: `enrichment.enrichUserLibrary(userId).catch(()=>undefined)`.
4. `upsertVideo(key)`:
   - `classifyVideo(key)` (ver parser) + `subtitleKeyFor(key, subtitles)` (match por ruta sin extensión o por basename, case-insensitive).
   - Serie → upsert `Series {userId,title}`, `Season {userId,seriesId,number}`, `Episode {userId,r2Key}` (+ crea/actualiza fila `LibraryItem type:'series'` con `r2Key = <folder>/`); película → upsert `LibraryItem {userId,r2Key} type:'movie'`.
   - Campos `$setOnInsert`: `watched:false`, `progressSec:0`, `lastPos:0`.

### Parser (`library/parser.ts`, puro sin Nest)

- Detecta series por código de episodio (`S01E02`, `1x02`), carpeta de temporada (`season|temporada|specials|extras`) o carpeta con pinta de serie; extrae `seriesTitle`, `season`, `episode`, `episodeTitle`, `year` y `folderPath`.
- Limpia ruido (`NOISE_TAGS`: `1080p, bluray, web-dl, x264/x265, hevc, castellano, …`) e ignora carpetas genéricas (`series|shows|tv|peliculas|movies|…`).
- `escapeRegex()` para filtros Mongo seguros con `q`.

### EnrichmentService — TMDB

- `enrichUserLibrary(userId)`: toma hasta `25` items sin `posterUrl` ni `tmdbSkipped`, busca en TMDB (`es-ES` + `en-US`), elige mejor match con `findBestMatch()` y persiste.
- **Circuit-breaker**: tras `5` fallos consecutivos de TMDB aborta el batch (respeta rate-limit).
- `persistMatch`: guarda `posterUrl (w500)`, `backdropUrl (w1280)`, `tmdbId`; si es serie actualiza también la colección `Series` (`synopsis` truncada a 2000 chars) y los `stillUrl (w300)` de episodios vía `tmdb.season()`. Si no hay póster pero sí match, marca `tmdbSkipped:true` + `tmdbId`. Si no hay match, `tmdbSkipped:true`.

---

## 10. Media — URLs firmadas (`/media`)

`@Controller('media')` — JWT. Puente entre catálogo y R2: nunca expone credenciales, solo URLs presigned con TTL.

| Método | Ruta | DTO | Respuesta |
|---|---|---|---|
| `POST` | `/media/presign` | `PresignDto {r2Key: string}` | `{url, expiresIn}` (vídeo) |
| `GET` | `/media/subtitle?subtitleKey=...` | `SubtitleQueryDto {subtitleKey: string}` | `{url, expiresIn}` (subtítulo `.srt`) |

Lógica (`media.service.ts`):

- `presign`: si el `r2Key` pertenece al usuario (`LibraryService.findOwnedKey`) → firma; si existe globalmente pero es de otro usuario (`keyExists`) → `403 'No tienes acceso a este recurso'`; si no existe → `404 'Recurso no encontrado'`.
- `subtitle`: `findOwnedSubtitle` → firma; si no → `404 'Subtítulo no encontrado'`.
- `expiresIn` = `PRESIGN_TTL_SECONDS` (def. 600 s).

---

## 11. Progreso (`/progress`)

Sincronización multi-dispositivo con estrategia **last-write-wins por timestamp de cliente**. `@Controller('progress')`.

| Método | Ruta | DTO | Respuesta |
|---|---|---|---|
| `GET` | `/progress?itemType=movie&refId=...` | `ProgressQueryDto` (ambos opcionales) | `WatchProgress[]` ordenado por `lastUpdated desc` |
| `POST` | `/progress` | `ProgressBodyDto` (batch o single) | `{updated, skipped}` |
| `PATCH` | `/progress` | idéntico a POST | `{updated, skipped}` |

DTOs (`progress/dto/progress.dto.ts`):

- `ProgressUpdateDto`: `itemType ('movie'\|'episode')`, `refId (MongoId)`, `currentTimeSec ≥0`, `durationSec ≥0`, `completedPct 0–100`, `lastUpdated ≥1` (epoch del cliente).
- `ProgressBodyDto`: o bien `updates[]` (máx `500`, validados anidados) o bien los 6 campos sueltos para modo single.

Lógica (`progress.service.ts`):

1. `resolveUpdates(body)`: si trae `updates[]` no vacío lo usa; si trae los 6 campos sueltos lo envuelve; si no → `400 'Cuerpo inválido…'` (o `'updates no puede estar vacío'`).
2. `apply()`: carga los progresos existentes del usuario para esos pares `(itemType,refId)`; por cada update, si `update.lastUpdated <= guardado` → `skipped++`; si no → `bulkWrite upsert` con `syncedAt: new Date()` (hora servidor) → `updated++`.

---

## 12. Descargas offline (`/downloads`)

Permite al cliente obtener una URL de descarga y trackear su estado. `@Controller('downloads')` — JWT.

| Método | Ruta | Body/Params | Respuesta |
|---|---|---|---|
| `GET` | `/downloads` | — | `Download[]` (orden `updatedAt desc`) |
| `POST` | `/downloads/start` | `StartDownloadDto {itemType:'movie'\|'episode', refId: MongoId}` | `{downloadId, url, expiresIn, fileName, fileSize?}` |
| `PATCH` | `/downloads/:id/progress` | `DownloadProgressDto {progressPct: 0–100}` | `Download` |
| `PATCH` | `/downloads/:id/complete` | `DownloadCompleteDto {fileSize?: ≥0}` | `Download` (status `completed`, `progressPct 100`) |
| `DELETE` | `/downloads/:id` | `id` | `{deleted:boolean}` |

Lógica (`downloads.service.ts`):

- `start`: valida que el vídeo pertenece al usuario (`libraryService.findVideoForDownload`); calcula `expiresAt = now + 7 días`; si ya existe registro `(userId,itemType,refId)` lo **reutiliza** (resetea a `pending`, nuevo `localPath=downloads/<id>.mp4`, `r2Key`, `expiresAt`); si no lo crea; firma con `r2.presignGet(r2Key)`.
- `updateProgress`: `status → 'downloading'` (salvo ya `completed`).
- `complete`: `status='completed'`, `progressPct=100`.
- `remove`: `deleteOne({_id,userId})`; `ObjectId` inválido → `{deleted:false}`.
- `onModuleInit → purgeExpired()`: `deleteMany({expiresAt: {$lt: now}})` al arrancar.
- Estados: `'pending' | 'downloading' | 'completed' | 'error'`. Id no encontrado → `404 'Descarga no encontrada'`.

---

## 13. Mantenimiento

Sin controlador; servicio transversal (`maintenance.service.ts`, `implements OnApplicationBootstrap`):

- `onApplicationBootstrap()`: `setImmediate(() => removeOrphans())` — limpia sin bloquear el arranque.
- `cascadeDeleteUser(userId)`: `deleteMany({userId})` en paralelo sobre `episodes, seasons, series, libraryItems, downloads, watchProgress` + `findByIdAndDelete` del usuario → `{deleted}`. Usado por `DELETE /users/me`.
- `removeOrphans()`: obtiene `distinct _id` de usuarios válidos y borra documentos con `userId ∉ válidos` en las 6 colecciones; retorna nº total eliminado.

`downloads.service.ts` además implementa `onModuleInit → purgeExpired()` (descargas caducadas).

---

## 14. Infraestructura: R2 y TMDB

### R2 (`infra/r2/r2.service.ts`)

```ts
client = new S3Client({ region: R2_REGION ?? 'auto',
  endpoint: getOrThrow('R2_ENDPOINT'),
  credentials: { accessKeyId, secretAccessKey } });
```

- `listAll(prefix)`: normaliza a `prefix/`, pagina con `ListObjectsV2Command` + `ContinuationToken`, retorna `{key, size}[]`.
- `presignGet(key)`: `GetObjectCommand({Bucket, Key})` + `getSignedUrl(expiresIn: presignTtl)` → `{url, expiresIn}`.
- `prefixes`: parseo CSV de `R2_PREFIXES`.

### TMDB (`infra/tmdb/`)

- `tmdb.service.ts`: `search({query, type, year})` contra `search/movie|search/tv` en `es-ES` + `en-US` (merge por `id`, fusionando `aliases`); `season(seriesId, n)` (`/tv/{id}/season/{n}`); helpers `posterUrl (w500)`, `backdropUrl (w1280)`, `stillUrl (w300)`; `fetch` con `AbortSignal.timeout(8000)`; error tipado `TmdbApiError`. Constantes: `TMDB_API=https://api.themoviedb.org/3`, `TMDB_IMAGE=https://image.tmdb.org/t/p`.
- `tmdb-matching.ts` (puro): normaliza títulos (minúsculas, sin diacríticos, no-alnum→espacio), score `100` exacto / `60` contains (+`20` año igual, `−25` año distinto, `−10` sin año pedido, `−5` con año no pedido); `findBestMatch` devuelve `exact`/`confident (score≥80)` o `null`; excepciones `TMDB_EXCEPTIONS` (ej. `'he man' → tmdbId 931`, soporte `skip:true`).

---

## 15. Modelos de datos (MongoDB)

Todos con `timestamps:true` (`createdAt/updatedAt`). Referencias por `ObjectId`; **aislamiento por `userId`** en todas las colecciones salvo `users`.

**`users`** (`users/schemas/user.schema.ts`): `email` (único, lowercase, trim), `passwordHash` (`select:false`).

**`libraryitems`** (`library/schemas/library-item.schema.ts`): fila de catálogo (película o serie agregada).

| Campo | Tipo | Notas |
|---|---|---|
| `userId` | ObjectId, index | propietario |
| `type` | `'movie'\|'series'`, index | |
| `title` | string, index, trim | |
| `year` | number? (1900–2100) | |
| `posterUrl`, `backdropUrl` | string? | TMDB `w500`/`w1280` |
| `tmdbId` | number? | |
| `tmdbSkipped` | boolean? | no reintentar enriquecimiento |
| `r2Key` | string | vídeo (movie) o carpeta `…/` (series) |
| `seriesId` | ObjectId? ref `Series` | solo `type:'series'` |
| `folderPath`, `subtitleKey` | string? | |
| `durationSec`, `fileSize` | number? ≥0 | |
| `format` | string, def `'mp4'` | |
| `watched` | boolean, def `false` | |
| `lastSeenAt` | Date? | |

Índices: `{userId:1, r2Key:1}` único, `{userId:1, type:1, title:1}`.

**`series`** (`series.schema.ts`): `userId` (index), `title` (trim, index), `year?`, `posterUrl?`, `backdropUrl?`, `synopsis?`, `tmdbId?`, `r2Prefix?`. Índice `{userId:1, title:1}`.

**`seasons`** (`season.schema.ts`): `seriesId` (index), `userId` (index), `number` (≥0), `title?`. Índice único `{userId:1, seriesId:1, number:1}`.

**`episodes`** (`episode.schema.ts`): `seasonId`, `seriesId`, `userId` (index), `title` (trim), `number` (≥0), `episodeNumber?`, `r2Key`, `subtitleKey?`, `durationSec?`, `fileSize?`, `stillUrl?`, `watched` (def false), `progressSec`/`lastPos` (def 0). Índices: `{userId:1, r2Key:1}` único, `{userId:1, seriesId:1, seasonId:1, number:1}`.

**`watchprogresses`** (`progress/schemas/watch-progress.schema.ts`): `userId` (index), `itemType` (`movie|episode`), `refId` (ObjectId), `currentTimeSec`/`durationSec` (def 0), `completedPct` (0–100), `lastUpdated` (epoch cliente, index), `syncedAt?` (servidor). Índice único `{userId:1, itemType:1, refId:1}` + `{userId:1, lastUpdated:-1}`.

**`downloads`** (`downloads/schemas/download.schema.ts`): `_id`, `userId` (index), `itemType`, `refId`, `localPath` (`downloads/<id>.mp4`), `r2Key`, `fileSize?`, `status` (`pending|downloading|completed|error`, def `pending`, index), `progressPct` (0–100, def 0), `error?`, `expiresAt` (index). Índices: `{userId:1, status:1}`, `{userId:1, itemType:1, refId:1}` único.

---

## 16. Referencia completa de endpoints

Todos salvo `GET /` y `/auth/*` requieren `Authorization: Bearer <JWT>`.

```
GET    /                                → "Hello World!" (público, healthcheck)
POST   /auth/register                   {email, password(8-72)} → {access_token}
POST   /auth/login                      {email, password} → {access_token}
GET    /users/me                        → {id, email}
DELETE /users/me                        → {deleted}
GET    /library?page&limit&type&q       → {items, total, page, limit}
POST   /library/scan                    {prefixes?} → {status:'started'}
GET    /library/status                  → {scanning, processed, total?, lastScanAt?}
GET    /library/:id                     → LibraryItem
GET    /series/:id                      → {series, seasons:{season, episodes[]}[]}
POST   /media/presign                   {r2Key} → {url, expiresIn}
GET    /media/subtitle?subtitleKey=     → {url, expiresIn}
GET    /progress?itemType&refId         → WatchProgress[]
POST   /progress                        {updates[] | single} → {updated, skipped}
PATCH  /progress                        idem POST
GET    /downloads                       → Download[]
POST   /downloads/start                 {itemType, refId} → {downloadId, url, expiresIn, fileName, fileSize?}
PATCH  /downloads/:id/progress          {progressPct} → Download
PATCH  /downloads/:id/complete          {fileSize?} → Download
DELETE /downloads/:id                   → {deleted}
```

Códigos de error habituales: `400` validación (`ValidationPipe` / `forbidNonWhitelisted`), `401 'Credenciales inválidas'` o JWT ausente/inválido, `403 'No tienes acceso a este recurso'` (recurso ajeno), `404` (`'Recurso no encontrado'`, `'Serie no encontrada'`, `'Subtítulo no encontrado'`, `'Descarga no encontrada'`), `409 'El email ya está registrado'`, `429` throttling (global 100/min, auth 10/min).

---

## 17. Scripts, tests y calidad

```bash
npm run build        # nest build → dist/
npm run start        # nest start
npm run start:dev    # watch mode
npm run start:debug  # --debug --watch
npm run start:prod   # node dist/main
npm run deploy       # nest deploy (Mau / AWS)

npm run test         # vitest run (unitarios: *.spec.ts junto al código)
npm run test:watch   # vitest watch
npm run test:cov     # vitest con coverage (v8)
npm run test:e2e     # vitest --config vitest.config.e2e.ts (test/app.e2e-spec.ts, supertest)
npm run test:debug   # vitest --inspect-brk --no-file-parallelism

npm run format       # prettier --write "src/**/*.ts" "test/**/*.ts"
npm run lint         # oxlint src/ test/
```

- Unitarios con **Vitest + `@nestjs/testing`**: hay `*.spec.ts` por casi cada controller/service (`auth`, `users`, `library`, `scanner`, `enrichment`, `parser`, `media`, `progress`, `downloads`, `maintenance`, `r2`, `tmdb`, `tmdb-matching`, `app.controller`).
- E2E: `test/app.e2e-spec.ts` con `supertest` y config dedicada `vitest.config.e2e.ts`.
- Formato: Prettier (`.prettierrc`); lint: `oxlint.json`.
- Limpiezas automáticas al arrancar: `MaintenanceService.removeOrphans()` (`OnApplicationBootstrap` + `setImmediate`) y `DownloadsService.purgeExpired()` (`OnModuleInit`).

