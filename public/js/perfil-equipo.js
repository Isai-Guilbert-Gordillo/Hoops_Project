// RETRO HOOPS · perfil-equipo — lógica de página (extraída del <script> inline).

        document.addEventListener('DOMContentLoaded', async () => {
            // Manejo de UI Navbar
            const token = localStorage.getItem('kphoops_token');
            const userName = localStorage.getItem('kphoops_user_name');
            const btnLogin = document.getElementById('btn-login');
            const btnRegister = document.getElementById('btn-register');
            const btnLogout = document.getElementById('btn-logout');
            const greeting = document.getElementById('user-greeting');

            if (token && userName) {
                btnLogin.style.display = 'none';
                btnRegister.style.display = 'none';
                greeting.innerText = 'Hola, ' + capitalizeName(userName);
                greeting.style.display = 'inline-block';
                btnLogout.style.display = 'inline-block';
            }

            btnLogout.addEventListener('click', () => {
                localStorage.removeItem('kphoops_token');
                localStorage.removeItem('kphoops_user_name');
                window.location.reload();
            });

            const urlParams = new URLSearchParams(window.location.search);
            const teamId = urlParams.get('teamId');

            if (!teamId) {
                const msg = document.getElementById('error-message');
                msg.innerText = 'No se especificó ningún equipo.';
                msg.style.display = 'block';
                return;
            }

            try {
                const res = await fetch(`/api/teams/${teamId}`);
                if (!res.ok) throw new Error('Equipo no encontrado o error del servidor.');
                
                const team = await res.json();
                
                // Mostrar contenedor
                document.getElementById('content').style.display = 'block';

                // -------------- SECTION 1: HEADER --------------
                document.getElementById('team-name').innerText = team.name;

                let logoHtml = team.logoUrl 
                    ? `<img src="${team.logoUrl}" class="team-logo-large" alt="Logo" onerror="this.outerHTML='<div class=\\'team-logo-large\\'>?</div>';">`
                    : `<div class="team-logo-large">${team.name.charAt(0).toUpperCase()}</div>`;
                document.getElementById('team-logo-container').innerHTML = logoHtml;

                // Calcular récord con partidos finalizados
                let wins = 0;
                let losses = 0;
                
                const allMatches = [...(team.homeMatches || []), ...(team.awayMatches || [])];
                const finishedMatches = allMatches.filter(m => m.status === 'FINISHED' || m.status === 'PLAYED');

                finishedMatches.forEach(m => {
                    const isHome = m.homeTeamId === teamId;
                    if (isHome) {
                        if (m.homeScore > m.awayScore) wins++;
                        else if (m.homeScore < m.awayScore) losses++;
                    } else {
                        if (m.awayScore > m.homeScore) wins++;
                        else if (m.awayScore < m.homeScore) losses++;
                    }
                });

                document.getElementById('team-record').innerText = `Récord: ${wins} - ${losses}`;

                // -------------- SECTION 2: ROSTER --------------
                const rosterBody = document.getElementById('roster-body');
                if (team.players && team.players.length > 0) {
                    team.players.forEach(p => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="color: var(--cyan-accent); font-weight: bold;">${p.jerseyNumber}</td>
                            <td style="font-weight: 600;">
                                <a href="perfil-jugador.html?playerId=${p.id}" style="color: inherit; text-decoration: none; cursor: pointer;" onmouseover="this.style.color='var(--cyan-accent)'" onmouseout="this.style.color='inherit'">
                                    ${p.name}
                                </a>
                            </td>
                            <td style="color: var(--text-muted);">${p.position}</td>
                            <td><span class="badge badge-cyan" style="margin-bottom: 0;">Activo</span></td>
                        `;
                        rosterBody.appendChild(tr);
                    });
                } else {
                    rosterBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Sin jugadores registrados</td></tr>`;
                }

                // -------------- SECTION 3: MATCH HISTORY --------------
                const historyContainer = document.getElementById('match-history');
                
                if (allMatches.length > 0) {
                    // Ordenar de más reciente a más antiguo
                    allMatches.sort((a, b) => new Date(b.matchDate) - new Date(a.matchDate));

                    allMatches.forEach(m => {
                        // Determinar oponente y marcador
                        const isHome = m.homeTeamId === teamId;
                        const opponent = isHome ? m.awayTeam : m.homeTeam;
                        // Si por algún error no trae awayTeam/homeTeam en el join, protegerlo
                        const oppName = opponent ? opponent.name : 'Desconocido';
                        const oppId = opponent ? opponent.id : null;
                        
                        const homeScore = m.homeScore;
                        const awayScore = m.awayScore;
                        
                        let resultBadge = '';
                        let scoreDisp = '';
                        
                        const mDate = new Date(m.matchDate).toLocaleDateString('es-ES', { 
                            year: 'numeric', month: 'short', day: 'numeric' 
                        });
                        const mTime = new Date(m.matchDate).toLocaleTimeString('es-ES', { 
                            hour: '2-digit', minute: '2-digit' 
                        });

                        if (m.status === 'FINISHED' || m.status === 'PLAYED') {
                            const won = isHome ? (homeScore > awayScore) : (awayScore > homeScore);
                            scoreDisp = `${homeScore} - ${awayScore}`;
                            if (won) {
                                resultBadge = `<span class="badge" style="background: rgba(76, 175, 80, 0.15); color: #4CAF50; border: 1px solid #4CAF50; margin-bottom: 0;">W</span>`;
                            } else {
                                resultBadge = `<span class="badge" style="background: rgba(255, 106, 0, 0.1); color: var(--orange); border: 1px solid var(--orange); margin-bottom: 0;">L</span>`;
                            }
                        } else {
                            scoreDisp = '-';
                            resultBadge = `<span style="color: var(--text-muted); font-size: 0.8rem;">Próximamente</span>`;
                        }

                        const matchHtml = `
                            <div class="match-card">
                                <div class="match-info">
                                    <div class="match-meta">
                                        <span style="color: var(--cyan-accent); font-family: 'Press Start 2P', cursive; font-size: 0.5rem; margin-right: 0.5rem;">${m.tournament ? m.tournament.name : 'Torneo'}</span>
                                        ${mDate} a las ${mTime}
                                    </div>
                                    <div class="match-teams">
                                        ${isHome ? `<span style="color: var(--text-main);">${team.name}</span>` : `<a href="/perfil-equipo.html?teamId=${oppId}" style="text-decoration: none; color: var(--text-muted); transition: color 0.3s;" onmouseover="this.style.color='var(--orange)'" onmouseout="this.style.color='var(--text-muted)'">${oppName}</a>`}
                                        <span class="match-vs">VS</span>
                                        ${!isHome ? `<span style="color: var(--text-main);">${team.name}</span>` : `<a href="/perfil-equipo.html?teamId=${oppId}" style="text-decoration: none; color: var(--text-muted); transition: color 0.3s;" onmouseover="this.style.color='var(--orange)'" onmouseout="this.style.color='var(--text-muted)'">${oppName}</a>`}
                                    </div>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                                    ${resultBadge}
                                    <div class="match-score">${scoreDisp}</div>
                                </div>
                            </div>
                        `;
                        historyContainer.innerHTML += matchHtml;
                    });
                } else {
                    historyContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem; border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px;">Este equipo aún no tiene partidos programados.</div>`;
                }


            } catch (err) {
                console.error(err);
                const msg = document.getElementById('error-message');
                msg.innerText = 'Error al cargar el perfil del equipo.';
                msg.style.display = 'block';
            }
        });
