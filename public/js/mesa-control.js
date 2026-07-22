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

        const token = localStorage.getItem('kphoops_token');

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

            updateScoreboard();
            updateUndoButtonState();
            showToast(`Anulado: +${last.value} de ${last.name}`, 'success');
        }

        function renderRoster(team, teamType, containerId) {
            const container = document.getElementById(containerId);
            container.innerHTML = `<div class="roster-header"><span>${team?.name || 'Equipo'} Roster</span></div>`;

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
                            <div class="player-number">${p.jerseyNumber}</div>
                            <div class="player-name">${p.name}</div>
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
                            <button class="action-btn pts-btn" onclick="addStat('${p.id}', 'pts', 1, '${teamType}')">+1</button>
                            <button class="action-btn pts-btn" onclick="addStat('${p.id}', 'pts', 2, '${teamType}')">+2</button>
                            <button class="action-btn pts-btn" onclick="addStat('${p.id}', 'pts', 3, '${teamType}')">+3</button>
                            <button class="action-btn reb-btn" onclick="addStat('${p.id}', 'reb', 1, '${teamType}')">REB</button>
                            <button class="action-btn ast-btn" onclick="addStat('${p.id}', 'ast', 1, '${teamType}')">AST</button>
                            <button class="action-btn foul-btn" onclick="addStat('${p.id}', 'foul', 1, '${teamType}')">F</button>
                        </div>
                    </div>
                `;
                container.appendChild(row);
            });
        }

        // Init
        window.onload = async () => {
            const token = localStorage.getItem('kphoops_token');
            if (!token) {
                console.error("No token found");
                document.getElementById('loading-overlay').innerText = 'Error al cargar el partido';
                return;
            }

            const urlParams = new URLSearchParams(window.location.search);
            matchId = urlParams.get('matchId');

            if (!matchId) {
                console.error("Match ID no proporcionado.");
                document.getElementById('loading-overlay').innerText = 'Error al cargar el partido';
                return;
            }

            try {
                const response = await fetch(`/api/matches/${matchId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    const errorMsg = await response.text();
                    console.error(`Error HTTP ${response.status}:`, errorMsg);
                    document.getElementById('loading-overlay').innerText = 'Error al cargar el partido';
                    alert("Error al cargar el partido");
                    return;
                }

                const match = await response.json();
                tournamentId = match.tournamentId;

                document.getElementById('home-name').innerText = match.homeTeam?.name || 'LOCAL';
                document.getElementById('away-name').innerText = match.awayTeam?.name || 'VISITANTE';

                // Mapeo del estado (gameState)
                if (match.homeTeam && match.homeTeam.players) {
                    match.homeTeam.players.forEach(p => {
                        gameState.players[p.id] = { pts: 0, reb: 0, ast: 0, fouls: 0, teamType: 'home', name: p.name };
                    });
                }

                if (match.awayTeam && match.awayTeam.players) {
                    match.awayTeam.players.forEach(p => {
                        gameState.players[p.id] = { pts: 0, reb: 0, ast: 0, fouls: 0, teamType: 'away', name: p.name };
                    });
                }

                renderRoster(match.homeTeam, 'home', 'home-roster');
                renderRoster(match.awayTeam, 'away', 'away-roster');

                document.getElementById('loading-overlay').style.display = 'none';

            } catch (err) {
                console.error("Reference/Fetch Error:", err);
                document.getElementById('loading-overlay').innerText = 'Error al cargar el partido';
                alert("Error al cargar el partido");
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
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
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
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
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
                    showToast('Partido finzalizado y guardado con éxito.', 'success');
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
