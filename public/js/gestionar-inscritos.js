// RETRO HOOPS · gestionar-inscritos — lógica de página (extraída del <script> inline).

        document.addEventListener('DOMContentLoaded', async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const tournamentId = urlParams.get('tournamentId');
            const token = localStorage.getItem('kphoops_token');

            if (!tournamentId || !token) {
                showToast('Acceso denegado', 'error');
                setTimeout(() => window.location.href = '/', 1500);
                return;
            }

            try {
                const res = await fetch(`/api/tournaments/${tournamentId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
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
                        <td style="font-weight: 600;">${enroll.team.name}</td>
                        <td style="color: var(--cyan-accent);">${enroll.status}</td>
                        <td style="color: var(--text-muted); font-size: 0.9rem;">${formattedDate}</td>
                        <td>
                            <button class="btn btn-danger btn-sm" onclick="removeEnrollment('${enroll.id}')"><span class="btn-content">Dar de Baja</span></button>
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

            const token = localStorage.getItem('kphoops_token');
            try {
                const res = await fetch(`/api/enrollments/${enrollmentId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al eliminar');

                showToast('Equipo eliminado del torneo exitosamente', 'success');
                setTimeout(() => window.location.reload(), 1000);
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
