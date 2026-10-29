/* TITLE: assets/js/user/Subscription.js */

const SubscriptionApp = {
    userId: null,
    biz: null,
    selectedDuration: 1,
    exchangeRate: 1500, // NGN per USD
    gatewayCurrency: 'NGN',
    hasPaidBefore: false, // Tracks whether user has completed a real payment
    pendingPlanId: null,

    BASE_MONTHLY_PRICES: {
        starter: 19,
        growth: 39,
        pro: 79
    },

    DURATION_DISCOUNTS: {
        1: 1.0,
        3: 0.95,
        6: 0.90,
        12: 0.80
    },

    async init() {
        const user = (await db.auth.getUser())?.data?.user;
        if (!user) return;
        this.userId = user.id;

        await this.loadPlatformPricing();
        await this.loadBusinessSubscription();

        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('reference') || urlParams.get('trxref');
        if (ref) {
            await this.verifyReturnedPayment(ref);
        }

        await this.loadPaymentHistory();
    },

    async loadPlatformPricing() {
        try {
            const { data: config } = await db
                .from('platform_settings')
                .select('pricing, annual_discount, exchange_rate, gateway_currency')
                .limit(1)
                .maybeSingle();

            if (config) {
                if (config.pricing) {
                    this.BASE_MONTHLY_PRICES = {
                        starter: parseInt(config.pricing.starter, 10) || 19,
                        growth: parseInt(config.pricing.growth, 10) || 39,
                        pro: parseInt(config.pricing.pro, 10) || 79
                    };
                }

                if (config.annual_discount) {
                    this.DURATION_DISCOUNTS[12] = (100 - parseInt(config.annual_discount, 10)) / 100;
                }

                if (config.exchange_rate) {
                    this.exchangeRate = Number(config.exchange_rate) || 1500;
                }

                if (config.gateway_currency) {
                    this.gatewayCurrency = config.gateway_currency.toUpperCase();
                }
            }
        } catch (err) {
            console.warn("Pricing config fallback:", err);
        }
    },

    async loadBusinessSubscription() {
        const { data: biz } = await db
            .from('businesses')
            .select('*')
            .eq('owner_id', this.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!biz) return;
        this.biz = biz;

        const status = (biz.subscription_status || 'trial').toLowerCase();
        const now = new Date();
        const trialEnd = new Date(biz.trial_ends_at);
        const isExpired = now > trialEnd && status === 'trial';

        this.renderStatusHero(isExpired ? 'expired' : status, biz);
        this.updatePricingDisplay();
    },

    renderStatusHero(status, biz) {
        const titleEl = document.getElementById('heroPlanTitle');
        const pillEl = document.getElementById('heroStatusPill');
        const countdownEl = document.getElementById('heroCountdownText');
        const dateRangeEl = document.getElementById('heroDateRange');
        const currencyEl = document.getElementById('heroCurrencyText');

        if (!pillEl) return;

        pillEl.className = `plan-status-pill status-${status}`;
        pillEl.innerText = status.toUpperCase();

        if (status === 'trial') titleEl.innerText = 'Growth Plan (Free Trial)';
        else if (status === 'starter') titleEl.innerText = 'Starter Plan (Active)';
        else if (status === 'growth') titleEl.innerText = 'Growth Plan (Active)';
        else if (status === 'pro') titleEl.innerText = 'PRO Unlimited Plan (Active)';
        else if (status === 'expired') titleEl.innerText = 'Trial Expired — Please Choose a Plan';
        else titleEl.innerText = `${status.toUpperCase()} Membership`;

        const end = new Date(biz.trial_ends_at);
        const now = new Date();
        const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

        if (diffDays > 7) {
            countdownEl.innerText = `${diffDays} Days Remaining`;
            countdownEl.style.color = 'var(--text-main)';
        } else if (diffDays > 0) {
            countdownEl.innerText = `${diffDays} Day${diffDays === 1 ? '' : 's'} Left — Renew Soon`;
            countdownEl.style.color = '#ea580c';
        } else {
            countdownEl.innerText = 'Subscription Expired';
            countdownEl.style.color = '#ef4444';
        }

        const startStr = biz.created_at ? new Date(biz.created_at).toLocaleDateString() : '--';
        const endStr = biz.trial_ends_at ? new Date(biz.trial_ends_at).toLocaleDateString() : '--';
        dateRangeEl.innerText = `${startStr} — ${endStr}`;

        // Permanently USD
        if (currencyEl) currencyEl.innerText = `USD ($)`;
    },

    setDuration(months, btn) {
        this.selectedDuration = months;
        document.querySelectorAll('.dur-btn-tab').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.updatePricingDisplay();
    },

    // 🟢 Permanently Displays Pure USD Pricing ($19, $39, $79)
    updatePricingDisplay() {
        const m = this.selectedDuration;
        const discount = this.DURATION_DISCOUNTS[m] || 1.0;

        document.querySelectorAll('.currency-symbol').forEach(el => el.innerText = '$');

        const starterPrice = Math.round(this.BASE_MONTHLY_PRICES.starter * m * discount);
        const growthPrice = Math.round(this.BASE_MONTHLY_PRICES.growth * m * discount);
        const proPrice = Math.round(this.BASE_MONTHLY_PRICES.pro * m * discount);

        document.getElementById('starterPriceDisplay').innerText = starterPrice.toLocaleString();
        document.getElementById('growthPriceDisplay').innerText = growthPrice.toLocaleString();
        document.getElementById('proPriceDisplay').innerText = proPrice.toLocaleString();

        const periodLabel = m === 1 ? '/mo' : ` total (${m} mos)`;
        document.getElementById('starterPeriodDisplay').innerText = periodLabel;
        document.getElementById('growthPeriodDisplay').innerText = periodLabel;
        document.getElementById('proPeriodDisplay').innerText = periodLabel;
    },

    // 🟢 Checkout: Pops up until the user makes their FIRST completed payment
    async checkout(planId) {
        this.pendingPlanId = planId;
        const cleanPlan = planId.toLowerCase().trim();
        const m = this.selectedDuration;
        const discount = this.DURATION_DISCOUNTS[m] || 1.0;
        const unitPriceUSD = this.BASE_MONTHLY_PRICES[cleanPlan] || 39;
        const totalUSD = Math.round(unitPriceUSD * m * discount);

        const merchantCurrency = this.gatewayCurrency || 'NGN';
        const gatewayRate = this.exchangeRate || 1500;
        const gatewayAmount = merchantCurrency === 'NGN' ? Math.round(totalUSD * gatewayRate) : totalUSD;
        const gatewaySymbol = merchantCurrency === 'NGN' ? '₦' : '$';

        // 🟢 Show popup EVERY TIME until user has completed their first payment
        if (!this.hasPaidBefore && merchantCurrency === 'NGN') {
            this.showCurrencyModal({
                plan: cleanPlan,
                duration: m,
                totalUSD,
                merchantCurrency,
                gatewaySymbol,
                gatewayAmount
            });
            return;
        }

        // If USD is enabled in Admin or user has already paid before, proceed directly
        this.executePaystackCheckout(cleanPlan);
    },

    showCurrencyModal(details) {
        document.getElementById('modalPlanName').innerText = `${details.plan.toUpperCase()} Plan (${details.duration} mo${details.duration > 1 ? 's' : ''})`;
        document.getElementById('modalLocalDisplay').innerText = `$${details.totalUSD.toLocaleString()}.00 USD`;
        document.getElementById('modalGatewayDisplay').innerText = `${details.gatewaySymbol}${details.gatewayAmount.toLocaleString()} ${details.merchantCurrency}`;
        
        // 🟢 Dynamically sets NGN or USD without hardcoding country names
        const merchantSpan = document.getElementById('modalMerchantCurrency');
        if (merchantSpan) {
            merchantSpan.innerText = details.merchantCurrency;
        }

        const modal = document.getElementById('currencyNoticeModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        const proceedBtn = document.getElementById('btnModalProceed');
        if (proceedBtn) {
            proceedBtn.onclick = () => {
                this.closeCurrencyModal();
                this.executePaystackCheckout(this.pendingPlanId);
            };
        }
    },

    closeCurrencyModal() {
        const modal = document.getElementById('currencyNoticeModal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    },

    async executePaystackCheckout(planId) {
        const cleanPlan = (planId || 'growth').toLowerCase().trim();
        const user = (await db.auth.getUser()).data.user;
        const m = this.selectedDuration;
        const discount = this.DURATION_DISCOUNTS[m] || 1.0;
        const unitPriceUSD = this.BASE_MONTHLY_PRICES[cleanPlan] || 39;
        const totalUSD = Math.round(unitPriceUSD * m * discount);

        const merchantCurrency = this.gatewayCurrency || 'NGN';
        let chargeAmountInSmallestUnit = totalUSD * 100;
        if (merchantCurrency === 'NGN') {
            const rate = this.exchangeRate || 1500;
            chargeAmountInSmallestUnit = Math.round(totalUSD * rate * 100);
        }

        const returnUrl = window.location.origin + window.location.pathname;
        App.toast("Opening secure checkout...", "info");

        try {
            const { data, error } = await db.functions.invoke('paystack-initialize', {
                body: {
                    planId: cleanPlan,
                    months: m,
                    bizId: this.biz?.id,
                    userId: this.userId,
                    email: user.email,
                    currency: merchantCurrency,
                    amount: chargeAmountInSmallestUnit,
                    callback_url: returnUrl
                }
            });

            if (!error && data && data.authorization_url) {
                window.location.href = data.authorization_url;
                return;
            }

            // Paystack Inline Fallback
            const publicKey = (typeof REFLO_CONFIG !== 'undefined' && REFLO_CONFIG.PAYSTACK_PUBLIC_KEY);
            if (typeof PaystackPop !== 'undefined' && publicKey) {
                const handler = PaystackPop.setup({
                    key: publicKey,
                    email: user.email,
                    amount: chargeAmountInSmallestUnit,
                    currency: merchantCurrency,
                    ref: `REF-${this.biz.id.substring(0, 6)}-${Date.now()}`,
                    metadata: {
                        planId: cleanPlan,
                        months: m,
                        bizId: this.biz.id,
                        userId: this.userId,
                        custom_fields: [
                            { display_name: "Plan", variable_name: "plan", value: cleanPlan },
                            { display_name: "Months", variable_name: "months", value: m }
                        ]
                    },
                    callback: (response) => {
                        window.location.href = `${returnUrl}?reference=${encodeURIComponent(response.reference)}`;
                    }
                });
                handler.openIframe();
            } else {
                throw new Error("Paystack gateway unavailable. Please refresh and try again.");
            }
        } catch (err) {
            App.toast("Payment Error: " + err.message, "error");
        }
    },

    async verifyReturnedPayment(reference) {
        App.toast("Verifying payment with Paystack...", "info");
        try {
            const { data, error } = await db.functions.invoke('paystack-verify', {
                body: { reference, user_id: this.userId, biz_id: this.biz?.id }
            });

            if (error || !data || !data.success) {
                App.toast("Verification: " + (data?.message || "Failed to confirm payment."), "error");
                return;
            }

            // 🟢 Payment confirmed: Mark user as a paid subscriber
            this.hasPaidBefore = true;
            localStorage.setItem(`reflo_payment_completed_${this.userId}`, 'true');

            window.history.replaceState({}, document.title, window.location.pathname);
            App.toast("Payment Confirmed! Redirecting to Dashboard... ✨", "success");
            await this.loadBusinessSubscription();
            await this.loadPaymentHistory();

            setTimeout(() => { window.location.href = 'dashboard.html'; }, 1800);
        } catch (err) {
            App.toast("Verification error: " + err.message, "error");
        }
    },

    async loadPaymentHistory() {
        if (!this.biz) return;
        const { data: records } = await db
            .from('subscriptions')
            .select('*')
            .eq('business_id', this.biz.id)
            .order('created_at', { ascending: false });

        // 🟢 Check if business has at least one verified payment
        if (records && records.length > 0) {
            this.hasPaidBefore = true;
        }

        const tbody = document.getElementById('paymentHistoryTbody');
        if (!tbody) return;

        if (!records || records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 22px; color: var(--text-muted);">No payment history found.</td></tr>`;
            return;
        }

        tbody.innerHTML = records.map(rec => {
            const dateStr = new Date(rec.created_at).toLocaleDateString();
            const cleanRef = rec.paystack_reference ? `${rec.paystack_reference.substring(0, 12)}...` : 'N/A';
            const durText = rec.duration_months ? `${rec.duration_months} mo${rec.duration_months > 1 ? 's' : ''}` : '1 mo';
            const symbol = rec.currency === 'NGN' ? '₦' : '$';
            const formattedAmount = Number(rec.amount || 0).toLocaleString();

            return `
                <tr>
                    <td>${dateStr}</td>
                    <td><strong>${(rec.plan_id || 'Growth').toUpperCase()}</strong></td>
                    <td>${durText}</td>
                    <td><strong>${symbol}${formattedAmount}</strong></td>
                    <td style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">${cleanRef}</td>
                    <td><span class="status-tag status-active" style="padding: 4px 8px; font-size: 0.65rem;">VERIFIED</span></td>
                </tr>
            `;
        }).join('');
    },

    showCancelPolicy() {
        App.toast("REFLO Policy: Data is never deleted upon plan expiration. You can renew at any time.", "info");
    }
};

document.addEventListener('DOMContentLoaded', () => SubscriptionApp.init());