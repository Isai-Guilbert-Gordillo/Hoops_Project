// RETRO HOOPS · login — lógica de página (extraída del <script> inline).

        // Aviso cuando se llega aquí por cierre de sesión por inactividad.
        if (new URLSearchParams(window.location.search).get('timeout') === '1'
            && typeof showToast === 'function') {
            showToast('Tu sesión se cerró por inactividad. Inicia sesión de nuevo.', 'info');
        }

        // 1. Lógica para el botón de Mostrar/Ocultar Contraseña
        const togglePwdBtn = document.getElementById('toggle-pwd');
        const pwdInput = document.getElementById('password');

        if (togglePwdBtn && pwdInput) {
            togglePwdBtn.addEventListener('click', () => {
                const isPassword = pwdInput.getAttribute('type') === 'password';
                pwdInput.setAttribute('type', isPassword ? 'text' : 'password');
                togglePwdBtn.textContent = isPassword ? '🙈' : '👁️';
            });
        }

        // 2. Lógica de Inicio de Sesión Seguro (con Cookies)
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    if (data.token) {
                        localStorage.setItem('kphoops_token', data.token);
                    }
                    if (data.user) {
                        localStorage.setItem('kphoops_user_name', data.user.firstName);
                        localStorage.setItem('kphoops_user_role', data.user.role);
                    }

                    if (typeof showToast === 'function') showToast('Inicio de sesión exitoso', 'success');

                    // Volver al destino de retorno si vino uno (ej. flujo de
                    // invitación a un torneo). Solo rutas internas: se acepta un
                    // ?next= que empiece con "/" pero no "//" (anti open-redirect).
                    const nextParam = new URLSearchParams(window.location.search).get('next');
                    const dest = (typeof nextParam === 'string' && /^\/(?!\/)/.test(nextParam)) ? nextParam : '/ligas.html';

                    setTimeout(() => {
                        window.location.href = dest;
                    }, 1000);
                } else {
                    if (typeof showToast === 'function') {
                        showToast(data.error || 'Error al iniciar sesión', 'error');
                    } else {
                        alert(data.error || 'Error al iniciar sesión');
                    }
                }
            } catch (error) {
                console.error("Error en la petición:", error);
            }
        });
