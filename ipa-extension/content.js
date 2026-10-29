(function () {
    'use strict';

    const STORAGE_KEY = 'rp_pending_ipa_order';

    function extractOrderFromUrl() {
        try {
            const url = new URL(window.location.href);
            let encoded = url.searchParams.get('rp_order');
            if (!encoded && window.location.hash.includes('rp_order=')) {
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                encoded = hashParams.get('rp_order');
            }
            if (encoded) {
                const jsonStr = decodeURIComponent(escape(atob(encoded)));
                const parsed = JSON.parse(jsonStr);
                if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
                    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                    url.searchParams.delete('rp_order');
                    if (window.location.hash.includes('rp_order=')) {
                        url.hash = '';
                    }
                    window.history.replaceState({}, document.title, url.toString());
                    return parsed;
                }
            }
        } catch (err) {
            console.warn('[RecipePantry → IPA] Error leyendo rp_order:', err);
        }

        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    }

    function showStatusBanner(title, subtitle, type = 'info', actions = []) {
        let banner = document.getElementById('rp-ipa-assistant-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'rp-ipa-assistant-banner';
            banner.style.cssText = [
                'position: fixed',
                'top: 18px',
                'right: 18px',
                'z-index: 999999',
                'max-width: 380px',
                'background: #ffffff',
                'color: #1a1c19',
                'border: 2px solid #10b981',
                'border-radius: 18px',
                'box-shadow: 0 12px 32px rgba(0,0,0,0.18)',
                'padding: 16px 18px',
                'font-family: Poppins, system-ui, -apple-system, sans-serif',
                'transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
            ].join(';');
            document.body.appendChild(banner);
        }

        const accentColor = type === 'success' ? '#0d7a50' : (type === 'warning' ? '#b45309' : '#0f766e');
        banner.style.borderColor = accentColor;

        banner.innerHTML = `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                <div>
                    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:${accentColor};margin-bottom:3px;">
                        RecipePantry · Auto Cart
                    </div>
                    <div style="font-size:14.5px;font-weight:700;color:#111827;line-height:1.3;">
                        ${title}
                    </div>
                    <div id="rp-ipa-banner-sub" style="font-size:12.5px;color:#4b5563;margin-top:4px;line-height:1.4;">
                        ${subtitle}
                    </div>
                </div>
                <button id="rp-ipa-banner-close" style="background:transparent;border:none;font-size:18px;line-height:1;cursor:pointer;color:#6b7280;padding:2px 6px;border-radius:999px;">✕</button>
            </div>
            <div id="rp-ipa-banner-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:${actions.length ? '12px' : '0'};"></div>
        `;

        const closeBtn = banner.querySelector('#rp-ipa-banner-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                sessionStorage.removeItem(STORAGE_KEY);
                banner.remove();
            };
        }

        const actionsContainer = banner.querySelector('#rp-ipa-banner-actions');
        actions.forEach(act => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = act.label;
            btn.style.cssText = act.primary
                ? 'background:#10b981;color:#ffffff;border:none;border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:700;cursor:pointer;'
                : 'background:#f3f4f6;color:#1f2937;border:1px solid #d1d5db;border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;';
            btn.onclick = act.onClick;
            actionsContainer.appendChild(btn);
        });
    }

    // Agrega todos los productos directo al carrito usando la API oficial de IPA (/api/orderpad/get/ + /api/basket/add)
    async function addItemsDirectlyViaIpaApi(orderData) {
        const items = orderData.items || [];
        if (items.length === 0) return;

        showStatusBanner(
            `Cargando ${items.length} productos al carrito...`,
            `Proveedor: ${orderData.supplierName || 'IPA'}`,
            'info'
        );

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const sku = String(item.sku || '').trim();
            const qty = Number(item.qty) || 1;
            if (!sku) continue;

            showStatusBanner(
                `Agregando ${i + 1} de ${items.length} al carrito...`,
                `${sku} (x${qty}) · ${item.name || ''}`,
                'info'
            );

            let productId = null;
            let supplierId = null;

            try {
                const searchUrl = `/api/orderpad/get/?overrideMode=&page=1&pageSize=20&search=${encodeURIComponent(sku)}&category=-1&strict=-1&identifier=-1&supplierId=-1&cache=false`;
                const res = await fetch(searchUrl, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    credentials: 'same-origin'
                });
                if (res.ok) {
                    const data = await res.json();
                    const prods = Array.isArray(data?.Products) ? data.Products : [];
                    const match = prods.find(p => String(p.Code || '').trim().toUpperCase() === sku.toUpperCase()) || prods[0];
                    if (match && match.ID) {
                        productId = match.ID;
                        supplierId = match.SupplierId || null;
                    }
                }
            } catch (e) {}

            const params = new URLSearchParams();
            if (productId !== null) params.set('ProductId', String(productId));
            params.set('VariationId', '');
            params.set('Qty', String(qty));
            params.set('Sku', sku);
            if (supplierId !== null) params.set('SupplierId', String(supplierId));
            params.set('ServiceAdditionId', '0');
            params.set('CustomisationGroupId', '');

            await fetch('/api/basket/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin',
                body: params.toString()
            });
        }

        sessionStorage.removeItem(STORAGE_KEY);
        showStatusBanner(
            `¡${items.length} productos agregados al carrito! 🛒`,
            'Abriendo tu carrito de IPA...',
            'success'
        );

        setTimeout(() => {
            window.location.href = '/basket';
        }, 500);
    }

    function init() {
        const orderData = extractOrderFromUrl();
        if (!orderData || !Array.isArray(orderData.items) || orderData.items.length === 0) return;

        // Si ya vienen marcados como agregados por la Edge Function del servidor, solo limpiar y mostrar confirmación
        if (orderData.serverAdded) {
            sessionStorage.removeItem(STORAGE_KEY);
            showStatusBanner(
                `¡${orderData.items.length} productos en tu carrito! 🛒`,
                `Enviados desde RecipePantry (${orderData.supplierName || 'IPA'}).`,
                'success'
            );
            return;
        }

        const path = window.location.pathname.toLowerCase();
        if (path.includes('login') || document.querySelector('input[type="password"]')) {
            showStatusBanner(
                'Inicia sesión en IPA',
                `Tienes ${orderData.items.length} productos listos para agregarse a tu carrito en cuanto inicies sesión.`,
                'warning'
            );
            return;
        }

        addItemsDirectlyViaIpaApi(orderData);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
