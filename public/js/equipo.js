// RETRO HOOPS · equipo — lógica de página (extraída del <script> inline).

        // Funciones Utilitarias
        function parseJwt(token) {
            try {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                return JSON.parse(jsonPayload);
            } catch (e) {
                return null;
            }
        }

        // Fallbacks de imagen rota y acciones dinámicas (roster/inscripción), sin
        // handlers inline: 'error' no burbujea, se escucha en fase de captura.
        document.addEventListener('error', (e) => {
            const img = e.target;
            if (img.tagName !== 'IMG') return;
            if (img.dataset.fallback === 'team-logo') {
                img.outerHTML = '?';
            } else if (img.dataset.fallback === 'player-photo') {
                img.parentElement.innerHTML = '?';
            }
        }, true);

        document.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('[data-action="delete-player"]');
            if (deleteBtn) {
                deletePlayer(deleteBtn.dataset.playerId, deleteBtn.dataset.playerName);
                return;
            }
            const enrollBtn = e.target.closest('[data-action="enroll"]');
            if (enrollBtn && window.enrollInTournament) {
                window.enrollInTournament(enrollBtn.dataset.tournamentId);
            }
        });

        document.addEventListener('DOMContentLoaded', async () => {
            // Navbar session checking
            const token = localStorage.getItem('kphoops_token');
            const userName = localStorage.getItem('kphoops_user_name');
            const btnLogin = document.getElementById('btn-login');
            const btnRegister = document.getElementById('btn-register');
            const userGreeting = document.getElementById('user-greeting');
            const btnLogout = document.getElementById('btn-logout');

            let userId = null;

            if (token && userName) {
                btnLogin.style.display = 'none';
                btnRegister.style.display = 'none';
                userGreeting.style.display = 'block';
                userGreeting.textContent = `Hola, ${capitalizeName(userName)}`;
                btnLogout.style.display = 'inline-block';

                const decoded = parseJwt(token);
                if (decoded) userId = decoded.id; // Extraemos el ID del usuario del JWT
            }

            btnLogout.addEventListener('click', () => {
                localStorage.removeItem('kphoops_token');
                localStorage.removeItem('kphoops_user_name');
                window.location.href = 'index.html';
            });

            // Extraer ID de equipo de la URL
            const urlParams = new URLSearchParams(window.location.search);
            const teamId = urlParams.get('id');

            if (!teamId) {
                document.getElementById('error-message').innerText = 'No se proporcionó un identificador de equipo.';
                document.getElementById('error-message').style.display = 'block';
                return;
            }

            // Fetch team data
            try {
                const response = await fetch(`/api/teams/${teamId}`);
                if (!response.ok) throw new Error('Equipo no encontrado o error en servidor');
                const team = await response.json();

                // Llenar header del equipo
                document.getElementById('team-name').innerText = team.name;
                document.getElementById('team-captain').innerText = team.captain ? capitalizeName(`${team.captain.firstName} ${team.captain.lastName}`) : 'Desconocido';
                document.getElementById('team-date').innerText = new Date(team.createdAt).toLocaleDateString('es-ES');

                const logoContainer = document.getElementById('team-logo');
                if (team.logoUrl) {
                    logoContainer.innerHTML = `<img src="${escapeHtml(team.logoUrl)}" alt="Logo" data-fallback="team-logo">`;
                } else {
                    logoContainer.innerText = '?';
                }

                document.getElementById('team-hero').style.display = 'flex';
                document.getElementById('roster-section').style.display = 'block';

                // El capitán puede además eliminar jugadores de su propio roster
                const isCaptain = !!(userId && team.captainId === userId);
                if (isCaptain) {
                    document.getElementById('roster-actions-header').style.display = 'table-cell';
                }

                // Llenar tabla Roster
                const rosterBody = document.getElementById('roster-body');
                if (team.players && team.players.length > 0) {
                    // Ordenar por dorsal opcionalmente
                    team.players.sort((a, b) => a.jerseyNumber - b.jerseyNumber);

                    team.players.forEach(player => {
                        const tr = document.createElement('tr');
                        const photoHtml = player.photoUrl
                            ? `<div class="player-photo"><img src="${escapeHtml(player.photoUrl)}" alt="${escapeHtml(player.name)}" data-fallback="player-photo"></div>`
                            : `<div class="player-photo">?</div>`;
                        tr.innerHTML = `
                            <td class="jersey">#${escapeHtml(player.jerseyNumber)}</td>
                            <td><div class="player-cell">${photoHtml}<span>${escapeHtml(player.name)}</span></div></td>
                            <td>${escapeHtml(player.position)}</td>
                            ${isCaptain ? `<td><button class="btn btn-danger btn-sm" data-action="delete-player" data-player-id="${player.id}" data-player-name="${escapeHtml(player.name)}"><span class="btn-content">Eliminar</span></button></td>` : ''}
                        `;
                        rosterBody.appendChild(tr);
                    });
                } else {
                    rosterBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Sin jugadores registrados.</td></tr>`;
                }

                // Controlar Acceso: Si el usuario es el capitán, mostramos formulario para añadir
                if (isCaptain) {
                    document.getElementById('add-player-section').style.display = 'block';
                    document.getElementById('enroll-section').style.display = 'block';
                    await loadTournamentEnrollment(team, token);
                }

            } catch (error) {
                document.getElementById('error-message').innerText = error.message;
                document.getElementById('error-message').style.display = 'block';
            }

            // Carga torneos ya inscritos + disponibles, y permite al capitán
            // inscribir su equipo sin salir de la página del equipo.
            async function loadTournamentEnrollment(team, token) {
                const enrolledWrap = document.getElementById('enrolled-tournaments-wrap');
                const enrolledList = document.getElementById('enrolled-tournaments-list');
                const availableList = document.getElementById('available-tournaments-list');
                const enrollMsg = document.getElementById('enroll-msg');

                const enrolledTournamentIds = new Set((team.enrollments || []).map(e => e.tournamentId));

                if (team.enrollments && team.enrollments.length > 0) {
                    enrolledWrap.style.display = 'block';
                    enrolledList.innerHTML = team.enrollments.map(e => `
                        <div class="card tournament-enrolled-badge">
                            <h3>${escapeHtml(e.tournament.name)}</h3>
                            <p>${escapeHtml(e.tournament.category)} · ${escapeHtml(e.tournament.venue || 'Sede por definir')}</p>
                        </div>
                    `).join('');
                }

                try {
                    const res = await fetch('/api/tournaments');
                    if (!res.ok) throw new Error('No se pudieron cargar los torneos disponibles');
                    const tournaments = await res.json();

                    const available = tournaments.filter(t => !enrolledTournamentIds.has(t.id));

                    if (available.length === 0) {
                        availableList.innerHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1;">No hay torneos disponibles para inscribirte por ahora.</p>';
                        return;
                    }

                    availableList.innerHTML = available.map(t => `
                        <div class="card tournament-enroll-card">
                            <h3>${escapeHtml(t.name)}</h3>
                            <p>${escapeHtml(t.category)} · ${escapeHtml(t.venue || 'Sede por definir')}</p>
                            <p>Organiza: ${t.organizer ? escapeHtml(capitalizeName(`${t.organizer.firstName} ${t.organizer.lastName}`)) : '—'}</p>
                            <button type="button" class="btn-submit" data-action="enroll" data-tournament-id="${t.id}">Inscribirme</button>
                        </div>
                    `).join('');
                } catch (err) {
                    availableList.innerHTML = `<p style="color: var(--orange); grid-column: 1 / -1;">${err.message}</p>`;
                }

                window.enrollInTournament = async (tournamentId) => {
                    enrollMsg.style.color = '';
                    enrollMsg.innerText = '';

                    try {
                        const res = await fetch(`/api/tournaments/${tournamentId}/enroll`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ teamId: team.id })
                        });
                        const data = await res.json();

                        if (!res.ok) {
                            enrollMsg.style.color = 'var(--orange)';
                            enrollMsg.innerText = data.error || 'No se pudo completar la inscripción';
                            return;
                        }

                        showToast('¡Inscrito al torneo exitosamente!', 'success');
                        enrollMsg.style.color = 'var(--cyan-accent)';
                        enrollMsg.innerText = '¡Inscripción exitosa!';
                        setTimeout(() => window.location.reload(), 1200);
                    } catch (err) {
                        enrollMsg.style.color = 'var(--orange)';
                        enrollMsg.innerText = 'Error de conexión al inscribir el equipo.';
                    }
                };
            }

            // Vista previa de la foto elegida desde el dispositivo
            const photoInput = document.getElementById('playerPhoto');
            const photoPreview = document.getElementById('playerPhotoPreview');
            photoInput.addEventListener('change', () => {
                const file = photoInput.files[0];
                if (!file) {
                    photoPreview.style.display = 'none';
                    photoPreview.innerHTML = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    photoPreview.innerHTML = `<img src="${ev.target.result}" alt="Vista previa">`;
                    photoPreview.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            });

            // Manejo de Agregar Jugador (Solo disponible si está visible)
            const addForm = document.getElementById('addPlayerForm');
            addForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const msgBox = document.getElementById('form-msg');
                msgBox.innerText = '';

                // FormData en vez de JSON: permite adjuntar el archivo de foto
                // (opcional) subido desde el dispositivo del usuario.
                const formData = new FormData();
                formData.append('name', document.getElementById('playerName').value);
                formData.append('jerseyNumber', document.getElementById('jerseyNumber').value);
                formData.append('position', document.getElementById('position').value);
                if (photoInput.files[0]) {
                    formData.append('photo', photoInput.files[0]);
                }

                try {
                    const res = await fetch(`/api/teams/${teamId}/players`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    const data = await res.json();

                    if (!res.ok) {
                        msgBox.style.color = 'var(--orange)';
                        msgBox.innerText = data.error || 'Error al agregar jugador';
                    } else {
                        msgBox.style.color = 'var(--cyan-accent)';
                        msgBox.innerText = '¡Jugador añadido con éxito!';
                        addForm.reset();
                        photoPreview.style.display = 'none';
                        photoPreview.innerHTML = '';
                        // Recargar tras 1.5s
                        setTimeout(() => window.location.reload(), 1500);
                    }
                } catch (err) {
                    msgBox.style.color = 'var(--orange)';
                    msgBox.innerText = 'Error de conexión';
                }
            });

        });

        // --- Ventana flotante de confirmación para eliminar un jugador ---
        const deletePlayerModal = document.getElementById('delete-player-modal');
        let playerIdToDelete = null;

        const closeDeletePlayerModal = () => { deletePlayerModal.style.display = 'none'; playerIdToDelete = null; };

        document.getElementById('delete-player-close').addEventListener('click', closeDeletePlayerModal);
        document.getElementById('delete-player-cancel').addEventListener('click', closeDeletePlayerModal);
        deletePlayerModal.addEventListener('click', (e) => { if (e.target === deletePlayerModal) closeDeletePlayerModal(); });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && deletePlayerModal.style.display !== 'none') closeDeletePlayerModal();
        });

        document.getElementById('delete-player-confirm').addEventListener('click', () => {
            if (!playerIdToDelete) return;

            const token = localStorage.getItem('kphoops_token');
            fetch(`/api/players/${playerIdToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json().then(data => ({ status: res.status, data })))
            .then(({ status, data }) => {
                if (status !== 200) throw new Error(data.error || 'Error al eliminar el jugador');
                showToast('Jugador eliminado', 'success');
                closeDeletePlayerModal();
                setTimeout(() => window.location.reload(), 800);
            })
            .catch(err => showToast(err.message, 'error'));
        });

        function deletePlayer(playerId, playerName) {
            playerIdToDelete = playerId;
            document.getElementById('delete-player-name').textContent = playerName || 'este jugador';
            deletePlayerModal.style.display = 'flex';
        }
