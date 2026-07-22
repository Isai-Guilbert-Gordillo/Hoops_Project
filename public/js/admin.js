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
            const token = localStorage.getItem('kphoops_token');
            const userName = localStorage.getItem('kphoops_user_name');
            const btnLogin = document.getElementById('btn-login');
            const btnRegister = document.getElementById('btn-register');
            const userGreeting = document.getElementById('user-greeting');
            const btnLogout = document.getElementById('btn-logout');

            if (token && userName) {
                btnLogin.style.display = 'none';
                btnRegister.style.display = 'none';
                userGreeting.style.display = 'block';
                userGreeting.textContent = `Hola, ${capitalizeName(userName)}`;
                btnLogout.style.display = 'inline-block';
            }

            btnLogout.addEventListener('click', () => {
                localStorage.removeItem('kphoops_token');
                localStorage.removeItem('kphoops_user_name');
                window.location.href = '/';
            });

            const currentUserId = (() => {
                if (!token) return null;
                try {
                    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                    return JSON.parse(decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))).id;
                } catch (e) { return null; }
            })();

            const usersCard = document.getElementById('users-card');
            const usersBody = document.getElementById('users-body');
            const accessDenied = document.getElementById('access-denied');

            if (!token) {
                usersCard.style.display = 'none';
                accessDenied.style.display = 'block';
                return;
            }

            async function loadUsers() {
                try {
                    const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });

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
                        const safeUserName = capitalizeName(user.firstName + ' ' + user.lastName).replace(/"/g, '&quot;');
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
                                <div class="user-row-name">${capitalizeName(user.firstName + ' ' + user.lastName)}${isSelf ? ' <span style="color: var(--cyan-accent); font-size: 0.75rem;">(Tú)</span>' : ''}</div>
                                <div class="user-row-email">${user.email}</div>
                            </td>
                            <td><span class="badge ${badgeClass}">${user.role}</span></td>
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
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
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
                        headers: { 'Authorization': `Bearer ${token}` }
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
