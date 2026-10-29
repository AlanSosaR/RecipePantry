(function () {
    'use strict';

    const STORAGE_KEY = 'rp_pending_ipa_order';

    // 1. Extraer orden si viene en la URL (?rp_order=... o #rp_order=...)
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
                    // Limpiar parámetro de la URL sin recargar
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
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {}
        return null;
    }

    // 2. Mostrar banner visual flotante estilo M3 en la esquina superior derecha de IPA
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

    // 3. Inyectar archivo CSV directamente en el <input type="file"> o zona de drop de Quick Order
    function injectCsvIntoQuickOrder(orderData) {
        const items = orderData.items || [];
        if (items.length === 0) return false;

        // Formato oficial pedido por IPA: primera columna SKU, segunda columna Cantidad, sin cabeceras
        const csvLines = items.map(it => `${String(it.sku).trim()},${Number(it.qty) || 1}`);
        const csvContent = csvLines.join('\r\n');
        const csvFile = new File([csvContent], 'ipa_quick_order.csv', { type: 'text/csv' });

        // Buscar input[type="file"] en la página (incluso si está oculto dentro del dropzone)
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
            try {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(csvFile);
                fileInput.files = dataTransfer.files;

                fileInput.dispatchEvent(new Event('input', { bubbles: true }));
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));

                // Si usa Dropzone.js u otro listener de drag & drop en el contenedor:
                const dropTarget = fileInput.closest('.dropzone, [class*="upload"], [class*="drop"], div') || fileInput.parentElement;
                if (dropTarget) {
                    const dropEvent = new DragEvent('drop', {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer
                    });
                    dropTarget.dispatchEvent(dropEvent);
                }

                sessionStorage.removeItem(STORAGE_KEY);
                showStatusBanner(
                    `¡${items.length} productos cargados!`,
                    `Proveedor: ${orderData.supplierName || 'IPA'}. Se inyectó el archivo CSV automáticamente.`,
                    'success',
                    [
                        {
                            label: 'Usar modo SKU 1x1 (Respaldo)',
                            primary: false,
                            onClick: () => addSkusSequentially(items)
                        }
                    ]
                );

                // Buscar automáticamente botón de "Add to Basket" / "Confirm" si aparece tras subir el CSV
                setTimeout(tryClickAddAllToBasket, 900);
                setTimeout(tryClickAddAllToBasket, 2000);
                return true;
            } catch (err) {
                console.warn('[RecipePantry → IPA] Falló inyección directa en input file:', err);
            }
        }

        return false;
    }

    // 4. Modo respaldo: escribir cada SKU en la caja "Product Sku" y pulsar "Add"
    async function addSkusSequentially(items) {
        const skuInput = document.querySelector('input[placeholder*="Sku" i], input[placeholder*="SKU" i], input[type="text"]');
        if (!skuInput) {
            alert('No se encontró el campo "Product Sku" en esta pantalla.');
            return;
        }

        // Buscar el botón "Add" al lado del input
        const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn'));
        const addBtn = buttons.find(b => (b.textContent || b.value || '').trim().toLowerCase() === 'add');

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            showStatusBanner(
                `Agregando producto ${i + 1} de ${items.length}...`,
                `SKU: ${item.sku} (Cant: ${item.qty}) - ${item.name || ''}`,
                'info'
            );

            skuInput.focus();
            skuInput.value = item.sku;
            skuInput.dispatchEvent(new Event('input', { bubbles: true }));
            skuInput.dispatchEvent(new Event('change', { bubbles: true }));
            skuInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 }));

            await new Promise(r => setTimeout(r, 450));

            if (addBtn) {
                addBtn.click();
            }
            await new Promise(r => setTimeout(r, 650));
        }

        sessionStorage.removeItem(STORAGE_KEY);
        showStatusBanner(
            `¡Listo! ${items.length} productos procesados`,
            'Revisa las cantidades en la lista y confirma tu carrito.',
            'success'
        );
    }

    // 5. Intentar pulsar el botón final de "Add to Basket" si la tabla de Quick Order lo muestra tras subir el CSV
    function tryClickAddAllToBasket() {
        const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a'));
        const basketBtn = candidates.find(el => {
            const txt = (el.textContent || el.value || '').trim().toLowerCase();
            return txt.includes('add to basket') || txt.includes('add all to basket') || txt.includes('add to cart');
        });
        if (basketBtn) {
            basketBtn.click();
        }
    }

    // 6. Flujo principal al cargar cualquier página de ipa-pay.ipapurchasing.co.uk
    function init() {
        const orderData = extractOrderFromUrl();
        if (!orderData || !Array.isArray(orderData.items) || orderData.items.length === 0) return;

        const path = window.location.pathname.toLowerCase();

        // Si el usuario fue redirigido al login porque su sesión estaba cerrada:
        if (path.includes('login') || document.querySelector('input[type="password"]')) {
            showStatusBanner(
                'Inicia sesión en IPA',
                `Tienes un pedido pendiente de ${orderData.items.length} productos (${orderData.supplierName || 'IPA'}). En cuanto entres se cargará automáticamente.`,
                'warning'
            );
            return;
        }

        // Si está en overview u otra página pero hay un pedido pendiente, llevarlo directo a Quick Order:
        if (!path.includes('quick-order')) {
            showStatusBanner(
                'Abriendo Quick Order...',
                `Redirigiendo para cargar tus ${orderData.items.length} productos automáticamente...`,
                'info'
            );
            setTimeout(() => {
                window.location.href = 'https://ipa-pay.ipapurchasing.co.uk/my-account/quick-order.aspx';
            }, 400);
            return;
        }

        // Estamos en /my-account/quick-order.aspx: esperar un instante a que el DOM termine de montar el dropzone
        setTimeout(() => {
            const injected = injectCsvIntoQuickOrder(orderData);
            if (!injected) {
                // Si el input[type=file] tarda en renderizarse, reintentar o mostrar botón directo
                setTimeout(() => {
                    const retry = injectCsvIntoQuickOrder(orderData);
                    if (!retry) {
                        showStatusBanner(
                            `Pedido listo (${orderData.items.length} productos)`,
                            'Haz clic abajo para inyectar los productos en Quick Order:',
                            'info',
                            [
                                {
                                    label: 'Cargar por CSV ahora',
                                    primary: true,
                                    onClick: () => injectCsvIntoQuickOrder(orderData)
                                },
                                {
                                    label: 'Cargar por SKU 1x1',
                                    primary: false,
                                    onClick: () => addSkusSequentially(orderData.items)
                                }
                            ]
                        );
                    }
                }, 900);
            }
        }, 450);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

