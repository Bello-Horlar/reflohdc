/* TITLE: assets/js/trial-gate.js */
/* REFLO Universal Expiration & Feature Padlock Sentinel */

const TrialGate = {
    isLocked: false,
    lockReason: 'trial', // 'trial' or 'subscription'
    bizData: null,

    async init() {
        if (typeof Auth === 'undefined') return;
        const session = await Auth.checkSession();
        if (!session || !session.user) return;

        // 1. Fetch user role
        const { data: profile } = await db
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();

        // 2. Fetch business data
        const { data: biz } = await db
            .from('businesses')
            .select('id, subscription_status, trial_ends_at')
            .eq('owner_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!biz) return;
        this.bizData = biz;

        const now = new Date();
        const endDate = biz.trial_ends_at ? new Date(biz.trial_ends_at) : null;
        const status = (biz.subscription_status || 'trial').toLowerCase();

        // Calculate days remaining
        const diffDays = endDate ? Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)) : 0;
        const hasTimeRemaining = diffDays > 0;

        // 🟢 3. BULLETPROOF ACCESS CHECK:
        // As long as there are days remaining (> 0) on the countdown, THE ACCOUNT IS ACTIVE!
        if (['suspended', 'cancelled', 'payment_failed'].includes(status)) {
            // Explicitly blocked by admin or failed payment
            this.isLocked = true;
            this.lockReason = 'subscription';
        } else if (!hasTimeRemaining) {
            // 0 Days Remaining: The period has truly expired
            this.isLocked = true;
            this.lockReason = (status === 'trial') ? 'trial' : 'subscription';
        } else {
            // Days remaining > 0 (e.g. 29 days left): ACCOUNT IS FULLY ACTIVE!
            this.isLocked = false;
        }

        // Allow Admin bypass unless explicitly testing an expired state
        if (profile && profile.role === 'admin' && !this.isLocked) {
            return;
        }

        // 4. ENFORCE LOCKOUT ONLY IF TRULY EXPIRED
        if (this.isLocked) {
            this.injectLockStyles();
            this.enforcePageRestrictions();
        } else {
            this.unlockDashboardCards();
        }
    },

    injectLockStyles() {
        if (document.getElementById('reflo-gate-styles')) return;

        const style = document.createElement('style');
        style.id = 'reflo-gate-styles';
        style.innerHTML = `
            .reflo-card-locked {
                position: relative !important;
                filter: blur(0.2px) grayscale(70%) !important;
                opacity: 0.45 !important;
                cursor: not-allowed !important;
                pointer-events: auto !important;
                user-select: none !important;
            }

            .reflo-lock-touch-shield {
                position: absolute;
                top: 0; left: 0; width: 100%; height: 100%;
                z-index: 50;
                cursor: not-allowed;
                border-radius: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(15, 23, 42, 0.25);
            }

            .reflo-padlock-badge {
                background: #ef4444 !important;
                color: #ffffff !important;
                font-size: 0.72rem;
                font-weight: 900;
                padding: 5px 10px;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
                letter-spacing: 0.5px;
            }

            .reflo-gate-overlay {
                position: fixed;
                top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(15, 23, 42, 0.9);
                backdrop-filter: blur(10px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 999999;
                padding: 20px;
            }

            .reflo-gate-modal {
                background: var(--bg-card, #ffffff);
                border: 2px solid var(--border, #e2e8f0);
                border-radius: 28px;
                padding: 35px 25px;
                max-width: 440px;
                width: 100%;
                text-align: center;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
            }
        `;
        document.head.appendChild(style);
    },

    enforcePageRestrictions() {
        const path = window.location.pathname.toLowerCase();
        const isDashboard = path.includes('dashboard.html');
        const isSubscription = path.includes('subscription.html');
        const isOnboarding = path.includes('onboarding.html');

        if (isDashboard) {
            this.lockDashboardCards();
            return;
        }

        if (isSubscription || isOnboarding) return;

        this.showRestrictedPageModal();
    },

    lockDashboardCards() {
        const actionCards = document.querySelectorAll('.gateway-action-card, .gateway-card, .action-card');
        actionCards.forEach(card => {
            const href = card.getAttribute('href') || '';
            if (!href.includes('subscription.html')) {
                card.classList.add('reflo-card-locked');

                if (!card.querySelector('.reflo-lock-touch-shield')) {
                    const shield = document.createElement('div');
                    shield.className = 'reflo-lock-touch-shield';
                    shield.innerHTML = `<span class="reflo-padlock-badge">🔒 LOCKED</span>`;
                    
                    shield.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showLockedPrompt();
                    });

                    card.appendChild(shield);
                }
            }
        });

        const viewAllLinks = document.querySelectorAll('a[href*="feedback.html"], a[href*="bookings.html"]');
        viewAllLinks.forEach(link => {
            if (!link.classList.contains('gateway-action-card')) {
                link.onclick = (e) => {
                    e.preventDefault();
                    this.showLockedPrompt();
                };
            }
        });
    },

    unlockDashboardCards() {
        document.querySelectorAll('.reflo-card-locked').forEach(card => {
            card.classList.remove('reflo-card-locked');
            const shield = card.querySelector('.reflo-lock-touch-shield');
            if (shield) shield.remove();
        });
    },

    showRestrictedPageModal() {
        const isTrial = this.lockReason === 'trial';
        const title = isTrial ? '30-Day Free Trial Ended' : 'Subscription Expired';
        const message = isTrial 
            ? 'Your 30-day trial has concluded. Your business data is 100% safe. Choose a plan to unlock all features.'
            : 'Your subscription period has ended. Renew your plan to restore full access to your reviews, bookings, and tools.';

        const overlay = document.createElement('div');
        overlay.className = 'reflo-gate-overlay';
        overlay.innerHTML = `
            <div class="reflo-gate-modal">
                <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
                <h2 style="font-size: 1.4rem; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px;">${title}</h2>
                <p style="font-size: 0.85rem; color: var(--text-muted, #64748b); line-height: 1.45; margin-bottom: 22px;">
                    ${message}
                </p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <a href="subscription.html" class="btn-primary" style="padding: 14px; text-decoration: none; border-radius: 14px; font-weight: 900; font-size: 0.95rem;">
                        Choose Plan & Renew →
                    </a>
                    <a href="dashboard.html" class="btn-outline" style="padding: 12px; text-decoration: none; border-radius: 14px; font-size: 0.85rem; font-weight: 800;">
                        Return to Dashboard
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    showLockedPrompt() {
        const msg = this.lockReason === 'trial' 
            ? "🔒 Trial ended. Tap 'Plans' to subscribe and unlock." 
            : "🔒 Subscription expired. Tap 'Plans' to renew.";

        if (typeof App !== 'undefined' && App.toast) {
            App.toast(msg, "warning");
        } else {
            alert(msg);
        }
        setTimeout(() => {
            window.location.href = 'subscription.html';
        }, 800);
    }
};

document.addEventListener('DOMContentLoaded', () => TrialGate.init());