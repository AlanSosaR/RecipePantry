// js/localdb.js
// IndexedDB Wrapper for RecipeHub Offline First Architecture

const DB_NAME = 'RecipeHubDB';
const DB_VERSION = 2;

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
                const oldVersion = event.oldVersion;
                const transaction = event.target.transaction;

                // 1. Recipes Index Store (Optimized for list view)
                if (!db.objectStoreNames.contains('recipes_index')) {
                    const indexStore = db.createObjectStore('recipes_index', { keyPath: 'id' });
                    indexStore.createIndex('category_id', 'category_id', { unique: false });
                    indexStore.createIndex('is_favorite', 'is_favorite', { unique: false });
                    indexStore.createIndex('updated_at', 'updated_at', { unique: false });
                }

                // 2. Recipes Full Store (Complete JSON data)
                if (!db.objectStoreNames.contains('recipes_full')) {
                    db.createObjectStore('recipes_full', { keyPath: 'id' });
                }

                // Legacy Recipes Store (v1)
                if (!db.objectStoreNames.contains('recipes')) {
                    const recipeStore = db.createObjectStore('recipes', { keyPath: 'id' });
                    recipeStore.createIndex('category_id', 'category_id', { unique: false });
                    recipeStore.createIndex('is_favorite', 'is_favorite', { unique: false });
                }

                // Data Migration from v1 to v2
                if (oldVersion < 2 && db.objectStoreNames.contains('recipes')) {
                    const oldStore = transaction.objectStore('recipes');
                    const indexStore = transaction.objectStore('recipes_index');
                    const fullStore = transaction.objectStore('recipes_full');

                    // Note: Cursor migration is async but the transaction will stay alive until it's done or errors.
                    oldStore.openCursor().onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            const recipe = cursor.value;
                            // Minimal data for index
                            const indexData = {
                                id: recipe.id,
                                name_es: recipe.name_es,
                                name_en: recipe.name_en,
                                image_url: recipe.image_url || null,
                                updated_at: recipe.updated_at,
                                category_id: recipe.category_id || null,
                                is_favorite: recipe.is_favorite || false,
                                sharingContext: recipe.sharingContext || null,
                                sharedPermission: recipe.sharedPermission || null,
                                isLegacy: true
                            };
                            indexStore.put(indexData);
                            fullStore.put(recipe);
                            cursor.continue();
                        }
                    };
                }

                // Categories Store
                if (!db.objectStoreNames.contains('categories')) {
                    db.createObjectStore('categories', { keyPath: 'id' });
                }

                // Sync Queue Store
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
        if (!Array.isArray(items)) {
            console.error(`[LocalDB] Error crítico: putAll(${storeName}) esperaba un array, recibió:`, typeof items, items);
            return Promise.resolve(); // Fail safely without crashing the execution
        }
        
        const store = await this._getTransaction(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            let completed = 0;
            if (items.length === 0) return resolve();

            for (const item of items) {
                if (!item || typeof item !== 'object' || Array.isArray(item)) {
                    completed++;
                    if (completed === items.length) resolve();
                    continue;
                }
                const req = store.put(item);
                req.onsuccess = () => {
                    completed++;
                    if (completed === items.length) resolve();
                };
                req.onerror = () => reject(req.error);
            }
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
