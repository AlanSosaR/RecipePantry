// js/dashboard.js
// Lógica específica del Dashboard

class DashboardManager {
    constructor() {
        this.currentFilters = {};
        this.viewMode = 'list'; // Enforce list view
        this.currentFilter = 'all';
    }

    async init() {
        try {
            console.log('🚀 Inicializando RecipeHub Premium...');

            // 1. Verificar autenticación silenciosamente
            // Nota: El HTML ya tiene lógica para ocultar el dashboard si el landing no está oculto
            const isAuthenticated = await window.authManager.checkAuth();

            const landingEl = document.getElementById('landing-section');
            const dashboardEl = document.getElementById('dashboard-app');

            if (!isAuthenticated) {
                console.log('💡 Modo Landing: Usuario no detectado');
                if (landingEl) landingEl.classList.remove('hidden');
                if (dashboardEl) dashboardEl.classList.add('hidden');
                return;
            }

            console.log('✅ Modo Dashboard: Usuario detectado:', window.authManager.currentUser);
            // Ocultar landing y mostrar dashboard inmediatamente
            if (landingEl) landingEl.classList.add('hidden');
            if (dashboardEl) dashboardEl.classList.remove('hidden');

            // Actualizar datos de usuario en la UI
            this.updateUserUI();

            // 2. Cargar datos iniciales
            console.log('📦 Cargando recetas...');
            // Categorías removidas por petición del usuario
            await this.loadRecipes().catch(e => console.error('Error cargando recetas:', e));

            console.log('✨ Dashboard listo');

            this.setupEventListeners();
        } catch (error) {
            console.error('❌ Error crítico en Dashboard.init:', error);
            const landingEl = document.getElementById('landing-section');
            if (landingEl) landingEl.classList.remove('hidden');
        }
    }

    updateUserUI() {
        if (!window.authManager.currentUser) return;
        const user = window.authManager.currentUser;

        // Actualizar saludo en sidebar
        const sidebarGreeting = document.getElementById('sidebar-user-greeting');
        if (sidebarGreeting) {
            sidebarGreeting.textContent = `Hola, ${user.first_name || 'Chef'}`;
        }

        // Actualizar iniciales
        const sidebarInitials = document.getElementById('sidebar-user-initials');
        if (sidebarInitials) {
            const initials = (user.first_name?.[0] || 'C') + (user.last_name?.[0] || 'H');
            sidebarInitials.textContent = initials.toUpperCase();
        }
    }

    setupEventListeners() {
        // Buscador
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            let timeout;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.loadRecipes({ search: e.target.value }), 300);
            });
        }

        // Navegación Sidebar Desktop
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const view = item.dataset.view;
                if (view) {
                    e.preventDefault();
                    this.switchView(view, item);
                    // Si es mobile, cerramos el drawer
                    if (window.innerWidth < 1024) {
                        this.toggleSidebar(false);
                    }
                }
            });
        });

        // Overlay se maneja vía onclick en el HTML para simplicidad, pero añadimos respaldo aquí
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.toggleSidebar(false));
        }
    }

    toggleSidebar(forceState = null) {
        const sidebar = document.getElementById('main-sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        if (!sidebar || !overlay) return;

        const isOpen = sidebar.classList.contains('active');
        const shouldOpen = forceState !== null ? forceState : !isOpen;

        if (shouldOpen) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
        } else {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    switchView(view, activeItem) {
        console.log('Cambiando a vista:', view);

        // Actualizar estado activo
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        if (activeItem) activeItem.classList.add('active');

        // Lógica de filtrado rápido según la vista
        if (view === 'favorites') {
            this.loadRecipes({ favorite: true, orderBy: 'name_es', ascending: true });
        } else if (view === 'recipes') {
            this.loadRecipes({ orderBy: 'name_es', ascending: true });
        } else if (view === 'shared') {
            // Placeholder para compartidas
            this.loadRecipes({ shared: true });
        }
    }

    async loadRecipes(filters = {}) {
        this.lastFilters = filters;
        const result = await window.db.getMyRecipes(filters);

        if (!result.success) {
            console.error('Error cargando recetas:', result.error);
            return;
        }

        this.currentRecipes = result.recipes;

        const titleEl = document.getElementById('view-title');
        if (titleEl) {
            if (filters.search) {
                titleEl.textContent = `Resultados para "${filters.search}"`;
            } else if (filters.favorite) {
                titleEl.textContent = 'Favoritos';
            } else if (filters.shared) {
                titleEl.textContent = 'Compartidas';
            } else {
                titleEl.textContent = 'Mis Recetas';
            }
        }

        this.renderRecipesGrid(this.currentRecipes);
    }

    renderRecipesGrid(recipes) {
        const container = document.getElementById('recipesGrid');
        if (!container) return;

        const emptyState = document.getElementById('emptyState');

        if (recipes.length === 0) {
            container.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        // Render unificado como lista refinada
        const header = `
            <div class="list-header hidden-mobile-lg">
                <div class="icon-cell"></div>
                <div class="title-cell">NOMBRE</div>
                <div class="meta-cell">CATEGORÍA</div>
                <div class="meta-cell">ACCESO</div>
                <div class="meta-cell">ÚLTIMA MODIFICACIÓN</div>
                <div class="action-cell"></div>
            </div>
        `;

        const rows = recipes.map(recipe => {
            const date = new Date(recipe.updated_at).toLocaleDateString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
            return `
                <div class="file-row group" onclick="window.location.href='recipe-detail.html?id=${recipe.id}'">
                    <div class="icon-cell">
                        <span class="material-symbols-outlined" style="font-size: 24px; color: var(--primary);">description</span>
                    </div>
                    <div class="title-cell">
                        <span class="title">${recipe.name_es}</span>
                    </div>
                    <div class="meta-cell">
                        <span class="badge-tag">General</span>
                    </div>
                    <div class="meta-cell">Solo tú</div>
                    <div class="meta-cell">${date}</div>
                    <div class="action-cell">
                        <div class="row-actions">
                            <button class="btn-action-icon" title="Editar" onclick="event.stopPropagation(); window.location.href='recipe-form.html?id=${recipe.id}'">
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button class="btn-favorite-m3 ${recipe.is_favorite ? 'active' : ''}" 
                                onclick="event.stopPropagation(); window.dashboard.toggleFavorite('${recipe.id}', ${recipe.is_favorite})">
                                <span class="material-symbols-outlined">
                                    ${recipe.is_favorite ? 'star' : 'star_border'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = header + rows;
    }

    async toggleFavorite(recipeId, currentStatus) {
        const result = await window.db.toggleFavorite(recipeId, currentStatus);
        if (result.success) {
            window.utils.showToast(result.isFavorite ? 'Añadido a favoritos' : 'Eliminado de favoritos', 'success');
            const recipe = this.currentRecipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.is_favorite = result.isFavorite;
                this.renderRecipesGrid(this.currentRecipes);
            }
        } else {
            window.utils.showToast('Error al actualizar favoritos', 'error');
        }
    }
}

// Inicializar y exponer
window.dashboard = new DashboardManager();
window.addEventListener('DOMContentLoaded', () => window.dashboard.init());
