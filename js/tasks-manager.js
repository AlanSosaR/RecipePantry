/**
 * Recipe Pantry - TasksManager (Material 3 Expressive)
 * Módulo de Tareas Diarias y Prep List con soporte de sincronización en tiempo real,
 * vinculación directa a recetas con escalado de porciones y control granular de acceso
 * (exclusivo para Super Admin o habilitado para usuarios en modo Compartido / Privado).
 */

(function () {
    class TasksManager {
        constructor() {
            this.SUPER_ADMIN_EMAIL = 'alansosa225@gmail.com';
            this.tasks = [];
            this.currentFilter = 'todas';
            this.activeTaskForRecipe = null;
            this.isLoading = false;
            this.initialized = false;
            this.realtimeSubscription = null;
            this.searchQuery = '';
            this.pantryRecipes = [];

            // Catálogo predeterminado de recetas con ingredientes
            this.recipesCatalog = {
                beer_batter: {
                    id: 'beer_batter',
                    greenTitle: 'Beer',
                    blackTitle: 'batter fish',
                    description: 'Crispy beer batter recipe',
                    ingredients: [
                        { id: 'ing1', baseAmount: 380, unit: 'g', name: 'plain flour', checked: false },
                        { id: 'ing2', baseAmount: 130, unit: 'g', name: 'rice flour', checked: false },
                        { id: 'ing3', baseAmount: null, unit: '', name: 'pinch of salt', checked: false },
                        { id: 'ing4', baseAmount: 4, unit: 'tsp', name: 'baking powder', checked: false },
                        { id: 'ing5', baseAmount: 550, unit: 'ml', name: 'cold lager beer', checked: false }
                    ]
                },
                tartar_sauce: {
                    id: 'tartar_sauce',
                    greenTitle: 'Tartar',
                    blackTitle: 'sauce house',
                    description: 'Classic creamy herb tartar sauce for fried fish',
                    ingredients: [
                        { id: 't1', baseAmount: 400, unit: 'g', name: 'mayonnaise', checked: false },
                        { id: 't2', baseAmount: 60, unit: 'g', name: 'chopped capers & gherkins', checked: false },
                        { id: 't3', baseAmount: 15, unit: 'g', name: 'fresh dill & parsley', checked: false },
                        { id: 't4', baseAmount: 1, unit: 'ud', name: 'lemon juice & zest', checked: false }
                    ]
                }
            };

            this.selectedDate = this.getTodayDateString();
            const now = new Date();
            this.currentViewYear = now.getFullYear();
            this.currentViewMonth = now.getMonth();
            this.isCompletedFolderOpen = false;
            this._trailReminderInterval = null;
            this.loadCache();
            this.initEvents();
            this.initTrailReminder();
        }

        /** Retorna la fecha de hoy en formato YYYY-MM-DD local */
        getTodayDateString() {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        /** Retorna el nombre del mes y año formateado para el selector */
        getSelectedMonthName() {
            const fullMonths = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const y = this.currentViewYear !== undefined ? this.currentViewYear : new Date().getFullYear();
            const m = this.currentViewMonth !== undefined ? this.currentViewMonth : new Date().getMonth();
            return `${fullMonths[m]} ${y}`;
        }

        /** Formatea una fecha en formato legible en español */
        formatDateReadable(dateStr) {
            if (!dateStr) return '';
            const [y, m, d] = dateStr.split('-');
            const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            return `${dayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]}`;
        }

        /** Normaliza valores de completed_dates desde Supabase/caché en un Array seguro de cadenas */
        normalizeDates(val) {
            if (!val) return [];
            if (Array.isArray(val)) return val.map(String);
            if (typeof val === 'string') {
                const trimmed = val.trim();
                if (!trimmed || trimmed === '{}' || trimmed === '[]') return [];
                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (Array.isArray(parsed)) return parsed.map(String);
                    } catch (e) {}
                }
                const cleaned = trimmed.replace(/^\{|\}$/g, '').trim();
                if (!cleaned) return [];
                return cleaned.split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
            }
            return [];
        }

        /** Formato corto de fecha (ej. "15 oct") para etiquetas de tareas pendientes */
        formatDateShort(dateStr) {
            if (!dateStr) return '';
            const parts = dateStr.split('-');
            if (parts.length < 3) return dateStr;
            const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            return `${d} ${months[m] || ''}`;
        }

        /** Comprueba si una tarea está completada para una fecha específica (YYYY-MM-DD) */
        isTaskCompletedForDate(task, dateStr) {
            if (!task) return false;
            const targetDate = dateStr || this.selectedDate || this.getTodayDateString();

            if (!task.is_daily) {
                return Boolean(task.completed);
            }

            // Para tareas de rutina diaria, verificar si esta fecha está en completed_dates
            let dates = this.normalizeDates(task.completed_dates);
            if (dates.length === 0 && task.recipe_data?.completed_dates) {
                dates = this.normalizeDates(task.recipe_data.completed_dates);
            }
            task.completed_dates = dates;

            if (dates.length === 0) {
                // Compatibilidad con tareas legadas: si completed era true, asignarlo solo a la fecha de hoy
                if (task.completed) {
                    task.completed_dates = [this.getTodayDateString()];
                    return targetDate === this.getTodayDateString();
                }
                return false;
            }

            return dates.includes(targetDate);
        }

        /** Genera la lista de todos los días del mes activo para el carrusel horizontal */
        getDaysRange() {
            const days = [];
            const y = this.currentViewYear !== undefined ? this.currentViewYear : new Date().getFullYear();
            const m = this.currentViewMonth !== undefined ? this.currentViewMonth : new Date().getMonth();
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            const todayStr = this.getTodayDateString();

            const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

            for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
                const d = new Date(y, m, dayNum);
                const mStr = String(m + 1).padStart(2, '0');
                const dStr = String(dayNum).padStart(2, '0');
                const dateStr = `${y}-${mStr}-${dStr}`;

                days.push({
                    dateStr,
                    dayName: dayNames[d.getDay()],
                    dayNumber: dayNum,
                    monthName: monthNames[m],
                    isToday: dateStr === todayStr
                });
            }
            return days;
        }

        /** Renderiza las píldoras de días para el carrusel horizontal con contador de actividades */
        renderDateCarouselPills() {
            const days = this.getDaysRange();
            const selected = this.selectedDate || this.getTodayDateString();

            return days.map(d => {
                const isSelected = d.dateStr === selected;
                const todayStr = this.getTodayDateString();
                // Contar actividades para este día (diarias recurrentes + tareas de esta fecha + arrastradas si es hoy o posterior)
                const dayTasks = this.tasks.filter(t => {
                    if (t.is_daily) return true;
                    const taskDate = t.due_date || (t.created_at ? t.created_at.split('T')[0] : '');
                    if (taskDate === d.dateStr) return true;
                    if (!t.completed && taskDate < d.dateStr && d.dateStr >= todayStr) return true;
                    return false;
                });
                const count = dayTasks.length;

                let badgeHtml = '';
                if (count > 0) {
                    badgeHtml = `<span class="task-day-count-badge" title="${count} actividad${count !== 1 ? 'es' : ''}">${count}</span>`;
                } else if (d.isToday) {
                    badgeHtml = `<span class="task-day-count-badge empty" title="Hoy (sin actividades)"></span>`;
                } else {
                    badgeHtml = `<span class="task-day-count-badge empty"></span>`;
                }

                return `
                    <button 
                        type="button" 
                        class="task-day-card ${isSelected ? 'active' : ''} ${d.isToday ? 'is-today' : ''}" 
                        data-date="${d.dateStr}"
                        onclick="window.tasksManager.selectDate('${d.dateStr}')"
                        title="${d.isToday ? 'Hoy · ' : ''}${d.dayName} ${d.dayNumber} de ${d.monthName} (${count} actividad${count !== 1 ? 'es' : ''})"
                    >
                        <span class="task-day-name">${d.dayName}</span>
                        <span class="task-day-number">${d.dayNumber}</span>
                        ${badgeHtml}
                    </button>
                `;
            }).join('');
        }

        /** Actualiza al instante los contadores numéricos de todos los días en el carrusel horizontal */
        updateCarouselBadges() {
            const carousel = document.getElementById('tasksDateCarousel');
            if (!carousel) return;

            const dayCards = carousel.querySelectorAll('.task-day-card');
            dayCards.forEach(card => {
                const dateStr = card.getAttribute('data-date');
                if (!dateStr) return;
                const isToday = card.classList.contains('is-today');

                const todayStr = this.getTodayDateString();
                const dayTasks = this.tasks.filter(t => {
                    if (t.is_daily) return true;
                    const taskDate = t.due_date || (t.created_at ? t.created_at.split('T')[0] : '');
                    if (taskDate === dateStr) return true;
                    if (!t.completed && taskDate < dateStr && dateStr >= todayStr) return true;
                    return false;
                });
                const count = dayTasks.length;

                let badge = card.querySelector('.task-day-count-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    card.appendChild(badge);
                }

                if (count > 0) {
                    badge.className = 'task-day-count-badge';
                    badge.textContent = count.toString();
                    badge.title = `${count} actividad${count !== 1 ? 'es' : ''}`;
                } else {
                    badge.className = 'task-day-count-badge empty';
                    badge.textContent = '';
                    badge.title = isToday ? 'Hoy (sin actividades)' : '';
                }
            });
        }

        /** Selecciona una fecha del carrusel */
        selectDate(dateStr) {
            this.selectedDate = dateStr;
            if (dateStr) {
                const [y, m] = dateStr.split('-');
                this.currentViewYear = parseInt(y, 10);
                this.currentViewMonth = parseInt(m, 10) - 1;
            }
            const carousel = document.getElementById('tasksDateCarousel');
            if (carousel) {
                carousel.innerHTML = this.renderDateCarouselPills();
                const activeEl = carousel.querySelector(`[data-date="${dateStr}"]`);
                if (activeEl) {
                    activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }
            const monthLabel = document.getElementById('tasksCarouselMonthLabel');
            if (monthLabel) {
                monthLabel.textContent = this.getSelectedMonthName();
            }
            this.updateDayPill();
            this.renderList();
            this.updateMetrics();
        }

        /** Selecciona el día de hoy y lo centra en el carrusel */
        selectToday() {
            const today = new Date();
            this.currentViewYear = today.getFullYear();
            this.currentViewMonth = today.getMonth();
            this.selectDate(this.getTodayDateString());
        }

        /** Cambia el mes visible en el carrusel (adelante o atrás) */
        changeMonth(delta) {
            const currentM = this.currentViewMonth !== undefined ? this.currentViewMonth : new Date().getMonth();
            const currentY = this.currentViewYear !== undefined ? this.currentViewYear : new Date().getFullYear();
            let nextM = currentM + delta;
            let nextY = currentY;

            if (nextM < 0) {
                nextM = 11;
                nextY -= 1;
            } else if (nextM > 11) {
                nextM = 0;
                nextY += 1;
            }

            this.currentViewMonth = nextM;
            this.currentViewYear = nextY;

            const daysInMonth = new Date(nextY, nextM + 1, 0).getDate();
            const today = new Date();
            const todayStr = this.getTodayDateString();

            if (today.getFullYear() === nextY && today.getMonth() === nextM) {
                this.selectedDate = todayStr;
            } else {
                let targetDay = 1;
                if (this.selectedDate) {
                    const parts = this.selectedDate.split('-');
                    targetDay = Math.min(daysInMonth, parseInt(parts[2], 10) || 1);
                }
                const mStr = String(nextM + 1).padStart(2, '0');
                const dStr = String(targetDay).padStart(2, '0');
                this.selectedDate = `${nextY}-${mStr}-${dStr}`;
            }

            const monthLabel = document.getElementById('tasksCarouselMonthLabel');
            if (monthLabel) {
                monthLabel.textContent = this.getSelectedMonthName();
            }

            const carousel = document.getElementById('tasksDateCarousel');
            if (carousel) {
                carousel.innerHTML = this.renderDateCarouselPills();
                const activeEl = carousel.querySelector(`[data-date="${this.selectedDate}"]`);
                if (activeEl) {
                    activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                } else {
                    carousel.scrollTo({ left: 0, behavior: 'smooth' });
                }
            }

            this.updateDayPill();
            this.renderList();
            this.updateMetrics();
        }

        /** Retorna el texto para la píldora de fecha (ej. "Hoy" o "Vie 16") */
        getDayPillLabel() {
            const todayStr = this.getTodayDateString();
            const selDate = this.selectedDate || todayStr;
            const [y, m, d] = selDate.split('-');
            const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
            const dayName = dayNames[dateObj.getDay()];
            const dayNum = dateObj.getDate();

            if (selDate === todayStr) {
                return 'Hoy';
            }
            return `${dayName} ${dayNum}`;
        }

        /** Actualiza dinámicamente la píldora de fecha según el día seleccionado */
        updateDayPill() {
            const pillBtn = document.getElementById('tasksCurrentDayPillBtn');
            const pillText = document.getElementById('tasksCurrentDayPillText');
            const pillIcon = document.getElementById('tasksCurrentDayPillIcon');
            if (!pillText) return;

            const todayStr = this.getTodayDateString();
            const isToday = (this.selectedDate || todayStr) === todayStr;

            pillText.textContent = this.getDayPillLabel();

            if (pillIcon) {
                pillIcon.textContent = isToday ? 'today' : 'calendar_today';
            }
            if (pillBtn) {
                pillBtn.title = isToday ? 'Estás viendo hoy' : 'Toca para volver a Hoy';
            }
        }

        /** Click en la píldora: si está en otro día, vuelve a Hoy; si está en Hoy, centra el carrusel */
        handleCurrentDayPillClick() {
            const todayStr = this.getTodayDateString();
            if (this.selectedDate !== todayStr) {
                this.selectToday();
            } else {
                const carousel = document.getElementById('tasksDateCarousel');
                const activeEl = carousel?.querySelector('.task-day-card.active');
                if (activeEl) {
                    activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }
        }

        /** Verifica si el usuario actual es el Super Administrador */
        isSuperAdmin() {
            const authEmail = (
                window.authManager?.currentUser?.email ||
                window.authManager?.session?.user?.email ||
                (JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}').email) ||
                ''
            ).toLowerCase().trim();
            return authEmail === this.SUPER_ADMIN_EMAIL;
        }

        /** Verifica si el usuario actual tiene acceso al módulo */
        canAccessTasks() {
            if (this.isSuperAdmin()) return true;
            try {
                const profile = window.authManager?.currentUser || 
                                JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}');
                return Boolean(profile && profile.can_access_tasks === true);
            } catch (e) {
                return false;
            }
        }

        /** Obtiene el modo de tareas del usuario ('shared' o 'isolated') */
        getTasksMode() {
            if (this.isSuperAdmin()) return 'shared';
            try {
                const profile = window.authManager?.currentUser || 
                                JSON.parse(localStorage.getItem('recipe_pantry_user_profile') || '{}');
                return profile.tasks_mode === 'isolated' ? 'isolated' : 'shared';
            } catch (e) {
                return 'shared';
            }
        }

        /** Carga instantánea de caché local */
        loadCache() {
            try {
                // Purgar versiones anteriores de caché para evitar datos de recetas vacíos
                localStorage.removeItem('recipe_pantry_tasks_cache');
                localStorage.removeItem('recipe_pantry_tasks_cache_v2');
                localStorage.removeItem('recipe_pantry_tasks_cache_v3');
                localStorage.removeItem('recipe_pantry_tasks_cache_v4');

                const cached = localStorage.getItem('recipe_pantry_tasks_cache_v5');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.tasks = parsed
                            .filter(t => !t.title?.toLowerCase().includes('tartar') && !t.title?.toLowerCase().includes('pescado'))
                            .map(t => {
                                t.completed_dates = this.normalizeDates(t.completed_dates || t.recipe_data?.completed_dates);
                                return t;
                            });
                    }
                }
            } catch (e) {
                console.warn('⚠️ Error al leer caché de tareas:', e);
            }
        }

        /** Guarda datos en caché local */
        saveCache() {
            try {
                const cleanTasks = (this.tasks || []).filter(t => !t.title?.toLowerCase().includes('tartar') && !t.title?.toLowerCase().includes('pescado'));
                this.tasks = cleanTasks;
                localStorage.setItem('recipe_pantry_tasks_cache_v5', JSON.stringify(cleanTasks));
            } catch (e) {}
        }

        /** Muestra notificación snackbar/toast */
        notify(msg, type = 'info', timeout = 2800) {
            if (window.utils?.showToast) {
                window.utils.showToast(msg, type, timeout);
            } else if (window.showToast) {
                window.showToast(msg, type);
            } else {
                console.log(`[Toast ${type}]`, msg);
            }
        }

        /** Inicializa el sistema de recordatorios horarios para hacer el Trail */
        initTrailReminder() {
            // Solicitar permiso de notificaciones suavemente si aún está en default
            if ('Notification' in window && Notification.permission === 'default') {
                setTimeout(() => {
                    if (this.canAccessTasks()) {
                        Notification.requestPermission().catch(() => {});
                    }
                }, 3000);
            }

            // Chequeo inicial al cargar
            setTimeout(() => this.checkTrailReminder(), 4000);

            // Intervalo cada 3 minutos para evaluar si ya transcurrió 1 hora
            if (!this._trailReminderInterval) {
                this._trailReminderInterval = setInterval(() => {
                    this.checkTrailReminder();
                }, 3 * 60 * 1000);
            }

            // Al volver al navegador o app
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.checkTrailReminder();
                }
            });
        }

        /** Verifica si la tarea de Trail está pendiente y si pasó al menos 1 hora desde el último recordatorio */
        checkTrailReminder() {
            if (!this.canAccessTasks()) return;

            // Buscar la tarea del Trail
            const trailTask = this.tasks.find(t => 
                (t.title && t.title.toLowerCase().includes('trail')) ||
                (t.qty && t.qty.includes('trailapp.com'))
            );

            // Si no existe o ya está completada para el día de hoy, detener recordatorios
            const todayStr = this.getTodayDateString();
            if (!trailTask || this.isTaskCompletedForDate(trailTask, todayStr)) {
                return;
            }

            const now = Date.now();
            const ONE_HOUR_MS = 60 * 60 * 1000;
            const lastNotifiedStr = localStorage.getItem('rp_trail_last_notified_timestamp');
            const lastNotified = lastNotifiedStr ? parseInt(lastNotifiedStr, 10) : 0;

            // Si nunca se notificó o ya pasó al menos 1 hora
            if (!lastNotified || (now - lastNotified) >= ONE_HOUR_MS) {
                this.sendTrailNotification();
                localStorage.setItem('rp_trail_last_notified_timestamp', now.toString());
            }
        }

        /** Dispara la notificación push / navegador e in-app para hacer el Trail */
        async sendTrailNotification(force = false) {
            const notifTitle = '📋 Recordatorio: Hacer el Trail';
            const notifBody = 'Aún no has completado el Trail de hoy. Toca aquí para abrir web.trailapp.com.';
            const trailUrl = 'https://web.trailapp.com/u/sign_in#/';

            let pushSent = false;

            // 1. Notificación Push / Sistema (Navegador o ServiceWorker)
            if ('Notification' in window) {
                if (Notification.permission === 'default') {
                    try {
                        const perm = await Notification.requestPermission();
                        if (perm !== 'granted' && force) {
                            this.notify('Activa los permisos de notificación para recibir avisos.', 'warning');
                        }
                    } catch (e) {}
                }

                if (Notification.permission === 'granted') {
                    try {
                        let swReg = null;
                        if (navigator.serviceWorker) {
                            swReg = await navigator.serviceWorker.ready.catch(() => null);
                        }
                        if (swReg && typeof swReg.showNotification === 'function') {
                            await swReg.showNotification(notifTitle, {
                                body: notifBody,
                                icon: '/assets/icons/icon.svg',
                                badge: '/assets/icons/icon.svg',
                                tag: 'trail-hourly-reminder',
                                renotify: true,
                                vibrate: [200, 100, 200],
                                data: { url: trailUrl }
                            });
                            pushSent = true;
                        } else {
                            this._fallbackNotification(notifTitle, notifBody, trailUrl);
                            pushSent = true;
                        }
                    } catch (e) {
                        this._fallbackNotification(notifTitle, notifBody, trailUrl);
                        pushSent = true;
                    }
                }
            }

            // 2. Notificación In-App (Toast visible)
            if (force) {
                this.notify(pushSent ? '🔔 Notificación push de prueba enviada.' : '⏰ Recordatorio Trail: pendiente por completar.', 'info', 4000);
            } else {
                this.notify('⏰ Recordatorio: Tienes pendiente hacer el Trail diario.', 'warning', 7000);
            }
        }

        _fallbackNotification(title, body, url) {
            try {
                const notif = new Notification(title, {
                    body,
                    icon: '/assets/icons/icon.svg',
                    tag: 'trail-hourly-reminder'
                });
                notif.onclick = () => {
                    window.focus();
                    window.open(url, '_blank');
                };
            } catch (e) {}
        }

        /** Inicialización de eventos reactivos de autenticación y visibilidad */
        initEvents() {
            const updateAndSync = () => {
                this.updateVisibility();
                if (this.canAccessTasks()) {
                    this.syncData();
                    this.initRealtimeSubscription();
                    this.initTrailReminder();
                }
            };

            window.addEventListener('auth-changed', updateAndSync);
            window.addEventListener('auth-ready', updateAndSync);

            // Re-sincronizar y asegurar Realtime en eventos de foco y visibilidad
            window.addEventListener('focus', () => updateAndSync());
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    updateAndSync();
                }
            });

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    updateAndSync();
                });
            } else {
                updateAndSync();
            }

            // Fallback timeout para cuando authManager termine de hidratar la sesión
            setTimeout(() => updateAndSync(), 400);
            setTimeout(() => updateAndSync(), 1200);

            // Cerrar menú de sugerencias de receta al hacer clic fuera
            document.addEventListener('click', (e) => {
                const wrap = document.getElementById('newTaskRecipeSearchWrapper');
                const drop = document.getElementById('newTaskRecipeDropdownList');
                if (drop && wrap && !wrap.contains(e.target)) {
                    drop.style.display = 'none';
                }
            });
        }

        /** Muestra u oculta la opción en el sidebar según permisos */
        updateVisibility() {
            const navEl = document.getElementById('navItemTasks');
            const hasAccess = this.canAccessTasks();
            if (navEl) {
                if (hasAccess) {
                    navEl.classList.remove('hidden');
                } else {
                    const hasAuthUser = Boolean(
                        window.authManager?.currentUser?.email ||
                        window.authManager?.session?.user?.email ||
                        localStorage.getItem('recipe_pantry_user_profile')
                    );
                    if (hasAuthUser) {
                        navEl.classList.add('hidden');
                    }
                }
            }
        }

        /** Configuración de suscripción Supabase Realtime para sincronización bidireccional */
        initRealtimeSubscription() {
            if (!window.supabaseClient) return;
            if (this.realtimeSubscription) return;

            try {
                this.realtimeSubscription = window.supabaseClient
                    .channel('prep_tasks_realtime_shared')
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'prep_tasks' },
                        (payload) => {
                            this.handleRealtimeEvent(payload);
                        }
                    )
                    .subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            console.log('📡 [Tasks Realtime] Sincronización en vivo activa');
                        }
                    });
            } catch (e) {
                console.warn('⚠️ No se pudo inicializar Realtime en prep_tasks:', e);
            }
        }

        /** Manejo de eventos en tiempo real recibidos desde Supabase */
        handleRealtimeEvent(payload) {
            const { eventType, new: newRec, old: oldRec } = payload;
            const mode = this.getTasksMode();

            if (eventType === 'INSERT') {
                if ((mode === 'shared' && newRec.is_shared) || (mode === 'isolated' && !newRec.is_shared)) {
                    newRec.completed_dates = this.normalizeDates(newRec.completed_dates || newRec.recipe_data?.completed_dates);
                    const exists = this.tasks.some(t => t.id === newRec.id);
                    if (!exists) {
                        this.tasks.unshift(newRec);
                        this.saveCache();
                        this.renderList();
                        this.updateCarouselBadges();
                    }
                }
            } else if (eventType === 'UPDATE') {
                newRec.completed_dates = this.normalizeDates(newRec.completed_dates || newRec.recipe_data?.completed_dates);
                const idx = this.tasks.findIndex(t => t.id === newRec.id);
                if (idx !== -1) {
                    this.tasks[idx] = { ...this.tasks[idx], ...newRec };
                    // Si la receta abierta coincide, actualizar también
                    if (this.activeTaskForRecipe && this.activeTaskForRecipe.id === newRec.id) {
                        this.activeTaskForRecipe = this.tasks[idx];
                        this.renderRecipeIngredients();
                    }
                    this.saveCache();
                    this.renderList();
                    this.updateCarouselBadges();
                } else if ((mode === 'shared' && newRec.is_shared) || (mode === 'isolated' && !newRec.is_shared)) {
                    this.tasks.unshift(newRec);
                    this.saveCache();
                    this.renderList();
                    this.updateCarouselBadges();
                }
            } else if (eventType === 'DELETE') {
                this.tasks = this.tasks.filter(t => t.id !== oldRec.id);
                this.saveCache();
                this.renderList();
                this.updateCarouselBadges();
            }
        }

        /** Sincroniza tareas desde Supabase */
        async syncData() {
            if (!this.canAccessTasks() || !window.supabaseClient) return;
            this.isLoading = true;

            try {
                const mode = this.getTasksMode();
                const isSuper = this.isSuperAdmin();

                let query = window.supabaseClient
                    .from('prep_tasks')
                    .select('*')
                    .order('order_index', { ascending: true })
                    .order('created_at', { ascending: false });

                if (!isSuper) {
                    if (mode === 'shared') {
                        query = query.eq('is_shared', true);
                    } else {
                        const myUserId = window.authManager?.currentUser?.id;
                        if (myUserId) {
                            query = query.eq('user_id', myUserId).eq('is_shared', false);
                        } else {
                            query = query.eq('is_shared', false);
                        }
                    }
                }

                const { data, error } = await query;
                if (error) throw error;

                if (Array.isArray(data)) {
                    this.tasks = data
                        .filter(t => !t.title?.toLowerCase().includes('tartar') && !t.title?.toLowerCase().includes('pescado'))
                        .map(t => {
                            t.completed_dates = this.normalizeDates(t.completed_dates || t.recipe_data?.completed_dates);
                            return t;
                        });
                    this.saveCache();
                    this.renderList();
                    const carousel = document.getElementById('tasksDateCarousel');
                    if (carousel) carousel.innerHTML = this.renderDateCarouselPills();
                    this.updateCarouselBadges();
                    this.hydrateMissingRecipes();
                    await this.rolloverPendingTasks();
                }

                // Cargar recetas de la despensa para el selector de recetas
                this.loadPantryRecipes();
            } catch (err) {
                console.warn('⚠️ Error al sincronizar tareas:', err.message);
            } finally {
                this.isLoading = false;
            }
        }

        /** Pasa automáticamente las tareas incompletas de días pasados a la fecha de hoy en To-Do */
        async rolloverPendingTasks() {
            const todayStr = this.getTodayDateString();
            const overdueTasks = this.tasks.filter(t => {
                if (t.is_daily) return false;
                if (t.completed) return false;
                const taskDate = t.due_date || (t.created_at ? t.created_at.split('T')[0] : todayStr);
                return taskDate < todayStr;
            });

            if (overdueTasks.length === 0) return;

            const overdueIds = [];
            overdueTasks.forEach(t => {
                t.original_due_date = t.original_due_date || t.due_date;
                t.due_date = todayStr;
                overdueIds.push(t.id);
            });

            this.saveCache();
            this.renderList();
            this.updateCarouselBadges();

            if (window.supabaseClient && overdueIds.length > 0) {
                try {
                    await window.supabaseClient
                        .from('prep_tasks')
                        .update({
                            due_date: todayStr,
                            updated_at: new Date().toISOString()
                        })
                        .in('id', overdueIds.filter(id => !String(id).startsWith('temp_')));
                } catch (e) {
                    console.warn('⚠️ Error al pasar tareas pendientes al siguiente día en Supabase:', e);
                }
            }
        }

        /** Carga todas las recetas existentes del usuario (Dashboard, DB, Supabase, localDB) para poder vincularlas a tareas */
        async loadPantryRecipes() {
            try {
                const map = new Map();

                // 1. Tomar recetas ya cargadas en el Dashboard si existen
                if (window.dashboard && Array.isArray(window.dashboard.currentRecipes) && window.dashboard.currentRecipes.length > 0) {
                    window.dashboard.currentRecipes.forEach(r => {
                        if (r && r.id) map.set(r.id, r);
                    });
                }

                // 2. Tomar recetas desde DatabaseManager (offline-first de la app)
                if (window.db && typeof window.db.getMyRecipes === 'function') {
                    try {
                        const res = await window.db.getMyRecipes();
                        if (res && res.success && Array.isArray(res.recipes)) {
                            res.recipes.forEach(r => {
                                if (r && r.id && !map.has(r.id)) map.set(r.id, r);
                            });
                        }
                    } catch (e) {}
                }

                // 3. Tomar recetas desde Supabase directamente sin filtros restrictivos
                if (window.supabaseClient) {
                    try {
                        const { data, error } = await window.supabaseClient
                            .from('recipes')
                            .select('id, name_es, name_en, name, title, description_es, description_en, description, ocr_raw_text, ingredients:ingredients(*)')
                            .order('name_es', { ascending: true })
                            .limit(500);

                        if (!error && Array.isArray(data) && data.length > 0) {
                            data.forEach(r => {
                                if (r && r.id) {
                                    if (!map.has(r.id) || (Array.isArray(r.ingredients) && r.ingredients.length > 0)) {
                                        map.set(r.id, { ...(map.get(r.id) || {}), ...r });
                                    }
                                }
                            });
                        }
                    } catch (e) {}
                }

                // 4. Fallback a localDB
                if (map.size === 0 && window.localDB) {
                    try {
                        const local = await window.localDB.getAll('recipes_index');
                        if (Array.isArray(local)) {
                            local.forEach(r => { if (r && r.id) map.set(r.id, r); });
                        }
                    } catch (e) {}
                }

                this.pantryRecipes = Array.from(map.values());
            } catch (e) {
                console.warn('⚠️ Error al cargar recetas de despensa:', e);
            }
        }

        /** Renderiza la vista principal del módulo en el contenedor asignado */
        render(container) {
            if (!container) return;
            this.tasks = (this.tasks || []).filter(t => !t.title?.toLowerCase().includes('tartar') && !t.title?.toLowerCase().includes('pescado'));
            container.innerHTML = `
                <div class="tasks-module-root">
                    
                    <!-- HERO HEADER -->
                    <div style="text-align: center; margin-bottom: 16px;">
                        <h2 style="font-size: clamp(26px, 4.5vw, 36px); font-weight: 800; letter-spacing: -0.5px; margin: 0; line-height: 1.15;">
                            <span style="color: #12B078;">To</span> <span style="color: #18181B;">Do</span>
                        </h2>
                    </div>

                    <!-- MATERIAL 3 EXPRESSIVE DATE CAROUSEL -->
                    <div class="tasks-date-section" style="margin-bottom: 18px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 4px;">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span class="material-symbols-outlined" style="color: #12B078; font-size: 20px; margin-right: 2px;">calendar_month</span>
                                <button type="button" onclick="window.tasksManager.changeMonth(-1)" style="
                                    background: none;
                                    border: none;
                                    width: 28px;
                                    height: 28px;
                                    border-radius: 50%;
                                    display: inline-flex;
                                    align-items: center;
                                    justify-content: center;
                                    cursor: pointer;
                                    color: #4B5563;
                                    transition: all 0.15s;
                                "
                                onmouseover="this.style.background='#F3F4F6'; this.style.color='#12B078';"
                                onmouseout="this.style.background='none'; this.style.color='#4B5563';"
                                title="Mes anterior"
                                aria-label="Mes anterior"
                                >
                                    <span class="material-symbols-outlined" style="font-size: 18px;">chevron_left</span>
                                </button>
                                <span id="tasksCarouselMonthLabel" style="font-size: 15px; font-weight: 800; color: #18181B; text-transform: capitalize; min-width: 120px; text-align: center;">
                                    ${this.getSelectedMonthName()}
                                </span>
                                <button type="button" onclick="window.tasksManager.changeMonth(1)" style="
                                    background: none;
                                    border: none;
                                    width: 28px;
                                    height: 28px;
                                    border-radius: 50%;
                                    display: inline-flex;
                                    align-items: center;
                                    justify-content: center;
                                    cursor: pointer;
                                    color: #4B5563;
                                    transition: all 0.15s;
                                "
                                onmouseover="this.style.background='#F3F4F6'; this.style.color='#12B078';"
                                onmouseout="this.style.background='none'; this.style.color='#4B5563';"
                                title="Mes siguiente"
                                aria-label="Mes siguiente"
                                >
                                    <span class="material-symbols-outlined" style="font-size: 18px;">chevron_right</span>
                                </button>
                            </div>

                            <div style="display: flex; align-items: center; gap: 8px;">
                                <button type="button" id="tasksCurrentDayPillBtn" onclick="window.tasksManager.handleCurrentDayPillClick()" style="
                                    background: #EAF8F2;
                                    color: #12B078;
                                    border: none;
                                    padding: 4px 12px;
                                    border-radius: 9999px;
                                    font-size: 12px;
                                    font-weight: 800;
                                    cursor: pointer;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 4px;
                                    transition: all 0.15s;
                                "
                                title="Estás viendo hoy"
                                onmouseover="this.style.background='#D5F2E5'"
                                onmouseout="this.style.background='#EAF8F2'"
                                >
                                    <span class="material-symbols-outlined" id="tasksCurrentDayPillIcon" style="font-size: 14px;">today</span>
                                    <span id="tasksCurrentDayPillText">${this.getDayPillLabel()}</span>
                                </button>
                            </div>
                        </div>

                        <div id="tasksDateCarousel" class="tasks-date-carousel">
                            ${this.renderDateCarouselPills()}
                        </div>
                    </div>

                    <!-- TASKS CONTAINER -->
                    <div id="prepTasksContainer" style="display: flex; flex-direction: column; gap: 12px;">
                        <!-- Cards renderizadas dinámicamente -->
                    </div>

                    <!-- FLOATING ACTION BUTTON (Icon only +) -->
                    <div class="tasks-fab-container">
                        <button type="button" onclick="window.tasksManager.openCreateModal()" class="tasks-fab-circle" aria-label="Nueva Tarea" title="Nueva Tarea">
                            <span class="material-symbols-outlined">add</span>
                        </button>
                    </div>

                    <!-- MODAL / BOTTOM SHEET CREAR NUEVA TAREA -->
                    <div id="prepTaskModalBackdrop" onclick="window.tasksManager.closeCreateModal()" class="tasks-backdrop" style="display: none;"></div>
                    
                    <div id="prepTaskBottomSheet" class="tasks-bottom-sheet" style="display: none;">
                        <div style="width: 38px; height: 5px; background: #D1D5DB; border-radius: 9999px; margin: 0 auto 16px auto;"></div>
                        
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                            <div>
                                <h3 style="font-size: 18px; font-weight: 800; color: #18181B; margin: 0;">Agregar a Prep List</h3>
                                <p style="font-size: 12px; color: #71717A; margin: 2px 0 0 0;">Puedes vincular una receta para que se abra al tocar la tarea</p>
                            </div>
                            <button type="button" onclick="window.tasksManager.closeCreateModal()" style="background: none; border: none; padding: 6px; border-radius: 50%; color: #9CA3AF; cursor: pointer;">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onsubmit="window.tasksManager.handleCreateTaskSubmit(event)" style="display: flex; flex-direction: column; gap: 14px;">
                            <div>
                                <label style="display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #4B5563; margin-bottom: 6px;">Nombre de la tarea *</label>
                                <input 
                                    id="newTaskTitleInput" 
                                    type="text" 
                                    required 
                                    placeholder="Ej. Fish batter, Picar cebolla, Pedir cerveza..." 
                                    style="width: 100%; padding: 12px 16px; border-radius: 16px; background: #F4F7F5; border: 1.5px solid #E5E7EB; font-size: 14px; font-weight: 600; outline: none; box-sizing: border-box;"
                                    onfocus="this.style.borderColor='#12B078'; this.style.background='#FFFFFF';"
                                    onblur="this.style.borderColor='#E5E7EB'; this.style.background='#F4F7F5';"
                                >
                            </div>

                            <!-- Recipe Search & Link Picker -->
                            <div id="newTaskRecipeSearchWrapper" style="position: relative;">
                                <label style="display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #4B5563; margin-bottom: 6px;">
                                    ¿Abrir una receta al tocar esta tarea?
                                </label>
                                
                                <div style="position: relative; display: flex; align-items: center;">
                                    <span class="material-symbols-outlined" style="position: absolute; left: 14px; color: #12B078; font-size: 20px; pointer-events: none;">search</span>
                                    <input 
                                        id="newTaskRecipeSearchInput" 
                                        type="text" 
                                        autocomplete="off"
                                        placeholder="Buscar en las recetas para vincular..." 
                                        style="width: 100%; padding: 12px 38px 12px 42px; border-radius: 16px; background: #F4F7F5; border: 1.5px solid #E5E7EB; font-size: 13.5px; font-weight: 600; outline: none; box-sizing: border-box; transition: all 0.2s;"
                                        onfocus="window.tasksManager.handleRecipeSearchFocus()"
                                        oninput="window.tasksManager.handleRecipeSearchInput(this.value)"
                                    >
                                    <button 
                                        type="button" 
                                        id="newTaskRecipeClearBtn"
                                        onclick="window.tasksManager.clearSelectedRecipe()"
                                        style="display: none; position: absolute; right: 10px; background: none; border: none; color: #9CA3AF; cursor: pointer; padding: 4px;"
                                        title="Quitar receta vinculada"
                                    >
                                        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
                                    </button>
                                </div>

                                <!-- Hidden input with the selected recipe id -->
                                <input type="hidden" id="newTaskRecipeSelect" value="none">

                                <!-- Selected Recipe Pill Preview -->
                                <div id="newTaskRecipeSelectedBadge" style="display: none; margin-top: 8px;">
                                    <div style="display: inline-flex; align-items: center; gap: 6px; background: #EAF8F2; color: #064E3B; border: 1px solid #A7F3D0; padding: 5px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700;">
                                        <span class="material-symbols-outlined" style="font-size: 16px; color: #12B078;">menu_book</span>
                                        <span id="newTaskRecipeSelectedTitle">Receta vinculada</span>
                                        <button type="button" onclick="window.tasksManager.clearSelectedRecipe()" style="background: none; border: none; color: #064E3B; cursor: pointer; padding: 0; display: flex; align-items: center; margin-left: 4px;">
                                            <span class="material-symbols-outlined" style="font-size: 14px;">close</span>
                                        </button>
                                    </div>
                                </div>

                                <!-- Dropdown Results Container -->
                                <div id="newTaskRecipeDropdownList" style="
                                    display: none;
                                    position: absolute;
                                    top: calc(100% + 4px);
                                    left: 0;
                                    right: 0;
                                    background: #FFFFFF;
                                    border: 1.5px solid #E5E7EB;
                                    border-radius: 16px;
                                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.08);
                                    max-height: 220px;
                                    overflow-y: auto;
                                    z-index: 100;
                                    padding: 6px;
                                ">
                                    <!-- Dinámico -->
                                </div>
                            </div>

                            <div>
                                <label style="display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #4B5563; margin-bottom: 6px;">Nota / Información adicional (opcional)</label>
                                <input 
                                    id="newTaskQtyInput" 
                                    type="text" 
                                    placeholder="Ej. Estación, turno, enlace o detalle..." 
                                    style="width: 100%; padding: 12px 16px; border-radius: 16px; background: #F4F7F5; border: 1.5px solid #E5E7EB; font-size: 13.5px; font-weight: 500; outline: none; box-sizing: border-box; transition: all 0.2s;"
                                    onfocus="this.style.borderColor='#12B078'; this.style.background='#FFFFFF';"
                                    onblur="this.style.borderColor='#E5E7EB'; this.style.background='#F4F7F5';"
                                >
                            </div>

                            <!-- Daily Routine Toggle -->
                            <div style="display: flex; align-items: center; justify-content: space-between; background: #F4F7F5; padding: 12px 16px; border-radius: 18px; border: 1px solid #E5E7EB;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span class="material-symbols-outlined" style="color: #12B078; font-size: 22px;">autorenew</span>
                                    <div>
                                        <div style="font-size: 12.5px; font-weight: 800; color: #18181B;">Se hace todos los días (Rutina Diaria)</div>
                                        <div style="font-size: 11px; color: #71717A;">Aparece cada día en tu lista de actividades</div>
                                    </div>
                                </div>
                                <input id="newTaskDailyToggle" type="checkbox" class="circle-mint-checkbox" style="width: 28px; height: 28px; cursor: pointer;">
                            </div>

                            <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
                                <button type="button" onclick="window.tasksManager.closeCreateModal()" style="
                                    flex: 1;
                                    padding: 13px;
                                    border-radius: 9999px;
                                    font-size: 13px;
                                    font-weight: 700;
                                    color: #4B5563;
                                    background: #F3F4F6;
                                    border: none;
                                    cursor: pointer;
                                ">
                                    Cancelar
                                </button>
                                <button type="submit" style="
                                    flex: 2;
                                    padding: 13px;
                                    border-radius: 9999px;
                                    font-size: 13px;
                                    font-weight: 800;
                                    color: #FFFFFF;
                                    background: #12B078;
                                    border: none;
                                    box-shadow: 0 4px 12px rgba(18, 176, 120, 0.3);
                                    cursor: pointer;
                                ">
                                    Guardar Tarea
                                </button>
                            </div>
                        </form>
                    </div>

                    <!-- RECIPE DETAIL SCREEN (SLIDE-IN MODAL) -->
                    <div id="prepRecipeDetailModal" class="recipe-screen-slide" style="display: none;">
                        <!-- Top Header Strip -->
                        <div style="position: sticky; top: 0; z-index: 20; background: #FFFFFF; border-bottom: 1px solid #F3F4F6; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between;">
                            <button type="button" onclick="window.tasksManager.closeRecipeView()" style="
                                background: none;
                                border: none;
                                color: #12B078;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                                font-weight: 700;
                                font-size: 13px;
                                cursor: pointer;
                                padding: 6px 10px;
                                border-radius: 9999px;
                            "
                            onmouseover="this.style.background='#EAF8F2'"
                            onmouseout="this.style.background='none'"
                            >
                                <span class="material-symbols-outlined" style="font-size: 24px;">arrow_back</span>
                                <span>Volver al To-Do</span>
                            </button>

                            <div style="display: flex; align-items: center; gap: 10px;">
                                <button type="button" onclick="window.tasksManager.toggleFavoriteRecipe()" id="prepFavBtn" style="background: none; border: none; color: #12B078; cursor: pointer; padding: 6px;">
                                    <span class="material-symbols-outlined" style="font-size: 22px;">favorite</span>
                                </button>
                            </div>
                        </div>

                        <!-- Recipe Body Content -->
                        <div style="max-width: 600px; margin: 0 auto; padding: 22px 18px 120px 18px;">
                            
                            <!-- Context Pill -->
                            <div style="text-align: center; margin-bottom: 8px;">
                                <span style="display: inline-flex; align-items: center; gap: 6px; background: #EAF8F2; color: #12B078; font-size: 11.5px; font-weight: 800; padding: 4px 12px; border-radius: 9999px;">
                                    <span class="material-symbols-outlined" style="font-size: 15px;">link</span>
                                    Vinculada a tu tarea: <span id="prepLinkedTaskTitle">Fish batter</span>
                                </span>
                            </div>

                            <!-- Dual-colored Title -->
                            <h1 style="font-size: clamp(28px, 6vw, 38px); font-weight: 800; text-align: center; margin: 4px 0 24px 0; line-height: 1.15;">
                                <span id="prepRecipeTitleGreen" style="color: #12B078;">Beer</span>
                                <span id="prepRecipeTitleBlack" style="color: #18181B;">batter fish</span>
                            </h1>

                            <!-- Stepper Porciones -->
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 24px; background: #FAFAFA; border: 1px solid #F0F0F0; border-radius: 20px; padding: 12px 18px;">
                                <div>
                                    <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #18181B; letter-spacing: 0.05em;">
                                        SELECCIONAR PORCIONES
                                    </div>
                                    <div id="prepPortionScaleHint" style="font-size: 14px; font-weight: 700; color: #12B078; margin-top: 4px;">
                                        Receta original
                                    </div>
                                </div>

                                <div style="background: #F0FAF6; border: 1px solid #DDF5EC; border-radius: 9999px; padding: 4px 8px; display: flex; align-items: center; gap: 14px;">
                                    <button type="button" onclick="window.tasksManager.changeRecipePortions(-1)" style="
                                        width: 38px;
                                        height: 38px;
                                        border-radius: 50%;
                                        background: #12B078;
                                        color: #FFFFFF;
                                        border: none;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        cursor: pointer;
                                    ">
                                        <span class="material-symbols-outlined" style="font-size: 20px;">remove</span>
                                    </button>

                                    <span id="prepRecipePortionValue" style="font-size: 20px; font-weight: 800; color: #18181B; min-width: 24px; text-align: center;">
                                        1
                                    </span>

                                    <button type="button" onclick="window.tasksManager.changeRecipePortions(1)" style="
                                        width: 38px;
                                        height: 38px;
                                        border-radius: 50%;
                                        background: #12B078;
                                        color: #FFFFFF;
                                        border: none;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        cursor: pointer;
                                    ">
                                        <span class="material-symbols-outlined" style="font-size: 20px;">add</span>
                                    </button>
                                </div>
                            </div>

                            <!-- Description -->
                            <div style="margin-bottom: 24px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                    <span class="material-symbols-outlined" style="color: #4B5563; font-size: 22px;">description</span>
                                    <h3 style="font-size: 17px; font-weight: 800; color: #18181B; margin: 0;">Descripción</h3>
                                </div>
                                <p id="prepRecipeDescription" style="font-size: 14.5px; color: #6B7280; margin: 0; line-height: 1.5;">
                                    Crispy beer batter recipe
                                </p>
                            </div>

                            <!-- Ingredients Checklist -->
                            <div>
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="material-symbols-outlined" style="color: #374151; font-size: 24px;">grocery</span>
                                        <div>
                                            <h3 style="font-size: 17px; font-weight: 800; color: #18181B; margin: 0;">Ingredientes</h3>
                                            <span id="prepRecipeItemsCount" style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #6B7280;">5 ITEMS</span>
                                        </div>
                                    </div>

                                    <button type="button" onclick="window.tasksManager.checkAllRecipeIngredients()" style="
                                        font-size: 12px;
                                        font-weight: 700;
                                        color: #12B078;
                                        background: #EAF8F2;
                                        border: none;
                                        border-radius: 9999px;
                                        padding: 6px 14px;
                                        cursor: pointer;
                                    ">
                                        Marcar todos
                                    </button>
                                </div>

                                <div id="prepRecipeIngredientsList" style="display: flex; flex-direction: column; gap: 14px; padding-left: 4px;">
                                    <!-- Renderizado dinámico -->
                                </div>
                            </div>
                        </div>

                        <!-- Sticky Bottom Bar -->
                        <div style="
                            position: fixed;
                            bottom: 0;
                            left: 0;
                            right: 0;
                            background: rgba(255, 255, 255, 0.96);
                            backdrop-filter: blur(8px);
                            border-top: 1px solid #E5E7EB;
                            padding: 14px 20px;
                            z-index: 30;
                        ">
                            <div style="max-width: 600px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                                <div>
                                    <div id="prepRecipeChecklistProgress" style="font-size: 13px; font-weight: 800; color: #18181B;">0 de 5 ingredientes listos</div>
                                    <div style="font-size: 11px; color: #6B7280;">Al terminar, se marcará en tu To-Do diario</div>
                                </div>

                                <button type="button" onclick="window.tasksManager.completeTaskFromRecipe()" style="
                                    background: #12B078;
                                    color: #FFFFFF;
                                    border: none;
                                    border-radius: 9999px;
                                    padding: 12px 22px;
                                    font-size: 13px;
                                    font-weight: 800;
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                    box-shadow: 0 4px 14px rgba(18, 176, 120, 0.35);
                                    cursor: pointer;
                                ">
                                    <span class="material-symbols-outlined" style="font-size: 18px;">task_alt</span>
                                    <span>Listo</span>
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            `;

            // Sincronizar barra de búsqueda global superior
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                const isEn = window.i18n && window.i18n.getLang() === 'en';
                searchInput.placeholder = isEn ? 'Search to-do...' : 'Buscar por hacer...';
                searchInput.value = this.searchQuery || '';
                const clearBtn = document.getElementById('clearSearch');
                if (clearBtn) {
                    clearBtn.classList.toggle('hidden', !this.searchQuery);
                }
            }

            this.renderList();
            this.syncData();

            setTimeout(() => {
                const carousel = document.getElementById('tasksDateCarousel');
                const activeEl = carousel?.querySelector('.task-day-card.active');
                if (activeEl) {
                    activeEl.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
                }
            }, 80);
        }

        /** Alterna la visibilidad de la carpeta de tareas realizadas */
        toggleCompletedFolder() {
            this.isCompletedFolderOpen = !this.isCompletedFolderOpen;
            const accordion = document.getElementById('prepCompletedAccordion');
            const content = document.getElementById('prepCompletedContent');
            const chevron = accordion?.querySelector('.prep-completed-chevron');
            if (accordion && content && chevron) {
                accordion.classList.toggle('open', this.isCompletedFolderOpen);
                content.style.display = this.isCompletedFolderOpen ? 'flex' : 'none';
                chevron.textContent = this.isCompletedFolderOpen ? 'expand_less' : 'expand_more';
            } else {
                this.renderList();
            }
        }

        /** Banner motivacional cuando todas las tareas de la fecha están realizadas */
        renderAllDoneBanner() {
            return `
                <div class="tasks-all-done-banner" style="
                    text-align: center;
                    padding: 24px 16px;
                    background: #EAF8F2;
                    border-radius: 22px;
                    border: 1.5px dashed #A8DFCA;
                    margin-bottom: 14px;
                ">
                    <span class="material-symbols-outlined" style="font-size: 32px; color: #12B078; display: block; margin-bottom: 4px;">task_alt</span>
                    <h4 style="font-size: 15px; font-weight: 700; color: #065F46; margin: 0 0 4px 0;">¡Todo listo para este día!</h4>
                    <p style="font-size: 12px; color: #047857; margin: 0;">Has completado todas las actividades del servicio.</p>
                </div>
            `;
        }

        /** Renderiza la tarjeta individual de una tarea (activa o archivada) */
        renderTaskCard(task, selDate, isArchived = false) {
            const todayStr = this.getTodayDateString();
            const taskDate = task.due_date || (task.created_at ? task.created_at.split('T')[0] : todayStr);
            const isRolledOver = !task.is_daily && taskDate < selDate;
            const isCompleted = this.isTaskCompletedForDate(task, selDate);
            const isTrail = (task.title && task.title.toLowerCase().includes('trail')) || (task.qty && task.qty.includes('trailapp.com'));
            const isUrl = task.qty && (task.qty.startsWith('http://') || task.qty.startsWith('https://'));
            const actionUrl = isTrail ? 'https://web.trailapp.com/u/sign_in#/' : (isUrl ? task.qty : null);

            return `
                <article id="task-card-${task.id}" class="task-card ${isCompleted ? 'task-completed' : ''} ${isArchived ? 'task-archived-item' : ''}" style="
                    background: ${isCompleted ? '#F9FAF9' : '#FFFFFF'};
                    border-radius: 22px;
                    padding: 14px 16px;
                    border: 1px solid ${task.recipe_id && !isCompleted ? 'rgba(18, 176, 120, 0.4)' : isTrail && !isCompleted ? 'rgba(2, 132, 199, 0.4)' : '#E4E4E7'};
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.02);
                    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
                ">
                    <!-- Checkbox Mint Circular -->
                    <input 
                        type="checkbox" 
                        class="circle-mint-checkbox" 
                        ${isCompleted ? 'checked' : ''} 
                        onchange="window.tasksManager.toggleTaskStatus('${task.id}')"
                        title="${isCompleted ? 'Marcar como pendiente' : 'Marcar como lista'}"
                    >

                    <!-- Main Info -->
                    <div onclick="${actionUrl ? `window.open('${actionUrl}', '_blank')` : task.recipe_id ? `window.tasksManager.openRecipeView('${task.id}')` : `window.tasksManager.toggleTaskStatus('${task.id}')`}" style="flex: 1; min-width: 0; cursor: pointer;">
                        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px;">
                            ${task.is_daily ? `
                                <button type="button" onclick="event.stopPropagation(); window.tasksManager.toggleTaskDaily('${task.id}')" title="Toca para cambiar a tarea puntual" style="border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; background: #EAF8F2; color: #12B078; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 9999px;">
                                    <span class="material-symbols-outlined" style="font-size: 12px;">autorenew</span>
                                    Todos los días
                                </button>
                            ` : ''}

                            ${isRolledOver ? `
                                <span style="display: inline-flex; align-items: center; gap: 3px; background: #FEF3C7; color: #B45309; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 9999px;" title="No se realizó el ${this.formatDateShort(taskDate)} y pasó a hoy">
                                    <span class="material-symbols-outlined" style="font-size: 12px;">history</span>
                                    Pendiente (${this.formatDateShort(taskDate)})
                                </span>
                            ` : ''}
                        </div>

                        <div style="font-size: 15.5px; font-weight: 800; color: ${isCompleted ? '#A1A1AA' : '#18181B'}; ${isCompleted ? 'text-decoration: line-through;' : ''}">
                            ${task.title}
                        </div>

                        ${task.qty ? `
                            <div style="font-size: 12px; font-weight: 500; color: #71717A; margin-top: 2px;">
                                ${isTrail ? `
                                    <span style="color: #0284C7; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                                        <span class="material-symbols-outlined" style="font-size: 14px;">checklist</span>
                                        web.trailapp.com
                                    </span>
                                ` : task.qty}
                            </div>
                        ` : ''}
                    </div>

                    <!-- Right Action (Esquina Derecha) -->
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: ${actionUrl || task.recipe_id ? 'space-between' : 'center'}; align-self: stretch; flex-shrink: 0; min-height: 52px; gap: 6px;">
                        ${actionUrl ? `
                            <a href="${actionUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="
                                background: #E0F2FE;
                                color: #0369A1;
                                border: none;
                                font-weight: 800;
                                font-size: 11px;
                                padding: 6px 12px;
                                border-radius: 9999px;
                                display: inline-flex;
                                align-items: center;
                                gap: 4px;
                                text-decoration: none;
                                cursor: pointer;
                                transition: all 0.15s;
                                white-space: nowrap;
                            "
                            onmouseover="this.style.background='#0284C7'; this.style.color='#FFFFFF';"
                            onmouseout="this.style.background='#E0F2FE'; this.style.color='#0369A1';"
                            title="Abrir en nueva pestaña"
                            >
                                <span class="material-symbols-outlined" style="font-size: 15px;">open_in_new</span>
                                <span>Abrir Trail</span>
                            </a>
                        ` : task.recipe_id ? `
                            <button type="button" onclick="event.stopPropagation(); window.tasksManager.openRecipeView('${task.id}')" style="
                                background: #EAF8F2;
                                color: #12B078;
                                border: none;
                                font-weight: 800;
                                font-size: 11px;
                                padding: 6px 12px;
                                border-radius: 9999px;
                                display: inline-flex;
                                align-items: center;
                                gap: 4px;
                                cursor: pointer;
                                transition: all 0.15s;
                                white-space: nowrap;
                            "
                            onmouseover="this.style.background='#12B078'; this.style.color='#FFFFFF';"
                            onmouseout="this.style.background='#EAF8F2'; this.style.color='#12B078';"
                            title="Abrir receta"
                            >
                                <span class="material-symbols-outlined" style="font-size: 15px;">open_in_new</span>
                                <span>Abrir receta</span>
                            </button>
                        ` : ''}

                        <button type="button" onclick="event.stopPropagation(); window.tasksManager.deleteTask('${task.id}')" style="
                            background: none;
                            border: none;
                            color: #D4D4D8;
                            padding: 4px;
                            border-radius: 50%;
                            cursor: pointer;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            transition: color 0.15s;
                        "
                        onmouseover="this.style.color='#EF4444';"
                        onmouseout="this.style.color='#D4D4D8';"
                        title="Eliminar tarea"
                        >
                            <span class="material-symbols-outlined" style="font-size: 17px;">delete</span>
                        </button>
                    </div>
                </article>
            `;
        }

        /** Renderiza el contenedor acordeón colapsable para las tareas Realizadas */
        renderCompletedAccordion(completedTasks, selDate, isOpen) {
            return `
                <div id="prepCompletedAccordion" class="prep-completed-accordion ${isOpen ? 'open' : ''}">
                    <button 
                        type="button" 
                        class="prep-completed-header" 
                        onclick="window.tasksManager.toggleCompletedFolder()"
                        aria-expanded="${isOpen}"
                        title="Toca para colapsar o expandir las tareas realizadas"
                    >
                        <div class="prep-completed-header-left">
                            <span class="material-symbols-outlined prep-completed-icon">inventory_2</span>
                            <span class="prep-completed-title">Realizadas</span>
                            <span class="prep-completed-badge">${completedTasks.length}</span>
                        </div>
                        <span class="material-symbols-outlined prep-completed-chevron">
                            ${isOpen ? 'expand_less' : 'expand_more'}
                        </span>
                    </button>
                    <div id="prepCompletedContent" class="prep-completed-content" style="display: ${isOpen ? 'flex' : 'none'};">
                        ${completedTasks.map(task => this.renderTaskCard(task, selDate, true)).join('')}
                    </div>
                </div>
            `;
        }

        /** Renderiza la lista filtrada de tareas con archivado directo en Realizadas */
        renderList() {
            const container = document.getElementById('prepTasksContainer');
            if (!container) return;

            const todayStr = this.getTodayDateString();
            const selDate = this.selectedDate || todayStr;
            const q = this.searchQuery ? this.searchQuery.toLowerCase().trim() : '';

            let filtered = this.tasks.filter(t => {
                const taskDate = t.due_date || (t.created_at ? t.created_at.split('T')[0] : todayStr);
                // Si el usuario está buscando texto, buscar en todas las tareas sin importar fecha
                let matchesDate = false;
                if (q) {
                    matchesDate = true;
                } else if (t.is_daily) {
                    matchesDate = true;
                } else if (taskDate === selDate) {
                    matchesDate = true;
                } else if (!t.completed && taskDate < selDate && selDate >= todayStr) {
                    // Si una tarea no se completó en un día previo, se arrastra / pasa al siguiente día
                    matchesDate = true;
                }
                if (!matchesDate) return false;

                if (this.currentFilter === 'todas') return true;
                if (this.currentFilter === 'diario') return t.is_daily;
                if (this.currentFilter === 'con_receta') return Boolean(t.recipe_id);
                if (this.currentFilter === 'Proveedores') return t.category === 'Proveedores' || (t.qty && t.qty.toLowerCase().includes('proveedor'));
                return t.category === this.currentFilter;
            });

            if (q) {
                filtered = filtered.filter(t => {
                    const titleMatch = t.title && t.title.toLowerCase().includes(q);
                    const qtyMatch = t.qty && t.qty.toLowerCase().includes(q);
                    const recipeData = t.recipe_data || (t.recipe_id ? this.recipesCatalog[t.recipe_id] : null);
                    const recipeMatch = recipeData && (
                        (recipeData.greenTitle && recipeData.greenTitle.toLowerCase().includes(q)) ||
                        (recipeData.blackTitle && recipeData.blackTitle.toLowerCase().includes(q))
                    );
                    return titleMatch || qtyMatch || recipeMatch;
                });
            }

            if (filtered.length === 0) {
                if (q) {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 44px 20px; background: #FFFFFF; border-radius: 24px; border: 1.5px dashed #E4E4E7;">
                            <span class="material-symbols-outlined" style="font-size: 38px; color: #71717A; opacity: 0.7;">search_off</span>
                            <h4 style="font-size: 16px; font-weight: 700; color: #18181B; margin: 10px 0 4px 0;">No se encontraron actividades</h4>
                            <p style="font-size: 12.5px; color: #71717A; margin: 0 0 16px 0;">No hay resultados para "<strong>${this.searchQuery}</strong>"</p>
                            <button type="button" onclick="window.tasksManager.handleSearch(''); const inp = document.getElementById('searchInput'); if (inp) { inp.value = ''; inp.focus(); }" style="
                                background: #F4F4F5;
                                color: #18181B;
                                border: none;
                                border-radius: 9999px;
                                padding: 8px 16px;
                                font-size: 12.5px;
                                font-weight: 700;
                                cursor: pointer;
                            ">
                                Limpiar búsqueda
                            </button>
                        </div>
                    `;
                } else {
                    container.innerHTML = `
                        <div style="text-align: center; padding: 48px 20px; background: #FFFFFF; border-radius: 24px; border: 1.5px dashed #E4E4E7;">
                            <span class="material-symbols-outlined" style="font-size: 40px; color: #12B078; opacity: 0.6;">checklist</span>
                            <h4 style="font-size: 16px; font-weight: 700; color: #18181B; margin: 10px 0 4px 0;">No hay tareas para este día</h4>
                            <p style="font-size: 12.5px; color: #71717A; margin: 0 0 16px 0;">Agrega una tarea a tu lista para comenzar el servicio de hoy</p>
                            <button type="button" onclick="window.tasksManager.openCreateModal()" style="
                                background: #12B078;
                                color: white;
                                border: none;
                                border-radius: 9999px;
                                padding: 10px 18px;
                                font-size: 13px;
                                font-weight: 700;
                                cursor: pointer;
                            ">
                                + Agregar Tarea
                            </button>
                        </div>
                    `;
                }
                this.updateMetrics();
                return;
            }

            // Separar tareas activas (pendientes) y tareas realizadas
            const activeTasks = filtered.filter(t => !this.isTaskCompletedForDate(t, selDate));
            const completedTasks = filtered.filter(t => this.isTaskCompletedForDate(t, selDate));

            // Si hay búsqueda y hay tareas realizadas coincidentes, abrir automáticamente la carpeta
            const hasSearchMatchInCompleted = Boolean(q && completedTasks.length > 0);
            const isFolderOpen = hasSearchMatchInCompleted || Boolean(this.isCompletedFolderOpen);

            let html = '';

            // 1. Carpeta colapsable "Realizadas" (ubicada justo debajo del carrusel de los días)
            if (completedTasks.length > 0) {
                html += this.renderCompletedAccordion(completedTasks, selDate, isFolderOpen);
            }

            // 2. Tareas activas (pendientes)
            if (activeTasks.length > 0) {
                html += activeTasks.map(task => this.renderTaskCard(task, selDate, false)).join('');
            } else if (completedTasks.length > 0 && !q) {
                // Si no hay tareas activas y todas están realizadas, mostrar banner felicitando
                html += this.renderAllDoneBanner();
            }

            container.innerHTML = html;
            this.updateMetrics();
        }

        /** Actualiza los contadores de progreso */
        updateMetrics() {
            const todayStr = this.getTodayDateString();
            const selDate = this.selectedDate || todayStr;
            const currentDayTasks = this.tasks.filter(t => {
                const taskDate = t.due_date || (t.created_at ? t.created_at.split('T')[0] : todayStr);
                if (t.is_daily) return true;
                if (taskDate === selDate) return true;
                if (!t.completed && taskDate < selDate && selDate >= todayStr) return true;
                return false;
            });

            const total = currentDayTasks.length;
            const completed = currentDayTasks.filter(t => this.isTaskCompletedForDate(t, selDate)).length;
            const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
            const dailyCount = currentDayTasks.filter(t => t.is_daily).length;

            const pBadge = document.getElementById('prepProgressPercent');
            const cText = document.getElementById('prepProgressCount');
            const fill = document.getElementById('prepProgressBarFill');
            const dailyText = document.getElementById('prepDailyCountText');

            if (pBadge) pBadge.textContent = `${percent}%`;
            if (cText) cText.textContent = `${completed} de ${total}`;
            if (fill) fill.style.width = `${percent}%`;
            if (dailyText) dailyText.textContent = `${dailyCount} tareas son de todos los días`;

            // Actualizar contadores del carrusel de inmediato
            this.updateCarouselBadges();
        }

        /** Filtro de tareas */
        setFilter(filter) {
            this.currentFilter = filter;
            document.querySelectorAll('.task-filter-chip').forEach(btn => {
                if (btn.dataset.filter === filter) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            this.renderList();
        }

        /** Buscador integrado */
        handleSearch(query) {
            this.searchQuery = query || '';
            this.renderList();
        }

        /** Abre el modal para crear nueva tarea */
        openCreateModal() {
            const backdrop = document.getElementById('prepTaskModalBackdrop');
            const sheet = document.getElementById('prepTaskBottomSheet');
            if (backdrop && sheet) {
                backdrop.style.display = 'block';
                sheet.style.display = 'block';
                const titleInput = document.getElementById('newTaskTitleInput');
                if (titleInput) titleInput.value = '';
                const qtyInput = document.getElementById('newTaskQtyInput');
                if (qtyInput) qtyInput.value = '';
                const portionsInput = document.getElementById('newTaskPortionsInput');
                if (portionsInput) portionsInput.value = '1';
                const dailyToggle = document.getElementById('newTaskDailyToggle');
                if (dailyToggle) dailyToggle.checked = false;
                this.clearSelectedRecipe();
                this.loadPantryRecipes();
                setTimeout(() => {
                    if (titleInput) titleInput.focus();
                }, 100);
            }
        }

        /** Retorna todas las recetas disponibles para vincular a tareas */
        getAllAvailableRecipes() {
            const list = [];
            const seen = new Set();

            // 1. Receta base (Beer batter fish)
            if (this.recipesCatalog && this.recipesCatalog.beer_batter) {
                const cat = this.recipesCatalog.beer_batter;
                const title = `${cat.greenTitle || ''} ${cat.blackTitle || ''}`.trim();
                list.push({
                    id: cat.id,
                    title: title || 'Beer batter fish',
                    description: cat.description || 'Receta base de la casa',
                    ingredientsCount: cat.ingredients?.length || 5,
                    source: 'preset'
                });
                seen.add(cat.id);
            }

            // 2. Recetas de todas las fuentes disponibles (Pantry, Dashboard, localDB)
            const allSources = [
                ...(Array.isArray(this.pantryRecipes) ? this.pantryRecipes : []),
                ...(Array.isArray(window.dashboard?.currentRecipes) ? window.dashboard.currentRecipes : [])
            ];

            allSources.forEach(r => {
                if (!r || !r.id) return;
                const id = `db_${r.id}`;
                if (!seen.has(id)) {
                    const rawTitle = (r.name_es || r.name_en || r.name || r.title || '').trim();
                    if (rawTitle && !rawTitle.toLowerCase().includes('tartar') && !rawTitle.toLowerCase().includes('pescado')) {
                        const ingCount = Array.isArray(r.ingredients) ? r.ingredients.length : 0;
                        list.push({
                            id,
                            title: rawTitle,
                            description: r.description_es || r.description_en || r.description || 'Recetario personal',
                            ingredientsCount: ingCount,
                            source: 'db'
                        });
                        seen.add(id);
                    }
                }
            });

            return list;
        }

        /** Abre el menú de sugerencias al enfocar solo si ya hay texto escrito */
        handleRecipeSearchFocus() {
            const input = document.getElementById('newTaskRecipeSearchInput');
            const val = input ? input.value.trim() : '';
            if (val.length > 0) {
                this.handleRecipeSearchInput(val);
            }
        }

        /** Filtra las recetas en el buscador del modal de tareas */
        handleRecipeSearchInput(query) {
            const dropdown = document.getElementById('newTaskRecipeDropdownList');
            const clearBtn = document.getElementById('newTaskRecipeClearBtn');
            if (!dropdown) return;

            const q = (query || '').toLowerCase().trim();
            if (clearBtn) {
                clearBtn.style.display = q ? 'block' : 'none';
            }

            // Si no ha escrito nada, mantener la lista completamente oculta
            if (!q) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }

            const all = this.getAllAvailableRecipes();
            const matches = all.filter(r => 
                r.title.toLowerCase().includes(q) || 
                (r.description && r.description.toLowerCase().includes(q))
            );

            let html = `
                <div 
                    onclick="window.tasksManager.clearSelectedRecipe()"
                    style="padding: 10px 12px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #4B5563; transition: background 0.15s;"
                    onmouseover="this.style.background='#F3F4F6'"
                    onmouseout="this.style.background='none'"
                >
                    <span class="material-symbols-outlined" style="font-size: 18px; color: #9CA3AF;">block</span>
                    <span>No vincular receta (Solo check rápido)</span>
                </div>
            `;

            if (matches.length === 0) {
                html += `
                    <div style="padding: 14px 12px; text-align: center; font-size: 12.5px; color: #9CA3AF;">
                        No se encontraron recetas con "${query}"
                    </div>
                `;
            } else {
                html += matches.map(r => `
                    <div 
                        onclick="window.tasksManager.selectRecipe('${r.id}', '${r.title.replace(/'/g, "\\'")}')"
                        style="padding: 9px 12px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.15s;"
                        onmouseover="this.style.background='#EAF8F2'"
                        onmouseout="this.style.background='none'"
                    >
                        <div style="width: 32px; height: 32px; border-radius: 10px; background: #EAF8F2; color: #12B078; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <span class="material-symbols-outlined" style="font-size: 18px;">menu_book</span>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 13.5px; font-weight: 700; color: #18181B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${r.title}
                            </div>
                            <div style="font-size: 11px; color: #71717A;">
                                ${r.ingredientsCount > 0 ? `${r.ingredientsCount} ingredientes · ` : ''}${r.description || 'Recetario'}
                            </div>
                        </div>
                        <span class="material-symbols-outlined" style="font-size: 18px; color: #12B078; opacity: 0.6;">add_circle</span>
                    </div>
                `).join('');
            }

            dropdown.innerHTML = html;
            dropdown.style.display = 'block';
        }

        /** Selecciona una receta del buscador desplegable */
        selectRecipe(recipeId, recipeTitle) {
            const selectEl = document.getElementById('newTaskRecipeSelect');
            const searchInput = document.getElementById('newTaskRecipeSearchInput');
            const clearBtn = document.getElementById('newTaskRecipeClearBtn');
            const badge = document.getElementById('newTaskRecipeSelectedBadge');
            const badgeTitle = document.getElementById('newTaskRecipeSelectedTitle');
            const dropdown = document.getElementById('newTaskRecipeDropdownList');
            const titleInput = document.getElementById('newTaskTitleInput');

            if (selectEl) selectEl.value = recipeId || 'none';
            if (searchInput) searchInput.value = recipeTitle || '';
            if (badge && badgeTitle) {
                badgeTitle.textContent = recipeTitle;
                badge.style.display = 'block';
            }
            if (clearBtn) clearBtn.style.display = 'block';
            if (dropdown) dropdown.style.display = 'none';

            // Pre-cargar ingredientes para que estén listos inmediatamente al guardar
            if (recipeId && recipeId.startsWith('db_')) {
                const dbId = recipeId.replace('db_', '');
                if (window.supabaseClient) {
                    Promise.all([
                        window.supabaseClient
                            .from('recipes')
                            .select('id, name_es, name_en, description_es, description_en, ocr_raw_text')
                            .eq('id', dbId)
                            .single(),
                        window.supabaseClient
                            .from('ingredients')
                            .select('*')
                            .eq('recipe_id', dbId)
                            .order('order_index', { ascending: true })
                    ]).then(([recRes, ingRes]) => {
                        if (recRes && recRes.data) {
                            const full = { ...recRes.data, ingredients: ingRes?.data || [] };
                            this.selectedRecipeForNewTask = full;
                            const idx = (this.pantryRecipes || []).findIndex(r => r.id === dbId);
                            if (idx !== -1) {
                                this.pantryRecipes[idx] = full;
                            } else {
                                (this.pantryRecipes = this.pantryRecipes || []).push(full);
                            }
                        }
                    }).catch(() => {});
                }
            }
        }

        /** Quita la receta seleccionada */
        clearSelectedRecipe() {
            const selectEl = document.getElementById('newTaskRecipeSelect');
            const searchInput = document.getElementById('newTaskRecipeSearchInput');
            const clearBtn = document.getElementById('newTaskRecipeClearBtn');
            const badge = document.getElementById('newTaskRecipeSelectedBadge');
            const dropdown = document.getElementById('newTaskRecipeDropdownList');

            if (selectEl) selectEl.value = 'none';
            if (searchInput) searchInput.value = '';
            if (badge) badge.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'none';
            if (dropdown) dropdown.style.display = 'none';
        }

        /** Cierra el modal de crear nueva tarea */
        closeCreateModal() {
            const backdrop = document.getElementById('prepTaskModalBackdrop');
            const sheet = document.getElementById('prepTaskBottomSheet');
            if (backdrop && sheet) {
                backdrop.style.display = 'none';
                sheet.style.display = 'none';
            }
            const titleInput = document.getElementById('newTaskTitleInput');
            if (titleInput) titleInput.value = '';
            const qtyInput = document.getElementById('newTaskQtyInput');
            if (qtyInput) qtyInput.value = '';
            const dailyToggle = document.getElementById('newTaskDailyToggle');
            if (dailyToggle) dailyToggle.checked = false;
            this.clearSelectedRecipe();
        }

        /** Procesa la creación de una nueva tarea */
        async handleCreateTaskSubmit(e) {
            e.preventDefault();
            const titleInput = document.getElementById('newTaskTitleInput');
            const recipeSelect = document.getElementById('newTaskRecipeSelect');
            const portionsInput = document.getElementById('newTaskPortionsInput');
            const qtyInput = document.getElementById('newTaskQtyInput');
            const dailyToggle = document.getElementById('newTaskDailyToggle');

            const title = titleInput.value.trim();
            if (!title) return;

            const recipeVal = recipeSelect ? recipeSelect.value : 'none';
            const portions = portionsInput ? (parseInt(portionsInput.value, 10) || 1) : 1;
            const qty = qtyInput ? qtyInput.value.trim() : '';
            const isDaily = Boolean(dailyToggle.checked);
            const isShared = this.getTasksMode() === 'shared';

            let recipeId = null;
            let recipeData = null;

            if (recipeVal === 'beer_batter' || recipeVal === 'tartar_sauce') {
                recipeId = recipeVal;
                recipeData = JSON.parse(JSON.stringify(this.recipesCatalog[recipeVal]));
            } else if (recipeVal.startsWith('db_')) {
                const dbId = recipeVal.replace('db_', '');
                let found = (this.selectedRecipeForNewTask?.id === dbId ? this.selectedRecipeForNewTask : null) ||
                            (this.pantryRecipes || []).find(r => r.id === dbId) ||
                            (window.dashboard?.currentRecipes || []).find(r => r.id === dbId);
                let fullRecipe = found;

                // Si no tiene los ingredientes cargados en memoria, consultarlos directamente
                if (!fullRecipe || !Array.isArray(fullRecipe.ingredients) || fullRecipe.ingredients.length === 0) {
                    if (window.supabaseClient) {
                        try {
                            const [recRes, ingRes] = await Promise.all([
                                window.supabaseClient
                                    .from('recipes')
                                    .select('id, name_es, name_en, description_es, description_en, ocr_raw_text')
                                    .eq('id', dbId)
                                    .single(),
                                window.supabaseClient
                                    .from('ingredients')
                                    .select('*')
                                    .eq('recipe_id', dbId)
                                    .order('order_index', { ascending: true })
                            ]);
                            if (recRes && recRes.data) {
                                fullRecipe = { ...recRes.data, ingredients: ingRes?.data || [] };
                            }
                        } catch (e) {}
                    }
                    if ((!fullRecipe || !Array.isArray(fullRecipe.ingredients) || fullRecipe.ingredients.length === 0) && window.db?.getRecipeById) {
                        try {
                            const res = await window.db.getRecipeById(dbId);
                            if (res?.success && res.recipe) fullRecipe = res.recipe;
                        } catch (e) {}
                    }
                }

                if (fullRecipe) {
                    recipeId = dbId;
                    const rawName = (fullRecipe.name_es || fullRecipe.name_en || 'Receta').trim();
                    const nameParts = rawName.split(' ');
                    const greenTitle = nameParts[0] || 'Receta';
                    const blackTitle = nameParts.slice(1).join(' ') || '';

                    let ings = [];
                    if (Array.isArray(fullRecipe.ingredients) && fullRecipe.ingredients.length > 0) {
                        ings = fullRecipe.ingredients.map((ing, i) => {
                            const rawQty = (typeof ing.quantity === 'number') ? ing.quantity : (parseFloat(ing.quantity) || (typeof ing.amount === 'number' ? ing.amount : parseFloat(ing.amount)));
                            const baseAmount = isNaN(rawQty) ? null : rawQty;
                            const unit = (ing.unit_es || ing.unit_en || ing.unit || '').trim();
                            const name = (ing.name_es || ing.name_en || ing.name || (typeof ing === 'string' ? ing : 'Ingrediente')).trim();
                            return {
                                id: ing.id || `db_ing_${i}`,
                                baseAmount: baseAmount,
                                unit: unit,
                                name: name,
                                checked: Boolean(ing.is_checked)
                            };
                        });
                    } else if (fullRecipe.ocr_raw_text) {
                        ings = this.parseIngredientsFromOcr(fullRecipe.ocr_raw_text);
                    }

                    recipeData = {
                        id: dbId,
                        greenTitle,
                        blackTitle,
                        description: fullRecipe.description_es || fullRecipe.description_en || fullRecipe.description || 'Recetario personal',
                        ingredients: ings
                    };
                }
            }

            const currentUserId = window.authManager?.currentUser?.id || 
                                  (this.isSuperAdmin() ? 'cf5ee75b-7182-4623-a8a0-fbeae25f4c61' : null);

            const newTask = {
                title,
                qty,
                category: recipeId ? 'con_receta' : 'diario',
                is_daily: isDaily,
                due_date: this.selectedDate || this.getTodayDateString(),
                completed: false,
                completed_dates: [],
                recipe_id: recipeId,
                recipe_data: recipeData,
                portions,
                order_index: this.tasks.length + 1,
                is_shared: isShared
            };

            if (currentUserId) {
                newTask.user_id = currentUserId;
            }

            // Inserción optimista en memoria
            const tempId = 'temp_' + Date.now();
            const optimisticTask = { ...newTask, id: tempId };
            this.tasks.unshift(optimisticTask);
            this.saveCache();
            this.renderList();
            this.closeCreateModal();
            e.target.reset();
            this.notify('¡Tarea agregada al Prep diario!', 'success');

            // Persistencia en Supabase
            if (window.supabaseClient) {
                try {
                    const { data, error } = await window.supabaseClient
                        .from('prep_tasks')
                        .insert([newTask])
                        .select();

                    if (!error && data && data[0]) {
                        const idx = this.tasks.findIndex(t => t.id === tempId);
                        if (idx !== -1) {
                            this.tasks[idx] = data[0];
                            this.saveCache();
                            this.renderList();
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ Error al guardar tarea en Supabase:', err);
                }
            }
        }

        /** Alterna el estado completado de una tarea para la fecha seleccionada */
        async toggleTaskStatus(taskId, dateStr) {
            const task = this.tasks.find(t => String(t.id) === String(taskId));
            if (!task) return;

            const targetDate = dateStr || this.selectedDate || this.getTodayDateString();
            const todayStr = this.getTodayDateString();
            const wasCompleted = this.isTaskCompletedForDate(task, targetDate);

            // Si pasa de activa a completada, animar salida fluida hacia Realizadas
            if (!wasCompleted) {
                const cardEl = document.getElementById(`task-card-${taskId}`);
                if (cardEl) {
                    cardEl.classList.add('task-card-archiving-out');
                    await new Promise(resolve => setTimeout(resolve, 180));
                }
                // Si la carpeta estaba cerrada o vacía, abrirla automáticamente para mostrar la tarea
                this.isCompletedFolderOpen = true;
            }

            let isNowCompleted = false;

            if (task.is_daily) {
                let dates = this.normalizeDates(task.completed_dates);
                if (dates.length === 0 && task.recipe_data?.completed_dates) {
                    dates = this.normalizeDates(task.recipe_data.completed_dates);
                }
                const idx = dates.indexOf(targetDate);
                if (idx >= 0) {
                    dates.splice(idx, 1);
                    isNowCompleted = false;
                } else {
                    dates.push(targetDate);
                    isNowCompleted = true;
                }
                task.completed_dates = dates;

                if (!task.recipe_data || typeof task.recipe_data !== 'object') {
                    task.recipe_data = {};
                }
                task.recipe_data.completed_dates = [...dates];

                // Sincronizar compatibilidad con task.completed solo si estamos en el día de hoy
                if (targetDate === todayStr) {
                    task.completed = isNowCompleted;
                }
            } else {
                task.completed = !task.completed;
                isNowCompleted = task.completed;
                // Si la tarea venía de una fecha anterior y ahora se completa, asociar su fecha a hoy
                if (isNowCompleted && task.due_date && task.due_date < targetDate) {
                    task.original_due_date = task.original_due_date || task.due_date;
                    task.due_date = targetDate;
                }
            }

            this.saveCache();
            this.renderList();
            this.updateCarouselBadges();

            const isTrail = (task.title && task.title.toLowerCase().includes('trail')) ||
                            (task.qty && task.qty.includes('trailapp.com'));

            if (isNowCompleted) {
                if (isTrail) {
                    this.notify('¡Excelente! Has completado el Trail diario. Se pausaron los recordatorios.', 'success', 3500);
                    localStorage.setItem('rp_trail_last_notified_timestamp', Date.now().toString());
                } else {
                    this.notify(`"${task.title}" marcada como lista`, 'success');
                }
            } else if (isTrail) {
                this.notify('Trail diario reactivado. Los recordatorios se reanudarán si queda pendiente.', 'info', 3000);
            }

            if (window.supabaseClient && !String(task.id).startsWith('temp_')) {
                try {
                    const updatePayload = {
                        completed: task.completed,
                        due_date: task.due_date,
                        updated_at: new Date().toISOString()
                    };
                    if (task.is_daily) {
                        updatePayload.completed_dates = task.completed_dates || [];
                        updatePayload.recipe_data = task.recipe_data;
                    }
                    await window.supabaseClient
                        .from('prep_tasks')
                        .update(updatePayload)
                        .eq('id', task.id);
                } catch (e) {
                    console.warn('⚠️ Error al actualizar estado de tarea:', e);
                }
            }
        }

        /** Alterna si una tarea es rutina diaria recurrente o puntual */
        async toggleTaskDaily(taskId) {
            const task = this.tasks.find(t => String(t.id) === String(taskId));
            if (!task) return;

            task.is_daily = !task.is_daily;
            this.saveCache();
            this.renderList();
            this.notify(task.is_daily ? `"${task.title}" configurada como rutina diaria` : `"${task.title}" cambiada a tarea puntual`);

            if (window.supabaseClient && !String(task.id).startsWith('temp_')) {
                try {
                    await window.supabaseClient
                        .from('prep_tasks')
                        .update({
                            is_daily: task.is_daily,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', task.id);
                } catch (e) {
                    console.warn('⚠️ Error al actualizar is_daily de tarea:', e);
                }
            }
        }

        /** Reinicia todas las tareas repetitivas diarias para la fecha visualizada */
        async resetDailyTasks() {
            const todayStr = this.getTodayDateString();
            const selDate = this.selectedDate || todayStr;
            const dailyTasksToUpdate = [];

            this.tasks.forEach(t => {
                if (t.is_daily) {
                    if (Array.isArray(t.completed_dates)) {
                        t.completed_dates = t.completed_dates.filter(d => d !== selDate);
                    } else {
                        t.completed_dates = [];
                    }
                    if (t.recipe_data) {
                        t.recipe_data.completed_dates = t.completed_dates;
                        if (Array.isArray(t.recipe_data.ingredients)) {
                            t.recipe_data.ingredients.forEach(i => i.checked = false);
                        }
                    }
                    if (selDate === todayStr) {
                        t.completed = false;
                    }
                    dailyTasksToUpdate.push(t);
                }
            });

            // Establecer timestamp actual para dar 1 hora de margen antes del recordatorio
            localStorage.setItem('rp_trail_last_notified_timestamp', Date.now().toString());

            this.saveCache();
            this.renderList();
            this.notify(`¡Rutina diaria reiniciada para ${this.formatDateReadable(selDate)}!`, 'success');

            if (window.supabaseClient && dailyTasksToUpdate.length > 0) {
                try {
                    for (const t of dailyTasksToUpdate) {
                        if (String(t.id).startsWith('temp_')) continue;
                        await window.supabaseClient
                            .from('prep_tasks')
                            .update({
                                completed: t.completed,
                                completed_dates: t.completed_dates || [],
                                recipe_data: t.recipe_data,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', t.id);
                    }
                } catch (e) {
                    console.warn('⚠️ Error al reiniciar tareas diarias en Supabase:', e);
                }
            }
        }

        /** Elimina una tarea */
        async deleteTask(taskId) {
            const task = this.tasks.find(t => String(t.id) === String(taskId));
            if (!task) return;

            this.tasks = this.tasks.filter(t => String(t.id) !== String(taskId));
            this.saveCache();
            this.renderList();
            this.notify('Tarea eliminada');

            if (window.supabaseClient && !String(taskId).startsWith('temp_')) {
                try {
                    await window.supabaseClient
                        .from('prep_tasks')
                        .delete()
                        .eq('id', taskId);
                } catch (e) {
                    console.warn('⚠️ Error al eliminar tarea:', e);
                }
            }
        }

        /** Analiza texto OCR para extraer ingredientes si no están desglosados */
        parseIngredientsFromOcr(ocrText) {
            if (!ocrText || typeof ocrText !== 'string') return [];
            const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
            const ings = [];
            let inIngredients = false;

            for (const line of lines) {
                const lower = line.toLowerCase();
                if (lower.startsWith('ingredient') || lower.startsWith('ingrediente')) {
                    inIngredients = true;
                    continue;
                }
                if (inIngredients && (lower.startsWith('direction') || lower.startsWith('instrucc') || lower.startsWith('método') || lower.startsWith('step') || lower.startsWith('paso'))) {
                    break;
                }

                if (inIngredients || line.startsWith('•') || line.startsWith('-') || /^\d+[\s\/\.,]/.test(line)) {
                    const clean = line.replace(/^[•\-\*\s]+/, '').trim();
                    if (clean.length > 2 && !clean.toLowerCase().includes('direction') && !clean.toLowerCase().includes('yield') && !clean.toLowerCase().includes('portion')) {
                        const match = clean.match(/^([\d\.,\/]+)\s*([a-zA-Z]+)?\s+(.+)$/);
                        if (match) {
                            const rawNum = parseFloat(match[1].replace(',', '.'));
                            const unitOrFirstWord = match[2] || '';
                            const rest = match[3] || '';
                            const knownUnits = ['g', 'kg', 'ml', 'l', 'lt', 'oz', 'lb', 'tbsp', 'tsp', 'cda', 'cdita', 'taza', 'cup', 'pinch', 'pizca', 'clove', 'cloves', 'diente', 'dientes'];
                            if (knownUnits.includes(unitOrFirstWord.toLowerCase())) {
                                ings.push({
                                    id: `ocr_ing_${ings.length}`,
                                    baseAmount: isNaN(rawNum) ? null : rawNum,
                                    unit: unitOrFirstWord,
                                    name: rest,
                                    checked: false
                                });
                            } else {
                                ings.push({
                                    id: `ocr_ing_${ings.length}`,
                                    baseAmount: isNaN(rawNum) ? null : rawNum,
                                    unit: '',
                                    name: `${unitOrFirstWord} ${rest}`.trim(),
                                    checked: false
                                });
                            }
                        } else {
                            ings.push({
                                id: `ocr_ing_${ings.length}`,
                                baseAmount: null,
                                unit: '',
                                name: clean,
                                checked: false
                            });
                        }
                    }
                }
            }
            return ings;
        }

        /** Hidrata automáticamente cualquier receta vinculada que no tenga sus ingredientes cargados */
        async hydrateMissingRecipes() {
            if (!this.tasks || !Array.isArray(this.tasks)) return;
            for (const t of this.tasks) {
                if (t.recipe_id && (!t.recipe_data || !Array.isArray(t.recipe_data.ingredients) || t.recipe_data.ingredients.length === 0)) {
                    await this.hydrateTaskRecipe(t);
                }
            }
        }

        /** Carga y vincula los ingredientes completos de una receta a una tarea */
        async hydrateTaskRecipe(task) {
            if (!task || !task.recipe_id) return;
            const lookupId = String(task.recipe_id).replace(/^db_/, '');
            if (lookupId === 'beer_batter' || lookupId === 'tartar_sauce') {
                if (this.recipesCatalog[lookupId]) {
                    task.recipe_data = JSON.parse(JSON.stringify(this.recipesCatalog[lookupId]));
                }
                return;
            }

            let fullRecipe = null;
            // 1. Consulta directa y confiable a Supabase (recipes + ingredients)
            if (window.supabaseClient) {
                try {
                    const { data: rec } = await window.supabaseClient
                        .from('recipes')
                        .select('id, name_es, name_en, description_es, description_en, ocr_raw_text')
                        .eq('id', lookupId)
                        .single();

                    const { data: ings } = await window.supabaseClient
                        .from('ingredients')
                        .select('*')
                        .eq('recipe_id', lookupId)
                        .order('order_index', { ascending: true });

                    if (rec) {
                        fullRecipe = { ...rec, ingredients: ings || [] };
                    }
                } catch (e) {}
            }

            // 2. Fallback con window.db si no se pudo
            if (!fullRecipe && window.db?.getRecipeById) {
                try {
                    const res = await window.db.getRecipeById(lookupId);
                    if (res?.success && res.recipe) fullRecipe = res.recipe;
                } catch (e) {}
            }

            if (fullRecipe) {
                const rawName = (fullRecipe.name_es || fullRecipe.name_en || task.title || 'Receta').trim();
                const nameParts = rawName.split(' ');
                const greenTitle = nameParts[0] || 'Receta';
                const blackTitle = nameParts.slice(1).join(' ') || '';

                let ings = [];
                if (Array.isArray(fullRecipe.ingredients) && fullRecipe.ingredients.length > 0) {
                    ings = fullRecipe.ingredients.map((ing, i) => {
                        const rawQty = (typeof ing.quantity === 'number') ? ing.quantity : (parseFloat(ing.quantity) || (typeof ing.amount === 'number' ? ing.amount : parseFloat(ing.amount)));
                        const baseAmount = isNaN(rawQty) ? null : rawQty;
                        const unit = (ing.unit_es || ing.unit_en || ing.unit || '').trim();
                        const name = (ing.name_es || ing.name_en || ing.name || (typeof ing === 'string' ? ing : 'Ingrediente')).trim();
                        return {
                            id: ing.id || `db_ing_${i}`,
                            baseAmount: baseAmount,
                            unit: unit,
                            name: name,
                            checked: Boolean(ing.is_checked)
                        };
                    });
                } else if (fullRecipe.ocr_raw_text) {
                    ings = this.parseIngredientsFromOcr(fullRecipe.ocr_raw_text);
                }

                task.recipe_data = {
                    id: fullRecipe.id,
                    greenTitle,
                    blackTitle,
                    description: fullRecipe.description_es || fullRecipe.description_en || fullRecipe.description || 'Recetario personal',
                    ingredients: ings
                };

                this.saveCache();

                // Si la receta abierta coincide, refrescar contenido de inmediato
                if (this.activeTaskForRecipe && this.activeTaskForRecipe.id === task.id) {
                    this.activeTaskForRecipe = task;
                    this.renderRecipeViewContent(task, task.recipe_data);
                }

                if (window.supabaseClient && !String(task.id).startsWith('temp_')) {
                    window.supabaseClient
                        .from('prep_tasks')
                        .update({
                            recipe_data: task.recipe_data,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', task.id)
                        .then(() => {});
                }
            }
        }

        /** Abre la vista detallada de la receta vinculada */
        async openRecipeView(taskId) {
            const task = this.tasks.find(t => String(t.id) === String(taskId));
            if (!task) return;

            this.activeTaskForRecipe = task;

            const modal = document.getElementById('prepRecipeDetailModal');
            if (modal) {
                modal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }

            document.getElementById('prepLinkedTaskTitle').textContent = task.title;

            const recipe = task.recipe_data || (task.recipe_id && this.recipesCatalog[task.recipe_id] ? this.recipesCatalog[task.recipe_id] : null);
            const isCompletedForDate = this.isTaskCompletedForDate(task, this.selectedDate || this.getTodayDateString());
            if (task.is_daily && !isCompletedForDate && recipe && Array.isArray(recipe.ingredients)) {
                const allChecked = recipe.ingredients.length > 0 && recipe.ingredients.every(i => i.checked);
                if (allChecked) {
                    recipe.ingredients.forEach(i => i.checked = false);
                }
            }
            const hasIngredients = recipe && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0;

            if (hasIngredients) {
                this.renderRecipeViewContent(task, recipe);
            } else {
                this.renderRecipeViewLoading(task, recipe);
                await this.hydrateTaskRecipe(task);
                const updatedRecipe = task.recipe_data || (task.recipe_id && this.recipesCatalog[task.recipe_id] ? this.recipesCatalog[task.recipe_id] : this.recipesCatalog.beer_batter);
                this.renderRecipeViewContent(task, updatedRecipe);
            }
        }

        /** Renderiza el estado de carga mientras se obtienen los ingredientes */
        renderRecipeViewLoading(task, recipe) {
            const initialGreen = recipe?.greenTitle || task.title.split(' ')[0] || 'Receta';
            const initialBlack = recipe?.blackTitle || task.title.split(' ').slice(1).join(' ') || '';

            document.getElementById('prepRecipeTitleGreen').textContent = initialGreen;
            document.getElementById('prepRecipeTitleBlack').textContent = ' ' + initialBlack;
            document.getElementById('prepRecipeDescription').textContent = recipe?.description || 'Buscando ingredientes en la despensa...';
            document.getElementById('prepRecipeItemsCount').textContent = '...';

            const listEl = document.getElementById('prepRecipeIngredientsList');
            if (listEl) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 36px 16px; color: #71717A;">
                        <span class="material-symbols-outlined" style="font-size: 32px; color: #12B078; animation: spin 1s linear infinite; display: inline-block;">sync</span>
                        <div style="font-size: 13.5px; font-weight: 700; color: #18181B; margin-top: 8px;">Cargando ingredientes de la receta...</div>
                    </div>
                `;
            }
            const prog = document.getElementById('prepRecipeChecklistProgress');
            if (prog) prog.textContent = 'Cargando ingredientes...';
        }

        /** Renderiza el contenido final de la receta vinculada */
        renderRecipeViewContent(task, recipe) {
            if (!recipe) recipe = task.recipe_data || this.recipesCatalog.beer_batter;
            document.getElementById('prepRecipeTitleGreen').textContent = recipe.greenTitle || 'Receta';
            document.getElementById('prepRecipeTitleBlack').textContent = ' ' + (recipe.blackTitle || '');
            document.getElementById('prepRecipeDescription').textContent = recipe.description || 'Recetario personal';
            document.getElementById('prepRecipeItemsCount').textContent = `${recipe.ingredients?.length || 0} ITEMS`;

            this.renderRecipeIngredients();
        }

        /** Cierra la vista de receta */
        closeRecipeView() {
            const modal = document.getElementById('prepRecipeDetailModal');
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
            this.renderList();
        }

        /** Cambia las porciones dentro de la receta y re-calcula cantidades con soporte fraccional */
        changeRecipePortions(delta) {
            if (!this.activeTaskForRecipe) return;
            const fractionalSteps = [0.125, 0.25, 0.5, 0.75, 1];
            const current = this.activeTaskForRecipe.portions || 1;
            let next;

            if (delta > 0) {
                if (current < 1) {
                    next = fractionalSteps.find(s => s > current + 0.001) || 2;
                } else {
                    next = Math.min(50, Math.floor(current) + 1);
                }
            } else {
                if (current <= 1) {
                    next = [...fractionalSteps].reverse().find(s => s < current - 0.001) || 0.125;
                } else {
                    next = Math.ceil(current) - 1;
                }
            }

            this.activeTaskForRecipe.portions = next;
            this.renderRecipeIngredients();

            if (window.supabaseClient && !String(this.activeTaskForRecipe.id).startsWith('temp_')) {
                window.supabaseClient
                    .from('prep_tasks')
                    .update({
                        portions: next,
                        recipe_data: this.activeTaskForRecipe.recipe_data,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.activeTaskForRecipe.id)
                    .then(() => {});
            }
        }

        /** Renderiza los ingredientes con cantidades escaladas */
        renderRecipeIngredients() {
            if (!this.activeTaskForRecipe) return;
            const task = this.activeTaskForRecipe;
            const recipe = task.recipe_data || (task.recipe_id ? this.recipesCatalog[task.recipe_id] : null);
            if (!recipe || !Array.isArray(recipe.ingredients)) return;

            const multiplier = task.portions || 1;
            let mainDisplay = '';
            if (multiplier === 0.125) mainDisplay = '1/8';
            else if (multiplier === 0.25) mainDisplay = '1/4';
            else if (multiplier === 0.5) mainDisplay = '1/2';
            else if (multiplier === 0.75) mainDisplay = '3/4';
            else mainDisplay = multiplier % 1 === 0 ? multiplier.toString() : multiplier.toFixed(2).replace(/\.?0+$/, '');

            const portionValEl = document.getElementById('prepRecipePortionValue');
            const portionHintEl = document.getElementById('prepPortionScaleHint');
            if (portionValEl) portionValEl.textContent = mainDisplay;
            if (portionHintEl) {
                if (multiplier === 1) {
                    portionHintEl.textContent = 'Receta original';
                } else if (multiplier > 1) {
                    portionHintEl.textContent = `Receta multiplicada × ${mainDisplay}`;
                } else {
                    const divisor = 1 / multiplier;
                    if (Math.abs(divisor - Math.round(divisor)) < 0.01) {
                        portionHintEl.textContent = `Receta reducida ÷ ${Math.round(divisor)}`;
                    } else {
                        portionHintEl.textContent = `Receta reducida a ${mainDisplay}`;
                    }
                }
            }

            const listEl = document.getElementById('prepRecipeIngredientsList');
            if (!listEl) return;

            if (recipe.ingredients.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 32px 16px; background: #F9FAFB; border-radius: 16px; border: 1px dashed #D1D5DB;">
                        <span class="material-symbols-outlined" style="font-size: 32px; color: #9CA3AF;">menu_book</span>
                        <div style="font-size: 13.5px; font-weight: 700; color: #374151; margin-top: 6px;">Esta receta no tiene lista de ingredientes</div>
                        <div style="font-size: 11.5px; color: #6B7280; margin-top: 2px;">Puedes presionar el botón "Listo" para marcar la actividad como completada.</div>
                    </div>
                `;
                const progressEl = document.getElementById('prepRecipeChecklistProgress');
                if (progressEl) progressEl.textContent = '0 ingredientes';
                return;
            }

            listEl.innerHTML = recipe.ingredients.map((ing, idx) => {
                let displayText = ing.name;
                if (ing.baseAmount !== null && ing.baseAmount !== undefined) {
                    const scaled = ing.baseAmount * multiplier;
                    const formattedQty = (scaled % 1 === 0) ? scaled : parseFloat(scaled.toFixed(2));
                    displayText = `${formattedQty} ${ing.unit || ''} ${ing.name}`.replace(/\s+/g, ' ').trim();
                } else if (multiplier !== 1) {
                    displayText = `${mainDisplay}x ${ing.name}`;
                }

                return `
                    <label style="display: flex; align-items: center; gap: 18px; cursor: pointer; user-select: none; padding: 4px 0;">
                        <input 
                            type="checkbox" 
                            class="circle-mint-checkbox" 
                            ${ing.checked ? 'checked' : ''} 
                            onchange="window.tasksManager.toggleIngredientCheck(${idx})"
                        >
                        <span style="font-size: 17px; font-weight: 600; color: ${ing.checked ? '#9CA3AF' : '#1F2937'}; ${ing.checked ? 'text-decoration: line-through;' : ''}">
                            ${displayText}
                        </span>
                    </label>
                `;
            }).join('');

            const checkedCount = recipe.ingredients.filter(i => i.checked).length;
            const totalCount = recipe.ingredients.length;
            document.getElementById('prepRecipeChecklistProgress').textContent = 
                `${checkedCount} de ${totalCount} ingredientes listos`;
        }

        /** Alterna el check de un ingrediente en la vista de receta */
        toggleIngredientCheck(index) {
            if (!this.activeTaskForRecipe) return;
            const task = this.activeTaskForRecipe;
            const recipe = task.recipe_data || (task.recipe_id ? this.recipesCatalog[task.recipe_id] : null);
            if (!recipe || !recipe.ingredients || !recipe.ingredients[index]) return;

            recipe.ingredients[index].checked = !recipe.ingredients[index].checked;
            task.recipe_data = recipe;

            // Si todos los ingredientes están listos, marcar la tarea como completada automáticamente
            const allChecked = recipe.ingredients.every(i => i.checked);
            const targetDate = this.selectedDate || this.getTodayDateString();
            const todayStr = this.getTodayDateString();

            if (task.is_daily) {
                if (!Array.isArray(task.completed_dates)) {
                    task.completed_dates = Array.isArray(task.recipe_data?.completed_dates)
                        ? [...task.recipe_data.completed_dates]
                        : (task.completed ? [todayStr] : []);
                }
                if (allChecked) {
                    if (!task.completed_dates.includes(targetDate)) {
                        task.completed_dates.push(targetDate);
                    }
                    if (targetDate === todayStr) task.completed = true;
                    this.notify(`¡Todos los ingredientes de ${recipe.greenTitle} ${recipe.blackTitle} listos!`, 'success');
                } else {
                    task.completed_dates = task.completed_dates.filter(d => d !== targetDate);
                    if (targetDate === todayStr) task.completed = false;
                }
                if (!task.recipe_data || typeof task.recipe_data !== 'object') {
                    task.recipe_data = {};
                }
                task.recipe_data.completed_dates = [...task.completed_dates];
            } else {
                task.completed = allChecked;
                if (allChecked) {
                    this.notify(`¡Todos los ingredientes de ${recipe.greenTitle} ${recipe.blackTitle} listos!`, 'success');
                }
            }

            this.saveCache();
            this.renderRecipeIngredients();

            if (window.supabaseClient && !String(task.id).startsWith('temp_')) {
                const updatePayload = {
                    recipe_data: recipe,
                    completed: task.completed,
                    updated_at: new Date().toISOString()
                };
                if (task.is_daily) {
                    updatePayload.completed_dates = task.completed_dates || [];
                }
                window.supabaseClient
                    .from('prep_tasks')
                    .update(updatePayload)
                    .eq('id', task.id)
                    .then(() => {});
            }
        }

        /** Marca todos los ingredientes de la receta activa como listos */
        checkAllRecipeIngredients() {
            if (!this.activeTaskForRecipe) return;
            const task = this.activeTaskForRecipe;
            const recipe = task.recipe_data || (task.recipe_id ? this.recipesCatalog[task.recipe_id] : null);
            if (!recipe || !recipe.ingredients) return;

            recipe.ingredients.forEach(i => i.checked = true);
            task.recipe_data = recipe;

            const targetDate = this.selectedDate || this.getTodayDateString();
            const todayStr = this.getTodayDateString();

            if (task.is_daily) {
                if (!Array.isArray(task.completed_dates)) {
                    task.completed_dates = Array.isArray(task.recipe_data?.completed_dates)
                        ? [...task.recipe_data.completed_dates]
                        : (task.completed ? [todayStr] : []);
                }
                if (!task.completed_dates.includes(targetDate)) {
                    task.completed_dates.push(targetDate);
                }
                if (targetDate === todayStr) task.completed = true;
                task.recipe_data.completed_dates = [...task.completed_dates];
            } else {
                task.completed = true;
            }

            this.saveCache();
            this.renderRecipeIngredients();
            this.notify('Todos los ingredientes marcados como listos');

            if (window.supabaseClient && !String(task.id).startsWith('temp_')) {
                const updatePayload = {
                    recipe_data: recipe,
                    completed: task.completed,
                    updated_at: new Date().toISOString()
                };
                if (task.is_daily) {
                    updatePayload.completed_dates = task.completed_dates || [];
                }
                window.supabaseClient
                    .from('prep_tasks')
                    .update(updatePayload)
                    .eq('id', task.id)
                    .then(() => {});
            }
        }

        /** Termina la preparación desde la vista de receta y vuelve al To-Do */
        completeTaskFromRecipe() {
            if (this.activeTaskForRecipe) {
                const task = this.activeTaskForRecipe;
                const targetDate = this.selectedDate || this.getTodayDateString();
                const todayStr = this.getTodayDateString();

                if (task.is_daily) {
                    if (!Array.isArray(task.completed_dates)) {
                        task.completed_dates = Array.isArray(task.recipe_data?.completed_dates)
                            ? [...task.recipe_data.completed_dates]
                            : (task.completed ? [todayStr] : []);
                    }
                    if (!task.completed_dates.includes(targetDate)) {
                        task.completed_dates.push(targetDate);
                    }
                    if (targetDate === todayStr) task.completed = true;
                } else {
                    task.completed = true;
                }

                if (task.recipe_data?.ingredients) {
                    task.recipe_data.ingredients.forEach(i => i.checked = true);
                }
                if (task.recipe_data) {
                    task.recipe_data.completed_dates = task.completed_dates || [];
                }
                this.saveCache();

                if (window.supabaseClient && !String(task.id).startsWith('temp_')) {
                    const updatePayload = {
                        completed: task.completed,
                        recipe_data: task.recipe_data,
                        updated_at: new Date().toISOString()
                    };
                    if (task.is_daily) {
                        updatePayload.completed_dates = task.completed_dates || [];
                    }
                    window.supabaseClient
                        .from('prep_tasks')
                        .update(updatePayload)
                        .eq('id', task.id)
                        .then(() => {});
                }
            }
            this.closeRecipeView();
            this.notify('¡Prep completado en tu To-Do diario!', 'success');
        }

        /** Alterna favorito en receta */
        toggleFavoriteRecipe() {
            const btn = document.getElementById('prepFavBtn')?.querySelector('span');
            if (btn) {
                const isFav = btn.style.fontVariationSettings?.includes("'FILL' 1");
                btn.style.fontVariationSettings = isFav ? "'FILL' 0" : "'FILL' 1";
                this.notify(isFav ? 'Quitada de Favoritos' : 'Guardada en Favoritos');
            }
        }
    }

    // Instancia global disponible en window
    window.tasksManager = new TasksManager();
})();
