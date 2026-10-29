/* TITLE: assets/js/app.js */
/* REFLO Master UI Engine, App Badging & Native Device Haptics */

/* ==========================================================================
   1. GLOBAL APP INTERCEPTOR (Eliminates ugly default popups)
   ========================================================================== */
window.alert = function(message) {
    if (typeof App !== 'undefined' && App.toast) {
        App.toast(message, 'info');
    } else {
        console.warn("App Alert Intercepted:", message);
    }
};

/* ==========================================================================
   2. PUSH NOTIFICATION & HARDWARE HAPTICS (RefloPush)
   ========================================================================== */
const RefloPush = {
    VAPID_PUBLIC_KEY: "BOT94SsjY7mXXP4o_pXb3CmaY11o5eLkqfMTS122VsFhfzsgG6wMTiKcfl66kY6NT6EwRHeC5KtxjpVXGDc9y8Y",

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },

    // 🟢 Physical Phone Vibration Motor
    vibrate(pattern = [300, 100, 300, 100, 400]) {
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(pattern);
            } catch (_) {}
        }
    },

    // 🟢 Silent Background Device Registration (No annoying popups on every page)
    async subscribeDevice(silent = true) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        try {
            const reg = await navigator.serviceWorker.ready;
            
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY)
            });

            const subJson = subscription.toJSON();

            if (typeof db !== 'undefined' && db.auth) {
                const user = (await db.auth.getUser())?.data?.user;
                if (user) {
                    await db.from('push_subscriptions').upsert({
                        user_id: user.id,
                        endpoint: subJson.endpoint,
                        p256dh: subJson.keys?.p256dh,
                        auth_key: subJson.keys?.auth,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'endpoint' });
                }
            }

            if (!silent) {
                App.toast("REFLO real-time alerts are active! 🔔", "success");
            }
        } catch (err) {
            console.warn("Push token sync:", err);
        }
    },

    // 🟢 Native Mobile App Permission Flow (Zero mentions of Chrome/Browser)
    async requestPermission(isUserAction = false) {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            if (isUserAction) {
                App.toast("Please enable notification access in your device settings.", "info");
            }
            return false;
        }

        if (Notification.permission === 'granted') {
            await this.subscribeDevice(true);
            if (isUserAction) {
                this.vibrate([150]);
                App.toast("REFLO real-time alerts are active! 🔔", "success");
            }
            return true;
        }

        if (isUserAction) {
            try {
                const permission = await Notification.requestPermission();
                
                if (permission === 'granted') {
                    await this.subscribeDevice(false);
                    this.vibrate([200, 100, 200]);
                    App.toast("✅ Real-time alerts enabled for REFLO!", "success");
                    return true;
                } else if (permission === 'denied') {
                    App.toast("Alerts are disabled. Please turn them on in your app settings.", "warning");
                }
            } catch (e) {
                console.warn("Permission error:", e);
            }
        }

        return Notification.permission === 'granted';
    },

    // 🟢 Keep token silently synced & sync toggle switch state on page load
    setupDashboardHooks() {
        const isGranted = ('Notification' in window && Notification.permission === 'granted');

        // Automatically keep the Profile/Settings toggle switch ON if already enabled
        const toggle = document.getElementById('notifPushMasterToggle');
        if (toggle) {
            toggle.checked = isGranted;
        }

        if (isGranted) {
            this.subscribeDevice(true);
        }
    },

// 🟢 Called when user toggles the switch in Profile/Settings
    async togglePush(checkbox) {
        // 🔴 User toggled OFF: Delete token from database so alerts STOP
        if (!checkbox.checked) {
            try {
                if ('serviceWorker' in navigator) {
                    const reg = await navigator.serviceWorker.ready;
                    const sub = await reg.pushManager.getSubscription();
                    if (sub) {
                        await sub.unsubscribe();
                        if (typeof db !== 'undefined') {
                            await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                        }
                    }
                }
                App.toast("Push alerts disabled on this device.", "info");
            } catch (e) {
                console.warn("Unsubscribe error:", e);
            }
            return;
        }

        // 🟢 User toggled ON: Subscribe and save token
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            App.toast("Please enable notification access in your device settings.", "warning");
            checkbox.checked = false;
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await this.subscribeDevice(true);
                this.vibrate([200, 100, 200]);
                App.toast("✅ Real-time alerts enabled for REFLO!", "success");
            } else {
                checkbox.checked = false;
                App.toast("Alerts are disabled. Please turn them on in your app settings.", "warning");
            }
        } catch (err) {
            checkbox.checked = false;
            console.warn("Push toggle error:", err);
        }
    }
};

const LocalNotifier = RefloPush;

/* ==========================================================================
   3. MASTER UI/UX ENGINE & HOME SCREEN BADGING (App Core)
   ========================================================================== */
const App = {
    // HOME SCREEN APP ICON BADGE (Like WhatsApp)
    setBadge(count) {
        if ('setAppBadge' in navigator) {
            if (count > 0) {
                navigator.setAppBadge(count).catch(e => console.warn("App badge notice:", e));
            } else {
                navigator.clearAppBadge().catch(e => console.warn("App badge clear notice:", e));
            }
        }
    },

    clearBadge() {
        if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge().catch(e => console.warn("App badge clear notice:", e));
        }
    },

    // In-App Toast Notification Engine
    toast(message, type = 'info', customTitle = null) {
        let container = document.getElementById('reflo-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'reflo-toast-container';
            document.body.appendChild(container);
        }

        if ('vibrate' in navigator) {
            if (type === 'error') navigator.vibrate([40, 30, 40]);
            else if (type === 'success') navigator.vibrate(35);
            else navigator.vibrate(20);
        }

        const config = {
            success: { icon: '✓', title: customTitle || 'Success', class: 'toast-success' },
            error:   { icon: '✕', title: customTitle || 'Action Failed', class: 'toast-error' },
            warning: { icon: '⚠️', title: customTitle || 'Attention Required', class: 'toast-warning' },
            info:    { icon: '🔔', title: customTitle || 'Notification', class: 'toast-info' }
        }[type] || { icon: '🔔', title: customTitle || 'Update', class: 'toast-info' };

        const toast = document.createElement('div');
        toast.className = `reflo-toast-pill ${config.class}`;
        toast.innerHTML = `
            <div class="toast-icon-badge">${config.icon}</div>
            <div class="toast-body-text">
                <strong class="toast-headline">${config.title}</strong>
                <p class="toast-desc-text">${message}</p>
            </div>
            <button type="button" class="toast-dismiss-x" onclick="this.closest('.reflo-toast-pill').remove()">✕</button>
            <div class="toast-timer-bar"></div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-leaving');
            setTimeout(() => toast.remove(), 350);
        }, 4000);
    },

    setLoading(btnId, isLoading, loadingText = 'Processing...') {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        if (isLoading) {
            if (!btn.dataset.originalText) {
                btn.dataset.originalText = btn.innerHTML;
            }
            btn.disabled = true;
            btn.innerHTML = loadingText 
                ? loadingText 
                : '<div class="skeleton" style="height:20px; width:60px; margin:0 auto; border-radius:6px;"></div>';
        } else {
            btn.disabled = false;
            if (btn.dataset.originalText) {
                btn.innerHTML = btn.dataset.originalText;
            }
        }
    },

    formatCurrency(amount, currencyCode = 'USD') {
        const symbolMap = {
            USD: '$', EUR: '€', GBP: '£', NGN: '₦', GHS: 'GH₵',
            KES: 'KSh', ZAR: 'R', AED: 'DH', EGP: 'E£', INR: '₹',
            CAD: 'C$', AUD: 'A$', JPY: '¥', XOF: 'CFA', TZS: 'TSh'
        };
        const symbol = symbolMap[currencyCode] || currencyCode + ' ';
        const formattedAmount = parseFloat(amount || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return `${symbol}${formattedAmount}`;
    },

    previewImage(src, caption = 'Image Preview') {
        if (!src) return;

        let overlay = document.getElementById('reflo-lightbox-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'reflo-lightbox-modal';
            overlay.className = 'image-lightbox-overlay';
            overlay.innerHTML = `
                <div class="lightbox-img-box">
                    <button type="button" class="lightbox-close-btn" onclick="App.closeImagePreview()">✕</button>
                    <img id="lightboxImgTarget" src="" alt="Preview">
                </div>
                <div class="lightbox-caption" id="lightboxCaptionTarget"></div>
            `;
            overlay.onclick = (e) => {
                if (e.target === overlay) App.closeImagePreview();
            };
            document.body.appendChild(overlay);
        }

        document.getElementById('lightboxImgTarget').src = src;
        document.getElementById('lightboxCaptionTarget').innerText = caption;

        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    },

    closeImagePreview() {
        const overlay = document.getElementById('reflo-lightbox-modal');
        if (overlay) {
            overlay.classList.remove('active');
        }
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            const swPath = window.location.pathname.includes('/app/') || window.location.pathname.includes('/admin/') || window.location.pathname.includes('/public/')
                ? '../sw.js'
                : '/sw.js';

            navigator.serviceWorker.register(swPath).catch(err => {
                console.warn("REFLO Service Worker registration note:", err);
            });
        }
    },

    init() {
        document.querySelectorAll('.btn, .btn-primary, .btn-outline').forEach(btn => {
            btn.dataset.originalText = btn.innerHTML;
        });

        // 1. Register Service Worker
        this.registerServiceWorker();

        // 2. Wire up push notification hooks & sync settings toggle
        RefloPush.setupDashboardHooks();

        // 3. Clear home screen badge on app open
        if (window.location.pathname.includes('/app/')) {
            this.clearBadge();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());