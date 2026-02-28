// js/localdb.js
// IndexedDB Wrapper for RecipeHub Offline First Architecture

const DB_NAME = 'RecipeHubDB';
const DB_VERSION = 1;

class LocalDBManager {
    constructor() {
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Recipes Store (Primary storage for offline viewing)
                if (!db.objectStoreNames.contains('recipes')) {
                    const recipeStore = db.createObjectStore('recipes', { keyPath: 'id' });
                    // Indexing to easily query by category or favorite status if needed later
                    recipeStore.createIndex('category_id', 'category_id', { unique: false });
                    recipeStore.createIndex('is_favorite', 'is_favorite', { unique: false });
                }

                // Categories Store
                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'id' });
                }

                // Sync Queue Store (Holds offline mutations: create, update, delete)
                if (!db.objectStoreNames.contains('sync_queue')) {
                    const syncStore = db.createObjectStore('sync_queue', { keyPath: 'uuid' });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async _getTransaction(storeName, mode) {
        if (!this.db) await this.init();
        return this.db.transaction([storeName], mode).objectStore(storeName);
    }

    // --- generic Helpers ---
    async getAll(storeName) {
        const store = await this._getTransaction(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, id) {
        const store = await this._getTransaction(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, item) {
        const store = await this._getTransaction(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async putAll(storeName, items) {
        const store = await this._getTransaction(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            let completed = 0;
            if (items.length === 0) return resolve();

            items.forEach(item => {
                const req = store.put(item);
                req.onsuccess = () => {
                    completed++;
                    if (completed === items.length) resolve();
                };
                req.onerror = () => reject(req.error);
            });
        });
    }

    async delete(storeName, id) {
        const store = await this._getTransaction(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName) {
        const store = await this._getTransaction(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // --- Specialized Sync Queue methods ---
    async enqueueSync(operation, table, payload, recipeId = null) {
        const uuid = crypto.randomUUID();
        const syncItem = {
            uuid,
            operation,    // 'create', 'update', 'delete', 'toggle_favorite', 'add_ingredients', etc
            table,        // 'recipes', 'ingredients', 'preparation_steps'
            payload,      // Object with data
            recipeId,     // Foreign key reference if applicable to group operations
            timestamp: Date.now()
        };
        await this.put('sync_queue', syncItem);
        return uuid;
    }

    async getSyncQueue() {
        const store = await this._getTransaction('sync_queue', 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.index('timestamp').getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async removeSyncItem(uuid) {
        await this.delete('sync_queue', uuid);
    }
}

// Export singleton
window.localDB = new LocalDBManager();
