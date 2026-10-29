/* TITLE: assets/js/network-listener.js */
/* REFLO Real-Time Network & Offline Sentry */
(function() {
    'use strict';

    function injectNetworkModal() {
        if (document.getElementById('reflo-network-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'reflo-network-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(8px);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            padding: 20px;
        `;

        overlay.innerHTML = `
            <div style="background: var(--bg-card, #ffffff); border: 1.5px solid var(--border, #e2e8f0); border-radius: 28px; padding: 35px 24px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 20px 35px rgba(0,0,0,0.4);">
                <div style="width: 75px; height: 75px; margin: 0 auto 15px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.2); display: flex; align-items: center; justify-content: center; font-size: 2.2rem;">
                    📡
                </div>
                <h2 style="font-size: 1.35rem; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px; color: var(--text-main, #0f172a);">
                    Connection Interrupted
                </h2>
                <p style="font-size: 0.85rem; color: var(--text-muted, #64748b); line-height: 1.45; margin-bottom: 22px;">
                    You are currently offline. REFLO is paused until your mobile data or Wi-Fi reconnects.
                </p>
                <button type="button" id="refloNetworkRetryBtn" style="width: 100%; padding: 14px; background: #2563eb; color: #ffffff; border: none; border-radius: 14px; font-weight: 900; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span>🔄</span><span>Retry Connection</span>
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        const retryBtn = document.getElementById('refloNetworkRetryBtn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                retryBtn.innerHTML = '<span>⏳</span><span>Checking...</span>';
                setTimeout(() => {
                    if (navigator.onLine) {
                        hideOfflineOverlay();
                    } else {
                        retryBtn.innerHTML = '<span>🔄</span><span>Still Offline — Retry</span>';
                    }
                }, 800);
            };
        }
    }

    function showOfflineOverlay() {
        injectNetworkModal();
        const overlay = document.getElementById('reflo-network-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    function hideOfflineOverlay() {
        const overlay = document.getElementById('reflo-network-overlay');
        if (overlay) overlay.style.display = 'none';
        if (typeof App !== 'undefined' && App.toast) {
            App.toast("✨ Internet connection restored!", "success");
        }
    }

    // Window Network Listeners
    window.addEventListener('offline', showOfflineOverlay);
    window.addEventListener('online', hideOfflineOverlay);

    document.addEventListener('DOMContentLoaded', () => {
        if (!navigator.onLine) {
            showOfflineOverlay();
        }
    });
})();