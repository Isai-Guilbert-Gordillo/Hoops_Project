// RETRO HOOPS · registro — lógica de página (extraída del <script> inline).

        const form = document.getElementById('register-form');
        const nextParam = new URLSearchParams(window.location.search).get('next');

        // Solo se aceptan rutas internas como destino (empieza con "/" pero no
        // "//"): evita open-redirect a sitios externos vía ?next=.
        function safeNext(n) {
            return (typeof n === 'string' && /^\/(?!\/)/.test(n)) ? n : null;
        }

        // Si venimos de un flujo con retorno (ej. invitación a un torneo), que el
        // enlace "¿Ya tienes cuenta? Inicia sesión" también lo conserve.
        if (safeNext(nextParam)) {
            const loginLink = document.querySelector('a.back-link[href^="/login"]');
            if (loginLink) loginLink.href = '/login.html?next=' + encodeURIComponent(nextParam);
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const data = Object.fromEntries(new FormData(form).entries());
            const dest = safeNext(nextParam) || '/ligas.html';

            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const json = await res.json();

                if (res.status !== 201) {
                    showToast('Error: ' + (json.error || 'no se pudo registrar'), 'error');
                    return;
                }

                // Auto-login: deja la sesión lista para no pedir login otra vez y
                // continuar directo al destino (p. ej. crear franquicia).
                const loginRes = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email: data.email, password: data.password })
                });

                if (loginRes.ok) {
                    const ld = await loginRes.json();
                    if (ld.token) localStorage.setItem('kphoops_token', ld.token);
                    if (ld.user) {
                        localStorage.setItem('kphoops_user_name', ld.user.firstName);
                        localStorage.setItem('kphoops_user_role', ld.user.role);
                    }
                    // Reiniciar el reloj de inactividad al abrir sesión.
                    localStorage.setItem('kphoops_last_activity', String(Date.now()));
                    showToast('¡Cuenta creada! Entrando...', 'success');
                    setTimeout(() => window.location.href = dest, 1000);
                } else {
                    // Si el auto-login fallara, mandarlo a login conservando el destino.
                    showToast('Cuenta creada. Inicia sesión para continuar.', 'success');
                    const q = safeNext(nextParam) ? '?next=' + encodeURIComponent(nextParam) : '';
                    setTimeout(() => window.location.href = '/login.html' + q, 1200);
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('Error de red', 'error');
            }
        });
