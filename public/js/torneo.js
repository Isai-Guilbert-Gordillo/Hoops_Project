// RETRO HOOPS · torneo — lógica de página (concatenación de los 4 <script> inline en orden).

// ---- bloque inline #1 ----
        // Title case para mostrar (misma lógica que el backend): respeta conectores
        // menores en minúscula. Red de seguridad para datos guardados en minúsculas.
        window.toTitleCaseDisplay = function (input) {
            if (typeof input !== 'string') return input || '';
            const minor = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'a', 'da', 'do']);
            const cleaned = input.trim().replace(/\s+/g, ' ');
            if (!cleaned) return cleaned;
            return cleaned.toLowerCase().split(' ')
                .map((w, i) => (i > 0 && minor.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        };

// ---- listeners delegados (reemplazan onclick/onerror inline, para poder
// activar la CSP estricta de helmet) ----
document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.dataset.fallback === 'placeholder') {
        img.outerHTML = `<span class="${img.dataset.fallbackClass}">${img.dataset.fallbackText}</span>`;
    } else if (img.dataset.fallback === 'hide-clear') {
        img.src = '';
        img.style.display = 'none';
    } else if (img.dataset.fallback === 'hide-sibling') {
        img.style.display = 'none';
        if (img.nextElementSibling) img.nextElementSibling.style.display = 'flex';
    }
}, true);

document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'navigate') {
        window.location.href = el.dataset.href;
    } else if (action === 'open-stats') {
        window.openStatsModal(el.dataset.matchId);
    } else if (action === 'delete-match') {
        window.deleteMatch(el.dataset.matchId);
    } else if (action === 'edit-match') {
        // El botón vive dentro de tarjetas que ya tienen su propio click (abrir
        // stats / iniciar mesa): sin esto, editar dispararía también esa acción.
        e.stopPropagation();
        if (window.startEditMatch) window.startEditMatch(el.dataset.matchId);
    }
});

// ---- bloque inline #2 ----
        document.querySelectorAll('.side-tab').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                document.querySelectorAll('.side-tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                tabBtn.classList.add('active');
                const panel = document.querySelector(`.tab-panel[data-panel="${tabBtn.dataset.tab}"]`);
                if (panel) panel.classList.add('active');
            });
        });

// ---- bloque inline #3 ----
        (function initDateTimePicker() {
            const trigger = document.getElementById('dt-trigger');
            if (!trigger) return;

            const triggerText = document.getElementById('dt-trigger-text');
            const popover = document.getElementById('dt-popover');
            const hiddenInput = document.getElementById('matchDate');
            const monthLabel = document.getElementById('dt-month-label');
            const daysGrid = document.getElementById('dt-days');
            const prevBtn = document.getElementById('dt-prev');
            const nextBtn = document.getElementById('dt-next');
            const hourSel = document.getElementById('dt-hour');
            const minSel = document.getElementById('dt-min');
            const confirmBtn = document.getElementById('dt-confirm');
            const clearBtn = document.getElementById('dt-clear');

            const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const pad = n => String(n).padStart(2, '0');

            const now = new Date();
            let viewYear = now.getFullYear();
            let viewMonth = now.getMonth();
            let selectedDate = null; // Date a nivel de día
            // Al agendar un partido nuevo no tiene sentido elegir un día pasado,
            // pero al REPROGRAMAR uno sí: puede que la fecha equivocada que se
            // quiere corregir ya haya quedado atrás.
            let allowPast = false;

            // Poblar selects de hora (00–23) y minutos (cada 5)
            for (let h = 0; h < 24; h++) {
                const o = document.createElement('option');
                o.value = pad(h); o.textContent = pad(h);
                hourSel.appendChild(o);
            }
            for (let m = 0; m < 60; m += 5) {
                const o = document.createElement('option');
                o.value = pad(m); o.textContent = pad(m);
                minSel.appendChild(o);
            }
            hourSel.value = '12';
            minSel.value = '00';

            function startOfToday() {
                const t = new Date(); t.setHours(0, 0, 0, 0); return t;
            }

            function renderCalendar() {
                monthLabel.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
                daysGrid.innerHTML = '';
                const firstDay = new Date(viewYear, viewMonth, 1);
                const offset = (firstDay.getDay() + 6) % 7; // lunes primero
                const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
                const today = startOfToday();

                for (let i = 0; i < offset; i++) {
                    const empty = document.createElement('span');
                    empty.className = 'dt-day dt-day-empty';
                    daysGrid.appendChild(empty);
                }
                for (let d = 1; d <= daysInMonth; d++) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'dt-day';
                    btn.textContent = d;
                    const cellDate = new Date(viewYear, viewMonth, d);
                    if (!allowPast && cellDate < today) btn.disabled = true; // no agendar en el pasado
                    if (cellDate.getTime() === today.getTime()) btn.classList.add('today');
                    if (selectedDate &&
                        selectedDate.getFullYear() === viewYear &&
                        selectedDate.getMonth() === viewMonth &&
                        selectedDate.getDate() === d) {
                        btn.classList.add('selected');
                    }
                    btn.addEventListener('click', (e) => {
                        // Evita que el clic burbujee al handler de "clic fuera": como
                        // renderCalendar() recrea este botón, su e.target queda huérfano
                        // y el popover se cerraría por error.
                        e.stopPropagation();
                        selectedDate = new Date(viewYear, viewMonth, d);
                        renderCalendar();
                        updateConfirmState();
                    });
                    daysGrid.appendChild(btn);
                }
            }

            function updateConfirmState() {
                confirmBtn.disabled = !selectedDate;
            }

            function openPopover() {
                popover.hidden = false;
                trigger.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                renderCalendar();
                updateConfirmState();
            }
            function closePopover() {
                popover.hidden = true;
                trigger.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            }

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (popover.hidden) openPopover(); else closePopover();
            });

            prevBtn.addEventListener('click', () => {
                viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
                renderCalendar();
            });
            nextBtn.addEventListener('click', () => {
                viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
                renderCalendar();
            });

            confirmBtn.addEventListener('click', () => {
                if (!selectedDate) return;
                const y = selectedDate.getFullYear();
                const mo = pad(selectedDate.getMonth() + 1);
                const da = pad(selectedDate.getDate());
                // Formato que el backend ya espera (igual que datetime-local)
                hiddenInput.value = `${y}-${mo}-${da}T${hourSel.value}:${minSel.value}`;
                const dObj = new Date(y, selectedDate.getMonth(), selectedDate.getDate(),
                                      parseInt(hourSel.value, 10), parseInt(minSel.value, 10));
                triggerText.textContent = dObj.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
                triggerText.classList.remove('placeholder');
                closePopover();
            });

            clearBtn.addEventListener('click', () => {
                selectedDate = null;
                hiddenInput.value = '';
                triggerText.textContent = 'Elegir fecha y hora';
                triggerText.classList.add('placeholder');
                hourSel.value = '12';
                minSel.value = '00';
                renderCalendar();
                updateConfirmState();
            });

            // Cerrar al hacer clic fuera o con Escape
            document.addEventListener('click', (e) => {
                if (!popover.hidden && !popover.contains(e.target) && !trigger.contains(e.target)) {
                    closePopover();
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !popover.hidden) closePopover();
            });

            // API mínima para el modo edición, que necesita precargar la fecha del
            // partido que se está moviendo y volver a dejarlo todo limpio al salir.
            window.matchDatePicker = {
                set(isoLocal) {
                    const [datePart, timePart = '12:00'] = String(isoLocal).split('T');
                    const [y, mo, da] = datePart.split('-').map(Number);
                    const [hh, mm] = timePart.split(':');
                    if (!y || !mo || !da) return;

                    allowPast = true;
                    selectedDate = new Date(y, mo - 1, da);
                    viewYear = y;
                    viewMonth = mo - 1;

                    // El select de minutos va de 5 en 5; un partido guardado a una
                    // hora "rara" perdería el valor en silencio si no se añade.
                    if (![...minSel.options].some(o => o.value === mm)) {
                        const extra = document.createElement('option');
                        extra.value = mm; extra.textContent = mm;
                        minSel.appendChild(extra);
                    }
                    hourSel.value = hh;
                    minSel.value = mm;

                    hiddenInput.value = `${y}-${pad(mo)}-${pad(da)}T${hh}:${mm}`;
                    triggerText.textContent = new Date(y, mo - 1, da, Number(hh), Number(mm))
                        .toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
                    triggerText.classList.remove('placeholder');
                    renderCalendar();
                },
                reset() {
                    allowPast = false;
                    clearBtn.click();
                }
            };
        })();

// ---- bloque inline #4 ----
        document.addEventListener('DOMContentLoaded', async () => {
            // Manejo de UI Navbar
            const token = localStorage.getItem('kphoops_token');
            const userName = localStorage.getItem('kphoops_user_name');
            const btnLogin = document.getElementById('btn-login');
            const btnRegister = document.getElementById('btn-register');
            const userGreeting = document.getElementById('user-greeting');
            const btnLogout = document.getElementById('btn-logout');

            if (token && userName) {
                btnLogin.style.display = 'none';
                btnRegister.style.display = 'none';
                userGreeting.style.display = 'block';
                userGreeting.textContent = `Hola, ${capitalizeName(userName)}`;
                btnLogout.style.display = 'inline-block';
            }

            btnLogout.addEventListener('click', () => {
                localStorage.removeItem('kphoops_token');
                localStorage.removeItem('kphoops_user_name');
                window.location.reload();
            });

            // Extraer ID del torneo
            const urlParams = new URLSearchParams(window.location.search);
            const tournamentId = urlParams.get('id');

            if (!tournamentId) {
                document.getElementById('error-message').innerText = 'No se indicó qué torneo quieres ver.';
                document.getElementById('error-message').style.display = 'block';
                return;
            }

            // Datos del Torneo
            let isOrganizer = false;
            let userHasEligibleTeam = false; // ¿el usuario tiene una franquicia que aún puede inscribir?
            try {
        // 1. Usamos la llave CORRECTA ('kphoops_token') para que el backend nos reconozca
        const myToken = localStorage.getItem('kphoops_token');

        const headers = {};
        if (myToken) {
            headers['Authorization'] = `Bearer ${myToken}`;
        }

        // 2. Hacemos la petición
        const response = await fetch(`/api/tournaments/${tournamentId}`, {
            headers: headers
        });

        if (!response.ok) throw new Error('Torneo no encontrado o error en servidor');

        const tournament = await response.json();

        // 3. ¡EL TRUCO! Asignamos la bandera de seguridad a la variable global.
        window.soyElOrganizador = tournament.isOrganizer;
        // Poblar Hero. Aplicamos title case también al mostrar (además del que ya
        // hace el backend al crear/editar), como red de seguridad para cualquier
        // dato antiguo o de otra vía que se haya guardado en minúsculas.
        document.getElementById('tournament-name').innerText = window.toTitleCaseDisplay(tournament.name);
        document.getElementById('tournament-category').innerText = tournament.category;
        document.getElementById('tournament-venue').innerText = window.toTitleCaseDisplay(tournament.venue);
        document.getElementById('tournament-max').innerText = tournament.maxTeams;
                
                // La fecha de inicio es un día suelto guardado a medianoche UTC:
                // formatearla en horario local la retrasaba un día en cualquier
                // zona al oeste de Greenwich (se creaba el 10/8 y se leía 9/8).
                const theDate = new Date(tournament.startDate);
                document.getElementById('tournament-date').innerText =
                    theDate.toLocaleDateString('es-ES', { timeZone: 'UTC' });

                document.getElementById('tournament-hero').style.display = 'block';
                document.getElementById('teams-header').style.display = 'block';
                
                // Decodificar token para ver si es organizador
                isOrganizer = tournament.isOrganizer === true;

                // Mostrar equipos inscritos
                const teamsContainer = document.getElementById('teams-container');
                let enrolledTeams = [];
                let enrolledTeamsIds = new Set();
                
                if (tournament.enrollments && tournament.enrollments.length > 0) {
                    teamsContainer.style.display = 'grid';
                    enrolledTeams = tournament.enrollments.map(e => e.team);
                    
                    tournament.enrollments.forEach(enrollment => {
                        const team = enrollment.team;
                        enrolledTeamsIds.add(team.id);

                        const card = document.createElement('div');
                        card.className = 'enrolled-card';

                        const initial = escapeHtml((team.name || '?').trim().charAt(0).toUpperCase());
                        const logoHtml = team.logoUrl
                            ? `<img src="${escapeHtml(team.logoUrl)}" alt="Logo ${escapeHtml(team.name)}" data-fallback="placeholder" data-fallback-class="enrolled-card__ph" data-fallback-text="${initial}">`
                            : `<span class="enrolled-card__ph">${initial}</span>`;

                        const cost = tournament.inscriptionFee || 0;
                        const paid = enrollment.amountPaid || 0;
                        const pending = cost - paid;
                        const paidPct = cost > 0 ? Math.min(100, Math.round((paid / cost) * 100)) : 0;
                        const isPaid = cost > 0 && pending <= 0;

                        // El backend solo manda los campos de pago a quien puede verlos
                        // (organizador, admin, o el capitán de esa misma franquicia).
                        // Si no vienen, aquí no se pinta nada de dinero: un visitante
                        // cualquiera no tiene por qué saber quién va al día y quién debe.
                        const canSeePayment = enrollment.amountPaid !== undefined;

                        let statusBadge = '';
                        let paymentInfo = '';
                        if (cost > 0 && canSeePayment) {
                            statusBadge = isPaid
                                ? `<span class="enr-badge is-paid">Pagado</span>`
                                : `<span class="enr-badge is-debt">Debe $${pending}</span>`;
                            paymentInfo = `
                                <div class="enr-pay">
                                    <div class="enr-pay__bar"><span style="width:${paidPct}%"></span></div>
                                    <div class="enr-pay__summary">
                                        <span><b class="is-ok">$${paid}</b> pagado</span>
                                        <span>de <b>$${cost}</b></span>
                                    </div>
                                </div>`;
                        }

                        let organizerControls = '';
                        if (isOrganizer && cost > 0) {
                            organizerControls = `
                                <div class="enr-controls">
                                    <input type="number" id="pay-input-${enrollment.id}" class="enr-input" placeholder="Monto" min="0">
                                    <button class="enr-btn btn-update-payment" data-enrollment-id="${enrollment.id}">Actualizar pago</button>
                                </div>`;
                        }

                        // Capitán visible: clave para distinguir franquicias homónimas
                        // (dos "Warriors" de capitanes distintos) al gestionar pagos.
                        const capName = team.captain
                            ? (window.capitalizeName
                                ? window.capitalizeName(`${team.captain.firstName} ${team.captain.lastName}`)
                                : `${team.captain.firstName} ${team.captain.lastName}`)
                            : null;
                        const captainLine = capName
                            ? `<p class="enrolled-card__cap">Cap. ${escapeHtml(capName)}</p>`
                            : '';

                        card.innerHTML = `
                            <a class="enrolled-card__head" href="equipo.html?id=${team.id}">
                                <div class="enrolled-card__logo">${logoHtml}</div>
                                <div class="enrolled-card__meta">
                                    <h3 class="enrolled-card__name">${escapeHtml(team.name)}</h3>
                                    ${captainLine}
                                    ${statusBadge}
                                </div>
                            </a>
                            ${paymentInfo}
                            ${organizerControls}
                        `;
                        teamsContainer.appendChild(card);
                    });
                    
                    // Almacenar en window array temporal para filtrar inscripciones luego
                    window.enrolledTeamsIds = enrolledTeamsIds;
                    
                    // Manejar clics de Actualizar Pago
                    document.querySelectorAll('.btn-update-payment').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            e.preventDefault();
                            const enrollmentId = e.target.getAttribute('data-enrollment-id');
                            const input = document.getElementById(`pay-input-${enrollmentId}`);
                            if (!input.value || input.value === "") {
                                return showToast('Ingresa un monto válido', 'error');
                            }
                            
                            try {
                                const res = await fetch(`/api/enrollments/${enrollmentId}/payment`, {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ amountPaid: input.value })
                                });
                                
                                if (res.ok) {
                                    showToast('Pago actualizado correctamente', 'success');
                                    setTimeout(() => window.location.reload(), 1000);
                                } else {
                                    const data = await res.json();
                                    showToast(data.error || 'Error al actualizar', 'error');
                                }
                            } catch (err) {
                                showToast('Error de red', 'error');
                            }
                        });
                    });
                } else {
                    document.getElementById('no-teams-msg').style.display = 'block';
                    window.enrolledTeamsIds = new Set();
                }

                // --------- INICIO: Tabla de Posiciones ---------
                // Porcentaje de victorias al estilo de la tabla de básquet: .750,
                // sin el cero de la izquierda. Es el criterio con el que ordena el
                // servidor, así que tiene que verse para que el orden se entienda.
                const formatPct = (pct) => {
                    if (typeof pct !== 'number') return '—';
                    if (pct >= 1) return '1.000';
                    return pct.toFixed(3).slice(1);
                };
                try {
                    const stResponse = await fetch(`/api/tournaments/${tournamentId}/standings`);
                    if (stResponse.ok) {
                        const standings = await stResponse.json();
                        if (standings && standings.length > 0) {
                            document.getElementById('standings-header').style.display = 'block';
                            document.getElementById('standings-container').style.display = 'block';
                            
                            const tbody = document.getElementById('standings-body');
                            standings.forEach((s, index) => {
                                const tr = document.createElement('tr');
                                
                                let logoHtml = s.logoUrl
                                    ? `<img src="${escapeHtml(s.logoUrl)}" alt="Logo" data-fallback="hide-clear">`
                                    : `<div style="width:30px; height:30px; border-radius:50%; background:#2a2a35; border:1px solid var(--cyan-accent); display:flex; align-items:center; justify-content:center; font-size:10px; font-family:'Press Start 2P'; color:var(--text-muted);">?</div>`;

                                tr.innerHTML = `
                                    <td>${index + 1}</td>
                                    <td>
                                        <div class="team-inline" data-action="navigate" data-href="/perfil-equipo.html?teamId=${s.teamId}" style="cursor: pointer;">
                                            ${logoHtml}
                                            <a href="/perfil-equipo.html?teamId=${s.teamId}" style="color: inherit; text-decoration: none;">${escapeHtml(s.teamName)}</a>
                                        </div>
                                    </td>
                                    <td>${s.pj}</td>
                                    <td>${s.g}</td>
                                    <td>${s.p}</td>
                                    <td>${formatPct(s.pct)}</td>
                                    <td>${s.pf}</td>
                                    <td>${s.pc}</td>
                                    <td>${s.diff}</td>
                                `;
                                tbody.appendChild(tr);
                            });
                        }
                    }
                } catch(e) {
                    console.error('Error cargando standings:', e);
                }
                // --------- FIN: Tabla de Posiciones ---------

                // --------- INICIO: Sección de Partidos ---------
                document.getElementById('matches-header').style.display = 'block';
                const matchesContainer = document.getElementById('matches-container');
                const playoffsHeader = document.getElementById('playoffs-header');
                const bracketContainer = document.getElementById('bracket-container');

                if (tournament.matches && tournament.matches.length > 0) {
                    window.matchesData = tournament.matches; // Guardar partidos globalmente
                    
                    // Primero los partidos por jugar (programados) y al final los ya
                    // jugados. Dentro de cada grupo, orden cronológico por fecha.
                    const isMatchPlayed = m => (m.status === 'FINISHED' || m.status === 'PLAYED');
                    const regularMatches = tournament.matches
                        .filter(m => m.stage === 'REGULAR')
                        .sort((a, b) => {
                            const playedA = isMatchPlayed(a) ? 1 : 0;
                            const playedB = isMatchPlayed(b) ? 1 : 0;
                            if (playedA !== playedB) return playedA - playedB; // por jugar arriba
                            return new Date(a.matchDate) - new Date(b.matchDate);
                        });
                    const playoffMatches = tournament.matches.filter(m => ['CUARTOS', 'SEMIFINAL', 'FINAL'].includes(m.stage));

                    if (regularMatches.length > 0) {
                        matchesContainer.style.display = 'flex';

                        // Escudo del equipo: usa el logo si existe, si no la inicial como fallback
                        const renderMatchLogo = (team) => {
                            const initial = escapeHtml(team.name.charAt(0).toUpperCase());
                            return team.logoUrl && team.logoUrl.trim() !== ''
                                ? `<img src="${escapeHtml(team.logoUrl)}" class="match-logo" alt="${escapeHtml(team.name)}" data-fallback="hide-sibling"><div class="match-logo" style="display:none;">${initial}</div>`
                                : `<div class="match-logo">${initial}</div>`;
                        };

                        regularMatches.forEach(match => {
                            const mCard = document.createElement('div');
                            // Etiqueta de grupo para el selector "Por jugar / Jugados"
                            mCard.className = 'match-card ' + (isMatchPlayed(match) ? 'is-played' : 'is-upcoming');

                            const mDate = new Date(match.matchDate);
                            const statusText = match.status === 'SCHEDULED' ? 'Programado' :
                                               (match.status === 'FINISHED' ? 'Finalizado' : 'Cancelado');

                            let scoreSection = '';
                            let actionBtn = '';
                            let deleteBtn = '';
                            const isPlayed = (match.status === 'FINISHED' || match.status === 'PLAYED');

                            if (isPlayed) {
                                scoreSection = `<div class="match-score">${match.homeScore} - ${match.awayScore}</div>`;
                                if (isOrganizer) {
                                    actionBtn = `<button class="btn-match-action ghost" data-action="open-stats" data-match-id="${match.id}">Ver estadísticas</button>`;
                                }
                            } else if (match.status === 'SCHEDULED' && isOrganizer) {
                                // Sin caja de marcador vacía ("-"): el estado "Programado" ya lo
                                // comunica y esa caja se confundía con un botón. Acción compacta.
                                actionBtn = `<button class="btn-match-action primary" data-action="navigate" data-href="/mesa-control.html?matchId=${match.id}">▶ Iniciar partido</button>`;
                            }

                            // Reprogramar y cancelar: solo el organizador y solo si aún no se jugó
                            let editBtn = '';
                            if (isOrganizer && !isPlayed) {
                                editBtn = `<button class="btn-match-edit" title="Reprogramar partido" aria-label="Reprogramar partido" data-action="edit-match" data-match-id="${match.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button>`;
                                deleteBtn = `<button class="btn-match-delete" title="Cancelar partido" aria-label="Cancelar partido" data-action="delete-match" data-match-id="${match.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>`;
                            }

                            const actionsRow = (actionBtn || editBtn || deleteBtn)
                                ? `<div class="match-actions">${actionBtn}${editBtn}${deleteBtn}</div>`
                                : '';

                            mCard.innerHTML = `
                                <div class="match-matchup">
                                    <div class="match-side home">
                                        ${renderMatchLogo(match.homeTeam)}
                                        <div class="match-side-info">
                                            <div class="match-role">Local</div>
                                            <a class="match-team-name" href="/perfil-equipo.html?teamId=${match.homeTeam.id}">${escapeHtml(match.homeTeam.name)}</a>
                                        </div>
                                    </div>
                                    <span class="match-vs">VS</span>
                                    <div class="match-side away">
                                        ${renderMatchLogo(match.awayTeam)}
                                        <div class="match-side-info">
                                            <div class="match-role">Visitante</div>
                                            <a class="match-team-name" href="/perfil-equipo.html?teamId=${match.awayTeam.id}">${escapeHtml(match.awayTeam.name)}</a>
                                        </div>
                                    </div>
                                </div>
                                <div class="match-meta">
                                    ${scoreSection}
                                    <div class="match-when">
                                        <div class="match-date">${mDate.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</div>
                                        <div class="match-status">${statusText}</div>
                                    </div>
                                </div>
                                ${actionsRow}
                            `;
                            matchesContainer.appendChild(mCard);
                        });

                        // ---- Selector "Por jugar / Jugados" ----
                        const upcomingCount = regularMatches.filter(m => !isMatchPlayed(m)).length;
                        const playedCount = regularMatches.length - upcomingCount;
                        const matchTabs = document.getElementById('match-tabs');
                        const countUpcomingEl = document.getElementById('count-upcoming');
                        const countPlayedEl = document.getElementById('count-played');
                        const filterMsg = document.getElementById('no-matches-filter-msg');
                        if (countUpcomingEl) countUpcomingEl.textContent = upcomingCount;
                        if (countPlayedEl) countPlayedEl.textContent = playedCount;

                        const applyMatchFilter = (filter) => {
                            const cards = matchesContainer.querySelectorAll('.match-card');
                            let shown = 0;
                            cards.forEach(c => {
                                const match = filter === 'upcoming' ? c.classList.contains('is-upcoming')
                                                                     : c.classList.contains('is-played');
                                c.style.display = match ? '' : 'none';
                                if (match) shown++;
                            });
                            // Mensaje cuando la sección elegida está vacía
                            if (filterMsg) {
                                if (shown === 0) {
                                    filterMsg.textContent = filter === 'upcoming'
                                        ? 'No hay partidos por jugar. ¡Programa uno arriba!'
                                        : 'Aún no se ha jugado ningún partido.';
                                    filterMsg.style.display = 'block';
                                    matchesContainer.style.display = 'none';
                                } else {
                                    filterMsg.style.display = 'none';
                                    matchesContainer.style.display = 'flex';
                                }
                            }
                        };

                        if (matchTabs) {
                            matchTabs.style.display = 'flex';
                            matchTabs.querySelectorAll('.match-tab').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    matchTabs.querySelectorAll('.match-tab').forEach(b => b.classList.remove('active'));
                                    btn.classList.add('active');
                                    applyMatchFilter(btn.dataset.filter);
                                });
                            });
                            // Por defecto muestra "Por jugar"; si no hay, arranca en "Jugados".
                            const initial = upcomingCount > 0 ? 'upcoming' : 'played';
                            matchTabs.querySelector(`.match-tab[data-filter="${initial}"]`)?.classList.add('active');
                            matchTabs.querySelector(`.match-tab[data-filter="${initial === 'upcoming' ? 'played' : 'upcoming'}"]`)?.classList.remove('active');
                            applyMatchFilter(initial);
                        }
                    }

                    // Renderizar Bracket
                    const cuartosMatches = playoffMatches.filter(m => m.stage === 'CUARTOS');
                    const semisMatches = playoffMatches.filter(m => m.stage === 'SEMIFINAL');
                    const finalMatches = playoffMatches.filter(m => m.stage === 'FINAL');
                    // Se declara aquí (no dentro del if de abajo) porque también la usa
                    // el bloque "if (isOrganizer)" más adelante, fuera de ese if.
                    const isMatchDone = m => (m.status === 'FINISHED' || m.status === 'PLAYED');

                    if (playoffMatches.length > 0) {
                        playoffsHeader.style.display = 'block';
                        bracketContainer.style.display = 'flex';

                        const formatLogo = (team) => {
                            return team.logoUrl && team.logoUrl.trim() !== ''
                                ? `<img src="${escapeHtml(team.logoUrl)}" class="bracket-team-logo" alt="logo" data-fallback="hide-sibling"><div class="bracket-team-logo" style="display:none;">${escapeHtml(team.name.charAt(0).toUpperCase())}</div>`
                                : `<div class="bracket-team-logo">${escapeHtml(team.name.charAt(0).toUpperCase())}</div>`;
                        };

                        // Función auxiliar para renderizar un partido en el bracket
                        const renderBracketMatch = (match, containerId) => {
                            const col = document.querySelector(`#${containerId} .bracket-column-matches`);
                            if (!col) return;

                            const bMatch = document.createElement('div');
                            bMatch.className = 'bracket-match';

                            if (isOrganizer && isMatchDone(match)) {
                                bMatch.addEventListener('click', () => window.openStatsModal(match.id));
                            }

                            let hWinner = false, aWinner = false;
                            if (isMatchDone(match)) {
                                hWinner = match.homeScore > match.awayScore;
                                aWinner = match.awayScore > match.homeScore;
                            }

                            const statusBadge = isMatchDone(match)
                                ? '<span class="bracket-status is-done">Finalizado</span>'
                                : '<span class="bracket-status is-pending">Programado</span>';

                            let scoreInputs = '';
                            if (match.status === 'SCHEDULED' && isOrganizer) {
                                // Las rondas de playoffs se agendan solas a hoy + 7 días:
                                // sin este botón, esa fecha era imposible de corregir.
                                scoreInputs = `
                                    <div class="bracket-match-actions">
                                        <button class="bracket-btn-start">▶ Iniciar (Mesa)</button>
                                        <button type="button" class="bracket-btn-edit" data-action="edit-match" data-match-id="${match.id}">Cambiar fecha</button>
                                    </div>
                                `;
                            }

                            const showStatsMsg = isOrganizer && isMatchDone(match)
                                ? '<div class="bracket-stats-hint">Clic para stats</div>' : '';

                            bMatch.innerHTML = `
                                ${statusBadge}
                                <div class="bracket-team ${hWinner ? 'is-winner' : ''}">
                                    ${formatLogo(match.homeTeam)}
                                    <div class="bracket-team-name">${escapeHtml(match.homeTeam.name)}</div>
                                    <div class="bracket-team-score">${match.status === 'SCHEDULED' ? '-' : match.homeScore}</div>
                                    ${hWinner ? '<span class="bracket-winner-tag">✓</span>' : ''}
                                </div>
                                <div class="bracket-team ${aWinner ? 'is-winner' : ''}">
                                    ${formatLogo(match.awayTeam)}
                                    <div class="bracket-team-name">${escapeHtml(match.awayTeam.name)}</div>
                                    <div class="bracket-team-score">${match.status === 'SCHEDULED' ? '-' : match.awayScore}</div>
                                    ${aWinner ? '<span class="bracket-winner-tag">✓</span>' : ''}
                                </div>
                                ${scoreInputs}
                                ${showStatsMsg}
                            `;

                            // Listener directo (no delegado) para que stopPropagation
                            // funcione: bMatch tiene su propio listener de click (arriba)
                            // que abriría el modal de stats si el clic burbujea hasta él.
                            const startBtn = bMatch.querySelector('.bracket-btn-start');
                            if (startBtn) {
                                startBtn.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    window.location.href = `/mesa-control.html?matchId=${match.id}`;
                                });
                            }

                            col.appendChild(bMatch);
                        };

                        // Tarjeta fantasma para una ronda que aún no se generó (esperando
                        // que termine la ronda anterior). Evita que la columna se vea
                        // vacía/confusa y deja claro qué falta para que avance sola.
                        const renderPlaceholder = (containerId, label) => {
                            const col = document.querySelector(`#${containerId} .bracket-column-matches`);
                            if (!col) return;
                            const ph = document.createElement('div');
                            ph.className = 'bracket-match is-placeholder';
                            ph.innerHTML = `
                                <div class="bracket-placeholder-icon">⏳</div>
                                <div class="bracket-placeholder-text">${label}</div>
                            `;
                            col.appendChild(ph);
                        };

                        cuartosMatches.forEach(m => renderBracketMatch(m, 'col-cuartos'));
                        semisMatches.forEach(m => renderBracketMatch(m, 'col-semis'));
                        finalMatches.forEach(m => renderBracketMatch(m, 'col-final'));

                        // Una liga de 4 equipos arranca en Semifinal y una de 2-3
                        // directamente en la Final: las columnas anteriores no
                        // existen y se ocultan con su conector, en vez de dejar
                        // una columna "Cuartos" vacía que parece un error.
                        const toggleBracketColumn = (colId, visible) => {
                            const col = document.getElementById(colId);
                            if (!col) return;
                            col.style.display = visible ? '' : 'none';
                            const connector = col.nextElementSibling;
                            if (connector && connector.classList.contains('bracket-connector')) {
                                connector.style.display = visible ? '' : 'none';
                            }
                        };
                        toggleBracketColumn('col-cuartos', cuartosMatches.length > 0);
                        toggleBracketColumn('col-semis', cuartosMatches.length > 0 || semisMatches.length > 0);

                        // Placeholders: semis pendientes de que terminen los cuartos
                        // (son 2 tanto en el cuadro de 8 como en el de 6 con byes).
                        if (semisMatches.length === 0 && cuartosMatches.length > 0) {
                            for (let i = 0; i < 2; i++) {
                                renderPlaceholder('col-semis', 'Esperando resultados de Cuartos');
                            }
                        }
                        // Placeholder: final pendiente de que terminen las 2 semis
                        if (finalMatches.length === 0 && semisMatches.length > 0) {
                            renderPlaceholder('col-final', 'Esperando resultados de Semifinal');
                        }

                        // Campeón: la Gran Final terminada cierra la temporada.
                        const decidedFinal = finalMatches.find(isMatchDone);
                        if (decidedFinal) {
                            const homeWon = decidedFinal.homeScore > decidedFinal.awayScore;
                            const champion = homeWon ? decidedFinal.homeTeam : decidedFinal.awayTeam;
                            const runnerUp = homeWon ? decidedFinal.awayTeam : decidedFinal.homeTeam;
                            const winnerScore = Math.max(decidedFinal.homeScore, decidedFinal.awayScore);
                            const loserScore = Math.min(decidedFinal.homeScore, decidedFinal.awayScore);

                            const banner = document.getElementById('champion-banner');
                            const logoBox = document.getElementById('champion-logo');
                            if (banner && logoBox) {
                                logoBox.innerHTML = champion.logoUrl && champion.logoUrl.trim() !== ''
                                    ? `<img src="${escapeHtml(champion.logoUrl)}" alt="Logo ${escapeHtml(champion.name)}" data-fallback="placeholder" data-fallback-text="${escapeHtml(champion.name.charAt(0).toUpperCase())}">`
                                    : escapeHtml(champion.name.charAt(0).toUpperCase());
                                document.getElementById('champion-name').textContent = champion.name;
                                document.getElementById('champion-detail').textContent =
                                    `Ganó la Gran Final ${winnerScore}-${loserScore} a ${runnerUp.name}.`;
                                banner.style.display = 'flex';
                            }
                        }

                        // Contadores en el título de cada columna
                        const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n > 0 ? ` (${n})` : ''; };
                        setCount('count-cuartos', cuartosMatches.length);
                        setCount('count-semis', semisMatches.length);
                        setCount('count-final', finalMatches.length);
                    }

                    // Botón "Generar Cuartos de Final": desde que el avance de
                    // Semifinal y Final es automático, este botón SOLO hace falta
                    // para arrancar los playoffs (fase regular -> Cuartos). Se
                    // mantiene como respaldo si, por alguna razón, una ronda ya
                    // terminada no avanzó sola.
                    if (isOrganizer) {
                        const btnPlayoffs = document.getElementById('btn-generate-playoffs');
                        const playoffsHint = document.getElementById('playoffs-hint');
                        if (btnPlayoffs) {
                            const btnLabel = btnPlayoffs.querySelector('.btn-content');
                            const cuartosFinished = cuartosMatches.length > 0 && cuartosMatches.every(isMatchDone);
                            const semisFinished = semisMatches.length === 2 && semisMatches.every(isMatchDone);

                            if (playoffMatches.length === 0) {
                                // Cuántos equipos jugaron de verdad la fase regular:
                                // de ahí sale la ronda por la que empezará el cuadro.
                                const activeTeams = new Set();
                                regularMatches.filter(isMatchDone).forEach(m => {
                                    activeTeams.add(m.homeTeamId);
                                    activeTeams.add(m.awayTeamId);
                                });
                                const n = activeTeams.size;

                                let roundLabel = null;
                                let roundDetail = '';
                                if (n >= 8) {
                                    roundLabel = 'CUARTOS DE FINAL';
                                    roundDetail = `Se cruzarán los 8 mejores de la tabla (hay ${n} equipos con partidos jugados).`;
                                } else if (n >= 6) {
                                    roundLabel = 'CUARTOS DE FINAL';
                                    roundDetail = `Con ${n} equipos, los dos primeros de la tabla pasan directos a semifinales y el resto juega cuartos.`;
                                } else if (n >= 4) {
                                    roundLabel = 'SEMIFINALES';
                                    roundDetail = `Con ${n} equipos el cuadro arranca en semifinales: 1º-4º y 2º-3º.`;
                                } else if (n >= 2) {
                                    roundLabel = 'LA GRAN FINAL';
                                    roundDetail = `Con ${n} equipos se juega directamente la final entre los dos primeros.`;
                                }

                                btnPlayoffs.style.display = roundLabel ? 'inline-flex' : 'none';
                                if (btnLabel && roundLabel) btnLabel.textContent = `🏆 GENERAR ${roundLabel}`;
                                if (playoffsHint) {
                                    playoffsHint.textContent = roundLabel
                                        ? `${roundDetail} De ahí en adelante, cada ronda avanza sola en cuanto se registran todos sus resultados.`
                                        : 'Para armar las eliminatorias hacen falta al menos 2 equipos con partidos jugados en la fase regular.';
                                }
                            } else if (semisMatches.length === 0 && cuartosFinished) {
                                // No debería pasar (el auto-avance ya lo hizo al guardar el
                                // último resultado), pero queda como respaldo manual.
                                btnPlayoffs.style.display = 'inline-flex';
                                if (btnLabel) btnLabel.textContent = '🏆 AVANZAR A SEMIFINAL';
                            } else if (finalMatches.length === 0 && semisMatches.length === 2 && semisFinished) {
                                btnPlayoffs.style.display = 'inline-flex';
                                if (btnLabel) btnLabel.textContent = '🏆 AVANZAR A FINAL';
                            } else {
                                btnPlayoffs.style.display = 'none';
                                // Con un cuadro que arranca en Semifinal no hay cuartos,
                                // así que la condición mira los playoffs en conjunto: si
                                // no, se quedaba el texto inicial de "genera los cuartos"
                                // con las semifinales ya en marcha.
                                if (playoffsHint && playoffMatches.length > 0) {
                                    if (finalMatches.some(isMatchDone)) {
                                        playoffsHint.textContent = 'Temporada cerrada: ya hay campeón.';
                                    } else if (finalMatches.length > 0) {
                                        playoffsHint.textContent = 'La Gran Final ya está en marcha.';
                                    } else {
                                        playoffsHint.textContent = 'La siguiente ronda se generará sola en cuanto termine la actual. No necesitas hacer nada más aquí.';
                                    }
                                }
                            }
                        }
                    }

                    // Renderizar mensaje de no partidos si nada se renderizó
                    if (regularMatches.length === 0 && playoffMatches.length === 0) {
                        document.getElementById('no-matches-msg').style.display = 'block';
                    }

                    // Añadir evento a los botones de guardar resultado (tanto regular como bracket)
                    document.querySelectorAll('.save-score-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const matchId = e.target.getAttribute('data-match-id');
                            const homeScore = document.getElementById(`homeScore-${matchId}`).value;
                            const awayScore = document.getElementById(`awayScore-${matchId}`).value;

                            if (homeScore === '' || awayScore === '') {
                                showToast('Por favor, ingresa los resultados para ambos equipos.', 'error');
                                return;
                            }

                            try {
                                const response = await fetch(`/api/matches/${matchId}/score`, {
                                    method: 'PUT',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({ homeScore, awayScore })
                                });

                                if (!response.ok) {
                                    const data = await response.json();
                                    showToast(data.error || 'Error al guardar el resultado.', 'error');
                                } else {
                                    showToast('¡Resultado guardado!', 'success');
                                    setTimeout(() => window.location.reload(), 1500);
                                }
                            } catch (err) {
                                console.error(err);
                                showToast('Error de red al guardar el resultado.', 'error');
                            }
                        });
                    });

                    // Cancelar/eliminar un partido programado (solo organizador)
                    window.deleteMatch = async function(matchId) {
                        const confirmed = await showConfirm(
                            '¿Seguro que quieres cancelar este partido? Se eliminará del calendario de forma permanente.',
                            { title: 'Cancelar partido', confirmText: 'Sí, cancelar', cancelText: 'No' }
                        );
                        if (!confirmed) return;

                        try {
                            const token = localStorage.getItem('kphoops_token');
                            const res = await fetch(`/api/matches/${matchId}`, {
                                method: 'DELETE',
                                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                                alert(data.error || 'No se pudo cancelar el partido.');
                                return;
                            }
                            location.reload();
                        } catch (err) {
                            console.error('Error al cancelar partido:', err);
                            alert('Error de conexión al cancelar el partido.');
                        }
                    };

                    // Muestra el box score ya guardado (registrado al terminar el
                    // partido en la mesa de control). Es solo de lectura: las
                    // estadísticas se cargan una única vez, desde la mesa de control.
                    window.openStatsModal = function(matchId) {
                        const matchData = window.matchesData.find(m => m.id === matchId);
                        if (!matchData) return;

                        const container = document.getElementById('stats-form-container');
                        container.innerHTML = ''; // Limpiar previo

                        const statsByPlayer = {};
                        (matchData.stats || []).forEach(s => { statsByPlayer[s.playerId] = s; });

                        const createTeamTable = (team, titleColor) => {
                            let html = `<h3 style="color:${titleColor}; font-family:'Press Start 2P'; font-size:0.8rem; margin-top: 1.5rem;">${escapeHtml(team.name)}</h3>`;
                            if (!team.players || team.players.length === 0) {
                                html += `<p style="color:var(--text-muted); font-size:0.8rem;">No hay jugadores registrados.</p>`;
                                return html;
                            }

                            html += `
                                <table class="stats-table">
                                    <thead>
                                        <tr>
                                            <th style="text-align:left; width:40%;">Jugador</th>
                                            <th>PTS</th>
                                            <th>REB</th>
                                            <th>AST</th>
                                            <th>MIN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                            `;
                            team.players.forEach(p => {
                                const s = statsByPlayer[p.id];
                                html += `
                                    <tr class="stat-row" data-player-id="${p.id}">
                                        <td style="text-align:left; font-size: 0.9rem;">${escapeHtml(p.name)} <span style="color:var(--text-muted); font-size:0.7rem;">#${escapeHtml(p.jerseyNumber)}</span></td>
                                        <td>${s ? s.points : 0}</td>
                                        <td>${s ? s.rebounds : 0}</td>
                                        <td>${s ? s.assists : 0}</td>
                                        <td>${s ? s.minutesPlayed : 0}</td>
                                    </tr>
                                `;
                            });
                            html += `</tbody></table>`;
                            return html;
                        };

                        container.innerHTML += createTeamTable(matchData.homeTeam, 'var(--orange)');
                        container.innerHTML += createTeamTable(matchData.awayTeam, 'var(--cyan-accent)');

                        if (!matchData.stats || matchData.stats.length === 0) {
                            container.innerHTML += `<p style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:1rem;">Este partido no tiene estadísticas individuales registradas.</p>`;
                        }

                        document.getElementById('stats-modal').style.display = 'flex';
                    };

                    document.getElementById('close-stats-modal').addEventListener('click', () => {
                        document.getElementById('stats-modal').style.display = 'none';
                    });

                } else {
                    document.getElementById('no-matches-msg').style.display = 'block';
                }
                // --------- FIN: Sección de Partidos ---------

                            if (isOrganizer) {
                                document.getElementById('organizer-section').style.display = 'block';
                                // La visibilidad/texto de btn-generate-playoffs ya se decide
                                // más arriba según el estado real de los playoffs.

                                // Botón "Reiniciar Temporada": disponible para el organizador
                                // siempre que haya algo que reiniciar (partidos jugados o
                                // programados, de temporada regular o de playoffs).
                                const btnResetSeason = document.getElementById('btn-reset-season');
                                if (btnResetSeason && tournament.matches && tournament.matches.length > 0) {
                                    btnResetSeason.style.display = 'inline-flex';
                                }
                                const homeSelect = document.getElementById('homeTeamSelect');
                                const awaySelect = document.getElementById('awayTeamSelect');

                                enrolledTeams.forEach(t => {
                                    const hOpt = document.createElement('option');
                                    hOpt.value = t.id;
                                    hOpt.text = t.name;
                                    homeSelect.appendChild(hOpt);

                                    const aOpt = document.createElement('option');
                                    aOpt.value = t.id;
                                    aOpt.text = t.name;
                                    awaySelect.appendChild(aOpt);
                                });

                                // Manejo de la programación
                                document.getElementById('matchForm').addEventListener('submit', async (e) => {
                                    e.preventDefault();
                                    const mMsg = document.getElementById('matchMessage');
                                    const hId = homeSelect.value;
                                    const aId = awaySelect.value;
                                    const dateVal = document.getElementById('matchDate').value;

                                    if (hId === aId) {
                                        mMsg.style.display = 'block';
                                        mMsg.style.color = 'var(--orange)';
                                        mMsg.innerText = 'Un equipo no puede jugar contra sí mismo.';
                                        return;
                                    }

                                    // El input de fecha es oculto (picker propio), así que
                                    // validamos manualmente en vez de depender de 'required'.
                                    if (!dateVal) {
                                        mMsg.style.display = 'block';
                                        mMsg.style.color = 'var(--orange)';
                                        mMsg.innerText = 'Selecciona la fecha y hora del partido.';
                                        return;
                                    }

                                    // Reprogramando: solo se manda lo que cambia. En un
                                    // partido de eliminatoria los equipos los decide el
                                    // cuadro, así que ahí solo viaja la fecha.
                                    const editing = window.matchEditState && window.matchEditState.matchId;
                                    const url = editing
                                        ? `/api/matches/${window.matchEditState.matchId}`
                                        : `/api/tournaments/${tournamentId}/matches`;
                                    const payload = editing
                                        ? (window.matchEditState.stage === 'REGULAR'
                                            ? { homeTeamId: hId, awayTeamId: aId, matchDate: dateVal }
                                            : { matchDate: dateVal })
                                        : { homeTeamId: hId, awayTeamId: aId, matchDate: dateVal };

                                    try {
                                        const r = await fetch(url, {
                                            method: editing ? 'PATCH' : 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify(payload)
                                        });

                                        const d = await r.json();
                                        mMsg.style.display = 'block';
                                        if (!r.ok) {
                                            mMsg.style.color = 'var(--orange)';
                                            mMsg.innerText = d.error || 'Error al programar.';
                                        } else {
                                            mMsg.style.color = '#00f0ff';
                                            mMsg.innerText = editing ? 'Partido reprogramado.' : 'Partido guardado.';
                                            setTimeout(() => window.location.reload(), 1500);
                                        }
                                    } catch (err) {
                                        mMsg.style.display = 'block';
                                        mMsg.style.color = 'var(--orange)';
                                        mMsg.innerText = 'Error de red.';
                                    }
                                });

                                // ---- Reprogramar un partido ----
                                // Reutiliza este mismo formulario en vez de duplicar el
                                // selector de fecha en un modal aparte.
                                window.matchEditState = { matchId: null, stage: null };
                                // El generador solo tiene sentido con el calendario vacío.
                                // Se mira tournament.matches y no regularMatches porque esa
                                // variable vive dentro del bloque "si hay partidos", que
                                // justo con el calendario vacío no llega a ejecutarse.
                                const hasRegularMatches = (tournament.matches || []).some(m => m.stage === 'REGULAR');

                                const formTitle = document.getElementById('match-form-title');
                                const editNote = document.getElementById('match-edit-note');
                                const submitBtn = document.getElementById('match-submit-btn');
                                const cancelBtn = document.getElementById('match-edit-cancel');
                                const scheduleGen = document.getElementById('schedule-gen');

                                function exitEditMode() {
                                    window.matchEditState = { matchId: null, stage: null };
                                    formTitle.textContent = 'Programar Nuevo Partido';
                                    editNote.style.display = 'none';
                                    submitBtn.textContent = 'Guardar Partido';
                                    cancelBtn.style.display = 'none';
                                    homeSelect.disabled = false;
                                    awaySelect.disabled = false;
                                    homeSelect.value = '';
                                    awaySelect.value = '';
                                    document.getElementById('matchMessage').style.display = 'none';
                                    if (window.matchDatePicker) window.matchDatePicker.reset();
                                    if (scheduleGen && !hasRegularMatches) scheduleGen.style.display = '';
                                }

                                window.startEditMatch = (matchId) => {
                                    const match = tournament.matches.find(m => m.id === matchId);
                                    if (!match) return;

                                    window.matchEditState = { matchId, stage: match.stage };

                                    formTitle.textContent = 'Reprogramar Partido';
                                    const isPlayoff = match.stage !== 'REGULAR';
                                    const STAGE_NAME = { CUARTOS: 'Cuartos de final', SEMIFINAL: 'Semifinal', FINAL: 'Gran Final' };
                                    editNote.textContent = isPlayoff
                                        ? `${STAGE_NAME[match.stage] || match.stage}: ${match.homeTeam.name} vs ${match.awayTeam.name}. En eliminatorias solo puedes cambiar la fecha.`
                                        : `${match.homeTeam.name} vs ${match.awayTeam.name}`;
                                    editNote.style.display = 'block';
                                    submitBtn.textContent = 'Guardar cambios';
                                    cancelBtn.style.display = 'inline-block';

                                    homeSelect.value = match.homeTeamId;
                                    awaySelect.value = match.awayTeamId;
                                    homeSelect.disabled = isPlayoff;
                                    awaySelect.disabled = isPlayoff;

                                    // El picker trabaja en hora local con el formato que ya
                                    // usa el input oculto (YYYY-MM-DDTHH:mm).
                                    const d = new Date(match.matchDate);
                                    const p = n => String(n).padStart(2, '0');
                                    if (window.matchDatePicker) {
                                        window.matchDatePicker.set(
                                            `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
                                        );
                                    }

                                    if (scheduleGen) scheduleGen.style.display = 'none';

                                    // El formulario vive en la pestaña Calendario; un partido
                                    // de playoffs se edita desde el cuadro, así que hay que
                                    // llevar al organizador hasta allí.
                                    const calTab = document.querySelector('.side-tab[data-tab="calendario"]');
                                    if (calTab) calTab.click();
                                    document.getElementById('organizer-section').scrollIntoView({ block: 'center', behavior: 'smooth' });
                                };

                                cancelBtn.addEventListener('click', exitEditMode);

                                // ---- Generador de calendario (todos contra todos) ----
                                const enrolledCount = (tournament.enrollments || []).length;
                                if (scheduleGen && !hasRegularMatches && enrolledCount >= 2) {
                                    const rounds = enrolledCount % 2 === 0 ? enrolledCount - 1 : enrolledCount;
                                    const games = (enrolledCount * (enrolledCount - 1)) / 2;
                                    document.getElementById('schedule-gen-hint').textContent =
                                        `Con ${enrolledCount} franquicias son ${games} partidos en ${rounds} jornadas, todos contra todos una vez.`;

                                    const startInput = document.getElementById('sched-start');
                                    if (startInput && tournament.startDate) {
                                        startInput.value = new Date(tournament.startDate).toISOString().slice(0, 10);
                                    }
                                    scheduleGen.style.display = '';

                                    document.getElementById('btn-generate-schedule').addEventListener('click', async (ev) => {
                                        const btn = ev.currentTarget;
                                        const times = document.getElementById('sched-times').value
                                            .split(',').map(t => t.trim()).filter(Boolean);

                                        if (!(await showConfirm(`Se crearán ${games} partidos en ${rounds} jornadas. Podrás mover cualquiera después.`, { title: 'Generar calendario', confirmText: 'Generar', danger: false }))) {
                                            return;
                                        }

                                        btn.disabled = true;
                                        const old = btn.textContent;
                                        btn.textContent = 'Generando…';
                                        try {
                                            const r = await fetch(`/api/tournaments/${tournamentId}/schedule`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                body: JSON.stringify({
                                                    startDate: document.getElementById('sched-start').value,
                                                    daysBetweenRounds: document.getElementById('sched-gap').value,
                                                    times
                                                })
                                            });
                                            const d = await r.json();
                                            if (!r.ok) {
                                                showToast(d.error || 'No se pudo generar el calendario.', 'error');
                                                btn.disabled = false;
                                                btn.textContent = old;
                                            } else {
                                                showToast(d.message, 'success');
                                                setTimeout(() => window.location.reload(), 1500);
                                            }
                                        } catch (err) {
                                            showToast('Error de red.', 'error');
                                            btn.disabled = false;
                                            btn.textContent = old;
                                        }
                                    });
                                }

                                // Evento para avanzar de Fase en Playoffs
                                const btnGeneratePlayoffs = document.getElementById('btn-generate-playoffs');
                                if (btnGeneratePlayoffs) {
                                    btnGeneratePlayoffs.addEventListener('click', async () => {
                                        if (!(await showConfirm('¿Estás seguro de avanzar a la siguiente fase de eliminatorias? Esto utilizará los resultados registrados actualmente.', { title: 'Avanzar Fase', confirmText: 'Avanzar', danger: false }))) {
                                            return;
                                        }

                                        btnGeneratePlayoffs.disabled = true;
                                        const oldText = btnGeneratePlayoffs.innerText;
                                        btnGeneratePlayoffs.innerText = 'Generando...';

                                        try {
                                            const r = await fetch(`/api/tournaments/${tournamentId}/playoffs`, {
                                                method: 'POST',
                                                headers: {
                                                    'Authorization': `Bearer ${token}`
                                                }
                                            });

                                            const d = await r.json();
                                            if (!r.ok) {
                                                showToast(d.error || 'Error al generar fase.', 'error');
                                                btnGeneratePlayoffs.disabled = false;
                                                btnGeneratePlayoffs.innerText = oldText;
                                            } else {
                                                showToast(`¡Fase ${d.stage} generada con éxito!`, 'success');
                                                setTimeout(() => window.location.reload(), 2000);
                                            }
                                        } catch (err) {
                                            showToast('Error de conexión.', 'error');
                                            btnGeneratePlayoffs.disabled = false;
                                            btnGeneratePlayoffs.innerText = oldText;
                                        }
                                    });
                                }

                                // Evento para Reiniciar Temporada
                                if (btnResetSeason) {
                                    btnResetSeason.addEventListener('click', async () => {
                                        const confirmed = await showConfirm(
                                            'Esto borrará TODOS los partidos y estadísticas (temporada regular y playoffs) de este torneo, y pondrá los pagos de todas las franquicias inscritas de vuelta en $0. Las franquicias y jugadores NO se borran. Esta acción no se puede deshacer.',
                                            { title: 'Reiniciar Temporada', confirmText: 'Sí, reiniciar todo', cancelText: 'No', danger: true }
                                        );
                                        if (!confirmed) return;

                                        btnResetSeason.disabled = true;
                                        const oldResetText = btnResetSeason.innerText;
                                        btnResetSeason.innerText = 'Reiniciando...';

                                        try {
                                            const r = await fetch(`/api/tournaments/${tournamentId}/reset-season`, {
                                                method: 'POST',
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });

                                            const d = await r.json();
                                            if (!r.ok) {
                                                showToast(d.error || 'Error al reiniciar la temporada.', 'error');
                                                btnResetSeason.disabled = false;
                                                btnResetSeason.innerText = oldResetText;
                                            } else {
                                                showToast('¡Temporada reiniciada con éxito!', 'success');
                                                setTimeout(() => window.location.reload(), 1500);
                                            }
                                        } catch (err) {
                                            showToast('Error de conexión.', 'error');
                                            btnResetSeason.disabled = false;
                                            btnResetSeason.innerText = oldResetText;
                                        }
                                    });
                                }
                            }

            } catch (error) {
                document.getElementById('error-message').innerText = error.message;
                document.getElementById('error-message').style.display = 'block';
                return; // Si no hay torneo, paramos
            }

            // Sección de inscripción. Dos modos:
            //  • Capitán (no organizador): elige entre SUS franquicias no inscritas.
            //  • Organizador dueño (o admin): puede inscribir CUALQUIER franquicia
            //    registrada que aún no esté en el torneo, para armar su liga.
            if (token) {
                try {
                    const selectElement = document.getElementById('franchise-select');
                    const sectionEl = document.getElementById('enrollment-section');
                    const submitBtn = document.querySelector('#enrollForm button[type="submit"]');

                    let candidateTeams = [];
                    if (isOrganizer) {
                        const allRes = await fetch('/api/teams', { credentials: 'include' });
                        candidateTeams = allRes.ok ? await allRes.json() : [];
                        const heading = sectionEl.querySelector('h3');
                        if (heading) heading.textContent = 'Inscribir una Franquicia al Torneo';
                        const defaultOpt = selectElement.querySelector('option[value=""]');
                        if (defaultOpt) defaultOpt.text = 'Selecciona una franquicia...';
                    } else {
                        const teamsRes = await fetch('/api/users/me/teams', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        candidateTeams = teamsRes.ok ? await teamsRes.json() : [];
                    }

                    sectionEl.style.display = 'block';

                    // Orden alfabético: con muchas franquicias el orden por fecha
                    // de creación es inservible para encontrar una.
                    candidateTeams.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));

                    let hasEligibleTeam = false;
                    candidateTeams.forEach(t => {
                        // No ofrecer franquicias ya inscritas en este torneo
                        if (window.enrolledTeamsIds && window.enrolledTeamsIds.has(t.id)) return;

                        const opt = document.createElement('option');
                        opt.value = t.id;

                        if (isOrganizer) {
                            // Etiqueta rica: capitán + nº de jugadores. Es lo que permite
                            // distinguir dos equipos homónimos de capitanes distintos.
                            const cap = t.captain
                                ? (window.capitalizeName
                                    ? window.capitalizeName(`${t.captain.firstName} ${t.captain.lastName}`)
                                    : `${t.captain.firstName} ${t.captain.lastName}`)
                                : 'Sin capitán';
                            const nPlayers = t._count?.players ?? 0;
                            const eligible = nPlayers >= 3;
                            opt.text = `${t.name} — Cap. ${cap} · ${nPlayers} jug.${eligible ? '' : ' (incompleto)'}`;
                            // Los equipos con <3 jugadores no pueden inscribirse (regla del
                            // backend): se muestran deshabilitados para evitar el error a ciegas.
                            if (!eligible) opt.disabled = true;
                            else hasEligibleTeam = true;
                        } else {
                            opt.text = t.name;
                            hasEligibleTeam = true;
                        }

                        selectElement.appendChild(opt);
                    });

                    // Buscador para el organizador: filtra el dropdown por nombre de
                    // equipo o capitán (imprescindible cuando hay decenas de equipos).
                    if (isOrganizer && selectElement.options.length > 1) {
                        const search = document.createElement('input');
                        search.type = 'search';
                        search.id = 'franchise-search';
                        search.className = 'enroll-search';
                        search.placeholder = '🔍 Filtrar por equipo o capitán…';
                        search.autocomplete = 'off';
                        selectElement.parentElement.insertBefore(search, selectElement);
                        search.addEventListener('input', () => {
                            const q = search.value.trim().toLowerCase();
                            [...selectElement.options].forEach(opt => {
                                if (!opt.value) return; // placeholder siempre visible
                                opt.hidden = q !== '' && !opt.text.toLowerCase().includes(q);
                            });
                            // Si la opción elegida quedó oculta, volver al placeholder
                            const sel = selectElement.selectedOptions[0];
                            if (sel && sel.hidden) selectElement.value = '';
                        });
                    }

                    userHasEligibleTeam = hasEligibleTeam;

                    if (!hasEligibleTeam) {
                        const opt = document.createElement('option');
                        opt.value = "";
                        opt.text = isOrganizer
                            ? "No hay franquicias disponibles para inscribir"
                            : "No tienes franquicias disponibles";
                        opt.disabled = true;
                        opt.selected = true;
                        selectElement.innerHTML = ''; // Limpiar
                        selectElement.appendChild(opt);
                        submitBtn.disabled = true;
                        submitBtn.style.opacity = '0.5';
                    }
                } catch (err) {
                    console.error('Error evaluando equipos posibles', err);
                }
            }

            // Manejo Formulario Enrolamiento
            const enrollForm = document.getElementById('enrollForm');
            if (enrollForm) {
                enrollForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const msgBox = document.getElementById('form-msg');
                    const teamId = document.getElementById('franchise-select').value;

                    msgBox.innerText = '';
                    
                    if(!teamId){
                        msgBox.style.color = 'var(--orange)';
                        msgBox.innerText = 'Debes seleccionar una franquicia.';
                        return;
                    }

                    try {
                        const res = await fetch(`/api/tournaments/${tournamentId}/enroll`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ teamId })
                        });
                        
                        const data = await res.json();
                        
                        if (!res.ok) {
                            msgBox.style.color = 'var(--orange)';
                            msgBox.innerText = data.error || 'No se pudo completar la inscripción';
                        } else {
                            msgBox.style.color = '#00f0ff'; // Success cyan-accent
                            msgBox.innerText = '¡Franquicia inscrita al torneo exitosamente!';
                            enrollForm.reset();
                            setTimeout(() => window.location.reload(), 1500);
                        }
                    } catch (err) {
                        msgBox.style.color = 'var(--orange)';
                        msgBox.innerText = 'Error de comunicación con el servidor.';
                    }
                });
            }

            // CTA del estado vacío: solo tiene sentido si NO hay franquicias inscritas.
            // Se configura al final, cuando ya sabemos sesión, rol y elegibilidad, para
            // que el botón lleve a la acción correcta según quién esté mirando.
            const emptyState = document.getElementById('no-teams-msg');
            if (emptyState && emptyState.style.display !== 'none') {
                const cta = document.getElementById('empty-enroll-cta');
                const ctaText = cta.querySelector('.btn-content');
                const emptyText = document.getElementById('empty-state-text');

                if (!token) {
                    // Visitante sin sesión: invitarlo a iniciar sesión para inscribirse.
                    emptyText.textContent = 'Inicia sesión para inscribir tu franquicia y competir.';
                    ctaText.textContent = '🔑 Iniciar sesión';
                    cta.href = '/login.html';
                    cta.style.display = 'inline-flex';
                } else if (isOrganizer) {
                    const copyInviteLink = async (e) => {
                        e.preventDefault();
                        try {
                            // Enlace de invitación: lleva al capitán a crear su franquicia
                            // (registrándose antes si hace falta) ya asociada a este torneo,
                            // en vez de a la página del torneo tal cual.
                            const inviteUrl = `${window.location.origin}/crear-equipo.html?tournamentId=${tournamentId}`;
                            await navigator.clipboard.writeText(inviteUrl);
                            showToast('Enlace de invitación copiado', 'success');
                        } catch (err) {
                            showToast('No se pudo copiar el enlace', 'error');
                        }
                    };

                    if (userHasEligibleTeam) {
                        // Acción principal: inscribir una franquicia directamente en la liga.
                        emptyText.textContent = 'Inscribe una franquicia al torneo, o comparte el enlace para que los capitanes se unan.';
                        ctaText.textContent = '➕ Inscribir una franquicia';
                        cta.href = '#';
                        cta.style.display = 'inline-flex';
                        cta.addEventListener('click', (e) => {
                            e.preventDefault();
                            const section = document.getElementById('enrollment-section');
                            if (section) {
                                section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                section.classList.remove('flash');
                                void section.offsetWidth;
                                section.classList.add('flash');
                            }
                            const sel = document.getElementById('franchise-select');
                            if (sel) setTimeout(() => sel.focus(), 400);
                        });
                        // Acción secundaria: copiar el enlace de invitación.
                        const secondary = document.createElement('a');
                        secondary.href = '#';
                        secondary.textContent = '🔗 Copiar enlace de invitación';
                        secondary.style.cssText = 'display:block; margin-top:1rem; color:var(--cyan,#00f0ff); font-family:var(--font-data,inherit); font-size:0.8rem; cursor:pointer;';
                        secondary.addEventListener('click', copyInviteLink);
                        cta.insertAdjacentElement('afterend', secondary);
                    } else {
                        // No hay ninguna franquicia registrada todavía: invitar capitanes.
                        emptyText.textContent = 'Aún no hay franquicias registradas. Comparte el enlace para que los capitanes creen e inscriban su equipo.';
                        ctaText.textContent = '🔗 Copiar enlace de invitación';
                        cta.href = '#';
                        cta.style.display = 'inline-flex';
                        cta.addEventListener('click', copyInviteLink);
                    }
                } else if (userHasEligibleTeam) {
                    // Capitán con franquicia disponible: llevarlo al formulario de inscripción.
                    emptyText.textContent = 'Sé el primero en unirte a este torneo.';
                    ctaText.textContent = '➕ Inscribir mi franquicia';
                    cta.href = '#';
                    cta.style.display = 'inline-flex';
                    cta.addEventListener('click', (e) => {
                        e.preventDefault();
                        const section = document.getElementById('enrollment-section');
                        if (section) {
                            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            section.classList.remove('flash');
                            void section.offsetWidth; // reinicia la animación
                            section.classList.add('flash');
                        }
                        const sel = document.getElementById('franchise-select');
                        if (sel) setTimeout(() => sel.focus(), 400);
                    });
                } else {
                    // Capitán sin ninguna franquicia: primero necesita crear una.
                    emptyText.textContent = 'Aún no tienes una franquicia. Crea la tuya para poder inscribirte.';
                    ctaText.textContent = '➕ Crear mi franquicia';
                    cta.href = '/crear-equipo.html';
                    cta.style.display = 'inline-flex';
                }
            }

        });
