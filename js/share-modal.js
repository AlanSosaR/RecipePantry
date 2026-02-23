/**
 * ShareModalManager - RecipeHub
 * Maneja la lógica del modal de compartir simplificado
 */
class ShareModalManager {
    constructor() {
        this.recipeId = null;
        this.selectedUsers = [];
        this.allUsers = [
            { id: '1', name: 'Wildryn Castellanos', email: 'wildryn@example.com', avatar: 'W' },
            { id: '2', name: 'Alan Sosa', email: 'alan@example.com', avatar: 'A' },
            { id: '3', name: 'María García', email: 'maria@example.com', avatar: 'M' },
            { id: '4', name: 'Juan Pérez', email: 'juan@example.com', avatar: 'J' },
            { id: '5', name: 'Elena Rodríguez', email: 'elena@example.com', avatar: 'E' }
        ];

        this.init();
    }

    init() {
        this.modal = document.getElementById('share-modal');
        this.searchInput = document.getElementById('user-search-input');
        this.suggestionsContainer = document.getElementById('search-suggestions');
        this.chipsContainer = document.getElementById('selected-users-chips');
        this.btnShare = document.getElementById('btn-share-submit');
        this.btnCopy = document.getElementById('btn-copy-link');

        if (!this.modal) return;

        // Búsqueda en tiempo real
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            this.searchInput.addEventListener('focus', () => {
                if (this.searchInput.value) this.handleSearch(this.searchInput.value);
            });
        }

        // Cerrar modal al hacer clic fuera
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Cerrar con Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    open(recipeId) {
        this.recipeId = recipeId;
        this.selectedUsers = [];
        this.renderChips();
        this.updateShareButton();

        // Simular obtención de datos de la receta
        const recipe = window.dashboard ? window.dashboard.currentRecipes.find(r => r.id === recipeId) : null;
        if (recipe) {
            document.getElementById('share-modal-title').textContent = `Compartir "${recipe.name_es}"`;
            // El tamaño es un mock en este caso ya que no está en la DB real
            document.getElementById('share-modal-size').textContent = "1.56 KB";
        }

        this.modal.classList.remove('hidden');
        if (this.searchInput) this.searchInput.focus();
    }

    close() {
        this.modal.classList.add('hidden');
        if (this.searchInput) this.searchInput.value = '';
        if (this.suggestionsContainer) this.suggestionsContainer.classList.add('hidden');
    }

    handleSearch(query) {
        if (!query.trim()) {
            this.suggestionsContainer.classList.add('hidden');
            return;
        }

        const filteredUsers = this.allUsers.filter(user =>
            (user.name.toLowerCase().includes(query.toLowerCase()) ||
                user.email.toLowerCase().includes(query.toLowerCase())) &&
            !this.selectedUsers.some(selected => selected.id === user.id)
        ).slice(0, 5);

        this.renderSuggestions(filteredUsers);
    }

    renderSuggestions(users) {
        if (users.length === 0) {
            this.suggestionsContainer.classList.add('hidden');
            return;
        }

        this.suggestionsContainer.innerHTML = users.map(user => `
            <div class="suggestion-item" onclick="window.shareModal.addUser('${user.id}')">
                <div class="suggestion-avatar">${user.avatar}</div>
                <div class="suggestion-info">
                    <span class="suggestion-name">${user.name}</span>
                    <span class="suggestion-email">${user.email}</span>
                </div>
            </div>
        `).join('');

        this.suggestionsContainer.classList.remove('hidden');
    }

    addUser(userId) {
        const user = this.allUsers.find(u => u.id === userId);
        if (user && !this.selectedUsers.some(u => u.id === userId)) {
            this.selectedUsers.push(user);
            this.renderChips();
            this.updateShareButton();
            if (this.searchInput) {
                this.searchInput.value = '';
                this.searchInput.focus();
            }
            this.suggestionsContainer.classList.add('hidden');
        }
    }

    removeUser(userId) {
        this.selectedUsers = this.selectedUsers.filter(u => u.id !== userId);
        this.renderChips();
        this.updateShareButton();
    }

    renderChips() {
        if (!this.chipsContainer) return;
        this.chipsContainer.innerHTML = this.selectedUsers.map(user => `
            <div class="user-chip">
                <span>${user.name}</span>
                <span class="material-symbols-outlined remove-chip" onclick="window.shareModal.removeUser('${user.id}')">close</span>
            </div>
        `).join('');
    }

    updateShareButton() {
        if (this.btnShare) {
            this.btnShare.disabled = this.selectedUsers.length === 0;
        }
    }

    share() {
        if (this.selectedUsers.length === 0) return;

        const permission = document.getElementById('share-permission').value;
        const names = this.selectedUsers.map(u => u.name).join(', ');

        // Mock de envío
        window.utils.showToast(`✅ Compartido con ${names}`, 'success');
        this.close();
    }

    copyLink() {
        if (!this.recipeId) return;

        const url = `${window.location.origin}/recipe-detail.html?id=${this.recipeId}`;
        const btnText = this.btnCopy.querySelector('.btn-text');
        const originalText = "Copiar enlace";

        navigator.clipboard.writeText(url).then(() => {
            this.btnCopy.classList.add('copied');
            if (btnText) btnText.textContent = "✅ Enlace copiado";

            setTimeout(() => {
                this.btnCopy.classList.remove('copied');
                if (btnText) btnText.textContent = originalText;
            }, 2000);
        });
    }
}

// Inicializar y exponer globalmente
window.addEventListener('DOMContentLoaded', () => {
    window.shareModal = new ShareModalManager();
});
