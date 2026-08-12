// Lógica de la página de reseteo. Va en archivo externo (no inline) porque la
// CSP de helmet (scriptSrc 'self') bloquea los scripts inline: si esto fuera un
// <script> dentro del EJS, no correría y el formulario se enviaría como GET
// nativo, perdiendo el token de la URL.
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-form');
    if (!form) return;
    const msg = document.getElementById('msg');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm').value;
        if (password !== confirm) {
            msg.textContent = 'Las contraseñas no coinciden.';
            return;
        }
        msg.textContent = 'Guardando...';
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: document.getElementById('token').value, password }),
            });
            const data = await res.json();
            if (res.ok) {
                form.style.display = 'none';
                msg.textContent = '¡Listo! Ya puedes iniciar sesión en la app con tu nueva contraseña.';
            } else {
                msg.textContent = data.error || 'No se pudo actualizar.';
            }
        } catch (err) {
            msg.textContent = 'Error de conexión. Intenta de nuevo.';
        }
    });
});
