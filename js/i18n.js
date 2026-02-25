/**
 * RecipeHub – Global i18n System
 * Usage:
 *   - Add data-i18n="key" to any element whose textContent should be translated.
 *   - Add data-i18n-placeholder="key" to inputs/textareas for placeholder.
 *   - Call window.i18n.toggle() from a language button.
 *   - The module auto-applies the saved language on DOMContentLoaded.
 */

(function () {
    const translations = {
        es: {
            // ── Sidebar nav ──────────────────────────────────────────────
            navRecipes: 'Recetas',
            navFavorites: 'Favoritos',
            navScan: 'Escanear Receta',
            navShared: 'Compartidas',
            navLogout: 'Cerrar Sesión',
            navBack: 'Volver',
            navToggleLanguage: 'Cambiar idioma',

            // ── Top bar / search ─────────────────────────────────────────
            searchPlaceholder: 'Buscar en mi recetario...',

            // ── Auth / Login ──────────────────────────────────────────────
            authTitleLogin: "Bienvenido",
            authSubtitleLogin: "Ingresa a tu colección privada de recetas.",
            authTitleRegister: "Crear Cuenta",
            authSubtitleRegister: "Únete para guardar tus recetas familiares.",
            lblName: "Nombre Completo",
            lblEmail: "Email",
            lblPassword: "Contraseña",
            lblConfirm: "Confirmar Contraseña",
            btnSubmitLogin: "Ingresar",
            btnSubmitRegister: "Registrarse",
            switchTextLogin: "¿No tienes cuenta? Regístrate",
            switchTextRegister: "¿Ya tienes cuenta? Ingresa",
            btnBack: "Volver al inicio",
            msgNameReq: "El nombre es obligatorio",
            msgPassLen: "Mínimo 6 caracteres",
            msgPassMismatch: "Las contraseñas no coinciden",
            msgEntering: "Ingresando...",
            msgCreating: "Creando...",
            msgCreatedSuccess: "¡Cuenta creada! Revisa tu email.",
            toastLoginSuccess: "Ha iniciado sesión en RecipeHub",

            // ── Dashboard headers ─────────────────────────────────────────
            myRecipes: 'Mis Recetas',
            myFavorites: 'Mis Favoritos',
            sharedWithMe: 'Compartidas conmigo',

            // ── List view column headers ──────────────────────────────────
            colName: 'NOMBRE',
            colCategory: 'CATEGORÍA',
            colAccess: 'ACCESO',
            colLastModified: 'ÚLTIMA MODIFICACIÓN',

            // ── Notifications ─────────────────────────────────────────────
            notifications: 'Notificaciones',
            noNotifications: 'No tienes notificaciones nuevas',

            // ── Sharing permissions ───────────────────────────────────────
            permView: 'Solo ver',
            permAdd: 'Agregar a sus recetas',

            // ── Empty state ───────────────────────────────────────────────
            noRecipesTitle: 'Aún no tienes recetas',
            noRecipesDesc: 'Comienza digitalizando tus recetas en papel o agrega una manualmente.',
            scanRecipeBtn: 'Escanear Receta',

            // ── Landing page ──────────────────────────────────────────────
            landingSubtitle: 'Tu recetario digital personal.',
            featOcrTitle: 'Escaneo OCR',
            featOcrDesc: 'Digitaliza recetas en papel',
            featPlanTitle: 'Plan de Comidas',
            featPlanDesc: 'Organiza tu semana',
            btnGetStarted: 'Comenzar',

            // ── OCR page ──────────────────────────────────────────────────
            ocrTitle: 'Escanear Receta',
            ocrStep1Title: 'Prepara tu escáner',
            ocrStep1Desc: 'Sube una foto clara de tu receta para digitalizarla al instante.',
            ocrStep2Title: 'Analizando...',
            ocrStep2Desc: 'Estamos extrayendo los secretos de tu receta.',
            ocrStep3Title: 'Resultado',
            ocrTabRaw: 'Texto Crudo',
            ocrTabParsed: 'Vista Previa',
            ocrTabAg: 'Análisis AG',
            ocrCamera: 'Cámara',
            ocrGallery: 'Galería',
            ocrRetry: 'Reintentar',
            ocrSave: 'Guardar Receta',
            ocrSelectImage: 'Selecciona o arrastra una imagen',
            ocrFormats: 'Formatos JPG, PNG compatibles',
            ocrTipsTitle: 'Consejos Pro:',
            ocrTip1: 'Asegúrate que el texto sea legible.',
            ocrTip2: 'Usa buena iluminación (evita sombras).',
            ocrTip3: 'Mantén la cámara paralela al papel.',
            ocrProcessing: 'Iniciando OCR...',
            ocrReading: 'Leyendo... {progress}%',
            ocrNoIngredients: 'No se detectaron ingredientes',
            ocrNoSteps: 'No se detectaron pasos',
            ocrCreatingRecipe: 'Crear Receta Ahora',
            ocrCameraHint: 'Apunta la cámara a la receta y presiona el botón',
            ocrTextPlaceholder: 'El texto aparecerá aquí...',
            ocrCorrectionHint: 'Puedes corregir cualquier error de detección directamente arriba.',
            ocrAgAnalysisTitle: 'ANÁLISIS EXHAUSTIVO TOTAL',
            ocrAgVersion: 'Modo Motor de Escaneo Ultra-Preciso v1.0 • Anti Gravity',
            ocrClose: 'Cerrar',
            ocrGalleryTooltip: 'Subir imagen desde galería',
            ocrCaptureTooltip: 'Capturar y analizar receta',
            ocrSwitchCameraTooltip: 'Cambiar cámara',
            ocrAiFallback: 'Error con la IA, intentando escaneo local...',
            ocrAiError: 'Error en el proceso de OCR con IA',
            ocrAiProcessing: 'Analizando con IA...',
            navNotificationsTitle: 'Notificaciones',

            // ── Recipe form ───────────────────────────────────────────────
            formNewRecipe: 'Nueva Receta',
            formEditRecipe: 'Editar Receta',
            formSave: 'Guardar',

            // ── Recipe detail ─────────────────────────────────────────────
            detailDescription: 'Descripción',
            detailPantry: 'Despensa (Notas)',
            detailIngredients: 'Ingredientes',
            detailSteps: 'Pasos de preparación',
            detailMoreInfo: 'Más información',
            detailCreated: 'Creada',

            // ── New labels ────────────────────────────────────────────────
            chefGreeting: 'Chef',
            viewGrid: 'Cuadrícula',
            viewGridLarge: 'Cuadrícula grande',
            viewList: 'Lista',
            viewMenuHeader: 'Diseño',
            shareFile: 'Compartir archivo',
            searchUserPlaceholder: 'Buscar por nombre o correo...',
            permissionLabel: 'Permiso:',
            shareBtn: 'Compartir',
            copyLinkLabel: 'Copiar enlace',
            managePermsTitle: 'Administrar permisos — {recipe}',

            // ── Detail / Form specific ─────────────────────────────────────
            loadingRecipe: 'Cargando receta...',
            noDescription: 'No hay descripción disponible.',
            formNameLabel: 'Nombre de la Receta',
            formCategoryLabel: 'Categoría',
            formDescriptionLabel: 'Descripción',
            formPantryLabel: 'Despensa (Notas)',
            formIngredientsLabel: 'Ingredientes',
            formStepsLabel: 'Pasos de preparación',
            formAddIngredient: 'Añadir Ingrediente',
            formAddStep: 'Añadir Paso',
            formImageUpload: 'Sube una imagen o arrastra',
            formImageRemove: 'Quitar imagen',
            placeholderRecipeName: 'Ej. Tacos al pastor',
            placeholderDescription: 'Cuéntanos un poco sobre esta receta...',
            placeholderPantry: 'Notas sobre ingredientes o variantes...',
            placeholderIngredient: 'Ej: 500g de Harina',
            placeholderStep: 'Escribe el paso de preparación...',
            formNewRecipe: 'Nueva Receta',
            formEditRecipe: 'Editar Receta',
            formSave: 'Guardar Receta',
            toggleTheme: 'Cambiar tema',
            cookNow: 'Cocinar ahora',
            editBtn: 'Editar',
            favBtn: 'Favorito',
            addFav: 'Agregar a favoritos',
            loadingRecipes: 'Cargando recetas...',
            detailDescription: 'Descripción',
            detailPantry: 'Despensa (Notas)',
            detailIngredients: 'Ingredientes',
            detailSteps: 'Pasos de preparación',
            detailMoreInfo: 'Más información',
            detailCreated: 'Creada',
            detailSharedBy: 'Compartida por {name}',
            infoTitle: 'Información',
            selectRecipeHint: 'Selecciona una receta para ver los detalles',

            // ── Dynamic / Action JS ───────────────────────────────────────
            searchResults: 'Resultados para "{search}"',
            shared: 'Compartidas',
            accessPublic: 'Público',
            accessPrivate: 'Solo tú',
            accessShared: 'Compartida',
            canCopy: 'Puede copiar',
            canView: 'Solo ver',
            deleteConfirm: '¿Seguro que desea eliminar la receta?',
            deleteBtn: 'ELIMINAR',
            deleteSuccess: 'Receta eliminada correctamente',
            deleteError: 'Error al eliminar la receta',
            favAdded: 'Añadido a favoritos',
            favRemoved: 'Eliminado de favoritos',
            favError: 'Error al actualizar favoritos',
            shareNotAvailable: 'Funcionalidad de compartir no disponible',
            linkCopied: 'Enlace copiado al portapapeles',
            downloading: 'Descargando...',
            openIn: 'Abrir en...',
            managePerms: 'Administrar permisos',
            rename: 'Renombrar',
            removeFav: 'Quitar de favoritos',
            addFav: 'Añadir a favoritos',
            recipePersonal: 'Receta personal',
            recipeType: 'Tipo',
            detailLastModified: 'Última modificación',
            saving: 'Guardando...',
            saveSuccess: '¡Receta guardada con éxito!',
            saveError: 'Error al guardar la receta',
            ocrScanning: 'Receta escaneada con OCR',
            toastLoginSuccess: "Ha iniciado sesión en RecipeHub",

            // ── Share Modal ───────────────────────────────────────────────
            shareRecipeTitle: 'Compartir "{recipe}"',
            searching: 'Buscando...',
            noUsersFound: 'No se encontraron usuarios',
            userSearchError: 'Error al buscar usuarios',
            sharing: 'Compartiendo...',
            linkCopiedShort: '✅ Enlace copiado',
            sharedWith: '✅ Compartido con {names}',
            shareError: 'Error al compartir la receta',

            // ── Notifications ─────────────────────────────────────────────
            notifNewRecipe: '¡Has recibido una nueva receta!',
            notifEmpty: 'Sin notificaciones',
            notifSharedRecipe: 'Receta compartida',
            notifSomebody: 'Alguien',
            notifCanCopy: '📋 Puedes agregar a tus recetas',
            notifCanViewOnly: '👁️ Solo puedes ver · Expira en 7 días',
            notifUserShared: '{user} compartió una receta',

            // ── Profile ───────────────────────────────────────────────────
            profileUnnamed: 'Usuario sin nombre',
            profileUpdated: '¡Perfil actualizado!',
            profilePhotoUpdated: '¡Foto actualizada!',
            profileExported: 'Recetas exportadas',
            profileEditFirstName: 'Nombre:',
            profileEditLastName: 'Apellido:',
            profileEditCollection: 'Nombre de tu colección:',
            profileUploadError: 'Error al subir imagen',

            // ── OCR ───────────────────────────────────────────────────────
            ocrReading: 'Leyendo... {progress}%',
            ocrReadError: 'No pudimos leer la imagen. Intenta con más luz.',
            ocrNoIngredients: 'No se detectaron ingredientes',
            ocrNoSteps: 'No se detectaron pasos',
            ocrNameRequired: 'La receta necesita un nombre',

            // ── OCR Analysis ──────────────────────────────────────────────
            ocrAnalysisError: 'El sistema de reconocimiento no se ha cargado. Por favor, recarga.',
            ocrDocTypeRecipe: 'Receta de Cocina',
            ocrDocTypeGeneral: 'Documento / Texto General',
            ocrLangEs: 'Español',
            ocrLangAuto: 'Detectado (Auto)',
            ocrAlertLowConfidence: 'Calidad de lectura media/baja: algunos caracteres pueden ser ambiguos.',
            ocrAlertShortText: 'Texto muy corto: verifique si la captura está completa.',
            ocrReportExtracted: '📄 CONTENIDO EXTRAÍDO:',
            ocrReportElements: '📊 ELEMENTOS DETECTADOS:',
            ocrReportAlerts: '⚠️ ALERTAS:',
            ocrReportNominal: 'Ninguna: Lectura nominal.',
            ocrReportTpl: '- Texto: {hasText} | Idioma: {language}\n- Números: {numCount} encontrados\n- Emojis/Símbolos: {symbols}\n- Tipo de documento: {docType}',
            ocrCameraError: 'No se pudo acceder a la cámara. Revisa los permisos.',
            ocrProcessError: 'Error al procesar la imagen',
        },

        en: {
            // ── Sidebar nav ──────────────────────────────────────────────
            navRecipes: 'Recipes',
            navFavorites: 'Favorites',
            navScan: 'Scan Recipe',
            navShared: 'Shared',
            navLogout: 'Log Out',
            navBack: 'Back',
            navToggleLanguage: 'Toggle language',

            // ── Top bar / search ─────────────────────────────────────────
            searchPlaceholder: 'Search my cookbook...',

            // ── Auth / Login ──────────────────────────────────────────────
            authTitleLogin: "Welcome Back",
            authSubtitleLogin: "Log in to your private recipe collection.",
            authTitleRegister: "Create Account",
            authSubtitleRegister: "Join to save your family recipes.",
            lblName: "Full Name",
            lblEmail: "Email",
            lblPassword: "Password",
            lblConfirm: "Confirm Password",
            btnSubmitLogin: "Log In",
            btnSubmitRegister: "Sign Up",
            switchTextLogin: "Don't have an account? Sign Up",
            switchTextRegister: "Already have an account? Log In",
            btnBack: "Back to Home",
            msgNameReq: "Name is required",
            msgPassLen: "Min 6 characters",
            msgPassMismatch: "Passwords do not match",
            msgEntering: "Logging in...",
            msgCreating: "Creating...",
            msgCreatedSuccess: "Account created! Please check your email.",
            toastLoginSuccess: "Welcome to RecipeHub!",

            // ── Dashboard headers ─────────────────────────────────────────
            myRecipes: 'My Recipes',
            myFavorites: 'My Favorites',
            sharedWithMe: 'Shared with me',

            // ── List view column headers ──────────────────────────────────
            colName: 'NAME',
            colCategory: 'CATEGORY',
            colAccess: 'ACCESS',
            colLastModified: 'LAST MODIFIED',

            // ── Notifications ─────────────────────────────────────────────
            notifications: 'Notifications',
            noNotifications: 'You have no new notifications',

            // ── Sharing permissions ───────────────────────────────────────
            permView: 'View only',
            permAdd: 'Add to their recipes',

            // ── Empty state ───────────────────────────────────────────────
            noRecipesTitle: "You don't have any recipes yet",
            noRecipesDesc: 'Start by scanning a paper recipe or add one manually.',
            scanRecipeBtn: 'Scan Recipe',

            // ── Landing page ──────────────────────────────────────────────
            landingSubtitle: 'Your personal digital cookbook.',
            featOcrTitle: 'OCR Scan',
            featOcrDesc: 'Digitize paper recipes',
            featPlanTitle: 'Meal Plan',
            featPlanDesc: 'Organize your week',
            btnGetStarted: 'Get Started',

            // ── OCR page ──────────────────────────────────────────────────
            ocrTitle: 'Scan Recipe',
            ocrStep1Title: 'Prepare your scanner',
            ocrStep1Desc: 'Upload a clear photo of your recipe to digitize it instantly.',
            ocrStep2Title: 'Analyzing...',
            ocrStep2Desc: 'We are extracting the secrets of your recipe.',
            ocrStep3Title: 'Result',
            ocrTabRaw: 'Raw Text',
            ocrTabParsed: 'Preview',
            ocrTabAg: 'AG Analysis',
            ocrCamera: 'Camera',
            ocrGallery: 'Gallery',
            ocrRetry: 'Retry',
            ocrSave: 'Save Recipe',
            ocrSelectImage: 'Select or drag an image',
            ocrFormats: 'Compatible JPG, PNG formats',
            ocrTipsTitle: 'Pro Tips:',
            ocrTip1: 'Make sure the text is legible.',
            ocrTip2: 'Use good lighting (avoid shadows).',
            ocrTip3: 'Keep the camera parallel to the paper.',
            ocrProcessing: 'Starting OCR...',
            ocrReading: 'Reading... {progress}%',
            ocrNoIngredients: 'No ingredients detected',
            ocrNoSteps: 'No steps detected',
            ocrCreatingRecipe: 'Create Recipe Now',
            ocrCameraHint: 'Point the camera at the recipe and press the button',
            ocrTextPlaceholder: 'Text will appear here...',
            ocrCorrectionHint: 'You can correct any detection errors directly above.',
            ocrAgAnalysisTitle: 'TOTAL EXHAUSTIVE ANALYSIS',
            ocrAgVersion: 'Ultra-Precise Scan Engine Mode v1.0 • Anti Gravity',
            ocrClose: 'Close',
            ocrGalleryTooltip: 'Upload image from gallery',
            ocrCaptureTooltip: 'Capture and analyze recipe',
            ocrSwitchCameraTooltip: 'Switch camera',
            ocrAiFallback: 'AI Error, trying local scan...',
            ocrAiError: 'Error in AI OCR process',
            ocrAiProcessing: 'Analyzing with AI...',
            navNotificationsTitle: 'Notifications',

            // ── Recipe form ───────────────────────────────────────────────
            formNewRecipe: 'New Recipe',
            formEditRecipe: 'Edit Recipe',
            formSave: 'Save',

            // ── Recipe detail ─────────────────────────────────────────────
            detailDescription: 'Description',
            detailPantry: 'Pantry (Notes)',
            detailIngredients: 'Ingredients',
            detailSteps: 'Preparation steps',
            detailMoreInfo: 'More information',
            detailCreated: 'Created',

            // ── New labels ────────────────────────────────────────────────
            chefGreeting: 'Chef',
            viewGrid: 'Grid',
            viewGridLarge: 'Large Grid',
            viewList: 'List',
            viewMenuHeader: 'Layout',
            shareFile: 'Share file',
            searchUserPlaceholder: 'Search by name or email...',
            permissionLabel: 'Permission:',
            shareBtn: 'Share now',
            copyLinkLabel: 'Copy link',
            managePermsTitle: 'Manage permissions — {recipe}',

            // ── Detail / Form specific ─────────────────────────────────────
            loadingRecipe: 'Loading recipe...',
            noDescription: 'No description available.',
            formNameLabel: 'Recipe Name',
            formCategoryLabel: 'Category',
            formDescriptionLabel: 'Description',
            formPantryLabel: 'Pantry (Notes)',
            formIngredientsLabel: 'Ingredients',
            formStepsLabel: 'Preparation Steps',
            formAddIngredient: 'Add Ingredient',
            formAddStep: 'Add Step',
            formImageUpload: 'Upload image or drag',
            formImageRemove: 'Remove image',
            placeholderRecipeName: 'e.g. Tacos al pastor',
            placeholderDescription: 'Tell us a bit about this recipe...',
            placeholderPantry: 'Notes on ingredients or variants...',
            placeholderIngredient: 'e.g. 500g Flour',
            placeholderStep: 'Write the preparation step...',
            formNewRecipe: 'New Recipe',
            formEditRecipe: 'Edit Recipe',
            formSave: 'Save Recipe',
            toggleTheme: 'Toggle Theme',
            cookNow: 'Cook Now',
            editBtn: 'Edit',
            favBtn: 'Favorite',
            loadingRecipes: 'Loading recipes...',
            detailDescription: 'Description',
            detailPantry: 'Pantry (Notes)',
            detailIngredients: 'Ingredients',
            detailSteps: 'Preparation Steps',
            detailMoreInfo: 'More Information',
            detailCreated: 'Created',
            detailSharedBy: 'Shared by {name}',
            infoTitle: 'Information',
            selectRecipeHint: 'Select a recipe to view details',

            // ── Dynamic / Action JS ───────────────────────────────────────
            searchResults: 'Results for "{search}"',
            shared: 'Shared',
            accessPublic: 'Public',
            accessPrivate: 'Only you',
            accessShared: 'Shared',
            canCopy: 'Can copy',
            canView: 'View only',
            deleteConfirm: 'Are you sure you want to delete this recipe?',
            deleteBtn: 'DELETE',
            deleteSuccess: 'Recipe deleted successfully',
            deleteError: 'Error deleting recipe',
            favAdded: 'Added to favorites',
            favRemoved: 'Removed from favorites',
            favError: 'Error updating favorites',
            shareNotAvailable: 'Sharing functionality not available',
            linkCopied: 'Link copied to clipboard',
            downloading: 'Downloading...',
            openIn: 'Open in...',
            managePerms: 'Manage permissions',
            rename: 'Rename',
            removeFav: 'Remove from favorites',
            addFav: 'Add to favorites',
            recipePersonal: 'Personal recipe',
            recipeType: 'Type',
            detailLastModified: 'Last modification',
            saving: 'Saving...',
            saveSuccess: 'Recipe saved successfully!',
            saveError: 'Error saving recipe',
            ocrScanning: 'Recipe scanned with OCR',
            toastLoginSuccess: "Welcome to RecipeHub!",

            // ── Share Modal ───────────────────────────────────────────────
            shareRecipeTitle: 'Share "{recipe}"',
            searching: 'Searching...',
            noUsersFound: 'No users found',
            userSearchError: 'Error searching users',
            sharing: 'Sharing...',
            linkCopiedShort: '✅ Link copied',
            sharedWith: '✅ Shared with {names}',
            shareError: 'Error sharing recipe',

            // ── Notifications ─────────────────────────────────────────────
            notifNewRecipe: "You've received a new recipe!",
            notifEmpty: 'No notifications',
            notifSharedRecipe: 'Shared Recipe',
            notifSomebody: 'Someone',
            notifCanCopy: '📋 You can add to your recipes',
            notifCanViewOnly: '👁️ View only · Expires in 7 days',
            notifUserShared: '{user} shared a recipe',

            // ── Profile ───────────────────────────────────────────────────
            profileUnnamed: 'Unnamed user',
            profileUpdated: 'Profile updated!',
            profilePhotoUpdated: 'Photo updated!',
            profileExported: 'Recipes exported',
            profileEditFirstName: 'First Name:',
            profileEditLastName: 'Last Name:',
            profileEditCollection: 'Collection Name:',
            profileUploadError: 'Error uploading image',

            // ── OCR ───────────────────────────────────────────────────────
            ocrReading: 'Reading... {progress}%',
            ocrReadError: 'Could not read original image. Try with more light.',
            ocrNoIngredients: 'No ingredients detected',
            ocrNoSteps: 'No steps detected',
            ocrNameRequired: 'Recipe needs a name',

            // ── OCR Analysis ──────────────────────────────────────────────
            ocrAnalysisError: 'The recognition system did not load. Please reload.',
            ocrDocTypeRecipe: 'Cooking Recipe',
            ocrDocTypeGeneral: 'General Document / Text',
            ocrLangEs: 'Spanish',
            ocrLangAuto: 'Detected (Auto)',
            ocrAlertLowConfidence: 'Medium/Low read quality: some characters may be ambiguous.',
            ocrAlertShortText: 'Very short text: check if the capture is complete.',
            ocrReportExtracted: '📄 EXTRACTED CONTENT:',
            ocrReportElements: '📊 DETECTED ELEMENTS:',
            ocrReportAlerts: '⚠️ ALERTS:',
            ocrReportNominal: 'None: Nominal reading.',
            ocrReportTpl: '- Text: {hasText} | Language: {language}\n- Numbers: {numCount} found\n- Emojis/Symbols: {symbols}\n- Document Type: {docType}',
            ocrCameraError: 'Could not access the camera. Check permissions.',
            ocrProcessError: 'Error processing image',
        }
    };

    /** Read persisted language (default 'es') */
    function getLang() {
        return localStorage.getItem('lang') || 'es';
    }

    /** Apply translations to the current page */
    function applyLanguage(lang) {
        const t = translations[lang];
        if (!t) return;

        // Text content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (t[key] !== undefined) el.textContent = t[key];
        });

        // Placeholder attributes
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (t[key] !== undefined) el.placeholder = t[key];
        });

        // Title attributes
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.dataset.i18nTitle;
            if (t[key] !== undefined) el.title = t[key];
        });

        // Aria-label attributes
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.dataset.i18nAriaLabel;
            if (t[key] !== undefined) el.setAttribute('aria-label', t[key]);
        });

        // Update any visible lang label buttons
        document.querySelectorAll('.lang-label').forEach(el => {
            el.textContent = lang.toUpperCase();
        });

        // Sync <html lang=""> attribute
        document.documentElement.lang = lang;
    }

    /** Toggle between es ↔ en and persist */
    function toggle() {
        const next = getLang() === 'es' ? 'en' : 'es';
        localStorage.setItem('lang', next);
        // Also keep legacy key in sync (login.html used 'preferredLang')
        localStorage.setItem('preferredLang', next.toUpperCase());
        applyLanguage(next);
    }

    /** Get translation string by key (for dynamic JS content) */
    function t(key, data = {}) {
        const lang = getLang();
        let str = (translations[lang] && translations[lang][key]) || key;

        // Substitution: {var} -> data.var
        Object.keys(data).forEach(k => {
            str = str.replace(`{${k}}`, data[k]);
        });
        return str;
    }

    // ── Auto-apply on every page load ────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyLanguage(getLang()));
    } else {
        applyLanguage(getLang());
    }

    // Expose globally
    window.i18n = { toggle, applyLanguage, getLang, t, translations };
})();
