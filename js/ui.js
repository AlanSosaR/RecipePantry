// UI Helper functions

window.toggleDarkMode = function () {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

window.initTheme = function () {
    if (localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

window.setupMobileMenu = function () {
    const btnMenuMobile = document.getElementById('btnMenuMobile');
    const sidebar = document.querySelector('.sidebar');

    if (btnMenuMobile && sidebar) {
        btnMenuMobile.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        });

        // Cerrar al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!sidebar.contains(e.target) && !btnMenuMobile.contains(e.target) && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });
    }
}
