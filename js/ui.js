
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
                window.toggleSidebar(false);
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

window.toggleSidebar = function (open) {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    if (open) {
        sidebar.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Global user UI updater
window.updateGlobalUserUI = function () {
    if (!window.authManager || !window.authManager.currentUser) return;
    const user = window.authManager.currentUser;

    // Update greeting with prefix
    const sidebarGreeting = document.getElementById('sidebar-user-greeting');
    if (sidebarGreeting) {
        const prefix = user.prefix || 'Chef';
        sidebarGreeting.textContent = `${prefix} ${user.first_name || ''}`;
    }

    // Update initials or image in all avatar circles (sidebar and header)
    const avatarContainers = document.querySelectorAll('.user-avatar-m3');
    const initials = (user.first_name?.[0] || 'C') + (user.last_name?.[0] || 'H');
    
    avatarContainers.forEach(container => {
        const initialsSpan = container.querySelector('.user-initials-m3');
        
        if (user.avatar_url) {
            // Apply background image and hide initials
            container.style.backgroundImage = `url(${user.avatar_url})`;
            container.style.backgroundSize = 'cover';
            container.style.backgroundPosition = 'center';
            if (initialsSpan) initialsSpan.style.display = 'none';
        } else {
            // Remove background image and show initials
            container.style.backgroundImage = 'none';
            if (initialsSpan) {
                initialsSpan.textContent = initials.toUpperCase();
                initialsSpan.style.display = 'block';
            }
        }
    });

    // Make sidebar profile clickable
    const profileSection = document.querySelector('.sidebar-user-profile');
    if (profileSection && !profileSection.dataset.listenerAdded) {
        profileSection.style.cursor = 'pointer';
        profileSection.title = 'Editar Perfil';
        profileSection.onclick = () => {
            window.location.href = 'profile.html';
        };
        profileSection.dataset.listenerAdded = 'true';
    }
}

// Global slim sidebar toggle (desktop)
window.toggleSlimSidebar = function () {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('sidebar--slim');
    const isSlim = sidebar.classList.contains('sidebar--slim');
    localStorage.setItem('recipe_pantry_sidebar_slim', isSlim);
}

// Global init for sidebar state
window.initSidebarState = function () {
    const sidebar = document.getElementById('main-sidebar');
    if (!sidebar) return;

    const isSlim = localStorage.getItem('recipe_pantry_sidebar_slim') === 'true';
    if (isSlim) sidebar.classList.add('sidebar--slim');

    // Setup menus
    window.setupSidebarMenus();
}

// Global sidebar menu handlers (Theme/Lang)
window.setupSidebarMenus = function () {
    const themeSub = document.getElementById('theme-submenu');
    const langSub = document.getElementById('lang-submenu');

    const openSubmenu = (btn, submenu) => {
        if (!btn || !submenu) return;
        // Close all submenus first
        document.querySelectorAll('#lang-submenu')
            .forEach(s => s.style.display = 'none');

        if (window.innerWidth >= 1024) {
            // Desktop: Open to the right
            document.body.appendChild(submenu);
            const rect = btn.getBoundingClientRect();
            submenu.style.cssText = `
                display: block;
                position: fixed;
                left: ${rect.right + 8}px;
                top: ${rect.top}px;
                bottom: auto;
                z-index: 99999;
                background: #1e1e1e;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                min-width: 200px;
                pointer-events: all;
            `;
        } else {
            // Mobile: Keep upward positioning
            const rect = btn.getBoundingClientRect();
            submenu.style.position = 'fixed';
            submenu.style.left = (rect.right + 8) + 'px';
            submenu.style.bottom = (window.innerHeight - rect.bottom) + 'px';
            submenu.style.top = 'auto';
            submenu.style.zIndex = '9999';
            submenu.style.display = 'block';
        }
    }


    document.getElementById('btn-lang-toggle')
        ?.addEventListener('click', e => {
            e.stopPropagation();
            openSubmenu(e.currentTarget, document.getElementById('lang-submenu'));
        });

    document.addEventListener('click', () => {
        if (langSub) langSub.style.display = 'none';
    });


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
    const currentLang = localStorage.getItem('lang') || 'es';
    document.querySelector(`.lang-option[data-lang="${currentLang}"]`)?.classList.add('active');
}

// Initialize on load if sidebar exists
document.addEventListener('DOMContentLoaded', () => {
    window.initSidebarState();
});
