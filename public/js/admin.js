// RETRO HOOPS · admin — lógica de página (extraída del <script> inline).

        document.addEventListener('click', (e) => {
            const delBtn = e.target.closest('[data-action="delete-user"]');
            if (delBtn) {
                window.deleteUser(delBtn.dataset.userId, delBtn.dataset.userName);
                return;
            }
            const roleBtn = e.target.closest('[data-action="change-role"]');
            if (roleBtn) {
                window.changeRole(roleBtn.dataset.userId, roleBtn.dataset.role);
            }
        });

        document.addEventListener('DOMContentLoaded', async () => {
            // El saludo y los botones de sesión del header ya los resuelve
            // /js/nav.js (lee la cookie httpOnly vía /api/auth/me); esta página
            // no necesita su propia copia de esa lógica.

            const usersCard = document.getElementById('users-card');
            const usersBody = document.getElementById('users-body');
            const accessDenied = document.getElementById('access-denied');

            // Quién soy y si soy ADMIN: antes se sacaba decodificando el JWT a
            // mano en el navegador (inseguro y fue explícitamente eliminado de
            // nav.js por esto mismo). /api/auth/me ya hace ese trabajo del lado
            // del servidor, leyendo la cookie httpOnly.
            let currentUserId = null;
            try {
                const meRes = await fetch('/api/auth/me', { credentials: 'include' });
                if (!meRes.ok) {
                    usersCard.style.display = 'none';
                    accessDenied.style.display = 'block';
                    return;
                }
                const me = await meRes.json();
                currentUserId = me.id;
                // La UI se ajusta aquí para no mostrar la tabla ni un instante a
                // quien no es admin, pero la autorización real vuelve a
                // comprobarse en el servidor en cada fetch de abajo (un 403 de
                // loadUsers() cae en el mismo aviso).
                if (me.role !== 'ADMIN') {
                    usersCard.style.display = 'none';
                    accessDenied.style.display = 'block';
                    return;
                }
            } catch (e) {
                usersCard.style.display = 'none';
                accessDenied.style.display = 'block';
                return;
            }

            async function loadUsers() {
                try {
                    const res = await fetch('/api/users', { credentials: 'include' });

                    if (res.status === 403) {
                        usersCard.style.display = 'none';
                        accessDenied.style.display = 'block';
                        return;
                    }

                    if (!res.ok) throw new Error('Error al cargar usuarios');

                    const users = await res.json();
                    usersBody.innerHTML = '';

                    users.forEach(user => {
                        const isSelf = user.id === currentUserId;
                        const badgeClass = user.role === 'ADMIN' ? 'role-badge-admin' : user.role === 'ORGANIZER' ? 'role-badge-organizer' : 'role-badge-player';

                        // Botón de borrado: disponible para PLAYER y ORGANIZER (nunca
                        // sobre uno mismo ni sobre otro ADMIN, ambos bloqueados también
                        // en el backend). Elimina en cascada torneos, franquicias,
                        // jugadores, inscripciones y partidos asociados a ese usuario.
                        const safeUserName = escapeHtml(capitalizeName(user.firstName + ' ' + user.lastName));
                        const deleteBtn = (!isSelf && user.role !== 'ADMIN')
                            ? `<button class="btn btn-danger btn-sm" data-action="delete-user" data-user-id="${user.id}" data-user-name="${safeUserName}"><span class="btn-content">Eliminar Usuario</span></button>`
                            : '';

                        let actions = '';
                        if (isSelf) {
                            actions = '<span style="color: var(--text-muted); font-size: 0.8rem;">No puedes cambiar tu propio rol</span>';
                        } else if (user.role === 'ADMIN') {
                            actions = `<div class="role-actions">
                                <button class="btn btn-danger btn-sm" data-action="change-role" data-user-id="${user.id}" data-role="PLAYER"><span class="btn-content">Quitar Admin</span></button>
                            </div>`;
                        } else if (user.role === 'ORGANIZER') {
                            actions = `<div class="role-actions">
                                <button class="btn btn-danger btn-sm" data-action="change-role" data-user-id="${user.id}" data-role="PLAYER"><span class="btn-content">Quitar Organizador</span></button>
                                <button class="btn btn-solid-gold btn-sm" data-action="change-role" data-user-id="${user.id}" data-role="ADMIN"><span class="btn-content">Hacer Admin</span></button>
                                ${deleteBtn}
                            </div>`;
                        } else {
                            actions = `<div class="role-actions">
                                <button class="btn btn-cyan btn-sm" data-action="change-role" data-user-id="${user.id}" data-role="ORGANIZER"><span class="btn-content">Hacer Organizador</span></button>
                                <button class="btn btn-solid-gold btn-sm" data-action="change-role" data-user-id="${user.id}" data-role="ADMIN"><span class="btn-content">Hacer Admin</span></button>
                                ${deleteBtn}
                            </div>`;
                        }

                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>
                                <div class="user-row-name">${escapeHtml(capitalizeName(user.firstName + ' ' + user.lastName))}${isSelf ? ' <span style="color: var(--cyan-accent); font-size: 0.75rem;">(Tú)</span>' : ''}</div>
                                <div class="user-row-email">${escapeHtml(user.email)}</div>
                            </td>
                            <td><span class="badge ${badgeClass}">${escapeHtml(user.role)}</span></td>
                            <td style="text-align: right;">${actions}</td>
                        `;
                        usersBody.appendChild(tr);
                    });
                } catch (error) {
                    usersBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--orange);">Error al cargar usuarios.</td></tr>`;
                }
            }

            window.changeRole = async (userId, role) => {
                try {
                    const res = await fetch(`/api/users/${userId}/role`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ role })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Error al actualizar el rol');
                    showToast(role === 'ADMIN' ? 'Usuario promovido a administrador' : 'Rol de administrador removido', 'success');
                    loadUsers();
                } catch (error) {
                    showToast(error.message, 'error');
                }
            };

            window.deleteUser = async (userId, userName) => {
                const confirmed = await showConfirm(
                    `Esto borra permanentemente su cuenta y TODOS sus datos asociados:` +
                    `<ul style="margin: 0.75rem 0; padding-left: 1.25rem;">` +
                        `<li>Torneos que organiza (con sus partidos e inscripciones)</li>` +
                        `<li>Franquicias que capitanea (con su roster de jugadores)</li>` +
                        `<li>Cualquier partido donde hayan participado esas franquicias</li>` +
                    `</ul>` +
                    `<strong style="color: var(--text-main);">Esta acción NO se puede deshacer.</strong>`,
                    { title: `⚠️ Eliminar a ${userName}`, confirmText: 'Eliminar Usuario' }
                );
                if (!confirmed) return;

                try {
                    const res = await fetch(`/api/users/${userId}`, {
                        method: 'DELETE',
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Error al eliminar el usuario');
                    showToast('Usuario y todos sus datos fueron eliminados', 'success');
                    loadUsers();
                } catch (error) {
                    showToast(error.message, 'error');
                }
            };

            loadUsers();
        });
