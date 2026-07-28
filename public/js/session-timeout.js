// Cierre de sesión por INACTIVIDAD (10 min).
//
// Solo actúa si hay sesión iniciada (token en localStorage). Cualquier actividad
// del usuario (mover el ratón, teclear, hacer scroll, tocar la pantalla) reinicia
// el contador. Al cumplirse la inactividad se limpia la sesión local, se cierra la
// cookie httpOnly en el servidor y se redirige a login.
//
// La actividad y el cierre se comparten entre pestañas vía localStorage: seguir
// activo en una pestaña mantiene viva la sesión en las demás, y cerrar sesión en
// una las cierra en todas.
//
// Nota: es una defensa del lado del cliente (el estándar para "logout por
// inactividad"). El JWT en la cookie sigue teniendo su propia expiración larga;
// para una expiración corta con refresco deslizante haría falta más trabajo en
// el backend (pendiente aparte).
(function () {
    'use strict';

    var IDLE_MS = 10 * 60 * 1000;                 // 10 minutos
    var TOKEN_KEY = 'kphoops_token';
    var ACTIVITY_KEY = 'kphoops_last_activity';
    var LOGOUT_KEY = 'kphoops_logout';

    function isLoggedIn() { return !!localStorage.getItem(TOKEN_KEY); }

    // En páginas públicas (sin sesión) no hay nada que vigilar.
    if (!isLoggedIn()) return;

    var timer = null;
    var loggingOut = false;

    function clearLocalSession() {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem('kphoops_user_name');
            localStorage.removeItem('kphoops_user_role');
            // Importante: borrar también la marca de actividad para que un login
            // posterior NO se cierre de inmediato leyendo un valor viejo (evita
            // el bucle login -> "inactividad" -> login).
            localStorage.removeItem(ACTIVITY_KEY);
        } catch (e) {}
    }

    function logout() {
        if (loggingOut) return;
        loggingOut = true;
        if (timer) clearTimeout(timer);
        clearLocalSession();
        // Avisar a otras pestañas para que también cierren.
        try { localStorage.setItem(LOGOUT_KEY, String(Date.now())); } catch (e) {}
        var go = function () { window.location.href = '/login.html?timeout=1'; };
        // Cerrar también la cookie de sesión en el servidor (best-effort).
        if (window.fetch) {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(go, go);
        } else {
            go();
        }
    }

    // Revisa el tiempo inactivo real (compartido entre pestañas) y decide.
    function check() {
        if (!isLoggedIn()) return;
        var last = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10);
        var idle = Date.now() - last;
        if (idle >= IDLE_MS) {
            logout();
        } else {
            // Otra pestaña registró actividad hace poco: reprogramar por lo que resta.
            schedule(IDLE_MS - idle);
        }
    }

    function schedule(ms) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(check, (ms == null ? IDLE_MS : ms) + 500);
    }

    // Registra actividad (con throttle para no escribir a localStorage sin parar).
    var nextWrite = 0;
    function onActivity() {
        if (loggingOut) return;
        var now = Date.now();
        if (now < nextWrite) return;
        nextWrite = now + 2000; // como mucho, una escritura cada 2 s
        try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch (e) {}
        schedule();
    }

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (ev) {
        window.addEventListener(ev, onActivity, { passive: true });
    });

    // Sincronía entre pestañas.
    window.addEventListener('storage', function (e) {
        if (e.key === LOGOUT_KEY) {
            // Ya se cerró sesión en otra pestaña: limpiar y salir sin repetir el fetch.
            loggingOut = true;
            clearLocalSession();
            window.location.href = '/login.html?timeout=1';
        } else if (e.key === ACTIVITY_KEY) {
            schedule(); // hubo actividad en otra pestaña: reprogramar
        }
    });

    // Al volver a la pestaña, revisar de inmediato (por si se cumplió el tiempo
    // mientras estaba en segundo plano).
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) check();
    });

    // Arranque: si ya se venía inactivo más de lo permitido, cerrar ya.
    var last = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10);
    if (last && (Date.now() - last) >= IDLE_MS) {
        logout();
    } else {
        try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch (e) {}
        schedule();
    }
})();
