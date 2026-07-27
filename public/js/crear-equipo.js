// RETRO HOOPS · crear-equipo — lógica de página (extraída del <script> inline).

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="delete-player-row"]');
            if (btn) window.deletePlayer(parseInt(btn.dataset.index, 10));
        });

        document.addEventListener('DOMContentLoaded', async () => {
            const token = localStorage.getItem('kphoops_token');

            // Redirigir si no está autenticado
            if (!token) {
                showToast("Debes iniciar sesión para crear una franquicia.", 'error');
                setTimeout(() => window.location.href = 'login.html', 1500);
                return;
            }

            // ========== SETUP DE NAVEGACIÓN ==========
            const btnLogin = document.getElementById('btn-login');
            const btnRegister = document.getElementById('btn-register');
            const btnLogout = document.getElementById('btn-logout');
            const greetingEl = document.getElementById('user-greeting');
            const userName = localStorage.getItem('kphoops_user_name') || 'Jugador';

            btnLogin.style.display = 'none';
            btnRegister.style.display = 'none';
            greetingEl.textContent = 'Bienvenido, ' + capitalizeName(userName);
            greetingEl.style.display = 'inline-block';
            btnLogout.style.display = 'inline-block';

            btnLogout.addEventListener('click', () => {
                localStorage.removeItem('kphoops_token');
                localStorage.removeItem('kphoops_user_name');
                showToast('Sesión cerrada', 'success');
                setTimeout(() => window.location.href = '/', 1000);
            });

            // ========== VERIFICAR LÍMITE DE FRANQUICIAS (los ADMIN no tienen límite) ==========
            try {
                const meRes = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const role = meRes.ok ? (await meRes.json())?.role : null;

                // Límite por rol (mismo criterio que el backend):
                //  capitán normal = 1 · ORGANIZER = 64 (arma sus ligas) · ADMIN = sin límite
                if (role !== 'ADMIN') {
                    const limit = role === 'ORGANIZER' ? 64 : 1;
                    const myTeamsRes = await fetch('/api/users/me/teams', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (myTeamsRes.ok) {
                        const myTeams = await myTeamsRes.json();
                        if (myTeams.length >= limit) {
                            const msg = document.querySelector('#limit-reached p');
                            if (msg) {
                                msg.innerHTML = role === 'ORGANIZER'
                                    ? `Alcanzaste el límite de <strong style="color: var(--text-main);">${limit} franquicias como organizador</strong>.`
                                    : `Ya tienes una franquicia registrada. El plan actual permite un máximo de <strong style="color: var(--text-main);">${limit} franquicia por capitán</strong>.`;
                            }
                            document.getElementById('createTeamForm').style.display = 'none';
                            document.getElementById('playersSection').style.display = 'none';
                            document.getElementById('limit-reached').style.display = 'block';
                            return;
                        }
                    }
                }
            } catch (e) {
                console.error('Error verificando límite:', e);
            }

            // ========== VARIABLES DE ESTADO ==========
            let currentTeamId = null;
            let playersToAdd = []; // Array de jugadores pendientes de guardar

            const createTeamForm = document.getElementById('createTeamForm');
            const playersSection = document.getElementById('playersSection');
            const btnAddPlayer = document.getElementById('btnAddPlayer');
            const btnSaveTeam = document.getElementById('btnSaveTeam');
            const btnCancel = document.getElementById('btnCancel');
            const playersTableBody = document.getElementById('playersTableBody');

            createTeamForm.style.display = 'block';

            // ========== VISTA PREVIA DEL LOGO ELEGIDO DESDE EL DISPOSITIVO ==========
            const logoInput = document.getElementById('logoFile');
            const logoPreview = document.getElementById('logoPreview');
            logoInput.addEventListener('change', () => {
                const file = logoInput.files[0];
                if (!file) {
                    logoPreview.style.display = 'none';
                    logoPreview.innerHTML = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    logoPreview.innerHTML = `<img src="${ev.target.result}" alt="Vista previa del logo">`;
                    logoPreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            });

            // ========== VISTA PREVIA DE LA FOTO DEL JUGADOR ==========
            const playerPhotoInput = document.getElementById('playerPhoto');
            const playerPhotoPreview = document.getElementById('playerPhotoPreview');
            playerPhotoInput.addEventListener('change', () => {
                const file = playerPhotoInput.files[0];
                if (!file) {
                    playerPhotoPreview.style.display = 'none';
                    playerPhotoPreview.innerHTML = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    playerPhotoPreview.innerHTML = `<img src="${ev.target.result}" alt="Vista previa">`;
                    playerPhotoPreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            });

            // ========== CREAR FRANQUICIA ==========
            createTeamForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const formData = new FormData();
                formData.append('name', document.getElementById('name').value);
                if (logoInput.files[0]) {
                    formData.append('logo', logoInput.files[0]);
                }

                try {
                    const response = await fetch('/api/teams', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        showToast(data.error || 'Error al crear la franquicia', 'error');
                        return;
                    }

                    // Éxito: guardar ID del equipo
                    currentTeamId = data.id;
                    playersToAdd = [];
                    
                    showToast('¡Franquicia creada! Ahora agrega los jugadores.', 'success');
                    
                    // Mostrar sección de jugadores
                    createTeamForm.style.display = 'none';
                    playersSection.style.display = 'block';
                    renderPlayersTable();

                } catch (error) {
                    showToast('Error de conexión. Intenta de nuevo.', 'error');
                    console.error('Error:', error);
                }
            });

            // ========== AGREGAR JUGADOR A LA LISTA (local) ==========
            btnAddPlayer.addEventListener('click', () => {
                const playerName = toTitleCase(document.getElementById('playerName').value.trim());
                const playerNumber = parseInt(document.getElementById('playerNumber').value);
                const playerPosition = document.getElementById('playerPosition').value;

                // Validación
                if (!playerName || !playerNumber || !playerPosition) {
                    showToast('Completa todos los campos del jugador', 'error');
                    return;
                }

                // Verificar que no hay número duplicado
                if (playersToAdd.some(p => p.jerseyNumber === playerNumber)) {
                    showToast('Ya existe un jugador con ese dorsal', 'error');
                    return;
                }

                const photoFile = playerPhotoInput.files[0] || null;

                // Agregar a la lista (la foto se guarda como File; solo se sube
                // al backend cuando se guarda todo el equipo al final)
                playersToAdd.push({
                    name: playerName,
                    jerseyNumber: playerNumber,
                    position: playerPosition,
                    photoFile: photoFile,
                    photoPreviewUrl: photoFile ? URL.createObjectURL(photoFile) : null
                });

                // Limpiar formulario
                document.getElementById('playerName').value = '';
                document.getElementById('playerNumber').value = '';
                document.getElementById('playerPosition').value = '';
                playerPhotoInput.value = '';
                playerPhotoPreview.style.display = 'none';
                playerPhotoPreview.innerHTML = '';
                document.getElementById('playerName').focus();

                // Actualizar tabla
                renderPlayersTable();
                showToast('Jugador agregado a la lista', 'success');
            });

            // ========== RENDERIZAR TABLA DE JUGADORES ==========
            function renderPlayersTable() {
                if (playersToAdd.length === 0) {
                    playersTableBody.innerHTML = '<tr><td colspan="5" class="empty-players">Sin jugadores agregados aún</td></tr>';
                    return;
                }

                playersTableBody.innerHTML = playersToAdd.map((player, index) => {
                    const initial = escapeHtml((player.name.trim().charAt(0) || '?').toUpperCase());
                    const photoHtml = player.photoPreviewUrl
                        ? `<div class="player-row-photo"><img src="${escapeHtml(player.photoPreviewUrl)}" alt="${escapeHtml(player.name)}"></div>`
                        : `<div class="player-row-photo player-avatar-fallback">${initial}</div>`;
                    return `
                    <tr>
                        <td>${index + 1}</td>
                        <td><div class="player-cell">${photoHtml}<span>${escapeHtml(player.name)}</span></div></td>
                        <td>${escapeHtml(player.jerseyNumber)}</td>
                        <td>${escapeHtml(player.position)}</td>
                        <td>
                            <button type="button" class="btn-delete" title="Eliminar jugador" aria-label="Eliminar jugador" data-action="delete-player-row" data-index="${index}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                        </td>
                    </tr>
                `;
                }).join('');
            }

            // ========== ELIMINAR JUGADOR DE LA LISTA ==========
            window.deletePlayer = (index) => {
                const [removed] = playersToAdd.splice(index, 1);
                if (removed && removed.photoPreviewUrl) {
                    URL.revokeObjectURL(removed.photoPreviewUrl);
                }
                renderPlayersTable();
                showToast('Jugador eliminado', 'success');
            };

            // ========== GUARDAR FRANQUICIA + TODOS LOS JUGADORES ==========
            btnSaveTeam.addEventListener('click', async () => {
                if (playersToAdd.length === 0) {
                    showToast('Agrega al menos un jugador', 'error');
                    return;
                }

                const savingMsg = document.getElementById('savingMessage');
                savingMsg.className = '';
                savingMsg.textContent = 'Guardando jugadores...';

                try {
                    // Guardar cada jugador secuencialmente (FormData para poder
                    // incluir la foto, igual que en la página de la franquicia)
                    for (const player of playersToAdd) {
                        const playerFormData = new FormData();
                        playerFormData.append('name', player.name);
                        playerFormData.append('jerseyNumber', player.jerseyNumber);
                        playerFormData.append('position', player.position);
                        if (player.photoFile) {
                            playerFormData.append('photo', player.photoFile);
                        }

                        const response = await fetch(`/api/teams/${currentTeamId}/players`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: playerFormData
                        });

                        if (!response.ok) {
                            throw new Error(`Error al guardar jugador: ${player.name}`);
                        }
                    }

                    // Éxito total
                    savingMsg.className = 'success-msg';
                    savingMsg.textContent = '✅ ¡Franquicia y jugadores guardados! Ahora inscríbela en un torneo...';
                    showToast('¡Todo guardado!', 'success');

                    setTimeout(() => {
                        window.location.href = `/equipo.html?id=${currentTeamId}`;
                    }, 2000);

                } catch (error) {
                    savingMsg.className = 'error-msg';
                    savingMsg.textContent = '❌ ' + error.message;
                    showToast('Error al guardar jugadores', 'error');
                    console.error('Error:', error);
                }
            });

            // ========== CANCELAR ==========
            btnCancel.addEventListener('click', async () => {
                if (await showConfirm('¿Descartar equipo y jugadores?', { title: 'Cancelar Creación', confirmText: 'Descartar' })) {
                    window.location.href = '/franquicias.html';
                }
            });
        });

        // Función auxiliar
        function capitalizeName(name) {
            return name.charAt(0).toUpperCase() + name.slice(1);
        }

        // Normaliza nombres a "Title Case" (Tyler Hero), igual que las sedes y
        // equipos, para no guardar lo que el usuario escribió tal cual (TYLER HERO).
        const TITLE_CASE_MINOR_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'da', 'do']);
        function toTitleCase(input) {
            if (typeof input !== 'string') return input;
            const cleaned = input.trim().replace(/\s+/g, ' ');
            if (!cleaned) return cleaned;
            return cleaned
                .toLowerCase()
                .split(' ')
                .map((word, i) => (i > 0 && TITLE_CASE_MINOR_WORDS.has(word))
                    ? word
                    : word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
