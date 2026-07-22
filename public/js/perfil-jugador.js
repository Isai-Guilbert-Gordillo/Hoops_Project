// RETRO HOOPS · perfil-jugador — lógica de página (extraída del <script> inline).

        document.addEventListener('DOMContentLoaded', async () => {
            // Check auth (opcional, visual)
            const token = localStorage.getItem('token');
            const user = JSON.parse(localStorage.getItem('user') || 'null');
            if (token && user) {
                const authSection = document.getElementById('auth-section');
                authSection.innerHTML = `
                    <span id="user-greeting" class="user-greeting" style="display: inline-block;">Hola, ${capitalizeName(user.firstName)}</span>
                    <button id="logout-btn" class="btn btn-ghost"><span class="btn-content">Logout</span></button>
                    ${['SUPERADMIN', 'LEAGUE_MANAGER'].includes(user.role) ? '<a href="/mesa-control.html" class="btn btn-cyan"><span class="btn-content">Mesa</span></a>' : ''}
                `;
                document.getElementById('logout-btn').addEventListener('click', () => {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/index.html';
                });
            }

            // Get parameters
            const urlParams = new URLSearchParams(window.location.search);
            const playerId = urlParams.get('playerId');

            if (!playerId) {
                showToast('ID de jugador no especificado', 'error');
                setTimeout(() => window.location.href = '/estadisticas.html', 2000);
                return;
            }

            try {
                const res = await fetch(`/api/players/${playerId}`);
                if (!res.ok) {
                    throw new Error('No se pudo obtener el perfil del jugador');
                }
                const data = await res.json();
                
                const player = data.player;
                const avgs = data.averages;

                // Update Hero headers
                document.getElementById('player-name').innerText = `#${player.jerseyNumber} - ${player.name}`;
                document.getElementById('player-position').innerText = player.position;

                // Update Team Link
                const teamLink = document.getElementById('team-link');
                teamLink.href = `/perfil-equipo.html?teamId=${player.team.id}`;
                document.getElementById('team-name').innerText = player.team.name;
                
                if (player.team.logoUrl) {
                    document.getElementById('team-logo-container').innerHTML = `<img src="${player.team.logoUrl}" class="team-logo-small" alt="${player.team.name} Logo">`;
                } else {
                    document.getElementById('team-logo-container').innerHTML = `<div class="team-logo-small" style="font-size:10px;">?</div>`;
                }

                // Update Stats
                document.getElementById('stat-ppg').innerText = avgs.ppg;
                document.getElementById('stat-rpg').innerText = avgs.rpg;
                document.getElementById('stat-apg').innerText = avgs.apg;

                // Build Game Log
                const gamelogBody = document.getElementById('gamelog-body');
                if (player.stats && player.stats.length > 0) {
                    player.stats.forEach(stat => {
                        const match = stat.match;
                        // Determinar oponente
                        const isHome = match.homeTeamId === player.teamId;
                        const opponent = isHome ? match.awayTeam : match.homeTeam;
                        
                        // Resultado
                        let resultHtml = '-';
                        if (match.status === 'COMPLETED') {
                            const ourScore = isHome ? match.homeScore : match.awayScore;
                            const oppScore = isHome ? match.awayScore : match.homeScore;
                            const isWin = ourScore > oppScore;
                            const wOrL = isWin ? 'W' : 'L';
                            const resultClass = isWin ? 'result-win' : 'result-loss';
                            resultHtml = `<span class="${resultClass}">${wOrL} ${ourScore}-${oppScore}</span>`;
                        } else {
                            resultHtml = '<span style="color: var(--text-muted)">Pendiente</span>';
                        }

                        // Fecha
                        const dateObj = new Date(match.matchDate);
                        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-size: 0.85rem; color: var(--text-muted);">${dateStr}</td>
                            <td>
                                <a href="/perfil-equipo.html?teamId=${opponent.id}" class="opponent-link">
                                    vs ${opponent.name}
                                </a>
                            </td>
                            <td>${resultHtml}</td>
                            <td style="color: var(--text-muted);">${stat.minutesPlayed}</td>
                            <td style="color: var(--orange); font-weight: bold;">${stat.points}</td>
                            <td style="color: var(--cyan-accent); font-weight: bold;">${stat.rebounds}</td>
                            <td style="color: #ffd700; font-weight: bold;">${stat.assists}</td>
                        `;
                        gamelogBody.appendChild(tr);
                    });
                } else {
                    gamelogBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay partidos registrados</td></tr>`;
                }

                // Show Content
                document.getElementById('loading-indicator').style.display = 'none';
                document.getElementById('main-content').style.display = 'block';

            } catch (error) {
                console.error(error);
                showToast('Error cargando el jugador', 'error');
                document.getElementById('loading-indicator').innerText = 'ERROR AL CARGAR DATOS';
            }
        });
