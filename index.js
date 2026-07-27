require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

// En producción la app corre detrás de un proxy inverso (Render, Nginx, etc.)
// que agrega X-Forwarded-For. Sin esto, express-rate-limit vería siempre la IP
// del proxy y limitaría a todos juntos; con 'trust proxy' en 1 salto usa la IP
// real del cliente. Se activa solo en producción para no confiar en cabeceras
// falsificables en desarrollo local.
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Headers de seguridad HTTP, incluida una CSP real. script-src queda estricto
// ('self', sin inline ni eval) porque ya no quedan onclick="" ni <script>
// inline en las vistas. style-src sí necesita 'unsafe-inline': todavía hay
// atributos style="" inline en varias vistas (deuda aparte, no se resuelve
// acá) además de la hoja de Google Fonts.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
            connectSrc: ["'self'"]
        }
    }
}));

// Límite general para toda la API: 300 solicitudes cada 15 min por IP.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api', apiLimiter);

// Límite más estricto en login/registro para dificultar fuerza bruta:
// 10 intentos cada 15 min por IP.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }
});
// El secreto de firma JWT vive SOLO en .env (nunca en el código). Sin un valor
// fuerte definido, cualquiera podría forjar tokens de admin: por eso el arranque
// se aborta si falta o es demasiado corto. Genera uno con: openssl rand -hex 48
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET no está definido o es demasiado corto (mínimo 32 caracteres). ' +
        'Definilo en .env con un valor aleatorio: openssl rand -hex 48');
    process.exit(1);
}
const AUTH_COOKIE_NAME = 'kphoops_session';
const JWT_EXPIRES_IN = '7d';
const JWT_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// Motor de vistas: EJS. Las páginas se arman con un header/nav/footer únicos
// (views/partials/*) en vez de repetir el HTML en cada archivo. Ver views/.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Límites del plan gratuito (por defecto, mientras no exista un modelo de
// negocio con niveles pagos). Los ADMIN no están sujetos a estos límites.
const FREE_PLAN_LIMITS = {
    MAX_TEAMS_PER_CAPTAIN: 1,          // capitanes normales: 1 franquicia
    MAX_TOURNAMENTS_PER_ORGANIZER: 4,  // ligas que puede crear un organizador
    MAX_TEAMS_PER_TOURNAMENT: 16,      // cupos máximos por liga
    // El organizador arma sus propias ligas: suficiente para llenar sus 4
    // ligas de 16 equipos, sin dejarle saturar la página indefinidamente.
    MAX_TEAMS_PER_ORGANIZER: 64
};

// Sanea una URL de imagen recibida en el body. Solo se aceptan rutas internas
// de archivos ya subidos a este servidor (/uploads/...). Rechaza URLs externas,
// esquemas peligrosos (javascript:, data:) y cualquier cosa que luego se
// inyectaría en el DOM con innerHTML/<img src>, cerrando un vector de XSS.
function safeUploadUrl(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;
    // Debe ser una ruta relativa dentro de /uploads/ y sin traversal.
    if (!/^\/uploads\/[A-Za-z0-9._\-\/]+$/.test(v) || v.includes('..')) return null;
    return v;
}

// Normaliza texto libre (nombres de liga, sede) a "title case" en español, para
// no guardar lo que el usuario escribió tal cual ("liga hermandad", "nayo"). Cada
// palabra lleva inicial mayúscula, salvo conectores menores (de, la, y...) que van
// en minúscula excepto al inicio. Solo capitaliza la primera letra sin tocar el
// resto de la palabra, para preservar acrónimos ya escritos (p. ej. "CDMX").
const TITLE_CASE_MINOR_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'a']);
function toTitleCase(input) {
    if (typeof input !== 'string') return input;
    const cleaned = input.trim().replace(/\s+/g, ' ');
    if (!cleaned) return cleaned;
    return cleaned
        .split(' ')
        .map((word, i) => {
            if (i > 0 && TITLE_CASE_MINOR_WORDS.has(word.toLowerCase())) {
                return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ');
}

// Middleware para procesar datos de formularios (URL-encoded y JSON).
// El límite de tamaño evita que un payload gigante agote memoria/CPU (DoS).
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

// Servir archivos estáticos desde la carpeta 'public'.
// Cache-Control: no-cache obliga al navegador a revalidar con el servidor (vía
// ETag) en cada carga, así el usuario SIEMPRE ve la última versión de HTML/CSS/JS
// tras recargar (evita quedarse viendo una versión cacheada vieja). Si nada
// cambió, el servidor responde 304 y sigue siendo rápido.
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache');
    }
}));

// ==========================================================================
// PÁGINAS (vistas EJS). Migración progresiva desde public/*.html: a medida que
// una página se convierte a vista, se borra su .html de public/ y se sirve
// aquí. Se conservan las URLs con .html para no tocar los enlaces existentes.
// ==========================================================================
app.get('/', (req, res) => res.render('index'));
app.get('/index.html', (req, res) => res.render('index'));
app.get('/ligas.html', (req, res) => res.render('ligas'));
app.get('/torneo.html', (req, res) => res.render('torneo'));
app.get('/login.html', (req, res) => res.render('login'));
app.get('/registro.html', (req, res) => res.render('registro'));
app.get('/estadisticas.html', (req, res) => res.render('estadisticas'));
app.get('/crear-torneo.html', (req, res) => res.render('crear-torneo'));
app.get('/franquicias.html', (req, res) => res.render('franquicias'));
app.get('/crear-equipo.html', (req, res) => res.render('crear-equipo'));
app.get('/equipo.html', (req, res) => res.render('equipo'));
app.get('/gestionar-inscritos.html', (req, res) => res.render('gestionar-inscritos'));
app.get('/perfil-equipo.html', (req, res) => res.render('perfil-equipo'));
app.get('/perfil-jugador.html', (req, res) => res.render('perfil-jugador'));
app.get('/admin.html', (req, res) => res.render('admin'));
app.get('/mesa-control.html', (req, res) => res.render('mesa-control'));

// ==========================================================================
// Subida de imágenes (logos de franquicia y fotos de jugador).
//
// En producción (Vercel) el disco es EFÍMERO: un archivo guardado en disco se
// pierde al terminar la petición. Por eso, si hay CLOUDINARY_URL definido, las
// imágenes se suben a Cloudinary (almacenamiento persistente + CDN) y en la BD
// se guarda la URL remota. Si NO está definido (desarrollo local sin cuenta),
// se cae automáticamente a guardar en disco bajo public/uploads, como antes.
// ==========================================================================
const cloudinary = require('cloudinary').v2;
const useCloudinary = !!process.env.CLOUDINARY_URL; // el SDK se autoconfigura con esa variable

const playerPhotosDir = path.join(__dirname, 'public', 'uploads', 'players');
const teamLogosDir = path.join(__dirname, 'public', 'uploads', 'teams');
// Solo se necesitan las carpetas locales en el modo disco (dev).
if (!useCloudinary) {
    fs.mkdirSync(playerPhotosDir, { recursive: true });
    fs.mkdirSync(teamLogosDir, { recursive: true });
}

// Crea un uploader de multer para imágenes. En modo Cloudinary guarda el archivo
// en memoria (buffer) para reenviarlo; en modo disco lo escribe en `diskDir`.
function makeImageUploader(diskDir) {
    return multer({
        storage: useCloudinary
            ? multer.memoryStorage()
            : multer.diskStorage({
                destination: (req, file, cb) => cb(null, diskDir),
                filename: (req, file, cb) => cb(null,
                    `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`)
            }),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
        fileFilter: (req, file, cb) => {
            if (!file.mimetype.startsWith('image/')) {
                return cb(new Error('El archivo debe ser una imagen.'));
            }
            cb(null, true);
        }
    });
}

const uploadPlayerPhoto = makeImageUploader(playerPhotosDir);
const uploadTeamLogo = makeImageUploader(teamLogosDir);

// Sube un buffer a Cloudinary bajo retrohoops/<folder> y devuelve su URL segura.
function uploadBufferToCloudinary(buffer, folder) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: `retrohoops/${folder}`, resource_type: 'image' },
            (err, result) => (err ? reject(err) : resolve(result.secure_url))
        );
        stream.end(buffer);
    });
}

// Resuelve la URL final de la imagen recién subida en una petición ya procesada
// por multer: sube a Cloudinary (modo remoto) o devuelve la ruta /uploads/ del
// archivo ya escrito en disco (modo local). Devuelve null si no vino archivo.
async function resolveUploadedImageUrl(req, folder) {
    if (!req.file) return null;
    if (useCloudinary) return uploadBufferToCloudinary(req.file.buffer, folder);
    return `/uploads/${folder}/${req.file.filename}`;
}

// Extrae el public_id (con su carpeta) de una URL de Cloudinary para poder borrar
// el recurso. Ej: .../upload/v123/retrohoops/teams/abc.png -> retrohoops/teams/abc
function cloudinaryPublicIdFromUrl(url) {
    const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    return m ? m[1] : null;
}

// Borra una imagen previa: de Cloudinary si es una URL suya, del disco si es una
// ruta local /uploads/. Best-effort: nunca lanza ni bloquea la respuesta.
function deleteStoredImage(url) {
    if (!url) return;
    if (url.includes('res.cloudinary.com')) {
        const publicId = cloudinaryPublicIdFromUrl(url);
        if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {});
    } else if (url.startsWith('/uploads/')) {
        fs.unlink(path.join(__dirname, 'public', url), () => {});
    }
}

// "Base de datos" temporal en memoria
const torneos = [
    {
        id: 1,
        nombre: 'Summer League 2026',
        categoria: '5x5',
        sede: 'Cancha Central Norte',
        equipos: 16,
        fecha: '2026-06-14',
        estado: 'En Juego (Cuartos)',
        claseEstado: 'status-live',
        estadisticas: [
            { nombre: 'Los Titanes', pj: 5, g: 5, p: 0, pts: 10, pf: 450, pc: 400 },
            { nombre: 'Bulls de la 24', pj: 5, g: 4, p: 1, pts: 9, pf: 430, pc: 390 },
            { nombre: 'Monstars', pj: 5, g: 3, p: 2, pts: 8, pf: 410, pc: 420 },
            { nombre: 'Tune Squad', pj: 5, g: 4, p: 1, pts: 9, pf: 460, pc: 400 } // Agregado para probar desempate
        ]
    },
    {
        id: 2,
        nombre: 'Streetball 3x3 Night',
        categoria: '3x3',
        sede: 'Cancha Callejera',
        equipos: 12,
        fecha: '2026-05-23',
        estado: 'Draft Abierto',
        claseEstado: 'status-open',
        estadisticas: [] // Aún sin equipos
    }
];

// Ruta para obtener todos los torneos (legado en memoria)
app.get('/api/torneos', (req, res) => {
    res.json(torneos);
});

// Ruta para recibir los datos del formulario de nuevo torneo
app.post('/api/torneos', (req, res) => {
    // Código legado omitido (mantenemos para no romper si algo viejo lo usa)
    res.redirect('/');
});

// ENDPOINT C: Listar todos los torneos públicamente (sin autenticación)
// Capitán busca torneos disponibles para inscribir su equipo
app.get('/api/tournaments', optionalAuthenticateToken, async (req, res) => {
    try {
        // Catálogo público: TODOS ven todas las ligas registradas (necesario para
        // el descubrimiento y las inscripciones). El foco por dueño ("Mis ligas")
        // y la gestión (editar/eliminar) se resuelven en el frontend según el
        // organizerId de cada liga y el rol del usuario en sesión.
        const tournaments = await prisma.tournament.findMany({
            include: {
                organizer: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        const result = tournaments.map(t => ({
            id: t.id,
            name: t.name,
            category: t.category,
            venue: t.venue,
            maxTeams: t.maxTeams,
            startDate: t.startDate,
            organizerId: t.organizerId,
            organizer: t.organizer,
            createdAt: t.createdAt
        }));

        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener torneos' });
    }
});

// Middleware de autenticación opcional con JWT
function optionalAuthenticateToken(req, res, next) {
    const token = getTokenFromRequest(req);

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) {
            req.user = user;
        } else {
            req.user = null;
        }
        next();
    });
}

// Editar datos de un torneo (Protegido, solo creador)
app.put('/api/tournaments/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, venue, maxTeams, startDate } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

        if (tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'No tienes permiso para editar este torneo' });
        }

        if (maxTeams) {
            const parsed = parseInt(maxTeams, 10);
            if (!Number.isInteger(parsed) || parsed < 2 || parsed > FREE_PLAN_LIMITS.MAX_TEAMS_PER_TOURNAMENT) {
                return res.status(400).json({ error: `Los cupos deben estar entre 2 y ${FREE_PLAN_LIMITS.MAX_TEAMS_PER_TOURNAMENT}.` });
            }
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: {
                name: name ? toTitleCase(name) : tournament.name,
                category: category || tournament.category,
                venue: venue ? toTitleCase(venue) : tournament.venue,
                maxTeams: maxTeams ? parseInt(maxTeams) : tournament.maxTeams,
                startDate: startDate ? new Date(startDate) : tournament.startDate,
            }
        });

        res.json(updated);
    } catch (error) {
        console.error("Error al actualizar torneo:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar un torneo (Protegido, solo creador)
app.delete('/api/tournaments/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

        if (tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar este torneo' });
        }

        // Obtener todos los partidos de este torneo
        const matches = await prisma.match.findMany({ where: { tournamentId: id } });
        const matchIds = matches.map(m => m.id);

        // Transacción para borrar relaciones hijas y el torneo en cascada manual
        await prisma.$transaction([
            prisma.playerStat.deleteMany({ where: { matchId: { in: matchIds } } }),
            prisma.match.deleteMany({ where: { tournamentId: id } }),
            prisma.tournamentEnrollment.deleteMany({ where: { tournamentId: id } }),
            prisma.tournament.delete({ where: { id } })
        ]);

        res.json({ message: 'Torneo eliminado exitosamente' });
    } catch (error) {
        console.error("Error al eliminar torneo:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Obtener detalles de un torneo específico y sus equipos inscritos
app.get('/api/tournaments/:id', optionalAuthenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            include: {
                enrollments: {
                    include: {
                        // El capitán viaja con cada equipo para que el organizador
                        // identifique franquicias homónimas (p. ej. dos "Warriors").
                        team: {
                            include: {
                                captain: { select: { firstName: true, lastName: true } }
                            }
                        }
                    }
                },
                matches: {
                    include: {
                        homeTeam: { include: { players: true } },
                        awayTeam: { include: { players: true } },
                        stats: true
                    },
                    orderBy: {
                        matchDate: 'asc'
                    }
                }
            }
        });

        if (!tournament) {
            return res.status(404).json({ error: 'Torneo no encontrado' });
        }

        // 1. Forzamos ambos valores a String para evitar problemas de tipos ("1" vs 1)
        const isOrganizer = req.user ? String(req.user.id) === String(tournament.organizerId) : false;

        // 2. Chivato en consola para ver exactamente qué está comparando el servidor
        console.log("-> Chequeo de Seguridad | Mi ID:", req.user?.id, "| Dueño del Torneo:", tournament.organizerId, "| ¿Soy Organizador?:", isOrganizer);

        res.status(200).json({ ...tournament, isOrganizer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el torneo' });
    }
});

// Middleware de autenticación con JWT
function authenticateToken(req, res, next) {
    const token = getTokenFromRequest(req);

    if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });

        req.user = user;
        next();
    });
}

function getTokenFromRequest(req) {
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;

    if (tokenFromHeader) return tokenFromHeader;

    const cookies = parseCookies(req.headers.cookie);
    return cookies[AUTH_COOKIE_NAME] || null;
}

function parseCookies(cookieHeader) {
    if (!cookieHeader) return {};

    return cookieHeader
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
            const separatorIndex = part.indexOf('=');
            if (separatorIndex === -1) return acc;

            const key = part.slice(0, separatorIndex);
            const value = part.slice(separatorIndex + 1);
            acc[key] = decodeURIComponent(value);
            return acc;
        }, {});
}

function getAuthCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: JWT_COOKIE_MAX_AGE_MS,
        path: '/'
    };
}

// Consulta el rol ACTUAL del usuario en la base de datos (no el que traía el
// JWT al momento de iniciar sesión, que puede haber quedado desactualizado
// si un admin le cambió el rol después).
async function userIsAdmin(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return !!user && user.role === 'ADMIN';
}

async function userIsOrganizerOrAdmin(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return !!user && (user.role === 'ADMIN' || user.role === 'ORGANIZER');
}

// Middleware: exige que el usuario autenticado sea ADMIN
async function requireAdmin(req, res, next) {
    try {
        if (!(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Esta acción está reservada para administradores.' });
        }
        next();
    } catch (error) {
        console.error('Error verificando rol de administrador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// Middleware: exige ADMIN u ORGANIZER
async function requireOrganizerOrAdmin(req, res, next) {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (!user || (user.role !== 'ADMIN' && user.role !== 'ORGANIZER')) {
            return res.status(403).json({ error: 'Esta acción está reservada para organizadores y administradores.' });
        }
        next();
    } catch (error) {
        console.error('Error verificando rol:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

// Listar usuarios (solo ADMIN) — para el panel de gestión de roles
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                createdAt: true
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json(users);
    } catch (error) {
        console.error('Error al listar usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Cambiar el rol de un usuario (solo ADMIN)
app.put('/api/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const validRoles = ['PLAYER', 'ORGANIZER', 'ADMIN'];

        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${validRoles.join(', ')}` });
        }

        if (id === req.user.id && role !== 'ADMIN') {
            return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de administrador.' });
        }

        const updated = await prisma.user.update({
            where: { id },
            data: { role },
            select: { id: true, email: true, firstName: true, lastName: true, role: true }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error al actualizar rol:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar un usuario (solo ADMIN) y TODOS sus datos asociados: torneos que
// organiza, franquicias que capitanea (con sus jugadores), inscripciones, y
// cualquier partido en el que sus franquicias hayan participado (incluso en
// torneos de otros organizadores, porque no pueden quedar partidos apuntando
// a un equipo que ya no existe).
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        if (id === req.user.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
        }

        const targetUser = await prisma.user.findUnique({ where: { id } });
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (targetUser.role === 'ADMIN') {
            return res.status(403).json({ error: 'No puedes eliminar a otro administrador desde aquí.' });
        }

        const ownTournaments = await prisma.tournament.findMany({ where: { organizerId: id }, select: { id: true } });
        const ownTournamentIds = ownTournaments.map(t => t.id);

        const ownTeams = await prisma.team.findMany({ where: { captainId: id }, select: { id: true, logoUrl: true } });
        const ownTeamIds = ownTeams.map(t => t.id);

        const ownPlayers = await prisma.player.findMany({ where: { teamId: { in: ownTeamIds } }, select: { id: true, photoUrl: true } });
        const ownPlayerIds = ownPlayers.map(p => p.id);

        // Partidos afectados: los de sus propios torneos, y cualquier partido
        // (aunque sea de un torneo ajeno) donde participe una franquicia suya.
        const affectedMatches = await prisma.match.findMany({
            where: {
                OR: [
                    { tournamentId: { in: ownTournamentIds } },
                    { homeTeamId: { in: ownTeamIds } },
                    { awayTeamId: { in: ownTeamIds } }
                ]
            },
            select: { id: true }
        });
        const affectedMatchIds = affectedMatches.map(m => m.id);

        await prisma.$transaction([
            prisma.playerStat.deleteMany({
                where: {
                    OR: [
                        { matchId: { in: affectedMatchIds } },
                        { playerId: { in: ownPlayerIds } }
                    ]
                }
            }),
            prisma.match.deleteMany({ where: { id: { in: affectedMatchIds } } }),
            prisma.tournamentEnrollment.deleteMany({
                where: {
                    OR: [
                        { tournamentId: { in: ownTournamentIds } },
                        { teamId: { in: ownTeamIds } }
                    ]
                }
            }),
            prisma.player.deleteMany({ where: { teamId: { in: ownTeamIds } } }),
            prisma.team.deleteMany({ where: { id: { in: ownTeamIds } } }),
            prisma.tournament.deleteMany({ where: { id: { in: ownTournamentIds } } }),
            prisma.user.delete({ where: { id } })
        ]);

        // Borrar las imágenes (de Cloudinary o del disco) de jugadores y equipos
        // eliminados (best-effort).
        ownPlayers.forEach(player => deleteStoredImage(player.photoUrl));
        ownTeams.forEach(team => deleteStoredImage(team.logoUrl));

        res.json({
            message: 'Usuario eliminado exitosamente junto con sus torneos, franquicias y partidos asociados.',
            deleted: {
                tournaments: ownTournamentIds.length,
                teams: ownTeamIds.length,
                players: ownPlayerIds.length,
                matches: affectedMatchIds.length
            }
        });
    } catch (error) {
        console.error('Error al eliminar usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para guardar Torneos en la base de datos (ADMIN u ORGANIZER)
app.post('/api/tournaments', authenticateToken, requireOrganizerOrAdmin, async (req, res) => {
    try {
        const { name, category, venue, maxTeams, startDate, inscriptionFee } = req.body;

        if (!name || !category) {
            return res.status(400).json({ error: 'El nombre y la categoría del torneo son obligatorios.' });
        }

        const parsedMaxTeams = parseInt(maxTeams, 10);
        if (!Number.isInteger(parsedMaxTeams) || parsedMaxTeams < 2 || parsedMaxTeams > FREE_PLAN_LIMITS.MAX_TEAMS_PER_TOURNAMENT) {
            return res.status(400).json({ error: `Indica un número válido de equipos/franquicias (entre 2 y ${FREE_PLAN_LIMITS.MAX_TEAMS_PER_TOURNAMENT}).` });
        }

        const parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
            return res.status(400).json({ error: 'Indica una fecha de inicio válida para el torneo.' });
        }

        // Límite de ligas por organizador (los admin no tienen límite)
        if (!(await userIsAdmin(req.user.id))) {
            const tournamentCount = await prisma.tournament.count({ where: { organizerId: req.user.id } });
            if (tournamentCount >= FREE_PLAN_LIMITS.MAX_TOURNAMENTS_PER_ORGANIZER) {
                return res.status(400).json({
                    error: `Alcanzaste el límite de ${FREE_PLAN_LIMITS.MAX_TOURNAMENTS_PER_ORGANIZER} ligas por organizador.`
                });
            }
        }

        // Crear el torneo asociándolo al ID del usuario autenticado
        const newTournament = await prisma.tournament.create({
            data: {
                name: toTitleCase(name),
                category,
                venue: toTitleCase(venue || ''),
                maxTeams: parsedMaxTeams,
                startDate: parsedStartDate,
                inscriptionFee: parseInt(inscriptionFee, 10) || 0,
                organizerId: req.user.id
            }
        });

        res.status(201).json(newTournament);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar el torneo en la base de datos' });
    }
});

// Obtener los equipos donde el usuario es capitan
app.get('/api/users/me/teams', authenticateToken, async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            where: { captainId: req.user.id },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(teams);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener los equipos del usuario' });
    }
});

// Dar de baja a un equipo (Borrar Enrollment)
app.delete('/api/enrollments/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const enrollment = await prisma.tournamentEnrollment.findUnique({
            where: { id },
            include: { tournament: true }
        });

        if (!enrollment) return res.status(404).json({ error: 'Inscripción no encontrada' });

        // Solo el organizador del torneo (o un admin) puede dar de baja a un inscrito
        if (enrollment.tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar inscritos' });
        }

        await prisma.tournamentEnrollment.delete({ where: { id } });
        res.json({ message: 'Equipo dado de baja exitosamente' });
    } catch (error) {
        console.error("Error al eliminar inscripción:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ENDPOINT A: Inscribir equipo en torneo
// POST /api/tournaments/:tournamentId/enroll
// Auth: Bearer token (capitán)
// Body: { teamId: "uuid" }
app.post('/api/tournaments/:id/enroll', authenticateToken, async (req, res) => {
    try {
        const { id: tournamentId } = req.params;
        const { teamId } = req.body;

        if (!teamId) {
            return res.status(400).json({ error: 'El teamId es obligatorio.' });
        }

        const team = await prisma.team.findUnique({
            where: { id: teamId },
            include: { _count: { select: { players: true } } }
        });
        if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

        const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado.' });

        // Validación 1: puede inscribir el CAPITÁN del equipo, el ORGANIZADOR dueño
        // del torneo, o un ADMIN. Así el organizador gestiona su propia liga sin
        // depender de que cada capitán se auto-inscriba.
        const isCaptain = team.captainId === req.user.id;
        const isOrganizer = tournament.organizerId === req.user.id;
        if (!isCaptain && !isOrganizer && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el capitán del equipo o el organizador del torneo pueden inscribirlo.' });
        }

        // Validación 2: Equipo tiene ≥3 jugadores
        if (team._count.players < 3) {
            return res.status(400).json({
                error: `El equipo debe tener al menos 3 jugadores. Actualmente tiene ${team._count.players}.`
            });
        }

        // Validación 3: Torneo no está lleno

        const currentEnrollments = await prisma.tournamentEnrollment.count({ where: { tournamentId } });
        if (currentEnrollments >= tournament.maxTeams) {
            return res.status(400).json({ error: 'El torneo ya alcanzó el máximo de equipos inscritos.' });
        }

        // Validación 4: Equipo NO está ya inscrito en este torneo
        const existing = await prisma.tournamentEnrollment.findFirst({
            where: { tournamentId, teamId }
        });
        if (existing) {
            return res.status(409).json({ error: 'Este equipo ya está inscrito en el torneo.' });
        }

        // Crear TournamentEnrollment
        const enrollment = await prisma.tournamentEnrollment.create({
            data: {
                tournamentId,
                teamId,
                amountPaid: 0
            }
        });

        res.status(201).json({
            enrollmentId: enrollment.id,
            status: 'APPROVED',
            teamId,
            tournamentId,
            message: 'Equipo inscrito exitosamente en el torneo'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al inscribir el equipo' });
    }
});

// ENDPOINT B: Ver equipos de un torneo (SEGREGADO)
// GET /api/tournaments/:tournamentId/teams
// Auth: Bearer token (organizador valida permisos)
// Sin Auth: Devuelve lista pública (si está permitido)
app.get('/api/tournaments/:id/teams', authenticateToken, async (req, res) => {
    try {
        const { id: tournamentId } = req.params;

        const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId },
            include: { _count: { select: { enrollments: true } } }
        });
        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado.' });

        // Validación: Usuario debe ser el organizador del torneo
        if (tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Acceso denegado. Solo el organizador puede ver los equipos inscritos en este torneo.' });
        }

        // SEGREGACIÓN: Trae SOLO los equipos inscritos EN ESTE torneo
        const enrollments = await prisma.tournamentEnrollment.findMany({
            where: { tournamentId },
            include: {
                team: {
                    include: {
                        captain: {
                            select: { id: true, firstName: true, lastName: true, email: true }
                        },
                        _count: { select: { players: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const teams = enrollments.map(e => ({
            enrollmentId: e.id,
            teamId: e.team.id,
            teamName: e.team.name,
            logoUrl: e.team.logoUrl,
            captain: {
                id: e.team.captain.id,
                firstName: e.team.captain.firstName,
                lastName: e.team.captain.lastName,
                email: e.team.captain.email
            },
            playerCount: e.team._count.players,
            status: e.status,
            amountPaid: e.amountPaid,
            enrollmentDate: e.createdAt
        }));

        res.json({
            tournament: {
                id: tournament.id,
                name: tournament.name,
                category: tournament.category,
                venue: tournament.venue,
                maxTeams: tournament.maxTeams,
                currentTeams: tournament._count.enrollments,
                spotsAvailable: tournament.maxTeams - tournament._count.enrollments,
                startDate: tournament.startDate
            },
            teams
        });
    } catch (error) {
        console.error('Error al obtener equipos del torneo:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Programar un partido en un torneo
app.post('/api/tournaments/:id/matches', authenticateToken, async (req, res) => {
    try {
        const { id: tournamentId } = req.params;
        const { homeTeamId, awayTeamId, matchDate } = req.body;

        // Verificar torneo
        const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId }
        });

        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

        if (tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el organizador del torneo puede programar partidos' });
        }

        const match = await prisma.match.create({
            data: {
                tournamentId,
                homeTeamId,
                awayTeamId,
                matchDate: new Date(matchDate)
            }
        });

        res.status(201).json(match);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al programar el partido' });
    }
});

// Obtener un partido específico
app.get('/api/matches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const match = await prisma.match.findUnique({
            where: { id },
            include: {
                homeTeam: { include: { players: true } },
                awayTeam: { include: { players: true } },
                tournament: true
            }
        });

        if (!match) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        res.status(200).json(match);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el partido' });
    }
});

// Cancelar/eliminar un partido (Protegido, solo el organizador del torneo o admin)
app.delete('/api/matches/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const match = await prisma.match.findUnique({
            where: { id },
            include: { tournament: true }
        });

        if (!match) return res.status(404).json({ error: 'Partido no encontrado' });

        if (match.tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el organizador del torneo puede cancelar partidos' });
        }

        // Borrar primero las estadísticas asociadas y luego el partido
        await prisma.$transaction([
            prisma.playerStat.deleteMany({ where: { matchId: id } }),
            prisma.match.delete({ where: { id } })
        ]);

        res.json({ message: 'Partido cancelado exitosamente' });
    } catch (error) {
        console.error('Error al cancelar partido:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Guardar resultado de un partido
app.put('/api/matches/:id/score', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { homeScore, awayScore } = req.body;

        const parsedHomeScore = parseInt(homeScore, 10);
        const parsedAwayScore = parseInt(awayScore, 10);

        if (parsedHomeScore === parsedAwayScore) {
            return res.status(400).json({ error: 'El partido no puede terminar en empate. Debe jugarse tiempo extra hasta romper el empate.' });
        }

        const currentMatch = await prisma.match.findUnique({
            where: { id },
            include: { tournament: true }
        });

        if (!currentMatch) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        if (currentMatch.tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el organizador puede guardar el resultado' });
        }

        const match = await prisma.match.update({
            where: { id },
            data: {
                homeScore: parsedHomeScore,
                awayScore: parsedAwayScore,
                status: 'FINISHED'
            }
        });

        // Si este resultado cierra una ronda de playoffs (Cuartos o Semifinal),
        // avanzar automáticamente a la siguiente sin que el organizador tenga
        // que pulsar "Avanzar Fase" manualmente.
        let advancedStage = null;
        if (match.stage === 'CUARTOS' || match.stage === 'SEMIFINAL') {
            advancedStage = await tryAutoAdvancePlayoffs(match.tournamentId);
        }

        res.status(200).json({ ...match, advancedStage });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar el resultado' });
    }
});

// Guardar/Actualizar Box Score de un partido
app.post('/api/matches/:id/boxscore', authenticateToken, async (req, res) => {
    try {
        const { id: matchId } = req.params;
        const { stats } = req.body; // array de objetos: [{ playerId, points, rebounds, assists, min }]

        if (!stats || !Array.isArray(stats)) {
            return res.status(400).json({ error: 'Formato de estadísticas inválido' });
        }

        const matchForBoxScore = await prisma.match.findUnique({
            where: { id: matchId },
            include: { tournament: true }
        });

        if (!matchForBoxScore) {
            return res.status(404).json({ error: 'Partido no encontrado' });
        }

        if (matchForBoxScore.tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el organizador puede guardar box scores' });
        }

        // Transacción
        const operations = stats.map(stat => {
            return prisma.playerStat.upsert({
                where: {
                    matchId_playerId: {
                        matchId: matchId,
                        playerId: stat.playerId
                    }
                },
                update: {
                    points: parseInt(stat.points || 0, 10),
                    rebounds: parseInt(stat.rebounds || 0, 10),
                    assists: parseInt(stat.assists || 0, 10),
                    minutesPlayed: parseInt(stat.minutesPlayed || 0, 10)
                },
                create: {
                    matchId: matchId,
                    playerId: stat.playerId,
                    points: parseInt(stat.points || 0, 10),
                    rebounds: parseInt(stat.rebounds || 0, 10),
                    assists: parseInt(stat.assists || 0, 10),
                    minutesPlayed: parseInt(stat.minutesPlayed || 0, 10)
                }
            });
        });

        await prisma.$transaction(operations);

        res.status(201).json({ message: 'Estadísticas guardadas con éxito' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar las estadísticas' });
    }
});

// Incrementar stat individual de un jugador en tiempo real
app.patch('/api/matches/:matchId/player-stat', authenticateToken, async (req, res) => {
    try {
        const { matchId } = req.params;
        const { playerId, action, increment } = req.body;

        const validActions = ['POINTS', 'REBOUNDS', 'ASSISTS'];
        if (!playerId || !action || !validActions.includes(action)) {
            return res.status(400).json({ error: `Datos inválidos. action debe ser: ${validActions.join(', ')}` });
        }

        const inc = parseInt(increment, 10) || 1;

        const match = await prisma.match.findUnique({
            where: { id: matchId },
            include: {
                homeTeam: { include: { players: true } },
                awayTeam: { include: { players: true } },
                tournament: true
            }
        });

        if (!match) return res.status(404).json({ error: 'Partido no encontrado.' });

        if (match.tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'No tienes permiso para modificar este partido.' });
        }

        const homePlayers = match.homeTeam.players.map(p => p.id);
        const awayPlayers = match.awayTeam.players.map(p => p.id);

        if (!homePlayers.includes(playerId) && !awayPlayers.includes(playerId)) {
            return res.status(404).json({ error: 'El jugador no pertenece a ningún equipo de este partido.' });
        }

        const fieldMap = { POINTS: 'points', REBOUNDS: 'rebounds', ASSISTS: 'assists' };
        const field = fieldMap[action];

        const stat = await prisma.playerStat.upsert({
            where: { matchId_playerId: { matchId, playerId } },
            update: { [field]: { increment: inc } },
            create: { matchId, playerId, [field]: inc }
        });

        if (action === 'POINTS') {
            const isHome = homePlayers.includes(playerId);
            await prisma.match.update({
                where: { id: matchId },
                data: isHome ? { homeScore: { increment: inc } } : { awayScore: { increment: inc } }
            });
        }

        res.json({
            playerStatId: stat.id,
            playerId: stat.playerId,
            matchId: stat.matchId,
            points: stat.points,
            rebounds: stat.rebounds,
            assists: stat.assists
        });
    } catch (error) {
        console.error('Error en player-stat:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Endpoint para guardar Equipos/Franquicias en la base de datos (Protegido)
// El logo se sube como archivo desde el dispositivo (campo 'logo'), no como URL.
app.post('/api/teams', authenticateToken, (req, res, next) => {
    uploadTeamLogo.single('logo')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Error al subir el logo' });
        next();
    });
}, async (req, res) => {
    try {
        const { name } = req.body;

        // Límite de franquicias según rol (el rol se lee de la BD, no del token):
        //  - Capitán normal: 1 (plan gratuito).
        //  - ORGANIZER: hasta 64, para poder armar los equipos de sus ligas.
        //  - ADMIN: sin límite.
        const creator = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { role: true }
        });
        if (creator?.role !== 'ADMIN') {
            const limit = creator?.role === 'ORGANIZER'
                ? FREE_PLAN_LIMITS.MAX_TEAMS_PER_ORGANIZER
                : FREE_PLAN_LIMITS.MAX_TEAMS_PER_CAPTAIN;
            const teamCount = await prisma.team.count({ where: { captainId: req.user.id } });
            if (teamCount >= limit) {
                return res.status(400).json({
                    error: creator?.role === 'ORGANIZER'
                        ? `Alcanzaste el límite de ${limit} franquicias como organizador.`
                        : `Alcanzaste el límite de ${limit} franquicia(s) como capitán en el plan actual.`
                });
            }
        }

        const logoUrl = await resolveUploadedImageUrl(req, 'teams');

        const newTeam = await prisma.team.create({
            data: {
                name,
                logoUrl,
                captainId: req.user.id
            }
        });

        res.status(201).json(newTeam);
    } catch (error) {
        console.error(error);
        // Si el nombre ya existe, Prisma lanza un error de constraint única
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Ya existe una franquicia con ese nombre' });
        }
        res.status(500).json({ error: 'Error al registrar el equipo en la base de datos' });
    }
});

// Editar una franquicia (Protegido, solo el capitán). El logo, si se envía,
// reemplaza al anterior y borra el archivo viejo del disco.
app.put('/api/teams/:id', authenticateToken, (req, res, next) => {
    uploadTeamLogo.single('logo')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Error al subir el logo' });
        next();
    });
}, async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const team = await prisma.team.findUnique({ where: { id } });
        if (!team) return res.status(404).json({ error: 'Franquicia no encontrada' });

        if (team.captainId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'No tienes permiso para editar esta franquicia' });
        }

        const uploadedLogoUrl = await resolveUploadedImageUrl(req, 'teams');
        const newLogoUrl = uploadedLogoUrl || team.logoUrl;

        const updated = await prisma.team.update({
            where: { id },
            data: {
                name: name || team.name,
                logoUrl: newLogoUrl
            }
        });

        if (uploadedLogoUrl && team.logoUrl) {
            deleteStoredImage(team.logoUrl);
        }

        res.json(updated);
    } catch (error) {
        console.error('Error al actualizar franquicia:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Ya existe una franquicia con ese nombre' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Eliminar una franquicia (Protegido, solo el capitán; bloqueado si ya tiene partidos)
app.delete('/api/teams/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const team = await prisma.team.findUnique({ where: { id } });
        if (!team) return res.status(404).json({ error: 'Franquicia no encontrada' });

        // Solo el capitán dueño o un ADMIN pueden eliminar la franquicia.
        if (team.captainId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar esta franquicia' });
        }

        const matchCount = await prisma.match.count({
            where: { OR: [{ homeTeamId: id }, { awayTeamId: id }] }
        });

        if (matchCount > 0) {
            return res.status(400).json({ error: 'No puedes eliminar una franquicia con partidos programados o jugados. Elimina primero esos partidos o el torneo correspondiente.' });
        }

        const players = await prisma.player.findMany({ where: { teamId: id } });
        const playerIds = players.map(p => p.id);

        await prisma.$transaction([
            prisma.playerStat.deleteMany({ where: { playerId: { in: playerIds } } }),
            prisma.player.deleteMany({ where: { teamId: id } }),
            prisma.tournamentEnrollment.deleteMany({ where: { teamId: id } }),
            prisma.team.delete({ where: { id } })
        ]);

        // Borrar las imágenes (de Cloudinary o del disco) de los jugadores y el
        // logo del equipo eliminado (best-effort).
        players.forEach(player => deleteStoredImage(player.photoUrl));
        deleteStoredImage(team.logoUrl);

        res.json({ message: 'Franquicia eliminada exitosamente' });
    } catch (error) {
        console.error('Error al eliminar franquicia:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint público para obtener todas las franquicias
app.get('/api/teams', async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            include: {
                captain: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
                // Conteo de jugadores: el frontend lo usa para distinguir equipos
                // homónimos y marcar los que aún no son elegibles (<3 jugadores).
                _count: { select: { players: true } }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.status(200).json(teams);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener franquicias completas' });
    }
});

// Endpoint para obtener los detalles de un equipo junto con su capitan y su roster (jugadores) y partidos
app.get('/api/teams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const team = await prisma.team.findUnique({
            where: { id },
            include: {
                // Nunca exponer passwordHash/email/teléfono del capitán en un
                // endpoint público: solo los datos de identidad necesarios.
                captain: {
                    select: { id: true, firstName: true, lastName: true }
                },
                players: true,
                homeMatches: {
                    include: {
                        awayTeam: true,
                        tournament: true
                    },
                    orderBy: {
                        matchDate: 'desc'
                    }
                },
                awayMatches: {
                    include: {
                        homeTeam: true,
                        tournament: true
                    },
                    orderBy: {
                        matchDate: 'desc'
                    }
                },
                enrollments: {
                    include: { tournament: true },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!team) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        res.status(200).json(team);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al buscar el equipo' });
    }
});

// Endpoint para que el capitán agregue jugadores a su equipo (Protegido)
app.post('/api/teams/:id/players', authenticateToken, (req, res, next) => {
    // Middleware de subida envuelto a mano para poder responder con JSON
    // (no la página de error por defecto de Express) si el archivo es
    // demasiado grande o no es una imagen.
    uploadPlayerPhoto.single('photo')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message || 'Error al subir la foto' });
        next();
    });
}, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, jerseyNumber, position, photoUrl } = req.body;

        // Buscar el equipo para validar el capitán
        const team = await prisma.team.findUnique({
            where: { id }
        });

        if (!team) {
            return res.status(404).json({ error: 'Equipo no encontrado' });
        }

        // Solo el capitán (o un admin) puede agregar jugadores
        if (req.user.id !== team.captainId && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el capitán de la franquicia puede registrar jugadores.' });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'El nombre del jugador es obligatorio.' });
        }

        const parsedJersey = parseInt(jerseyNumber, 10);
        if (isNaN(parsedJersey)) {
            return res.status(400).json({ error: 'El número de jersey es obligatorio.' });
        }

        const duplicateJersey = await prisma.player.findFirst({
            where: { teamId: id, jerseyNumber: parsedJersey }
        });
        if (duplicateJersey) {
            return res.status(400).json({ error: `El número ${parsedJersey} ya está en uso en este equipo.` });
        }

        const uploadedPhotoUrl = (await resolveUploadedImageUrl(req, 'players')) || safeUploadUrl(photoUrl);

        const newPlayer = await prisma.player.create({
            data: {
                name: toTitleCase(name),
                jerseyNumber: parseInt(jerseyNumber, 10),
                position,
                photoUrl: uploadedPhotoUrl,
                teamId: id
            }
        });

        res.status(201).json(newPlayer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al agregar jugador al equipo' });
    }
});

// Eliminar un jugador del roster (Protegido, solo el capitán de su equipo)
app.delete('/api/players/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const player = await prisma.player.findUnique({
            where: { id },
            include: { team: true }
        });

        if (!player) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        if (req.user.id !== player.team.captainId && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el capitán de la franquicia puede eliminar jugadores.' });
        }

        await prisma.$transaction([
            prisma.playerStat.deleteMany({ where: { playerId: id } }),
            prisma.player.delete({ where: { id } })
        ]);

        // Borrar la foto del jugador (de Cloudinary o del disco), best-effort.
        deleteStoredImage(player.photoUrl);

        res.json({ message: 'Jugador eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar jugador:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Registro combinado: crea usuario + franquicia en una sola transacción
app.post('/api/teams/register-captain', authLimiter, async (req, res) => {
    try {
        const { email, password, firstName, lastName, teamName, teamLogo } = req.body;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ error: 'Email inválido.' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
        }
        if (!firstName || !lastName) {
            return res.status(400).json({ error: 'Nombre y apellido son obligatorios.' });
        }
        if (!teamName || !teamName.trim()) {
            return res.status(400).json({ error: 'El nombre de la franquicia es obligatorio.' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'El email ya está registrado.' });
        }

        const existingTeam = await prisma.team.findUnique({ where: { name: teamName.trim() } });
        if (existingTeam) {
            return res.status(400).json({ error: 'Ya existe una franquicia con ese nombre.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [newUser, newTeam] = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email,
                    passwordHash: hashedPassword,
                    firstName,
                    lastName,
                    role: 'PLAYER'
                }
            });

            const team = await tx.team.create({
                data: {
                    name: teamName.trim(),
                    logoUrl: safeUploadUrl(teamLogo),
                    captainId: user.id
                }
            });

            return [user, team];
        });

        const token = jwt.sign(
            { id: newUser.id, role: newUser.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

        res.status(201).json({
            userId: newUser.id,
            teamId: newTeam.id,
            token
        });
    } catch (error) {
        console.error('Error en register-captain:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Email o nombre de franquicia ya en uso.' });
        }
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Ruta real para registro de usuario con bcrypt y JWT
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;
        
        // Verificar si el usuario ya existe
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }

        // Encriptar la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Crear el usuario en la BD (asumiendo esquema con UUID, firstName, lastName y role)
        const newUser = await prisma.user.create({
            data: {
                email,
                passwordHash: hashedPassword,
                firstName,
                lastName,
                role: 'PLAYER' // Default asignado en la DB también
            }
        });

        res.status(201).json({ message: 'Usuario registrado exitosamente', userId: newUser.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Ruta real para login de usuario con JWT
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Buscar el usuario
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Comparar contraseña con el hash de la BD (recuerda que tu esquema lo nombra "passwordHash")
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                role: user.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/'
    });

    res.status(200).json({ message: 'Logout exitoso' });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error en GET /api/auth/me:', error);
    res.status(500).json({ error: 'Error al obtener datos del usuario' });
  }
});

// Obtener standings del torneo
app.get('/api/tournaments/:id/standings', async (req, res) => {
    try {
        const { id: tournamentId } = req.params;

        // Validar si el torneo existe
        const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId }
        });

        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

        // Obtener equipos inscritos
        const enrollments = await prisma.tournamentEnrollment.findMany({
            where: { tournamentId },
            include: { team: true }
        });

        const teams = enrollments.map(e => e.team);

        // Obtener partidos FINISHED
        const matches = await prisma.match.findMany({
            where: { 
                tournamentId, 
                status: 'FINISHED' 
            }
        });

        // Inicializar standings
        const standings = teams.map(team => ({
            teamId: team.id,
            teamName: team.name,
            logoUrl: team.logoUrl,
            pj: 0,
            g: 0,
            p: 0,
            pf: 0,
            pc: 0,
            diff: 0
        }));

        // Calcular estadísticas
        matches.forEach(match => {
            const homeTeam = standings.find(s => s.teamId === match.homeTeamId);
            const awayTeam = standings.find(s => s.teamId === match.awayTeamId);

            if (homeTeam && awayTeam) {
                homeTeam.pj += 1;
                homeTeam.pf += match.homeScore;
                homeTeam.pc += match.awayScore;
                
                awayTeam.pj += 1;
                awayTeam.pf += match.awayScore;
                awayTeam.pc += match.homeScore;

                if (match.homeScore > match.awayScore) {
                    homeTeam.g += 1;
                    awayTeam.p += 1;
                } else if (match.awayScore > match.homeScore) {
                    awayTeam.g += 1;
                    homeTeam.p += 1;
                }
            }
        });

        // Calcular diferencia y ordenar
        standings.forEach(s => {
            s.diff = s.pf - s.pc;
        });

        standings.sort((a, b) => {
            if (b.g !== a.g) return b.g - a.g;
            return b.diff - a.diff;
        });

        res.status(200).json(standings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al calcular las posiciones' });
    }
});

// GET Líderes del Torneo
app.get('/api/tournaments/:id/leaders', async (req, res) => {
    try {
        const { id: tournamentId } = req.params;

        const matches = await prisma.match.findMany({
            where: {
                tournamentId,
                status: 'FINISHED'
            },
            include: {
                stats: {
                    include: {
                        player: {
                            include: {
                                team: true
                            }
                        }
                    }
                }
            }
        });

        const playerStats = {};

        matches.forEach(match => {
            match.stats.forEach(stat => {
                const pId = stat.player.id;
                if (!playerStats[pId]) {
                    playerStats[pId] = {
                        playerId: pId,
                        name: stat.player.name,
                        teamId: stat.player.team.id,
                        teamName: stat.player.team.name,
                        logoUrl: stat.player.team.logoUrl,
                        gamesPlayed: 0,
                        totalPoints: 0,
                        totalRebounds: 0,
                        totalAssists: 0
                    };
                }
                playerStats[pId].gamesPlayed += 1;
                playerStats[pId].totalPoints += stat.points;
                playerStats[pId].totalRebounds += stat.rebounds;
                playerStats[pId].totalAssists += stat.assists;
            });
        });

        const playersArray = Object.values(playerStats).map(p => ({
            ...p,
            pointsPerGame: parseFloat((p.totalPoints / p.gamesPlayed).toFixed(1)),
            reboundsPerGame: parseFloat((p.totalRebounds / p.gamesPlayed).toFixed(1)),
            assistsPerGame: parseFloat((p.totalAssists / p.gamesPlayed).toFixed(1))
        }));

        const topScorers = [...playersArray].sort((a, b) => b.pointsPerGame - a.pointsPerGame).slice(0, 10);
        const topRebounders = [...playersArray].sort((a, b) => b.reboundsPerGame - a.reboundsPerGame).slice(0, 10);
        const topAssists = [...playersArray].sort((a, b) => b.assistsPerGame - a.assistsPerGame).slice(0, 10);

        res.json({
            topScorers,
            topRebounders,
            topAssists
        });

    } catch (error) {
        console.error('Error obteniendo líderes del torneo:', error);
        res.status(500).json({ error: 'Error al obtener los líderes' });
    }
});

// Avanza automáticamente Cuartos->Semis o Semis->Final cuando la ronda
// correspondiente ya terminó por completo. NO genera Cuartos desde la fase
// regular (eso sigue siendo una decisión explícita del organizador, vía el
// botón "Generar Cuartos de Final", porque solo él sabe cuándo cerrar la
// temporada regular). Se llama automáticamente al guardar el resultado de
// un partido de playoffs; es idempotente (no duplica rondas ya generadas).
// Devuelve el stage generado ('SEMIFINAL' | 'FINAL') o null si no aplicaba.
async function tryAutoAdvancePlayoffs(tournamentId) {
    const playoffMatches = await prisma.match.findMany({
        where: { tournamentId, stage: { not: 'REGULAR' } },
        orderBy: { createdAt: 'asc' }
    });

    const cuartos = playoffMatches.filter(m => m.stage === 'CUARTOS');
    const semis = playoffMatches.filter(m => m.stage === 'SEMIFINAL');
    const finales = playoffMatches.filter(m => m.stage === 'FINAL');

    if (finales.length > 0) return null;

    // Cuartos -> Semis
    if (cuartos.length === 4 && semis.length === 0 && cuartos.every(m => m.status === 'FINISHED')) {
        const win1 = cuartos[0].homeScore > cuartos[0].awayScore ? cuartos[0].homeTeamId : cuartos[0].awayTeamId;
        const win2 = cuartos[1].homeScore > cuartos[1].awayScore ? cuartos[1].homeTeamId : cuartos[1].awayTeamId;
        const win3 = cuartos[2].homeScore > cuartos[2].awayScore ? cuartos[2].homeTeamId : cuartos[2].awayTeamId;
        const win4 = cuartos[3].homeScore > cuartos[3].awayScore ? cuartos[3].homeTeamId : cuartos[3].awayTeamId;

        const matchDate1 = new Date(); matchDate1.setDate(matchDate1.getDate() + 7);
        const matchDate2 = new Date(matchDate1); matchDate2.setHours(matchDate1.getHours() + 2);

        await prisma.match.create({
            data: { tournamentId, homeTeamId: win1, awayTeamId: win2, matchDate: matchDate1, stage: 'SEMIFINAL' }
        });
        await prisma.match.create({
            data: { tournamentId, homeTeamId: win3, awayTeamId: win4, matchDate: matchDate2, stage: 'SEMIFINAL' }
        });
        return 'SEMIFINAL';
    }

    // Semis -> Final
    if (semis.length === 2 && finales.length === 0 && semis.every(m => m.status === 'FINISHED')) {
        const win1 = semis[0].homeScore > semis[0].awayScore ? semis[0].homeTeamId : semis[0].awayTeamId;
        const win2 = semis[1].homeScore > semis[1].awayScore ? semis[1].homeTeamId : semis[1].awayTeamId;

        const matchDate = new Date();
        matchDate.setDate(matchDate.getDate() + 7);

        await prisma.match.create({
            data: { tournamentId, homeTeamId: win1, awayTeamId: win2, matchDate, stage: 'FINAL' }
        });
        return 'FINAL';
    }

    return null;
}

// Generar Playoffs Inteligente: Cuartos -> Semis -> Final
app.post('/api/tournaments/:id/playoffs', authenticateToken, async (req, res) => {
    try {
        const { id: tournamentId } = req.params;

        // Validar si el torneo existe y si el usuario es el organizador
        const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId }
        });

        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });
        if (tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Acceso denegado. Solo el organizador puede generar los playoffs.' });
        }

        // Obtener todos los partidos de eliminatoria (no REGULAR)
        const playoffMatches = await prisma.match.findMany({
            where: { tournamentId, stage: { not: 'REGULAR' } },
            orderBy: { createdAt: 'asc' }
        });

        const cuartos = playoffMatches.filter(m => m.stage === 'CUARTOS');
        const semis = playoffMatches.filter(m => m.stage === 'SEMIFINAL');
        const finales = playoffMatches.filter(m => m.stage === 'FINAL');

        if (finales.length > 0) {
            return res.status(400).json({ error: 'La fase final ya fue generada por completo.' });
        }

        // REGLAS 2 y 3 (Cuartos->Semis, Semis->Final): desde que el auto-avance
        // existe, esto normalmente ya ocurrió solo al guardar el último resultado
        // de la ronda. Este botón manual queda como respaldo/fallback.
        if ((cuartos.length === 4 && semis.length === 0) || (semis.length === 2 && finales.length === 0)) {
            const currentStageMatches = semis.length === 2 ? semis : cuartos;
            const currentStageName = semis.length === 2 ? 'Semifinales' : 'Cuartos de Final';
            if (currentStageMatches.some(m => m.status !== 'FINISHED')) {
                return res.status(400).json({ error: `Deben finalizar todos los partidos de ${currentStageName} para avanzar.` });
            }
            const advancedStage = await tryAutoAdvancePlayoffs(tournamentId);
            if (!advancedStage) {
                return res.status(400).json({ error: 'No se pudo avanzar de fase. Revisa que los resultados estén guardados.' });
            }
            const message = advancedStage === 'FINAL' ? 'Final generada exitosamente' : 'Semifinales generadas exitosamente';
            return res.status(201).json({ message, stage: advancedStage });
        }

        // REGLA 1: Generar Cuartos
        if (cuartos.length === 0) {
            // Obtener equipos inscritos
            const enrollments = await prisma.tournamentEnrollment.findMany({
                where: { tournamentId },
                include: { team: true }
            });

            const teams = enrollments.map(e => e.team);

            // Obtener partidos FINISHED en fase REGULAR para standings
            const matches = await prisma.match.findMany({
                where: { tournamentId, status: 'FINISHED', stage: 'REGULAR' }
            });

            // Inicializar standings
            const standings = teams.map(team => ({ teamId: team.id, pj: 0, g: 0, p: 0, pf: 0, pc: 0, diff: 0 }));

            // Calcular estadísticas
            matches.forEach(match => {
                const homeTeam = standings.find(s => s.teamId === match.homeTeamId);
                const awayTeam = standings.find(s => s.teamId === match.awayTeamId);

                if (homeTeam && awayTeam) {
                    homeTeam.pj += 1; homeTeam.pf += match.homeScore; homeTeam.pc += match.awayScore;
                    awayTeam.pj += 1; awayTeam.pf += match.awayScore; awayTeam.pc += match.homeScore;
                    if (match.homeScore > match.awayScore) { homeTeam.g += 1; awayTeam.p += 1; } 
                    else if (match.awayScore > match.homeScore) { awayTeam.g += 1; homeTeam.p += 1; }
                }
            });

            // Calcular diferencia y ordenar
            standings.forEach(s => { s.diff = s.pf - s.pc; });
            standings.sort((a, b) => {
                if (b.g !== a.g) return b.g - a.g;
                return b.diff - a.diff;
            });

            const activeTeams = standings.filter(s => s.pj > 0);

            if (activeTeams.length < 8) {
                return res.status(400).json({ error: 'Se necesitan al menos 8 equipos con partidos jugados para generar los cuartos de final.' });
            }

            const top8 = activeTeams.slice(0, 8);
            const matchDate = new Date();
            matchDate.setDate(matchDate.getDate() + 7);

            // Llave 1 (1ro vs 8vo), Llave 2 (4to vs 5to), Llave 3 (2do vs 7mo) y Llave 4 (3ro vs 6to)
            await prisma.match.create({ data: { tournamentId, homeTeamId: top8[0].teamId, awayTeamId: top8[7].teamId, matchDate, stage: 'CUARTOS' }});
            await prisma.match.create({ data: { tournamentId, homeTeamId: top8[3].teamId, awayTeamId: top8[4].teamId, matchDate, stage: 'CUARTOS' }});
            await prisma.match.create({ data: { tournamentId, homeTeamId: top8[1].teamId, awayTeamId: top8[6].teamId, matchDate, stage: 'CUARTOS' }});
            await prisma.match.create({ data: { tournamentId, homeTeamId: top8[2].teamId, awayTeamId: top8[5].teamId, matchDate, stage: 'CUARTOS' }});

            return res.status(201).json({ message: 'Cuartos de final generados exitosamente', stage: 'CUARTOS' });
        }

        return res.status(400).json({ error: 'Estado de playoffs inválido o fuera de flujo.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al generar los playoffs' });
    }
});

// Reiniciar Temporada: borra todos los partidos (regular y playoffs) y sus
// estadísticas, y resetea los pagos de las franquicias inscritas a cero.
// Conserva franquicias, jugadores e inscripciones, para poder arrancar una
// temporada nueva y volver a generar los playoffs desde cero.
app.post('/api/tournaments/:id/reset-season', authenticateToken, async (req, res) => {
    try {
        const { id: tournamentId } = req.params;

        const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
        if (!tournament) return res.status(404).json({ error: 'Torneo no encontrado' });

        if (tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'Solo el organizador puede reiniciar la temporada' });
        }

        await prisma.$transaction([
            prisma.playerStat.deleteMany({ where: { match: { tournamentId } } }),
            prisma.match.deleteMany({ where: { tournamentId } }),
            prisma.tournamentEnrollment.updateMany({
                where: { tournamentId },
                data: { amountPaid: 0, paymentStatus: 'PENDING', paymentDate: null }
            })
        ]);

        res.status(200).json({ message: 'Temporada reiniciada: partidos, estadísticas y pagos restablecidos.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al reiniciar la temporada' });
    }
});

// Endpoint público para obtener los líderes de la liga (Estadísticas globales)
app.get('/api/stats/leaders', async (req, res) => {
    try {
        const allStats = await prisma.playerStat.findMany({
            include: {
                player: {
                    include: {
                        team: true
                    }
                }
            }
        });

        const playerMap = {};

        // Agrupar y sumar
        allStats.forEach(stat => {
            const pId = stat.playerId;
            if (!playerMap[pId]) {
                playerMap[pId] = {
                    id: pId,
                    name: stat.player.name,
                    teamId: stat.player.team.id,
                    teamName: stat.player.team.name,
                    logoUrl: stat.player.team.logoUrl,
                    games: 0,
                    points: 0,
                    rebounds: 0,
                    assists: 0,
                    minutesPlayed: 0
                };
            }
            playerMap[pId].games += 1;
            playerMap[pId].points += stat.points;
            playerMap[pId].rebounds += stat.rebounds;
            playerMap[pId].assists += stat.assists;
            playerMap[pId].minutesPlayed += stat.minutesPlayed;
        });

        // Calcular promedios
        const aggregated = Object.values(playerMap).map(p => ({
            ...p,
            ppg: parseFloat((p.points / p.games).toFixed(1)),
            rpg: parseFloat((p.rebounds / p.games).toFixed(1)),
            apg: parseFloat((p.assists / p.games).toFixed(1))
        }));

        // Seleccionar los Top 10 por categoría
        const topScorers = [...aggregated].sort((a, b) => b.ppg - a.ppg).slice(0, 10);
        const topRebounders = [...aggregated].sort((a, b) => b.rpg - a.rpg).slice(0, 10);
        const topAssists = [...aggregated].sort((a, b) => b.apg - a.apg).slice(0, 10);

        res.status(200).json({ topScorers, topRebounders, topAssists });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener líderes de la liga' });
    }
});

// Actualizar pago de inscripción (Control de Pagos)
app.put('/api/enrollments/:id/payment', authenticateToken, async (req, res) => {
    try {
        const { amountPaid } = req.body;
        const enrollmentId = req.params.id;

        // Verificar si el usuario actual es el organizador de este torneo
        const enrollment = await prisma.tournamentEnrollment.findUnique({
            where: { id: enrollmentId },
            include: { tournament: true }
        });

        if (!enrollment) return res.status(404).json({ error: 'Inscripción no encontrada' });

        if (enrollment.tournament.organizerId !== req.user.id && !(await userIsAdmin(req.user.id))) {
            return res.status(403).json({ error: 'No autorizado para editar inscripciones de este torneo' });
        }

        const updated = await prisma.tournamentEnrollment.update({
            where: { id: enrollmentId },
            data: { amountPaid: parseInt(amountPaid, 10) || 0 }
        });

        res.status(200).json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el pago' });
    }
});

app.get('/api/players/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const player = await prisma.player.findUnique({
            where: { id },
            include: {
                team: true,
                stats: {
                    include: {
                        match: {
                            include: {
                                homeTeam: true,
                                awayTeam: true,
                                tournament: true
                            }
                        }
                    },
                    orderBy: {
                        match: {
                            matchDate: 'desc'
                        }
                    }
                }
            }
        });

        if (!player) {
            return res.status(404).json({ error: 'Jugador no encontrado' });
        }

        // Calculate averages
        const totalMatches = player.stats.length;
        let totalPoints = 0;
        let totalRebounds = 0;
        let totalAssists = 0;

        player.stats.forEach(stat => {
            totalPoints += stat.points;
            totalRebounds += stat.rebounds;
            totalAssists += stat.assists;
        });

        const averages = {
            ppg: totalMatches > 0 ? (totalPoints / totalMatches).toFixed(1) : 0,
            rpg: totalMatches > 0 ? (totalRebounds / totalMatches).toFixed(1) : 0,
            apg: totalMatches > 0 ? (totalAssists / totalMatches).toFixed(1) : 0,
        };

        res.json({ player, averages });
    } catch (error) {
        console.error("Error fetching player profile:", error);
        res.status(500).json({ error: 'Error del servidor al obtener el perfil del jugador' });
    }
});

// 404 para rutas de API no encontradas (evita caer en el static/HTML y devolver
// una página cuando el cliente esperaba JSON).
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Recurso no encontrado' });
});

// Manejador de errores global: última red de seguridad. Registra el detalle en
// el servidor pero NUNCA devuelve el stack ni el mensaje interno al cliente, para
// no filtrar rutas de archivos, versiones ni estructura de la base de datos.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Error no controlado:', err);
    // Errores de payload demasiado grande (express.json/urlencoded).
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'La solicitud es demasiado grande.' });
    }
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: 'Error interno del servidor' });
});

app.listen(port, () => {
    console.log(`Aplicación escuchando en http://localhost:${port}`);
});
