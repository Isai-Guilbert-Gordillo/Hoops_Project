// RETRO HOOPS · Ligas — lógica de página (carga, filtros, tarjetas, modal).
// Depende de: /js/nav.js (animateCount), /toast.js (showToast), /confirm-modal.js (showConfirm).

        let sessionUser = null;
        let allTournaments = [];

        // La fecha de inicio se guarda como día suelto (medianoche UTC). Si se
        // formatea en horario local, cualquier zona al oeste de Greenwich la pinta
        // un día antes: se escribía el 10/8 y la tarjeta mostraba 9/8. Por eso se
        // lee y se escribe siempre en UTC.
        function formatStartDate(iso) {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return 'Próximamente';
            return d.toLocaleDateString('es-ES', { timeZone: 'UTC' });
        }

        // Mismo criterio para rellenar un <input type="date"> (espera YYYY-MM-DD).
        function toDateInputValue(iso) {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '';
            return d.toISOString().slice(0, 10);
        }

        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            const id = el.dataset.tournamentId;
            if (el.dataset.action === 'edit-tournament') window.editTournament(id);
            else if (el.dataset.action === 'manage-players') window.managePlayers(id);
            else if (el.dataset.action === 'delete-tournament') window.deleteTournament(id);
            else if (el.dataset.action === 'open-tournament') window.location.href = `/torneo.html?id=${id}`;
        });

        document.addEventListener('DOMContentLoaded', async () => {
            const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            try {
                const meRes = await fetch('/api/auth/me', { credentials: 'include' });
                if (meRes.ok) {
                    const meData = await meRes.json();
                    sessionUser = meData.user || meData;
                } else {
                    sessionUser = null;
                }
            } catch (_) {
                sessionUser = null;
            }

            // El estado lo calcula el servidor a partir de los partidos jugados
            // (ver /api/tournaments). El respaldo por fecha solo actúa si la
            // respuesta viniera sin el campo.
            function getTournamentStatus(torneo) {
                if (torneo.status) return torneo.status;
                if (!torneo.startDate) return 'open';
                return new Date(torneo.startDate).getTime() > Date.now() ? 'open' : 'live';
            }

            const STATUS_LABEL = {
                open:  { text: 'INSCRIPCIONES', className: 'status-open' },
                live:  { text: 'EN CURSO',      className: 'status-live' },
                ended: { text: 'FINALIZADO',    className: 'status-ended' }
            };

            const contenedor     = document.getElementById('tournaments-container');
            const noResultsMsg   = document.getElementById('no-results-msg');
            const searchInput    = document.getElementById('search-tournaments');
            const formatSelect   = document.getElementById('filter-format');
            const statusSelect   = document.getElementById('filter-status');
            const ownerSelect    = document.getElementById('filter-owner');

            // El filtro "Mis ligas / Todas" solo aplica a quien puede tener ligas
            // propias: ORGANIZER (por defecto ve las suyas) y ADMIN (ve todas).
            const canFilterOwner = sessionUser &&
                (sessionUser.role === 'ORGANIZER' || sessionUser.role === 'ADMIN');
            if (ownerSelect && canFilterOwner) {
                ownerSelect.style.display = '';
                ownerSelect.value = sessionUser.role === 'ADMIN' ? 'all' : 'mine';
            }

            function renderTournaments(list) {
                contenedor.innerHTML = '';

                if (allTournaments.length === 0) {
                    contenedor.innerHTML = '<p style="color:var(--text-dim);font-family:var(--font-data);font-size:var(--fs-label);">No hay ligas registradas aún. ¡Crea la primera!</p>';
                    noResultsMsg.style.display = 'none';
                    return;
                }
                if (list.length === 0) {
                    noResultsMsg.style.display = 'block';
                    return;
                }
                noResultsMsg.style.display = 'none';

                list.forEach(torneo => {
                    const fechaFormateada = torneo.startDate ? formatStartDate(torneo.startDate) : 'Próximamente';
                    const status = STATUS_LABEL[getTournamentStatus(torneo)];
                    const teamsCell = torneo.maxTeams
                        ? `<span class="count-up" data-countup="${torneo.maxTeams}">0</span>`
                        : '—';
                    const organizerName = torneo.organizer
                        ? `${torneo.organizer.firstName || ''} ${torneo.organizer.lastName || ''}`.trim()
                        : '';
                    const organizerCell = escapeHtml(organizerName || 'Desconocido');

                    // Solo el organizador dueño de la liga o un ADMIN pueden gestionarla.
                    const canManage = sessionUser && (
                        sessionUser.role === 'ADMIN' ||
                        sessionUser.id === torneo.organizerId
                    );

                    let adminButtons = '';
                    if (canManage) {
                        adminButtons = `
                            <div class="lg-card__actions">
                                <div class="lg-card__btns">
                                    <button data-action="edit-tournament" data-tournament-id="${torneo.id}" class="lg-btn-secondary lg-btn-sm">Editar</button>
                                    <button data-action="manage-players" data-tournament-id="${torneo.id}" class="lg-btn-primary lg-btn-sm">Inscritos</button>
                                </div>
                                <button data-action="delete-tournament" data-tournament-id="${torneo.id}" class="lg-btn-danger">Eliminar</button>
                            </div>`;
                    }

                    const tarjeta = document.createElement('div');
                    tarjeta.className = 'lg-card rise';
                    tarjeta.innerHTML = `
                        <div class="lg-card__body" data-action="open-tournament" data-tournament-id="${torneo.id}">
                            <span class="lg-status ${status.className}">${status.text}</span>
                            <h3 class="lg-card__name">${escapeHtml(torneo.name)}</h3>
                            <dl class="lg-card__meta">
                                <div><dt>Formato</dt><dd>${escapeHtml(torneo.category)}</dd></div>
                                <div><dt>Sede</dt><dd>${escapeHtml(torneo.venue || 'Por definir')}</dd></div>
                                <div><dt>Cupos</dt><dd>${teamsCell}</dd></div>
                                <div><dt>Inicio</dt><dd>${fechaFormateada}</dd></div>
                                <div><dt>Registró</dt><dd>${organizerCell}</dd></div>
                            </dl>
                        </div>
                        ${adminButtons}
                    `;
                    contenedor.appendChild(tarjeta);
                });

                if (window.animateCount) {
                    contenedor.querySelectorAll('[data-countup]').forEach(el => window.animateCount(el));
                }

                // Reveal cards con stagger
                contenedor.querySelectorAll('.rise').forEach((el, idx) => {
                    if (rm) { el.classList.add('is-in'); return; }
                    el.style.transitionDelay = (idx * 70) + 'ms';
                    const io = new IntersectionObserver((ents, ob) => {
                        ents.forEach(en => { if (en.isIntersecting) { el.classList.add('is-in'); ob.disconnect(); } });
                    }, { threshold: 0.08 });
                    io.observe(el);
                });
            }

            function applyFilters() {
                const query  = searchInput.value.trim().toLowerCase();
                const format = formatSelect.value;
                const status = statusSelect.value;
                const owner  = (ownerSelect && canFilterOwner) ? ownerSelect.value : 'all';
                const filtered = allTournaments.filter(t => {
                    return (!query  || t.name.toLowerCase().includes(query))
                        && (!format || t.category === format)
                        && (!status || getTournamentStatus(t) === status)
                        && (owner !== 'mine' || t.organizerId === sessionUser.id);
                });
                renderTournaments(filtered);
            }

            if (searchInput) searchInput.addEventListener('input', applyFilters);
            if (formatSelect) formatSelect.addEventListener('change', applyFilters);
            if (statusSelect) statusSelect.addEventListener('change', applyFilters);
            if (ownerSelect) ownerSelect.addEventListener('change', applyFilters);

            fetch('/api/tournaments', { credentials: 'include' })
                .then(res => res.json())
                .then(tournaments => {
                    allTournaments = tournaments;
                    applyFilters(); // respeta el filtro por defecto (organizador → "mis ligas")
                })
                .catch(() => {
                    contenedor.innerHTML = '<p style="color:var(--text-dim);font-family:var(--font-data);">Error al cargar las ligas.</p>';
                });

            // Modal
            const editModal = document.getElementById('edit-tournament-modal');
            const editForm  = document.getElementById('edit-tournament-form');
            let editingTournamentId = null;

            if (editModal && editForm) {
                const closeEditModal = () => { editModal.style.display = 'none'; editingTournamentId = null; };

                document.getElementById('edit-tournament-close').addEventListener('click', closeEditModal);
                document.getElementById('edit-tournament-cancel').addEventListener('click', closeEditModal);
                editModal.addEventListener('click', e => { if (e.target === editModal) closeEditModal(); });
                document.addEventListener('keydown', e => {
                    if (e.key === 'Escape' && editModal.style.display !== 'none') closeEditModal();
                });

                editForm.addEventListener('submit', e => {
                    e.preventDefault();
                    if (!editingTournamentId) return;
                    const updated = {
                        name:      document.getElementById('edit-t-name').value,
                        category:  document.getElementById('edit-t-category').value,
                        venue:     document.getElementById('edit-t-venue').value,
                        maxTeams:  document.getElementById('edit-t-maxteams').value,
                        startDate: document.getElementById('edit-t-startdate').value
                    };
                    fetch(`/api/tournaments/${editingTournamentId}`, {
                        method: 'PUT', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updated)
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.error) throw new Error(data.error);
                        if (typeof showToast === 'function') showToast('Torneo actualizado', 'success');
                        closeEditModal();
                        setTimeout(() => window.location.reload(), 800);
                    })
                    .catch(err => {
                        if (typeof showToast === 'function') showToast(err.message, 'error');
                        else alert(err.message);
                    });
                });

                window.openEditTournamentModal = id => {
                    const torneo = allTournaments.find(t => t.id === id);
                    if (!torneo) return;
                    editingTournamentId = id;
                    document.getElementById('edit-t-name').value  = torneo.name  || '';
                    document.getElementById('edit-t-venue').value = torneo.venue || '';

                    // El formato pasó de texto libre a lista cerrada. Una liga
                    // creada antes puede traer un valor que no está entre las
                    // opciones ("5vs5"): se añade como opción propia para que el
                    // <select> no caiga en la primera y reescriba el dato solo.
                    const categorySelect = document.getElementById('edit-t-category');
                    const currentCategory = torneo.category || '';
                    categorySelect.querySelectorAll('option[data-legacy]').forEach(o => o.remove());

                    const isKnownCategory = [...categorySelect.options]
                        .some(o => o.value === currentCategory);

                    if (currentCategory && !isKnownCategory) {
                        const legacyOption = document.createElement('option');
                        legacyOption.value = currentCategory;
                        legacyOption.textContent = `${currentCategory} (formato antiguo)`;
                        legacyOption.dataset.legacy = 'true';
                        categorySelect.insertBefore(legacyOption, categorySelect.firstChild);
                    }

                    categorySelect.value = currentCategory;

                    // Cupos y fecha eran los dos datos que no se podían corregir:
                    // equivocarse al crear la liga obligaba a borrarla entera.
                    const maxTeamsInput = document.getElementById('edit-t-maxteams');
                    const enrolled = torneo.enrolledTeams || 0;
                    maxTeamsInput.value = torneo.maxTeams || '';
                    maxTeamsInput.min = Math.max(2, enrolled);

                    const hint = document.getElementById('edit-t-maxteams-hint');
                    if (hint) {
                        hint.textContent = enrolled > 0
                            ? `Ya hay ${enrolled} franquicia(s) inscritas: no puedes bajar de ${enrolled}.`
                            : 'Entre 2 y 16 franquicias.';
                    }

                    document.getElementById('edit-t-startdate').value = torneo.startDate
                        ? toDateInputValue(torneo.startDate)
                        : '';

                    editModal.style.display = 'flex';
                };
            }
        });

        window.editTournament = function(id) {
            if (typeof window.openEditTournamentModal === 'function') window.openEditTournamentModal(id);
        };

        window.deleteTournament = async function(id) {
            if (await showConfirm("¿Estás seguro de ELIMINAR este torneo? Esta acción es irreversible.", { title: 'Eliminar Torneo', confirmText: 'Eliminar' })) {
                fetch(`/api/tournaments/${id}`, { method: 'DELETE', credentials: 'include' })
                .then(res => res.json())
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    if (typeof showToast === 'function') showToast('Torneo eliminado', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                })
                .catch(err => {
                    if (typeof showToast === 'function') showToast(err.message, 'error');
                    else alert(err.message);
                });
            }
        };

        window.managePlayers = function(id) {
            window.location.href = `/gestionar-inscritos.html?tournamentId=${id}`;
        };
