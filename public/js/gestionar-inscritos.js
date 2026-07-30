// RETRO HOOPS · gestionar-inscritos — lógica de página (extraída del <script> inline).

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove-enrollment"]');
            if (!btn) return;
            removeEnrollment(btn.dataset.enrollId);
        });

        document.addEventListener('DOMContentLoaded', async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const tournamentId = urlParams.get('tournamentId');
            // Pista no sensible (solo el nombre a mostrar) para descartar de
            // entrada al visitante obviamente sin sesión, sin esperar una
            // respuesta de red. La autorización real la hace el servidor abajo,
            // leyendo la cookie httpOnly.
            const looksLoggedIn = !!localStorage.getItem('kphoops_user_name');

            if (!tournamentId || !looksLoggedIn) {
                showToast('Acceso denegado', 'error');
                setTimeout(() => window.location.href = '/', 1500);
                return;
            }

            try {
                const res = await fetch(`/api/tournaments/${tournamentId}`, {
                    credentials: 'include'
                });

                if (!res.ok) throw new Error('Error al cargar torneo');

                const tournament = await res.json();
                document.getElementById('tournament-name').innerText = tournament.name;

                const tbody = document.getElementById('enrollments-body');
                tbody.innerHTML = '';

                if (!tournament.enrollments || tournament.enrollments.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay equipos inscritos aún</td></tr>';
                    return;
                }

                tournament.enrollments.forEach(enroll => {
                    const tr = document.createElement('tr');
                    const d = new Date(enroll.createdAt);
                    const formattedDate = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    tr.innerHTML = `
                        <td style="font-weight: 600;">${escapeHtml(enroll.team.name)}</td>
                        <td style="color: var(--cyan-accent);">${escapeHtml(enroll.status)}</td>
                        <td style="color: var(--text-muted); font-size: 0.9rem;">${formattedDate}</td>
                        <td>
                            <button class="btn btn-danger btn-sm" data-action="remove-enrollment" data-enroll-id="${enroll.id}"><span class="btn-content">Dar de Baja</span></button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

            } catch (error) {
                console.error(error);
                showToast(error.message, 'error');
            }
        });

        async function removeEnrollment(enrollmentId) {
            if (!(await showConfirm("¿Estás seguro de que deseas eliminar la inscripción de este equipo del torneo?", { title: '⚠️ Dar de Baja', confirmText: 'Dar de Baja' }))) {
                return;
            }

            try {
                const res = await fetch(`/api/enrollments/${enrollmentId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al eliminar');

                showToast('Equipo eliminado del torneo exitosamente', 'success');
                setTimeout(() => window.location.reload(), 1000);
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
