// public/confirm-modal.js
// Reemplazo de window.confirm() nativo por una ventana flotante con el mismo
// diseño que el resto del sitio (.modal-overlay / .modal-box de theme.css).
// Uso: if (await showConfirm('¿Seguro?')) { ... }
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const title = options.title || 'Confirmar acción';
        const confirmText = options.confirmText || 'Aceptar';
        const cancelText = options.cancelText || 'Cancelar';
        const danger = options.danger !== false;

        let overlay = document.getElementById('confirm-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = 'confirm-modal-overlay';
            overlay.style.display = 'none';
            overlay.innerHTML = `
                <div class="modal-box" style="max-width: 440px;">
                    <div class="modal-header">
                        <h3 class="modal-title" id="confirm-modal-title"></h3>
                        <button type="button" class="modal-close-btn" id="confirm-modal-close" aria-label="Cerrar">&times;</button>
                    </div>
                    <div id="confirm-modal-message" style="color: var(--text-muted); margin: 0 0 1.5rem; line-height: 1.6;"></div>
                    <div class="modal-actions">
                        <button type="button" class="btn" id="confirm-modal-accept"><span class="btn-content"></span></button>
                        <button type="button" class="btn btn-ghost" id="confirm-modal-cancel"><span class="btn-content"></span></button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        overlay.querySelector('#confirm-modal-title').textContent = title;
        overlay.querySelector('#confirm-modal-message').innerHTML = message;

        const acceptBtn = overlay.querySelector('#confirm-modal-accept');
        const cancelBtn = overlay.querySelector('#confirm-modal-cancel');
        const closeBtn = overlay.querySelector('#confirm-modal-close');

        acceptBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-cyan');
        acceptBtn.querySelector('.btn-content').textContent = confirmText;
        cancelBtn.querySelector('.btn-content').textContent = cancelText;

        const cleanup = (result) => {
            overlay.style.display = 'none';
            document.removeEventListener('keydown', onKeydown);
            overlay.removeEventListener('click', onOverlayClick);
            resolve(result);
        };

        const onKeydown = (e) => { if (e.key === 'Escape') cleanup(false); };
        const onOverlayClick = (e) => { if (e.target === overlay) cleanup(false); };

        acceptBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
        closeBtn.onclick = () => cleanup(false);
        overlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeydown);

        overlay.style.display = 'flex';
    });
}
