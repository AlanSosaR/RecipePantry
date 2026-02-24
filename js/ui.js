// UI Helper functions

window.applyTheme = function (theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
    }
    localStorage.setItem('theme', theme);
}

window.initTheme = function () {
    const saved = localStorage.getItem('theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    window.applyTheme(saved);
}

window.toggleDarkMode = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    window.applyTheme(current === 'dark' ? 'light' : 'dark');
}

window.setupMobileMenu = function () {
    const btnMenuMobile = document.getElementById('btnMenuMobile');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar) {
        // Toggle mobile
        if (btnMenuMobile) {
            btnMenuMobile.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('active');
            });
        }

        // Close on overlay click
        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('active');
            });
        }

        // Close on click outside (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 991) {
                if (!sidebar.contains(e.target) && (!btnMenuMobile || !btnMenuMobile.contains(e.target)) && sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                }
            }
        });
    }
}

window.closeSidebar = function () {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('active');
}

// Global user UI updater
window.updateGlobalUserUI = function () {
    if (!window.authManager || !window.authManager.currentUser) return;
    const user = window.authManager.currentUser;

    // Update greeting
    const sidebarGreeting = document.getElementById('sidebar-user-greeting');
    if (sidebarGreeting) {
        const chefText = window.i18n ? window.i18n.t('chefGreeting') : 'Chef';
        sidebarGreeting.textContent = `${chefText} ${user.first_name || ''}`;
    }

    // Update initials
    const sidebarInitials = document.getElementById('sidebar-user-initials');
    if (sidebarInitials) {
        const initials = (user.first_name?.[0] || 'C') + (user.last_name?.[0] || 'H');
        sidebarInitials.textContent = initials.toUpperCase();
    }
}

// Global slim sidebar toggle (desktop)
window.toggleSlimSidebar = function () {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('slim');
    const isSlim = sidebar.classList.contains('slim');
    localStorage.setItem('recipehub_sidebar_slim', isSlim);
}

// Global init for sidebar state
window.initSidebarState = function () {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;

    const isSlim = localStorage.getItem('recipehub_sidebar_slim') === 'true';
    if (isSlim) sidebar.classList.add('slim');

    // Setup menus
    window.setupSidebarMenus();
}

// Global sidebar menu handlers (Theme/Lang)
window.setupSidebarMenus = function () {
    const themeBtn = document.getElementById('btn-theme-toggle');
    const langBtn = document.getElementById('btn-lang-toggle');
    const themeSub = document.getElementById('theme-submenu');
    const langSub = document.getElementById('lang-submenu');

    const toggleSubmenu = (btn, submenu, otherSubmenu) => {
        if (!btn || !submenu) return;

        // Hide other submenu
        if (otherSubmenu) otherSubmenu.style.display = 'none';

        const isVisible = submenu.style.display === 'block';
        if (isVisible) {
            submenu.style.display = 'none';
        } else {
            const rect = btn.getBoundingClientRect();
            submenu.style.top = rect.top + 'px';
            submenu.style.display = 'block';
        }
    };

    themeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSubmenu(themeBtn, themeSub, langSub);
    });

    langBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSubmenu(langBtn, langSub, themeSub);
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (themeSub && !themeBtn?.contains(e.target) && !themeSub.contains(e.target)) {
            themeSub.style.display = 'none';
        }
        if (langSub && !langBtn?.contains(e.target) && !langSub.contains(e.target)) {
            langSub.style.display = 'none';
        }
    });

    // Theme options logic
    document.querySelectorAll('.theme-option').forEach(b => b.addEventListener('click', () => {
        const theme = b.dataset.theme;
        if (theme) {
            localStorage.setItem('theme', theme);
            window.applyTheme(theme);
            // Mark active
            document.querySelectorAll('.theme-option').forEach(opt => opt.classList.remove('active'));
            b.classList.add('active');
            if (themeSub) themeSub.style.display = 'none';
        }
    }));

    // Language options logic
    document.querySelectorAll('.lang-option').forEach(b => b.addEventListener('click', () => {
        const lang = b.dataset.lang;
        if (lang && window.i18n) {
            localStorage.setItem('lang', lang);
            window.i18n.applyLanguage(lang);
            // Mark active
            document.querySelectorAll('.lang-option').forEach(opt => opt.classList.remove('active'));
            b.classList.add('active');
            if (langSub) langSub.style.display = 'none';
        }
    }));

    // Initial active state for options
    const currentTheme = localStorage.getItem('theme') || 'light';
    const currentLang = localStorage.getItem('lang') || 'es';

    document.querySelector(`.theme-option[data-theme="${currentTheme}"]`)?.classList.add('active');
    document.querySelector(`.lang-option[data-lang="${currentLang}"]`)?.classList.add('active');
}

// Initialize on load if sidebar exists
document.addEventListener('DOMContentLoaded', () => {
    window.initSidebarState();
});
