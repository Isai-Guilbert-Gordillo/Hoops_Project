// RETRO HOOPS · crear-torneo — lógica de página (extraída del <script> inline).

        const form = document.querySelector('form');

        document.addEventListener('DOMContentLoaded', async () => {
            const token = localStorage.getItem('kphoops_token');
            if (!token) {
                form.style.display = 'none';
                document.getElementById('limit-reached').style.display = 'none';
                showToast('Debes iniciar sesión para acceder a esta página.', 'error');
                setTimeout(() => window.location.href = '/login.html', 1500);
                return;
            }

            try {
                const meRes = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!meRes.ok) {
                    localStorage.removeItem('kphoops_token');
                    showToast('Sesión expirada. Inicia sesión de nuevo.', 'error');
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

            // Verificar si el usuario ha iniciado sesión antes de nada
            const token = localStorage.getItem('kphoops_token');
            if (!token) {
                showToast('Debes iniciar sesión para crear un torneo.', 'error');
                setTimeout(() => window.location.href = '/login.html', 1500);
                return;
            }

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

            // Enviar petición al backend agregando el Token
            fetch('/api/tournaments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(data)
            })
            .then(res => res.json().then(body => ({ status: res.status, body })))
            .then(({ status, body }) => {
                if (status === 401 || status === 403) {
                    localStorage.removeItem('kphoops_token');
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
