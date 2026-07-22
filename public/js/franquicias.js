// RETRO HOOPS · franquicias — lógica de página (extraída del <script> inline).

        let currentUserId = null;
        let currentUserRole = null;
        let allTeams = [];
        let teamDetailById = {};
        let allTournaments = [];
        // Filtro de propiedad para las TARJETAS: 'mine' = solo las que soy capitán,
        // 'all' = todas. Las stats y próximos partidos siempre son globales (directorio).
        let ownerFilter = 'all';
        // Filtro de LIGA: 'all' = todas las ligas mezcladas, o el id de un torneo
        // para ver solo las franquicias inscritas en esa liga. Es el filtro
        // principal (siempre visible, con o sin sesión) para que el directorio
        // no sea una lista gigante de TODAS las franquicias de TODAS las ligas.
        let leagueFilter = 'all';

        /* ────────────────────────────────────────────────────────────────
           CONTADOR ANIMADO (requestAnimationFrame). Cuenta de 0 al valor real.
           Respeta prefers-reduced-motion: si está activo, muestra el valor final
           sin animar.
           ──────────────────────────────────────────────────────────────── */
        function countUp(el, target) {
            if (!el) return;
            target = Number(target) || 0;
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduce) { el.textContent = target; return; }
            const duration = 1100;
            const startAt = performance.now();
            (function tick(now) {
                const p = Math.min((now - startAt) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3); // ease-out
                el.textContent = Math.round(target * eased);
                if (p < 1) requestAnimationFrame(tick);
                else el.textContent = target;
            })(startAt);
        }

        document.addEventListener('DOMContentLoaded', async () => {
            // Sesión: define si se muestran los botones Editar/Eliminar
            try {
                const meRes = await fetch('/api/auth/me', { credentials: 'include' });
                if (meRes.ok) {
                    const me = await meRes.json();
                    currentUserId = me?.id || null;
                    currentUserRole = me?.role || null;
                }
            } catch (e) { /* invitado */ }

            // Configurar el filtro "Mis franquicias / Todas".
            // Solo aparece con sesión iniciada. Por defecto: el ADMIN ve todas;
            // el resto (posibles capitanes) arranca enfocado en las suyas.
            const ownerSel = document.getElementById('filter-owner-teams');
            if (ownerSel && currentUserId) {
                ownerSel.style.display = '';
                ownerFilter = currentUserRole === 'ADMIN' ? 'all' : 'mine';
                ownerSel.value = ownerFilter;
                ownerSel.addEventListener('change', () => {
                    ownerFilter = ownerSel.value;
                    applyTeamFilter();
                });
            }

            // Filtro de liga: disponible para todos (con o sin sesión).
            const leagueSel = document.getElementById('filter-league-teams');
            if (leagueSel) {
                leagueSel.addEventListener('change', () => {
                    leagueFilter = leagueSel.value;
                    applyTeamFilter();
                });
            }

            await loadDirectory();
        });

        // Tarjetas visibles según los filtros de liga y de propiedad (las
        // stats/próximos partidos se recalculan sobre este mismo subconjunto).
        function visibleTeams() {
            let teams = allTeams;

            if (leagueFilter !== 'all') {
                teams = teams.filter(t => {
                    const detail = teamDetailById[t.id];
                    return !!(detail && detail.enrollments && detail.enrollments.some(e => e.tournament && e.tournament.id === leagueFilter));
                });
            }

            if (currentUserId && ownerFilter === 'mine') {
                teams = teams.filter(t => t.captainId === currentUserId);
            }

            return teams;
        }
        // Con "Mis franquicias" activo, TODO el tablero (stats, tarjetas y próximos
        // partidos) se acota a las franquicias del usuario. Con "Todas" (o sin
        // sesión) muestra los totales globales del directorio.
        function applyTeamFilter() {
            const teams = visibleTeams();
            const details = teams.map(t => teamDetailById[t.id]).filter(Boolean);
            renderStats(teams, details);
            renderTeams(teams, teamDetailById);
            renderUpcoming(details);
        }

        /* ════════════════════════════════════════════════════════════════════
           ┌──────────────────────  FUENTE DE DATOS  ──────────────────────┐
           │ TODO: aquí conectas tus consultas reales. Hoy uso los endpoints │
           │ que ya existen:                                                 │
           │   • Lista de franquicias:      GET /api/teams                   │
           │   • Detalle por franquicia:    GET /api/teams/:id               │
           │       → players[], enrollments[] (=ligas), homeMatches[],       │
           │         awayMatches[] (para récord y próximos partidos)         │
           │   • Torneos (ligas activas):   GET /api/tournaments             │
           │                                                                 │
           │ Si tienes MUCHAS franquicias, el Promise.all de detalles es un  │
           │ N+1. Reemplázalo por UN endpoint de agregados, p. ej.:          │
           │   GET /api/stats/directory  →  { teams, players, matches,       │
           │                                  leagues, teamExtras[], upcoming }│
           └─────────────────────────────────────────────────────────────────┘
           ════════════════════════════════════════════════════════════════════ */
        async function loadDirectory() {
            let teams = [];
            try {
                teams = await fetch('/api/teams', { credentials: 'include' }).then(r => r.json());
            } catch (err) {
                document.getElementById('teams-container').innerHTML =
                    `<p style="color: var(--orange); grid-column: 1 / -1;">Error al cargar el directorio de franquicias.</p>`;
                return;
            }
            allTeams = teams;

            // Detalle de cada franquicia (jugadores, ligas, partidos).
            const details = await Promise.all(
                teams.map(t => fetch(`/api/teams/${t.id}`, { credentials: 'include' })
                    .then(r => r.ok ? r.json() : null).catch(() => null))
            );
            const detailById = {};
            details.forEach(d => { if (d && d.id) detailById[d.id] = d; });
            teamDetailById = detailById;

            // Torneos, para contar "ligas activas" y para el selector de liga.
            try { allTournaments = await fetch('/api/tournaments', { credentials: 'include' }).then(r => r.json()); }
            catch (e) { allTournaments = []; }

            populateLeagueFilter();

            // Pinta stats, tarjetas y próximos partidos según el filtro activo.
            applyTeamFilter();
        }

        // Llena el selector de ligas con los torneos reales y respeta un
        // deep-link `?tournamentId=...` (p. ej. un enlace "Ver franquicias"
        // desde la página de una liga concreta) para que llegue pre-filtrado.
        function populateLeagueFilter() {
            const sel = document.getElementById('filter-league-teams');
            if (!sel) return;

            const sorted = [...allTournaments].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            sel.innerHTML = `<option value="all">Todas las ligas</option>` +
                sorted.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

            const fromUrl = new URLSearchParams(window.location.search).get('tournamentId');
            leagueFilter = (fromUrl && sorted.some(t => t.id === fromUrl)) ? fromUrl : 'all';
            sel.value = leagueFilter;
        }

        // ¿La liga/torneo está activa? (inscripciones abiertas o en curso).
        // TODO: ajústalo a tu regla real de "activa" si tienes un campo de estado.
        function isTournamentActive(t) {
            if (!t || !t.startDate) return true;               // sin fecha ⇒ inscripciones
            const start = new Date(t.startDate).getTime();
            const now = Date.now();
            if (start > now) return true;                      // programada / abierta
            return (now - start) < 30 * 24 * 60 * 60 * 1000;   // "en curso" durante 30 días
        }

        /* ─────────── CAPA 1: stats agregadas (todas de datos reales) ─────────── */
        function renderStats(teams, details) {
            // Con una liga concreta seleccionada, los partidos/jugadores deben
            // contarse SOLO dentro de esa liga, no de todas las que juega cada equipo.
            const inLeague = (m) => leagueFilter === 'all' || m.tournamentId === leagueFilter;

            const totalTeams = teams.length;                                              // COUNT franquicias
            const totalPlayers = details.reduce((s, d) => s + (d?.players?.length || 0), 0); // SUMA jugadores
            const matchIds = new Set();                                                   // COUNT partidos (dedupe)
            details.forEach(d => d && [...(d.homeMatches || []), ...(d.awayMatches || [])]
                .filter(inLeague)
                .forEach(m => matchIds.add(m.id)));

            // Ligas activas: con una liga seleccionada, es esa (1). Con "Mis
            // franquicias" se cuentan solo las ligas en las que participan mis
            // equipos (vía enrollments); si no, el total global.
            let activeLeagues;
            if (leagueFilter !== 'all') {
                activeLeagues = 1;
            } else if (currentUserId && ownerFilter === 'mine') {
                const tIds = new Set();
                details.forEach(d => (d?.enrollments || []).forEach(e => {
                    if (e.tournament && isTournamentActive(e.tournament)) tIds.add(e.tournament.id);
                }));
                activeLeagues = tIds.size;
            } else {
                activeLeagues = allTournaments.filter(isTournamentActive).length;
            }

            countUp(document.getElementById('stat-teams'), totalTeams);
            countUp(document.getElementById('stat-players'), totalPlayers);
            countUp(document.getElementById('stat-matches'), matchIds.size);
            countUp(document.getElementById('stat-leagues'), activeLeagues);
        }

        // Datos por franquicia para la mini-fila (Jugadores · Ligas · Récord W-L).
        // Con una liga seleccionada, "Ligas" y "Récord" se acotan a esa liga
        // (el récord de un equipo en SU liga es más útil que su récord global).
        function teamExtras(detail, teamId) {
            if (!detail) return { players: 0, ligas: 0, record: '0-0' };
            const players = detail.players?.length || 0;      // nº de jugadores en el roster
            const enrollments = leagueFilter === 'all'
                ? (detail.enrollments || [])
                : (detail.enrollments || []).filter(e => e.tournament && e.tournament.id === leagueFilter);
            const ligas = enrollments.length;                 // inscripciones = ligas en las que juega

            let w = 0, l = 0;
            [...(detail.homeMatches || []), ...(detail.awayMatches || [])]
                .filter(m => leagueFilter === 'all' || m.tournamentId === leagueFilter)
                .forEach(m => {
                    if (m.status !== 'FINISHED') return;
                    const isHome = m.homeTeamId === teamId;
                    const mine = isHome ? m.homeScore : m.awayScore;
                    const opp = isHome ? m.awayScore : m.homeScore;
                    if (mine > opp) w++; else if (opp > mine) l++;
                });
            return { players, ligas, record: `${w}-${l}` };
        }

        /* ─────────── CAPA 2: tarjetas enriquecidas ─────────── */
        function renderTeams(teams, detailById) {
            const container = document.getElementById('teams-container');
            container.innerHTML = '';

            // Tarjeta "+ Nueva Franquicia" (siempre primera)
            const addCard = document.createElement('a');
            addCard.href = 'crear-equipo.html';
            addCard.className = 'add-team-card';
            addCard.innerHTML = `<span class="add-icon">+</span><span class="add-label">Nueva Franquicia</span>`;
            container.appendChild(addCard);

            if (teams.length === 0) {
                const empty = document.createElement('p');
                empty.style.cssText = 'color: var(--text-muted); grid-column: 1 / -1;';
                if (leagueFilter !== 'all' && currentUserId && ownerFilter === 'mine') {
                    empty.textContent = 'Ninguna de tus franquicias está inscrita en esta liga.';
                } else if (leagueFilter !== 'all') {
                    empty.textContent = 'Ninguna franquicia está inscrita en esta liga todavía.';
                } else if (currentUserId && ownerFilter === 'mine') {
                    empty.textContent = 'Aún no tienes franquicias. Crea la tuya o cambia a "Todas las franquicias".';
                } else {
                    empty.textContent = 'Aún no hay franquicias registradas. ¡Sé el primero!';
                }
                container.appendChild(empty);
                return;
            }

            teams.forEach(team => {
                const extras = teamExtras(detailById[team.id], team.id);

                const card = document.createElement('div');
                card.className = 'card team-card';
                card.onclick = () => { window.location.href = `equipo.html?id=${team.id}`; };

                // Escudo: imagen si existe, si no la inicial sobre gradiente
                const initial = (team.name || '?').trim().charAt(0).toUpperCase();
                const logoHtml = team.logoUrl
                    ? `<div class="team-logo"><img src="${team.logoUrl}" alt="Logo ${team.name}" onerror="this.parentElement.classList.add('is-fallback'); this.outerHTML='<span class=\\'team-logo-placeholder\\'>${initial}</span>'"></div>`
                    : `<div class="team-logo is-fallback"><span class="team-logo-placeholder">${initial}</span></div>`;

                const captainStr = team.captain
                    ? capitalizeName(`${team.captain.firstName} ${team.captain.lastName}`)
                    : 'No Asignado';

                // Editar/Eliminar: el capitán dueño ve ambos; el ADMIN solo Eliminar.
                // El ORGANIZER ya no controla franquicias ajenas (paridad con ligas).
                const isCaptain = !!(currentUserId && team.captainId === currentUserId);
                const isModerator = currentUserRole === 'ADMIN';
                let actionsHtml = '';
                if (isCaptain) {
                    actionsHtml = `
                        <div class="team-card-actions">
                            <button class="btn-pill btn-pill--cyan" onclick="editTeam(event, '${team.id}')">Editar</button>
                            <button class="btn-pill btn-pill--danger" onclick="deleteTeam(event, '${team.id}')">Eliminar</button>
                        </div>`;
                } else if (isModerator) {
                    actionsHtml = `
                        <div class="team-card-actions">
                            <button class="btn-pill btn-pill--danger" onclick="deleteTeam(event, '${team.id}')">Eliminar</button>
                        </div>`;
                }

                card.innerHTML = `
                    <div class="team-card-main">
                        ${logoHtml}
                        <div class="team-info">
                            <h2>${team.name}</h2>
                            <p>Capitán: <span class="captain-name">${captainStr}</span></p>
                        </div>
                    </div>
                    <div class="team-stats-row">
                        <div class="team-stat"><div class="team-stat-val">${extras.players}</div><div class="team-stat-lbl">Jugadores</div></div>
                        <div class="team-stat"><div class="team-stat-val">${extras.ligas}</div><div class="team-stat-lbl">Ligas</div></div>
                        <div class="team-stat"><div class="team-stat-val">${extras.record}</div><div class="team-stat-lbl">Récord</div></div>
                    </div>
                    ${actionsHtml}
                `;
                container.appendChild(card);
            });
        }

        /* ─────────── CAPA 3: próximos partidos ─────────── */
        // ¿Está "en vivo"? El modelo actual usa SCHEDULED/FINISHED. Si añades un
        // estado LIVE/IN_PROGRESS, se pinta solo. Mientras tanto, heurística:
        // no terminado y la hora de inicio ya pasó hace < 3h.
        function isLive(m) {
            if (m.status === 'LIVE' || m.status === 'IN_PROGRESS') return true;
            const t = new Date(m.date).getTime();
            return m.status !== 'FINISHED' && t <= Date.now() && (Date.now() - t) < 3 * 60 * 60 * 1000;
        }

        function renderUpcoming(details) {
            // Reunimos los partidos de todas las franquicias y deduplicamos por id.
            // Con una liga seleccionada, solo sus partidos (no los de otras ligas
            // en las que el mismo equipo también juegue).
            const map = new Map();
            details.forEach(d => {
                if (!d) return;
                (d.homeMatches || []).filter(m => leagueFilter === 'all' || m.tournamentId === leagueFilter).forEach(m => {
                    if (!map.has(m.id)) map.set(m.id, { id: m.id, home: d.name, away: m.awayTeam?.name || '—', date: m.matchDate, status: m.status });
                });
                (d.awayMatches || []).filter(m => leagueFilter === 'all' || m.tournamentId === leagueFilter).forEach(m => {
                    if (!map.has(m.id)) map.set(m.id, { id: m.id, home: m.homeTeam?.name || '—', away: d.name, date: m.matchDate, status: m.status });
                });
            });

            // Solo próximos / en vivo (no finalizados), ordenados por fecha ascendente.
            const rows = [...map.values()]
                .filter(m => m.status !== 'FINISHED')
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            const container = document.getElementById('upcoming-container');
            if (rows.length === 0) {
                container.innerHTML = `<p class="upcoming-empty">No hay partidos próximos programados.</p>`;
                return;
            }

            container.innerHTML = rows.map(m => {
                const live = isLive(m);
                const when = m.date
                    ? new Date(m.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
                    : 'Por definir';
                const badge = live
                    ? `<span class="match-badge is-live"><span class="badge-dot"></span>En vivo</span>`
                    : `<span class="match-badge is-scheduled">Programado</span>`;
                return `
                    <div class="match-row">
                        <div class="match-teams">
                            <span class="match-team">${m.home}</span>
                            <span class="match-vs">VS</span>
                            <span class="match-team">${m.away}</span>
                        </div>
                        <span class="match-when">${when}</span>
                        ${badge}
                    </div>`;
            }).join('');
        }

        /* ─────────── Modal editar franquicia (sin cambios de lógica) ─────────── */
        const editTeamModal = document.getElementById('edit-team-modal');
        const editTeamForm = document.getElementById('edit-team-form');
        let editingTeamId = null;

        const closeEditTeamModal = () => { editTeamModal.style.display = 'none'; editingTeamId = null; };

        document.getElementById('edit-team-close').addEventListener('click', closeEditTeamModal);
        document.getElementById('edit-team-cancel').addEventListener('click', closeEditTeamModal);
        editTeamModal.addEventListener('click', (e) => { if (e.target === editTeamModal) closeEditTeamModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && editTeamModal.style.display !== 'none') closeEditTeamModal();
        });

        const editTeamLogoInput = document.getElementById('edit-team-logo');
        const editTeamLogoPreview = document.getElementById('edit-team-logo-preview');
        editTeamLogoInput.addEventListener('change', () => {
            const file = editTeamLogoInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { editTeamLogoPreview.innerHTML = `<img src="${ev.target.result}" alt="Vista previa">`; };
            reader.readAsDataURL(file);
        });

        editTeamForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!editingTeamId) return;
            const formData = new FormData();
            formData.append('name', document.getElementById('edit-team-name').value);
            if (editTeamLogoInput.files[0]) formData.append('logo', editTeamLogoInput.files[0]);

            fetch(`/api/teams/${editingTeamId}`, { method: 'PUT', credentials: 'include', body: formData })
                .then(res => res.json().then(data => ({ status: res.status, data })))
                .then(({ status, data }) => {
                    if (status !== 200) throw new Error(data.error || 'Error al actualizar la franquicia');
                    showToast('Franquicia actualizada', 'success');
                    closeEditTeamModal();
                    setTimeout(() => window.location.reload(), 800);
                })
                .catch(err => showToast(err.message, 'error'));
        });

        function editTeam(event, id) {
            event.stopPropagation();
            const team = allTeams.find(t => t.id === id);
            if (!team) return;
            editingTeamId = id;
            document.getElementById('edit-team-name').value = team.name || '';
            editTeamLogoInput.value = '';
            editTeamLogoPreview.innerHTML = team.logoUrl
                ? `<img src="${team.logoUrl}" alt="Logo actual">`
                : `<span class="team-logo-placeholder">?</span>`;
            editTeamModal.style.display = 'flex';
        }

        async function deleteTeam(event, id) {
            event.stopPropagation();
            if (!(await showConfirm('¿Estás seguro de que deseas ELIMINAR esta franquicia? Esta acción no se puede deshacer.', { title: 'Eliminar Franquicia', confirmText: 'Eliminar' }))) return;

            fetch(`/api/teams/${id}`, { method: 'DELETE', credentials: 'include' })
                .then(res => res.json().then(data => ({ status: res.status, data })))
                .then(({ status, data }) => {
                    if (status !== 200) throw new Error(data.error || 'Error al eliminar la franquicia');
                    showToast('Franquicia eliminada', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                })
                .catch(err => showToast(err.message, 'error'));
        }
