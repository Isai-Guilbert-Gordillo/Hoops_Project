// RETRO HOOPS · registro — lógica de página (extraída del <script> inline).

        const form = document.getElementById('register-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            .then(res => res.json().then(json => ({ status: res.status, json })))
            .then(({ status, json }) => {
                if (status === 201) {
                    showToast('Usuario registrado con éxito. Redirigiendo a Login...', 'success');
                    setTimeout(() => window.location.href = '/login.html', 1500);
                } else {
                    showToast('Error: ' + json.error, 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('Error de red', 'error');
            });
        });
