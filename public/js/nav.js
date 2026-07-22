// RETRO HOOPS — Navegación responsiva + animaciones + autenticación segura

window.capitalizeName = function (str) {
    if (!str || typeof str !== 'string') return str;
    return str.toLowerCase().split(' ').filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// ❌ Se eliminó la función parseJwtPayload porque leer el token en el cliente ya no es seguro.

document.addEventListener('DOMContentLoaded', async () => { 
    // ==========================================
    // 1. UI: MENÚ MÓVIL (¡INTACTO!)
    // ==========================================
    const toggle = document.getElementById('nav-toggle');
    const navWrapper = document.getElementById('nav-wrapper');

    if (toggle && navWrapper) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('open');
            navWrapper.classList.toggle('open');
        });
        navWrapper.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                toggle.classList.remove('open');
                navWrapper.classList.remove('open');
            });
        });
    }

    // ==========================================
    // 2. NUEVA AUTENTICACIÓN (COOKIES HTTP-ONLY)
    // ==========================================
    const mainNav = document.querySelector('nav.main-nav');
    const btnLogin = document.getElementById('btn-login');
    const btnRegister = document.getElementById('btn-register');
    const btnLogout = document.getElementById('btn-logout');
    const greeting = document.getElementById('user-greeting');
    const btnNewTournament = document.getElementById('btn-new-tournament');

    if (btnNewTournament) btnNewTournament.style.display = 'none';

    try {
        // Consultamos al backend si existe una sesión válida en la cookie
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        
        if (res.ok) {
            const data = await res.json();
            const user = data.user || data; 

            // Actualizar la interfaz para usuario logueado
            if (btnLogin) btnLogin.style.display = 'none';
            if (btnRegister) btnRegister.style.display = 'none';
            if (greeting) {
                greeting.innerText = 'Hola, ' + window.capitalizeName(user.firstName);
                greeting.style.display = 'inline-block';
            }
            if (btnLogout) btnLogout.style.display = 'inline-block';
            if (btnNewTournament) btnNewTournament.style.display = 'inline-block';

            // Si es ADMIN, le inyectamos la pestaña de Administración
            if (mainNav && user.role === 'ADMIN' && !document.getElementById('nav-admin-link')) {
                const adminLink = document.createElement('a');
                adminLink.href = '/admin.html';
                adminLink.id = 'nav-admin-link';
                adminLink.textContent = 'Admin';
                const headerActions = mainNav.querySelector('.header-actions');
                if (headerActions) {
                    mainNav.insertBefore(adminLink, headerActions);
                } else {
                    mainNav.appendChild(adminLink);
                }
            }
        }
    } catch (error) {
        console.error("Modo invitado: No hay sesión activa");
    }

    // Evento de Cerrar Sesión (Destruye la cookie en el backend)
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                localStorage.removeItem('kphoops_token'); // Limpieza de basura vieja por seguridad
                window.location.href = '/';
            } catch (err) {
                console.error("Error al cerrar sesión:", err);
            }
        });
    }

    // ==========================================
    // 3. UI: LINKS ACTIVOS Y ANIMACIONES (¡INTACTO!)
    // ==========================================
    const path = window.location.pathname;
    document.querySelectorAll('nav.main-nav a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && href !== '/' && path.includes(href.replace('.html', ''))) {
            link.classList.add('active');
        } else if (href === '/' && (path === '/' || path === '/index.html')) {
            link.classList.add('active');
        }
    });

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length) {
        // Entrada escalonada: los .reveal que comparten un mismo padre entran en
        // secuencia (delay creciente), para que la lista se "arme" ante los ojos.
        revealEls.forEach(el => {
            const parent = el.parentElement;
            if (!parent || reduceMotion) return;
            const siblings = Array.from(parent.children).filter(c => c.classList.contains('reveal'));
            const idx = siblings.indexOf(el);
            if (idx > 0) el.style.transitionDelay = Math.min(idx, 8) * 90 + 'ms';
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        revealEls.forEach(el => observer.observe(el));
    }

    // ==========================================================================
    // Datos vivos: contadores que cuentan de 0 al valor cuando entran en vista.
    // Uso: <span class="count-up" data-countup="128">0</span>. Las páginas con
    // datos dinámicos pueden fijar data-countup y llamar window.animateCount(el).
    // ==========================================================================
    window.animateCount = function (el) {
        const raw = el.getAttribute('data-countup');
        const target = parseFloat(raw);
        if (isNaN(target)) return;
        const decimals = ((raw.split('.')[1]) || '').length;
        if (reduceMotion) { el.textContent = target.toFixed(decimals); return; }
        const duration = 1100;
        const startAt = performance.now();
        (function tick(now) {
            const p = Math.min((now - startAt) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = (target * eased).toFixed(decimals);
            if (p < 1) requestAnimationFrame(tick);
            else el.textContent = target.toFixed(decimals);
        })(startAt);
    };
    document.addEventListener('DOMContentLoaded', () => {
    const navContainer = document.getElementById('navbar-container');
    
    if (navContainer) {
        navContainer.innerHTML = `
            <nav class="top-nav">
                <div class="logo">RETRO HOOPS</div>
                <ul class="nav-links">
                    <li><a href="/index.html">INICIO</a></li>
                    <li><a href="/ligas.html">LIGAS</a></li>
                    <li><a href="/franquicias.html">FRANQUICIAS</a></li>
                    <li><a href="/estadisticas.html">ESTADÍSTICAS</a></li>
                </ul>
                <div class="user-menu">
                    <span>Hola, Isaí</span>
                    <button class="btn-cerrar">CERRAR SESIÓN</button>
                </div>
            </nav>
        `;
    }
});

    const countEls = document.querySelectorAll('[data-countup]');
    if (countEls.length) {
        const countObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    window.animateCount(entry.target);
                    countObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.4 });
        countEls.forEach(el => countObserver.observe(el));
    }
});