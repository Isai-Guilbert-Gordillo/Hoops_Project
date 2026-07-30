// RETRO HOOPS · crear-torneo — lógica de página (extraída del <script> inline).

        const form = document.querySelector('form');

        document.addEventListener('DOMContentLoaded', async () => {
            // /api/auth/me lee la cookie httpOnly de sesión (no hay token en
            // localStorage que comprobar antes): si no hay sesión válida, esta
            // llamada ya devuelve 401 y sirve de única guarda.
            try {
                const meRes = await fetch('/api/auth/me', { credentials: 'include' });
                if (!meRes.ok) {
                    form.style.display = 'none';
                    document.getElementById('limit-reached').style.display = 'none';
                    showToast('Debes iniciar sesión para acceder a esta página.', 'error');
                    setTimeout(() => window.location.href = '/login.html', 1500);
                    return;
                }
                const me = await meRes.json();
                if (me.role !== 'ADMIN' && me.role !== 'ORGANIZER') {
                    form.style.display = 'none';
                    document.getElementById('limit-reached').style.display = 'none';
                    showToast('No tienes permiso para crear torneos.', 'error');
                    setTimeout(() => window.location.href = '/', 1500);
                    return;
                }
            } catch (e) {
                console.error('Error verificando permisos:', e);
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault(); // Evitar recarga de página

            // Extraer datos del formulario
            const formData = new FormData(form);
            const formObj = Object.fromEntries(formData.entries());

            // Mapeamos los campos en español al formato inglés del backend
            const data = {
                name: formObj.nombre,
                category: formObj.categoria,
                venue: formObj.sede,
                maxTeams: formObj.equipos,
                startDate: formObj.fecha,
                inscriptionFee: formObj.inscriptionFee
            };

            // La sesión viaja en la cookie httpOnly (credentials:'include'), no
            // hace falta ningún token de por medio. Si no hay sesión válida el
            // servidor responde 401/403 y se maneja abajo igual que antes.
            fetch('/api/tournaments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(data)
            })
            .then(res => res.json().then(body => ({ status: res.status, body })))
            .then(({ status, body }) => {
                if (status === 401 || status === 403) {
                    showToast('Sesión expirada o no autorizada', 'error');
                    setTimeout(() => window.location.href = '/login.html', 1500);
                    return;
                }
                if (status < 200 || status >= 300) {
                    showToast(body.error || 'No se pudo crear el torneo.', 'error');
                    return;
                }
                showToast('¡Torneo guardado en la base de datos con éxito!', 'success');
                setTimeout(() => window.location.href = '/ligas.html', 1500);
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Error de conexión. Intenta de nuevo.', 'error');
            });
        });
