// Escapa texto para insertarlo de forma segura dentro de HTML generado con
// innerHTML o plantillas de cadena. Convierte los caracteres que el navegador
// interpretaría como marcado (& < > " ') en sus entidades, neutralizando XSS
// almacenado o reflejado a partir de datos de usuario (nombres de equipo o
// jugador, email, sede, etc.). Disponible globalmente como window.escapeHtml
// en todas las páginas (se carga desde views/partials/head.ejs).
(function () {
    'use strict';
    var REPLACEMENTS = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    window.escapeHtml = function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, function (ch) {
            return REPLACEMENTS[ch];
        });
    };
})();
