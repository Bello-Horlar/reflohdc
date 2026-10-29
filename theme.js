/* TITLE: assets/js/theme.js */
const RefloTheme = {
    init() {
        const saved = localStorage.getItem('reflo-theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
    },
    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('reflo-theme', next);
    }
};

// Apply theme immediately to prevent white flicker on page load
RefloTheme.init();