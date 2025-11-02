// Listen for messages from popup (örneğin kullanıcı popup'tan kalite seçtiğinde)
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'setQuality') {
        chrome.storage.sync.set({ preferredQuality: request.quality });
        setPreferredQuality(request.quality, true);
    }
});

// React to storage changes (e.g., popup saved a new preferredQuality) so content applies it reliably
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.preferredQuality) {
        const newQ = changes.preferredQuality.newValue;
        const oldQ = changes.preferredQuality.oldValue;
        
        // Only apply if we have a new valid quality value
        if (newQ) {
            // Clean up the quality value (strip 'p', etc.)
            const cleanQ = String(newQ).replace(/[pP]\s*60|\s+|[pP]$/g, '');
            
            // Validate it's a supported quality value
            if (['720', '1080'].includes(cleanQ)) {
                console.debug('[Kick Quality] Yeni kalite ayarı uygulanıyor:', newQ, '(cleaned:', cleanQ, ')');
                // true indicates it originated from UI change
                setPreferredQuality(cleanQ, true);
            } else {
                console.warn('[Kick Quality] Geçersiz kalite değeri:', newQ);
            }
        } else if (oldQ && !newQ) {
            // Quality preference was removed - let player use default
            console.debug('[Kick Quality] Kalite tercihi kaldırıldı, player varsayılanı kullanılacak');
            sessionStorage.removeItem('stream_quality');
        }
    }
});

// --- SPA navigation / URL change handling ---------------------------------
// Debounced handler to run when URL changes or relevant DOM appears
let _lastUrl = location.href;
let _urlChangeTimer = null;
function handleUrlChangeDebounced() {
    if (_urlChangeTimer) clearTimeout(_urlChangeTimer);
    _urlChangeTimer = setTimeout(async () => {
        _urlChangeTimer = null;
        const href = location.href;
        if (href === _lastUrl) return;
        _lastUrl = href;
    console.debug('[Kick Quality] URL değişti, tetikleniyor:', href);
        // read preferredQuality from storage then apply
        chrome.storage.sync.get('preferredQuality', (data) => {
            const preferredQuality = data.preferredQuality || '1080';
            setPreferredQuality(preferredQuality, false);
        });
    }, 300);
}

// Patch history methods to detect SPA navigation
(function() {
    const _push = history.pushState;
    history.pushState = function() {
        const res = _push.apply(this, arguments);
        window.dispatchEvent(new Event('locationchange'));
        return res;
    };
    const _replace = history.replaceState;
    history.replaceState = function() {
        const res = _replace.apply(this, arguments);
        window.dispatchEvent(new Event('locationchange'));
        return res;
    };
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('locationchange', handleUrlChangeDebounced);
})();

// Observe DOM mutations to detect when video player is added (useful on route change)
const domObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.tagName === 'VIDEO' || node.querySelector && node.querySelector('#video-player, video')) {
                // run immediately (but debounce so multiple adds don't spam)
                if (_urlChangeTimer) clearTimeout(_urlChangeTimer);
                _urlChangeTimer = setTimeout(() => {
                    chrome.storage.sync.get('preferredQuality', (data) => {
                        const preferredQuality = data.preferredQuality || '1080';
                        setPreferredQuality(preferredQuality, false);
                    });
                    _urlChangeTimer = null;
                }, 250);
                return;
            }
        }
    }
});
domObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
// --------------------------------------------------------------------------

// Run id to cancel in-progress operations when navigation happens quickly
let _kickQualityRunId = 0;

// Sayfa yüklendiğinde mevcut kaliteyi kontrol et
const currentQuality = sessionStorage.getItem('stream_quality');

if (!currentQuality) {
    // Eğer sessionStorage boşsa chrome.storage.sync'ten yükle
    chrome.storage.sync.get('preferredQuality', function (data) {
        // Don't default to any quality if none is set - let player use its default
        const preferredQuality = data.preferredQuality || null;
        if (preferredQuality) {
            console.debug('[Kick Quality] sessionStorage boş, storage\'dan yüklendi:', preferredQuality);
            setPreferredQuality(preferredQuality, false);
        } else {
            console.debug('[Kick Quality] Kalite tercihi ayarlanmamış, player varsayılanı kullanılacak');
        }
    });
    } else {
    console.debug('[Kick Quality] sessionStorage bulundu:', currentQuality);
    setPreferredQuality(currentQuality, false);
}

// Ana fonksiyon: kaliteyi uygular ve sessionStorage’a kaydeder
async function setPreferredQuality(preferredQuality, shouldReload) {
        // bump run id and capture for this invocation - used to cancel on rapid navigation
        const _thisRun = ++_kickQualityRunId;
        const _isStale = () => _thisRun !== _kickQualityRunId;
    try {
        // Video player'ı bul (id veya video elementi)
        const videoPlayer = document.getElementById('video-player') || document.querySelector('video');
        if (_isStale()) { console.debug('[Kick Quality] Run cancelled early (navigation)'); return; }
        if (!videoPlayer) {
            console.log('[Kick Quality] Video player bulunamadı');
            // yine de sessionStorage kaydet
            sessionStorage.setItem('stream_quality', preferredQuality);
            return;
        }

        // Mouse hover efektini daha gerçekçi simüle et
        const rect = videoPlayer.getBoundingClientRect();
        const centerX = Math.round(rect.left + rect.width / 2);
        const centerY = Math.round(rect.top + rect.height / 2);

        const events = [
            new MouseEvent('mouseenter', { view: window, bubbles: true, cancelable: true, clientX: centerX, clientY: centerY }),
            new MouseEvent('mouseover',  { view: window, bubbles: true, cancelable: true, clientX: centerX, clientY: centerY }),
            new MouseEvent('mousemove',  { view: window, bubbles: true, cancelable: true, clientX: centerX, clientY: centerY })
        ];

        // Helper: robust click that dispatches pointer/mouse events and falls back to elementFromPoint click
        async function robustClick(el) {
            if (!el) return;
            try {
                const r = el.getBoundingClientRect();
                const cx = Math.round(r.left + r.width / 2);
                const cy = Math.round(r.top + r.height / 2);

                // pointer/mouse down
                el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: cx, clientY: cy, button: 0 }));
                el.dispatchEvent(new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));
                await new Promise(rp => setTimeout(rp, 20));

                // pointer/mouse up
                el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: cx, clientY: cy, button: 0 }));
                el.dispatchEvent(new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 }));

                // try native click
                try { el.click(); } catch (e) {}

                // fallback: if element at point is different (overlay) click that one
                const at = document.elementFromPoint(cx, cy);
                if (at && at !== el) {
                    try { at.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true, clientX: cx, clientY: cy })); } catch (e) {}
                }
                await new Promise(rp => setTimeout(rp, 30));
            } catch (err) {
                try { el.click(); } catch (e) {}
            }
        }

        // Dispatch events on the player and a few parent nodes to increase chance
        events.forEach(ev => {
            videoPlayer.dispatchEvent(ev);
            if (videoPlayer.parentElement) videoPlayer.parentElement.dispatchEvent(ev);
            if (videoPlayer.parentElement && videoPlayer.parentElement.parentElement) videoPlayer.parentElement.parentElement.dispatchEvent(ev);
        });

    console.debug('[Kick Quality] Video player üzerine hover simüle edildi');

        // Hover sonrası kontrol öğelerinin görünmesi için bekle
        await new Promise(resolve => setTimeout(resolve, 900));
    if (_isStale()) { console.debug('[Kick Quality] Run cancelled after hover (navigation)'); return; }

        // Ayarlar butonunu öncelikle tam XPath ile ara (kullanıcının verdiği XPath)
        const settingsXPath = '/html/body/div[2]/div[2]/div[4]/main/div[1]/div[2]/div/div/div/div[1]/div[2]/button[5]';
        let settingsButton = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

        // Eğer bulunamazsa, SVG path içerik kontrolü ile ikinci bir deneme yap
        if (!settingsButton) {
            try {
                settingsButton = document.evaluate(
                    "//button[.//svg//path[contains(@d, 'M25.7,17.3')]]",
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                ).singleNodeValue;
            } catch (e) {
                // ignore xpath errors
            }
        }

        if (!settingsButton) {
            // Alternatif olarak aria-label veya title ile ara
            settingsButton = document.querySelector('button[aria-label="Settings"], button[title="Settings"], button[aria-label="Ayarlar"], button[title="Ayarlar"]');
        }

        if (!settingsButton) {
            console.warn('[Kick Quality] Ayarlar butonu bulunamadı');
            // yine kaydet ve çık
            sessionStorage.setItem('stream_quality', preferredQuality);
            return;
        }

        // Sayfayı kaydırmadan önce buton üzerine hover yapıp tıklamayı dene
        try {
            const sRect = settingsButton.getBoundingClientRect();
            const sX = Math.round(sRect.left + sRect.width / 2);
            const sY = Math.round(sRect.top + sRect.height / 2);

            // Hover events
            ['mouseenter', 'mouseover', 'mousemove'].forEach(type => {
                const ev = new MouseEvent(type, { view: window, bubbles: true, cancelable: true, clientX: sX, clientY: sY });
                settingsButton.dispatchEvent(ev);
            });

            // Kısa bekleme
            await new Promise(resolve => setTimeout(resolve, 250));
            if (_isStale()) { console.debug('[Kick Quality] Run cancelled before clicking settings (navigation)'); return; }

            // Re-get element by XPath in case DOM changed
            const settingsByXPath = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton;

            // Check if element at point is the button or is covering it
            const elAtPoint = document.elementFromPoint(sX, sY);
            const covered = elAtPoint && elAtPoint !== settingsByXPath && !settingsByXPath.contains(elAtPoint);
            if (covered) {
                console.debug('[Kick Quality] Ayarlar butonu noktasında başka bir element var:', elAtPoint);
            }

            // Try a sequence of pointer/mouse events on the target element
            try {
                const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: sX, clientY: sY, button: 0 });
                const mouseDown = new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true, clientX: sX, clientY: sY, button: 0 });
                settingsByXPath.dispatchEvent(pointerDown);
                settingsByXPath.dispatchEvent(mouseDown);

                // small delay
                await new Promise(resolve => setTimeout(resolve, 50));
                if (_isStale()) { console.debug('[Kick Quality] Run cancelled during click sequence (navigation)'); return; }

                const pointerUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: sX, clientY: sY, button: 0 });
                const mouseUp = new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true, clientX: sX, clientY: sY, button: 0 });
                settingsByXPath.dispatchEvent(pointerUp);
                settingsByXPath.dispatchEvent(mouseUp);

                // Dispatch click both on the xpath element and the element at point
                try { settingsByXPath.click(); } catch (e) {}
                const elNow = document.elementFromPoint(sX, sY);
                if (elNow && elNow !== settingsByXPath) {
                    try { elNow.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true, clientX: sX, clientY: sY })); } catch (e) {}
                }

                console.debug('[Kick Quality] Ayarlar butonuna çeşitli click denemeleri yapıldı');
            } catch (innerErr) {
                console.warn('[Kick Quality] click sequence sırasında hata:', innerErr);
                try { settingsByXPath.click(); } catch (e) {}
            }
        } catch (e) {
            console.warn('[Kick Quality] Ayarlar butonuna tıklama sırasında hata, fallback click deneniyor', e);
            try { settingsButton.click(); } catch {}
        }

        // Menü açılması için bekle
        await new Promise(resolve => setTimeout(resolve, 600));
    if (_isStale()) { console.debug('[Kick Quality] Run cancelled waiting for menu (navigation)'); return; }

        // Kalite seçeneğini bulmaya çalış - geliştirilmiş güvenilir arama yaklaşımı
        let qualityOption = null;
        const pref = String(preferredQuality).toLowerCase();
        
        // 1. Öncelikle kalite menüsünü bulmaya çalış
        const qualityMenus = Array.from(document.querySelectorAll([
            'div[role="menu"]',
            '[aria-label*="Quality"]',
            '[aria-label*="quality"]',
            '[class*="quality-menu"]',
            '[class*="QualityMenu"]'
        ].join(',')));

        // 2. Kalite seçeneklerini tüm olası selektörlerle ara
        const candidates = Array.from(document.querySelectorAll([
            '[role="menuitemradio"]',
            '[data-testid="player-quality-option"]',
            '.vjs-menu-item',
            '.quality-option',
            // Kick.com özel menü öğeleri
            '[class*="quality"]',
            '[class*="Quality"]',
            // Ek selektörler
            'div[role="menuitem"]',
            'button[role="menuitem"]',
            '[aria-label*="quality"]'
        ].join(',')));

        // Quality text matching patterns - genişletilmiş kalıplar
        const matchPatterns = [
            pref,              // düz sayı eşleşmesi
            pref + 'p',       // örn. "720p"
            pref + 'p60',     // örn. "720p60"
            pref + ' p',      // örn. "720 p"
            pref + ' p60',    // örn. "720 p60"
            pref + ' P',      // örn. "720 P"
            pref + 'P',       // örn. "720P"
            pref + ' FPS',    // örn. "720 FPS"
            pref + 'fps',     // örn. "720fps"
            pref + ' HD',     // örn. "720 HD"
            pref + 'HD'       // örn. "720HD"
        ];

        // 2. İlk olarak tam eşleşme ara
        qualityOption = candidates.find(el => {
            const txt = (el.textContent || '').toLowerCase().trim();
            return matchPatterns.some(pattern => txt === pattern);
        });

        // 3. Tam eşleşme yoksa içeren ara
        if (!qualityOption) {
            qualityOption = candidates.find(el => {
                const txt = (el.textContent || '').toLowerCase().trim();
                return matchPatterns.some(pattern => txt.includes(pattern));
            });
        }

        // 4. Hala bulunamadıysa XPath ve diğer seçicilerle dene
        if (!qualityOption) {
            try {
                // Önce menü yapısını doğrula
                const qualityMenu = document.evaluate('//div[@role="menu"][contains(@class, "quality") or contains(@aria-label, "Quality")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

                if (qualityMenu) {
                    // 720p için birden fazla XPath dene
                    if (pref === '720') {
                        const paths720 = [
                            '//div[@role="menuitemradio"][contains(., "720")]',
                            '//div[contains(@class, "quality-option")][contains(., "720")]',
                            '/html/body/div[2]/div[2]/div[4]/main/div[1]/div[2]/div/div/div/div[2]/div/div/div[3]',
                            '//div[@role="menuitem"][contains(., "720")]'
                        ];
                        
                        for (const xpath of paths720) {
                            const found = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            if (found && (found.textContent || '').toLowerCase().includes('720')) {
                                qualityOption = found;
                                break;
                            }
                        }
                    }
                    // 1080p için birden fazla XPath dene
                    else if (pref === '1080') {
                        const paths1080 = [
                            '//div[@role="menuitemradio"][contains(., "1080")]',
                            '//div[contains(@class, "quality-option")][contains(., "1080")]',
                            '/html/body/div[2]/div[2]/div[4]/main/div[1]/div[2]/div/div/div/div[2]/div/div/div[2]',
                            '//div[@role="menuitem"][contains(., "1080")]'
                        ];
                        
                        for (const xpath of paths1080) {
                            const found = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            if (found && (found.textContent || '').toLowerCase().includes('1080')) {
                                qualityOption = found;
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                console.debug('[Kick Quality] XPath araması sırasında hata:', e);
                qualityOption = null;
            }
        }

        // 5. Son çare: tüm menü öğelerini ara ve en yakın eşleşmeyi bul
        if (!qualityOption) {
            const allMenuItems = Array.from(document.querySelectorAll('div[role="menu"] > *, .vjs-menu-content > *'));
            qualityOption = allMenuItems.find(el => {
                const txt = (el.textContent || '').toLowerCase().trim();
                return matchPatterns.some(pattern => txt.includes(pattern));
            });
        }

        // Helper to check if a quality element is selected
        const isSelected = (el) => {
            if (!el) return false;
            const ds = el.getAttribute('data-state');
            if (ds && ds.toLowerCase() === 'checked') return true;
            const ac = el.getAttribute('aria-checked');
            if (ac && (ac === 'true' || ac === 'checked')) return true;
            // fallback: check for classes or aria-pressed
            if (el.classList && (el.classList.contains('selected') || el.classList.contains('is-selected'))) return true;
            return false;
        };

        if (qualityOption) {
            // Try clicking with retries if not selected
            const maxAttempts = 4;
            let attempt = 0;
            let success = false;

            while (attempt < maxAttempts && !success) {
                if (_isStale()) { console.debug('[Kick Quality] Run cancelled during attempts (navigation)'); return; }
                attempt++;
                try { qualityOption.scrollIntoView({block: 'center', inline: 'center', behavior: 'auto'}); } catch {}
                try { qualityOption.click(); } catch (e) {
                    try { qualityOption.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } catch (ee) {}
                }

                // wait a bit for UI to update
                await new Promise(r => setTimeout(r, 300 + attempt * 150));

                // re-find the candidate that matches preferredQuality text
                const candidates = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'));
                const pref = String(preferredQuality).toLowerCase();
                const current = candidates.find(el => {
                    const txt = (el.textContent || '').toLowerCase();
                    return txt.includes(pref) || txt.includes(pref + 'p') || txt.includes(pref + 'p60');
                }) || null;

                // Consider selection successful if the target element reports selected
                // OR if the menu closed (many players close the menu after applying the choice).
                const menuNow = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'));
                const menuClosed = menuNow.length === 0;
                if (isSelected(current) || menuClosed) {
                    if (isSelected(current)) {
                        console.log(`[Kick Quality] ${preferredQuality} seçeneği seçili (attempt ${attempt})`);
                    } else {
                        console.log(`[Kick Quality] Menü kapandı; ${preferredQuality} seçimi varsayılan olarak başarılı sayıldı (attempt ${attempt})`);
                    }
                    success = true;
                    break;
                }

                // If not selected and we have attempts left, try re-opening settings and retry
                if (attempt < maxAttempts) {
                    try {
                        const btn = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton;
                        if (btn) {
                            // quick click sequence to open menu again
                            btn.dispatchEvent(new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true }));
                            btn.dispatchEvent(new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true }));
                            try { await robustClick(btn); } catch (e) { try { btn.click(); } catch (ee) {} }
                        }
                    } catch (e) {
                        // ignore
                    }
                    // small pause before next click
                    await new Promise(r => setTimeout(r, 200 + attempt * 100));
                    if (_isStale()) { console.debug('[Kick Quality] Run cancelled after pause (navigation)'); return; }
                    // refresh qualityOption reference
                    qualityOption = (function(){
                        // try previous XPath position first if pref is 1080 and xpath for 1080 exists
                        try {
                            const qx = document.evaluate(qualityXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                            if (qx && (qx.textContent || '').toLowerCase().includes(pref)) return qx;
                        } catch(e) {}
                        const cand = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'))
                            .find(el => {
                                const txt = (el.textContent || '').toLowerCase();
                                return txt.includes(pref) || txt.includes(pref + 'p') || txt.includes(pref + 'p60');
                            }) || null;
                        return cand;
                    })();
                }
            }

            if (!success) console.warn(`[Kick Quality] ${preferredQuality} seçeneği tıklama denemeleri başarısız`);
        } else {
            // If quality option not found, try re-hovering and re-opening settings a few times to reveal menu
            const retryOpen = 4;
            let found = null;
            const pref = String(preferredQuality).toLowerCase();
            for (let i = 0; i < retryOpen && !found; i++) {
                if (_isStale()) { console.debug('[Kick Quality] Run cancelled during reopen retries (navigation)'); return; }
                // re-hover the player
                try {
                    events.forEach(ev => {
                        videoPlayer.dispatchEvent(ev);
                        if (videoPlayer.parentElement) videoPlayer.parentElement.dispatchEvent(ev);
                        if (videoPlayer.parentElement && videoPlayer.parentElement.parentElement) videoPlayer.parentElement.parentElement.dispatchEvent(ev);
                    });
                } catch (e) {}

                // small wait
                await new Promise(r => setTimeout(r, 500 + i * 150));

                // re-find settings button and click
                try {
                    settingsButton = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton;
                } catch (e) {}
                if (!settingsButton) {
                    settingsButton = document.querySelector('button[aria-label="Settings"], button[title="Settings"], button[aria-label="Ayarlar"], button[title="Ayarlar"]');
                }

                    if (settingsButton) {
                        if (_isStale()) { console.debug('[Kick Quality] Run cancelled before settings click (navigation)'); return; }
                        try {
                            const sRect = settingsButton.getBoundingClientRect();
                            const sX = Math.round(sRect.left + sRect.width / 2);
                            const sY = Math.round(sRect.top + sRect.height / 2);
                            settingsButton.dispatchEvent(new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true, clientX: sX, clientY: sY }));
                            settingsButton.dispatchEvent(new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true, clientX: sX, clientY: sY }));
                            try { await robustClick(settingsButton); } catch (e) { try { settingsButton.click(); } catch (ee) {} }
                        } catch (e) {
                            try { await robustClick(settingsButton); } catch (ee) { try { settingsButton.click(); } catch (e) {} }
                        }
                    }

                // wait for menu
                await new Promise(r => setTimeout(r, 600 + i * 100));
                if (_isStale()) { console.debug('[Kick Quality] Run cancelled waiting for menu after reopen (navigation)'); return; }

                // look for candidates
                const candidates = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'));
                found = candidates.find(el => {
                    const txt = (el.textContent || '').toLowerCase();
                    return txt.includes(pref) || txt.includes(pref + 'p') || txt.includes(pref + 'p60');
                }) || null;

                if (found) {
                    qualityOption = found;
                    break;
                }
            }

                if (qualityOption) {
                    if (_isStale()) { console.debug('[Kick Quality] Run cancelled before final click (navigation)'); return; }
                // If we found it after retries, try the same selection logic (single attempt sequence)
                try { qualityOption.scrollIntoView({block: 'center', inline: 'center', behavior: 'auto'}); } catch {}
                try { qualityOption.click(); } catch (e) { try { qualityOption.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } catch (ee) {} }
                await new Promise(r => setTimeout(r, 350));
                    if (_isStale()) { console.debug('[Kick Quality] Run cancelled after final click (navigation)'); return; }
                const finalCandidates = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'));
                const current = finalCandidates.find(el => {
                    const txt = (el.textContent || '').toLowerCase();
                    return txt.includes(pref) || txt.includes(pref + 'p') || txt.includes(pref + 'p60');
                }) || null;
                const menuNow = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'));
                const menuClosed = menuNow.length === 0;
                if (isSelected(current) || menuClosed) {
                    if (isSelected(current)) {
                        console.log(`[Kick Quality] ${preferredQuality} seçeneği seçili (after reopen)`);
                    } else {
                        console.log(`[Kick Quality] Menü kapandı; ${preferredQuality} seçimi varsayılan olarak başarılı sayıldı (after reopen)`);
                    }
                    // close menu if open
                    const stillOpen = document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option').length > 0;
                    if (stillOpen) {
                        try {
                            const btnClose = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton;
                            if (btnClose) {
                                try { await robustClick(btnClose); } catch (e) { try { btnClose.click(); } catch (ee) { try { btnClose.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } catch(_){} } }
                            }
                        } catch (e) {}
                    }
                } else {
                    console.warn(`[Kick Quality] ${preferredQuality} seçeneği bulunamadı (son denemeler)`);
                    // close menu to restore UI
                    const stillOpen = document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option').length > 0;
                    if (stillOpen) {
                        try { const btnClose = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton; if (btnClose) { try { btnClose.click(); } catch (e) { btnClose.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } } } catch (e) {}
                    }
                }
            } else {
                console.warn(`[Kick Quality] ${preferredQuality} seçeneği bulunamadı`);

                // If still not found, do a final recovery: hover, open settings and try a few more times
                const finalRecovery = 3;
                let recovered = false;
                for (let r = 0; r < finalRecovery && !recovered; r++) {
                    // re-hover
                    try {
                        events.forEach(ev => {
                            videoPlayer.dispatchEvent(ev);
                            if (videoPlayer.parentElement) videoPlayer.parentElement.dispatchEvent(ev);
                            if (videoPlayer.parentElement && videoPlayer.parentElement.parentElement) videoPlayer.parentElement.parentElement.dispatchEvent(ev);
                        });
                    } catch (e) {}

                    await new Promise(res => setTimeout(res, 500 + r * 150));

                    // click settings
                    try {
                        settingsButton = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton;
                    } catch (e) {}
                    if (!settingsButton) {
                        settingsButton = document.querySelector('button[aria-label="Settings"], button[title="Settings"], button[aria-label="Ayarlar"], button[title="Ayarlar"]');
                    }
                    if (settingsButton) {
                        try { settingsButton.click(); } catch (e) { try { settingsButton.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } catch(e) {} }
                    }

                    await new Promise(res => setTimeout(res, 600 + r * 100));

                    // search again
                    const candidates = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'));
                    const pref = String(preferredQuality).toLowerCase();
                    const found = candidates.find(el => {
                        const txt = (el.textContent || '').toLowerCase();
                        return txt.includes(pref) || txt.includes(pref + 'p') || txt.includes(pref + 'p60');
                    }) || null;

                    if (found) {
                        qualityOption = found;
                        // try to click and validate once more
                        try { qualityOption.scrollIntoView({block: 'center', inline: 'center', behavior: 'auto'}); } catch {}
                        try { qualityOption.click(); } catch (e) { try { qualityOption.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } catch (ee) {} }
                        await new Promise(res => setTimeout(res, 350));

                        const finalMenu = Array.from(document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option'));
                        const current = finalMenu.find(el => (el.textContent||'').toLowerCase().includes(pref)) || null;
                        const menuClosed = finalMenu.length === 0;
                        if (isSelected(current) || menuClosed) {
                            console.log(`[Kick Quality] ${preferredQuality} seçeneği seçili (recovery attempt ${r+1})`);
                            recovered = true;
                            // close menu if still open
                            const stillOpen = document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option').length > 0;
                            if (stillOpen) {
                                try { const btnClose = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton; if (btnClose) { try { btnClose.click(); } catch (e) { btnClose.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } } } catch (e) {}
                            }
                            break;
                        }
                    }
                }

                if (!recovered) {
                    console.warn(`[Kick Quality] ${preferredQuality} seçeneği tüm denemelerde bulunamadı`);
                    // ensure menu is closed for UI cleanliness
                    const stillOpen = document.querySelectorAll('[role="menuitemradio"], [data-testid="player-quality-option"], .vjs-menu-item, .quality-option').length > 0;
                    if (stillOpen) {
                        try { const btnClose = document.evaluate(settingsXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || settingsButton; if (btnClose) { try { btnClose.click(); } catch (e) { btnClose.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true })); } } } catch (e) {}
                    }
                }
            }
        }

        // SessionStorage'a kaydet
        sessionStorage.setItem('stream_quality', preferredQuality);
        console.log('[Kick Quality] Uygulanan kalite:', preferredQuality);

/*         if (shouldReload) {
            console.log('[Kick Quality] Sayfa yeniden yükleniyor...');
            // küçük bir bekleme verip reload
            await new Promise(resolve => setTimeout(resolve, 300));
            location.reload();
        } */
    } catch (err) {
        console.error('[Kick Quality] Hata:', err);
    }
}

// Sayfadaki i18n (çeviri) metinlerini ayarla
document.querySelectorAll('.i18n').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
        el.textContent = chrome.i18n.getMessage(key);
    }
});
