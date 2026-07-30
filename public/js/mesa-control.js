// RETRO HOOPS · mesa-control — lógica de página (extraída del <script> inline).

        // State Management
        let matchId = null;
        let tournamentId = null;
        let clockInterval = null;
        let timeLeft = 600; // 10 minutes in seconds
        let currentQuarter = 1;

        const gameState = {
            homeScore: 0,
            awayScore: 0,
            homeFouls: 0,
            awayFouls: 0,
            players: {} // { 'player_id': { pts: 0, reb: 0, ast: 0, fouls: 0, teamType: 'home' | 'away', name } }
        };

        // Pila de puntos anotados (solo 'pts'), para poder anular el último
        // punto cargado por error en cualquiera de los dos equipos.
        const pointsHistory = [];

        // Formato MM:SS
        function formatTime(seconds) {
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        }

        function updateClockDisplay() {
            document.getElementById('clock-display').innerText = formatTime(timeLeft);
        }

        function startClock() {
            if (clockInterval) return;
            clockInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    updateClockDisplay();
                } else {
                    pauseClock();
                    // Auto-advance quarter or beep sound
                }
            }, 1000);
        }

        function pauseClock() {
            if (clockInterval) {
                clearInterval(clockInterval);
                clockInterval = null;
            }
        }

        function nextQuarter() {
            if (currentQuarter < 4) currentQuarter++;
            else currentQuarter = 'OT';
            document.getElementById('quarter-display').innerText = currentQuarter === 'OT' ? 'OT' : `Q${currentQuarter}`;
            timeLeft = 600; // Reset to 10 mins (or 5 for OT if preferred)
            updateClockDisplay();
            // Resetear faltas de equipo (opcional según reglas)
            gameState.homeFouls = 0;
            gameState.awayFouls = 0;
            updateScoreboard();
        }

        function updateScoreboard() {
            document.getElementById('home-score-display').innerText = gameState.homeScore;
            document.getElementById('away-score-display').innerText = gameState.awayScore;
            document.getElementById('home-fouls-display').innerText = gameState.homeFouls;
            document.getElementById('away-fouls-display').innerText = gameState.awayFouls;
        }

        // ---------------------------------------------------------------------
        // Guardado continuo
        //
        // Antes el partido entero vivía solo en memoria hasta pulsar "Terminar
        // partido": recargar la pestaña, quedarse sin batería o que saltara el
        // cierre por inactividad borraba dos horas de anotación. Ahora cada clic
        // se manda al servidor en cuanto ocurre (PATCH .../player-stat, que ya
        // existía sin usarse) y al recargar el partido se reconstruye.
        //
        // Es "best effort": la pantalla se actualiza al instante y el envío va
        // detrás. Si falla la red no se pierde nada, porque al terminar el partido
        // se sigue mandando el boxscore completo con valores absolutos; solo se
        // avisa de que en ese momento no hay copia en el servidor.
        // ---------------------------------------------------------------------
        const STAT_ACTIONS = { pts: 'POINTS', reb: 'REBOUNDS', ast: 'ASSISTS' };
        let syncQueue = Promise.resolve();   // encadena los envíos para que lleguen en orden
        let pendingSyncs = 0;
        let syncFailed = false;

        function updateSyncIndicator() {
            const el = document.getElementById('sync-status');
            if (!el) return;

            if (syncFailed) {
                el.textContent = '⚠ Sin guardar en el servidor';
                el.className = 'sync-status is-error';
            } else if (pendingSyncs > 0) {
                el.textContent = '⟳ Guardando…';
                el.className = 'sync-status is-saving';
            } else {
                el.textContent = '✓ Guardado';
                el.className = 'sync-status is-saved';
            }
        }

        // Las faltas no se sincronizan porque PlayerStat no tiene columna para
        // ellas: hoy tampoco se guardan al terminar el partido. Siguen siendo un
        // contador en pantalla.
        function syncStat(playerId, type, increment) {
            const action = STAT_ACTIONS[type];
            if (!action || !matchId) return;

            pendingSyncs++;
            updateSyncIndicator();

            syncQueue = syncQueue.then(async () => {
                try {
                    const res = await fetch(`/api/matches/${matchId}/player-stat`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ playerId, action, increment })
                    });
                    if (!res.ok) throw new Error('respuesta ' + res.status);
                    syncFailed = false;
                } catch (err) {
                    console.error('No se pudo guardar la jugada:', err);
                    if (!syncFailed) {
                        syncFailed = true;
                        showToast('Sin conexión con el servidor. Se seguirá anotando y se guardará todo al terminar el partido.', 'error');
                    }
                } finally {
                    pendingSyncs--;
                    updateSyncIndicator();
                }
            });
        }

        // Logic for Stats
        function addStat(playerId, type, value, teamType) {
            const p = gameState.players[playerId];
            if (!p) return;

            if (type === 'pts') {
                p.pts += value;
                if (teamType === 'home') gameState.homeScore += value;
                else gameState.awayScore += value;
                pointsHistory.push({ playerId, value, teamType, name: p.name });
                updateUndoButtonState();
            } else if (type === 'reb') {
                p.reb += value;
            } else if (type === 'ast') {
                p.ast += value;
            } else if (type === 'foul') {
                p.fouls += value;
                if (teamType === 'home') gameState.homeFouls += value;
                else gameState.awayFouls += value;
            }

            syncStat(playerId, type, value);

            // Update UI
            updateScoreboard();
            updatePlayerStatBadges(playerId);
        }

        // Refresca las 4 fichas de stats (PTS/REB/AST/F) de un jugador y
        // resalta la de faltas cuando está cerca de la salida por faltas.
        function updatePlayerStatBadges(playerId) {
            const p = gameState.players[playerId];
            const el = document.getElementById(`p-stats-${playerId}`);
            if (!p || !el) return;

            el.querySelector('[data-stat="pts"]').textContent = p.pts;
            el.querySelector('[data-stat="reb"]').textContent = p.reb;
            el.querySelector('[data-stat="ast"]').textContent = p.ast;
            el.querySelector('[data-stat="foul"]').textContent = p.fouls;
            el.querySelector('.stat-chip.stat-foul').classList.toggle('is-warning', p.fouls >= 4);
        }

        // Refleja en el botón "Anular Punto" si hay algo que deshacer y, si
        // lo hay, qué se anularía (jugador y valor), para que el organizador
        // no tenga dudas antes de hacer clic.
        function updateUndoButtonState() {
            const btn = document.getElementById('btn-undo-point');
            if (!btn) return;
            const label = btn.querySelector('.btn-content');
            const last = pointsHistory[pointsHistory.length - 1];

            btn.disabled = !last;
            if (label) {
                label.textContent = last ? `↩ ANULAR +${last.value} (${last.name})` : '↩ ANULAR PUNTO';
            }
        }

        // Deshace el último punto anotado (+1/+2/+3), sin importar de qué
        // equipo fue. Pensado para corregir un clic equivocado en caliente,
        // sin tener que reiniciar el partido ni tocar rebotes/asistencias/faltas.
        function undoLastPoint() {
            const last = pointsHistory.pop();
            if (!last) return;

            const p = gameState.players[last.playerId];
            if (p) {
                p.pts = Math.max(0, p.pts - last.value);
                updatePlayerStatBadges(last.playerId);
            }

            if (last.teamType === 'home') gameState.homeScore = Math.max(0, gameState.homeScore - last.value);
            else gameState.awayScore = Math.max(0, gameState.awayScore - last.value);

            // El servidor también tiene que enterarse de que ese punto se anuló.
            syncStat(last.playerId, 'pts', -last.value);

            updateScoreboard();
            updateUndoButtonState();
            showToast(`Anulado: +${last.value} de ${last.name}`, 'success');
        }

        function renderRoster(team, teamType, containerId) {
            const container = document.getElementById(containerId);
            container.innerHTML = `<div class="roster-header"><span>${escapeHtml(team?.name || 'Equipo')} Roster</span></div>`;

            if (!team || !team.players || team.players.length === 0) {
                container.innerHTML += `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Sin jugadores.</div>`;
                return;
            }

            team.players.forEach(p => {
                const row = document.createElement('div');
                row.className = 'player-row';
                row.innerHTML = `
                    <div class="player-top">
                        <div class="player-info">
                            <div class="player-number">${escapeHtml(p.jerseyNumber)}</div>
                            <div class="player-name">${escapeHtml(p.name)}</div>
                        </div>
                    </div>
                    <div class="player-bottom">
                        <div class="player-stat-badges" id="p-stats-${p.id}">
                            <div class="stat-chip stat-pts"><span class="stat-value" data-stat="pts">0</span><span class="stat-label">PTS</span></div>
                            <div class="stat-chip stat-reb"><span class="stat-value" data-stat="reb">0</span><span class="stat-label">REB</span></div>
                            <div class="stat-chip stat-ast"><span class="stat-value" data-stat="ast">0</span><span class="stat-label">AST</span></div>
                            <div class="stat-chip stat-foul"><span class="stat-value" data-stat="foul">0</span><span class="stat-label">F</span></div>
                        </div>
                        <div class="action-buttons">
                            <button class="action-btn pts-btn" data-player-id="${p.id}" data-stat="pts" data-value="1" data-team="${teamType}">+1</button>
                            <button class="action-btn pts-btn" data-player-id="${p.id}" data-stat="pts" data-value="2" data-team="${teamType}">+2</button>
                            <button class="action-btn pts-btn" data-player-id="${p.id}" data-stat="pts" data-value="3" data-team="${teamType}">+3</button>
                            <button class="action-btn reb-btn" data-player-id="${p.id}" data-stat="reb" data-value="1" data-team="${teamType}">REB</button>
                            <button class="action-btn ast-btn" data-player-id="${p.id}" data-stat="ast" data-value="1" data-team="${teamType}">AST</button>
                            <button class="action-btn foul-btn" data-player-id="${p.id}" data-stat="foul" data-value="1" data-team="${teamType}">F</button>
                        </div>
                    </div>
                `;
                container.appendChild(row);
            });
        }

        // Wiring de botones (sin onclick inline, para poder activar la CSP de helmet).
        document.getElementById('quarter-display').addEventListener('click', nextQuarter);
        document.getElementById('btn-start').addEventListener('click', startClock);
        document.getElementById('btn-pause').addEventListener('click', pauseClock);
        document.getElementById('btn-undo-point').addEventListener('click', undoLastPoint);
        document.getElementById('btn-finish-match').addEventListener('click', finishMatchAndSave);

        // Los botones de stats (+1/+2/+3/REB/AST/F) se recrean cada vez que se
        // renderiza un roster, así que en vez de atar un listener por botón se
        // delega en document y se lee la data del botón clickeado.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.action-btn');
            if (!btn) return;
            const { playerId, stat, value, team } = btn.dataset;
            addStat(playerId, stat, parseInt(value, 10), team);
        });

        // El overlay de carga quedó fuera de la vista en algún rediseño, pero el
        // código seguía haciendo getElementById('loading-overlay').style.display,
        // que lanzaba un TypeError en CADA apertura de la mesa —y en las rutas de
        // error, antes de poder avisar de nada—. Se tolera que no exista.
        function hideLoadingOverlay() {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.style.display = 'none';
        }

        function showLoadError(message) {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.innerText = message;
            showToast(message, 'error');
        }

        // Init
        window.onload = async () => {
            // Pista no sensible (solo el nombre a mostrar) para descartar de
            // entrada a quien claramente no tiene sesión, sin esperar una
            // llamada de red. Las acciones que sí importan (guardar el marcador,
            // el boxscore, cada jugada) las autoriza el servidor con la cookie
            // httpOnly de sesión, no esto.
            if (!localStorage.getItem('kphoops_user_name')) {
                console.error("No hay sesión");
                showLoadError('Inicia sesión para abrir la mesa de control.');
                return;
            }

            const urlParams = new URLSearchParams(window.location.search);
            matchId = urlParams.get('matchId');

            if (!matchId) {
                console.error("Match ID no proporcionado.");
                showLoadError('No se indicó qué partido abrir.');
                return;
            }

            try {
                const response = await fetch(`/api/matches/${matchId}`, {
                    credentials: 'include'
                });

                if (!response.ok) {
                    const errorMsg = await response.text();
                    console.error(`Error HTTP ${response.status}:`, errorMsg);
                    showLoadError('No se pudo cargar el partido.');
                    return;
                }

                const match = await response.json();
                tournamentId = match.tournamentId;

                document.getElementById('home-name').innerText = match.homeTeam?.name || 'LOCAL';
                document.getElementById('away-name').innerText = match.awayTeam?.name || 'VISITANTE';

                // Mapeo del estado (gameState). Si el partido ya tenía jugadas
                // guardadas —porque se recargó la página, se cerró la sesión por
                // inactividad o se cambió de dispositivo— se arranca desde ellas
                // en vez de desde cero.
                const savedStats = {};
                (match.stats || []).forEach(s => { savedStats[s.playerId] = s; });

                const hydrate = (team, teamType) => {
                    if (!team || !team.players) return;
                    team.players.forEach(p => {
                        const saved = savedStats[p.id];
                        gameState.players[p.id] = {
                            pts: saved ? saved.points : 0,
                            reb: saved ? saved.rebounds : 0,
                            ast: saved ? saved.assists : 0,
                            fouls: 0, // las faltas no se persisten (no existen en PlayerStat)
                            teamType,
                            name: p.name
                        };
                    });
                };

                hydrate(match.homeTeam, 'home');
                hydrate(match.awayTeam, 'away');

                // El marcador lo lleva el propio partido: el endpoint de stats lo
                // va incrementando con cada canasta.
                gameState.homeScore = match.homeScore || 0;
                gameState.awayScore = match.awayScore || 0;

                renderRoster(match.homeTeam, 'home', 'home-roster');
                renderRoster(match.awayTeam, 'away', 'away-roster');

                updateScoreboard();
                Object.keys(gameState.players).forEach(updatePlayerStatBadges);
                updateSyncIndicator();

                hideLoadingOverlay();

                if (match.status === 'FINISHED') {
                    showToast('Este partido ya está finalizado. Lo que anotes aquí sobrescribirá el resultado guardado.', 'error');
                } else if ((match.stats || []).length > 0) {
                    showToast('Partido recuperado: se retomó el marcador donde se quedó.', 'success');
                }

            } catch (err) {
                console.error("Reference/Fetch Error:", err);
                showLoadError('Error al cargar el partido.');
            }
        };

        // Guardado Final
        async function finishMatchAndSave() {
            if (gameState.homeScore === gameState.awayScore) {
                showToast('El partido no puede terminar en empate. Juega tiempo extra hasta romper el empate.', 'error');
                return;
            }

            if (!(await showConfirm('¿Estás seguro de terminar el partido? Esta acción guardará el resultado final y las estadísticas de todos los jugadores.', { title: 'Terminar Partido', confirmText: 'Terminar', danger: false }))) {
                return;
            }

            pauseClock();

            // Build stats array
            const statsPayload = [];
            for (const [playerId, data] of Object.entries(gameState.players)) {
                statsPayload.push({
                    playerId: playerId,
                    points: parseInt(data.pts, 10) || 0,
                    rebounds: parseInt(data.reb, 10) || 0,
                    assists: parseInt(data.ast, 10) || 0,
                    minutesPlayed: parseInt((40 - Math.floor(timeLeft/60)), 10) || 0
                });
            }

            try {
                // 1. Guardar Score Global y cambiar status
                const scoreRes = await fetch(`/api/matches/${matchId}/score`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ homeScore: gameState.homeScore, awayScore: gameState.awayScore })
                });

                if (!scoreRes.ok) throw new Error("Error guardando el marcador.");
                // Si este resultado cerró Cuartos o Semifinal, el backend ya generó
                // automáticamente la siguiente ronda (advancedStage lo confirma).
                const scoreData = await scoreRes.json().catch(() => ({}));
                const advancedStage = scoreData.advancedStage || null;

                // 2. Guardar Boxscore
                if (statsPayload.length > 0) {
                    console.log("Enviando stats:", { stats: statsPayload });
                    const statsRes = await fetch(`/api/matches/${matchId}/boxscore`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ stats: statsPayload })
                    });

                    if (!statsRes.ok) {
                        const errorMsg = await statsRes.text();
                        console.error("Error del backend:", errorMsg);
                        throw new Error("Error guardando las estadísticas individuales.");
                    }
                }

                if (advancedStage) {
                    const stageLabel = advancedStage === 'FINAL' ? 'la Final' : 'la Semifinal';
                    showToast(`¡Partido guardado! Se generó automáticamente ${stageLabel}.`, 'success');
                } else {
                    showToast('Partido finalizado y guardado con éxito.', 'success');
                }

                // Redirigir de vuelta al torneo solo tras éxito en ambas peticiones
                setTimeout(() => {
                    window.location.href = `/torneo.html?id=${tournamentId}`;
                }, 2000);

            } catch (err) {
                console.error(err);
                showToast(err.message, 'error');
            }
        }
