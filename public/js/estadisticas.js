// RETRO HOOPS · estadisticas — lógica de página (extraída del <script> inline).

        document.addEventListener('error', (e) => {
            const img = e.target;
            if (img.tagName === 'IMG' && img.dataset.fallback === 'hide') {
                img.src = '';
                img.style.display = 'none';
            }
        }, true);

        document.addEventListener('DOMContentLoaded', async () => {
            // Función para renderizar filas
            const renderTable = (tbodyId, data, statKey) => {
                const tbody = document.getElementById(tbodyId);
                tbody.innerHTML = '';

                if (!data || data.length === 0) {
                   tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 2rem 0; white-space: normal;">Sin datos</td></tr>`;
                    return;
                }

                data.forEach((p, index) => {
                    const tr = document.createElement('tr');

                    const isFirst = index === 0;
                    const rank = index + 1;
                    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';

                    let logoHtml = p.logoUrl
                        ? `<img src="${escapeHtml(p.logoUrl)}" class="team-logo" alt="Logo" data-fallback="hide">`
                        : `<div class="team-logo">?</div>`;

                    tr.innerHTML = `
                        <td class="rank-cell ${rankClass}">${rank}</td>
                        <td>
                            <div class="player-info">
                                <a href="/perfil-equipo.html?teamId=${p.teamId}" class="team-name-link">
                                    ${logoHtml}
                                </a>
                                <div>
                                    <a href="/perfil-jugador.html?playerId=${p.playerId}" class="player-name-link">
                                        <div class="player-name ${isFirst ? 'leader-name' : ''}">${escapeHtml(p.name)}</div>
                                    </a>
                                    <a href="/perfil-equipo.html?teamId=${p.teamId}" class="team-name-link">
                                        <div class="team-name-sub">${escapeHtml(p.teamName)}</div>
                                    </a>
                                </div>
                            </div>
                        </td>
                        <td class="avg-number ${isFirst ? 'leader-avg' : ''}">${p[statKey].toFixed(1)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            };

            const loadLeaders = async (tournamentId) => {
                try {
                    const response = await fetch(`/api/tournaments/${tournamentId}/leaders`, {
                        credentials: 'include'
                    });
                    if (!response.ok) throw new Error('Error al obtener datos');

                    const data = await response.json();

                    const statsGrid = document.getElementById('stats-grid-container');
                    const emptyState = document.getElementById('empty-state');
                    const hasAnyData = (data.topScorers && data.topScorers.length > 0)
                        || (data.topRebounders && data.topRebounders.length > 0)
                        || (data.topAssists && data.topAssists.length > 0);

                    if (!hasAnyData) {
                        // Ningún jugador tiene estadísticas todavía en este torneo:
                        // mostramos un solo estado vacío en vez de 3 tablas cortadas.
                        statsGrid.style.display = 'none';
                        document.getElementById('empty-state-cta').href = `/torneo.html?id=${tournamentId}`;
                        emptyState.style.display = 'block';
                        return;
                    }

                    emptyState.style.display = 'none';
                    statsGrid.style.display = 'grid';
                    renderTable('ppg-body', data.topScorers, 'pointsPerGame');
                    renderTable('rpg-body', data.topRebounders, 'reboundsPerGame');
                    renderTable('apg-body', data.topAssists, 'assistsPerGame');

                } catch (err) {
                    console.error(err);
                    showToast('Error de conexión al cargar estadísticas', 'error');
                }
            };

            // Setup tournament select
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const queryId = urlParams.get('id');

                const tRes = await fetch('/api/tournaments', { credentials: 'include' });
                if (!tRes.ok) throw new Error('Error cargando torneos');
                const tournaments = await tRes.json();

                const select = document.getElementById('tournament-select');
                select.innerHTML = '<option value="" disabled selected>Selecciona un Torneo...</option>';

                tournaments.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.text = `${t.name} (${t.category})`;
                    if (queryId === t.id) opt.selected = true;
                    select.appendChild(opt);
                });

                select.addEventListener('change', (e) => {
                    if (e.target.value) {
                        loadLeaders(e.target.value);
                    }
                });

                // Auto-load if selected
                if (select.value) {
                    loadLeaders(select.value);
                }

            } catch (err) {
                 document.getElementById('error-message').innerText = 'No se pudieron cargar los torneos disponibles.';
                 document.getElementById('error-message').style.display = 'block';
            }

        });
