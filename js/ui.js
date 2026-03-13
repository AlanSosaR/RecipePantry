
window.setupMobileMenu = function () {
    const btnMenuMobile = document.getElementById('btnMenuMobile');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar) {
        // Toggle mobile
        if (btnMenuMobile) {
            btnMenuMobile.addEventListener('click', (e) => {
                e.stopPropagation();
                window.toggleSidebar(true);
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
        const fName = user.first_name || '';
        const lName = user.last_name || '';
        
        // Robust name display: fallback to 'Chef' if first_name is missing
        let fullName = `${prefix} ${fName} ${lName}`.replace(/\s+/g, ' ').trim();
        if (!fName && !lName) fullName = prefix;
        
        sidebarGreeting.textContent = fullName;
    }

    // Update initials or image in all avatar circles (sidebar and header)
    const avatarContainers = document.querySelectorAll('.user-avatar-m3');
    const initials = (user.first_name?.[0] || 'C') + (user.last_name?.[0] || 'H');
    
    avatarContainers.forEach(container => {
        const initialsSpan = container.querySelector('.user-initials-m3');
        const imgTag = container.querySelector('img');
        
        if (user.avatar_url) {
            // Option 1: If there's an <img> tag, update its src
            if (imgTag) {
                imgTag.src = user.avatar_url;
                imgTag.style.display = 'block';
                container.style.backgroundImage = 'none'; // Clear bg if img is used
            } else {
                // Option 2: Use background image (sidebar default)
                container.style.backgroundImage = `url(${user.avatar_url})`;
                container.style.backgroundSize = 'cover';
                container.style.backgroundPosition = 'center';
            }
            if (initialsSpan) initialsSpan.style.display = 'none';
        } else {
            // Fallback to initials
            container.style.backgroundImage = 'none';
            if (imgTag) imgTag.style.display = 'none';
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
    
    // Setup global utils for notification bar if not exists
    if (!window.utils) window.utils = {};
    
    window.utils.showNotificationBar = function(id, text) {
        const bar = document.getElementById('notification-bar');
        const textEl = document.getElementById('notification-text');
        if (bar && textEl) {
            textEl.textContent = text;
            bar.classList.remove('hidden');
            bar.classList.add('active');
        }
    };

    window.utils.updateNotificationBar = function(id, text) {
        const textEl = document.getElementById('notification-text');
        if (textEl) textEl.textContent = text;
    };

    window.utils.hideNotificationBar = function(id) {
        const bar = document.getElementById('notification-bar');
        if (bar) {
            bar.classList.remove('active');
            setTimeout(() => bar.classList.add('hidden'), 300);
        }
    };

    // Material 3 Expressive Download Progress Bar
    window.utils.showDownloadProgress = function(current, total) {
        let container = document.getElementById('global-download-progress');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-download-progress';
            container.style.cssText = `
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--surface, #1e1e1e);
                color: var(--on-surface, #FFFFFF);
                padding: 16px 24px;
                border-radius: 28px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                z-index: 10000;
                box-shadow: 0 12px 32px rgba(0,0,0,0.5);
                width: 90%;
                max-width: 400px;
                animation: slideUpFade 0.4s cubic-bezier(0.2, 0, 0, 1) forwards;
                border: 1px solid rgba(255,255,255,0.05);
            `;
            if (!document.getElementById('download-anim-style')) {
                const style = document.createElement('style');
                style.id = 'download-anim-style';
                style.textContent = `
                    @keyframes slideUpFade {
                        from { opacity: 0; transform: translate(-50%, 40px) scale(0.95); }
                        to { opacity: 1; transform: translate(-50%, 0) scale(1); }
                    }
                    .m3-progress-track {
                        width: 100%;
                        height: 6px;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 4px;
                        overflow: hidden;
                    }
                    .m3-progress-fill {
                        height: 100%;
                        background: var(--primary, #10B981);
                        width: 0%;
                        border-radius: 4px;
                        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                `;
                document.head.appendChild(style);
            }
            container.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-family: var(--font-display, sans-serif);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: var(--primary, #10B981);">cloud_download</span>
                        <span id="global-progress-text" style="font-size: 15px;">Descargando...</span>
                    </div>
                    <span id="global-progress-percent" style="color: var(--primary, #10B981); font-size: 15px;">0%</span>
                </div>
                <div class="m3-progress-track">
                    <div id="global-progress-fill" class="m3-progress-fill"></div>
                </div>
            `;
            document.body.appendChild(container);
        }

        const percent = total > 0 ? Math.round((current / total) * 100) : 100;
        document.getElementById('global-progress-text').textContent = `Sincronizando (${current}/${total})`;
        document.getElementById('global-progress-percent').textContent = `${percent}%`;
        document.getElementById('global-progress-fill').style.width = `${percent}%`;
    };

    window.utils.hideDownloadProgress = function() {
        const container = document.getElementById('global-download-progress');
        if (container) {
            container.style.animation = 'slideUpFade 0.3s cubic-bezier(0.2, 0, 0, 1) reverse forwards';
            setTimeout(() => container.remove(), 300);
        }
    };

});
