/* TITLE: assets/js/admin/Settings.js */

const AdminSettings = {
    adminId: null,
    settingsId: null,

    // Default Currency Catalog (Global & African)
    CURRENCY_CATALOG: [
        { code: 'USD', name: 'US Dollar ($)' },
        { code: 'EUR', name: 'Euro (€)' },
        { code: 'GBP', name: 'British Pound (£)' },
        { code: 'NGN', name: 'Nigerian Naira (₦)' },
        { code: 'GHS', name: 'Ghanaian Cedi (GH₵)' },
        { code: 'KES', name: 'Kenyan Shilling (KSh)' },
        { code: 'ZAR', name: 'South African Rand (R)' },
        { code: 'AED', name: 'UAE Dirham (DH)' },
        { code: 'EGP', name: 'Egyptian Pound (E£)' },
        { code: 'INR', name: 'Indian Rupee (₹)' }
    ],

    async init() {
        const session = await Auth.checkSession();
        if (!session) return;
        this.adminId = session.user.id;

        // Verify Admin Role
        const { data: profile } = await db
            .from('profiles')
            .select('role')
            .eq('id', this.adminId)
            .single();

        if (!profile || profile.role !== 'admin') {
            alert("Unauthorized: Admin credentials required.");
            window.location.href = '../app/dashboard.html';
            return;
        }

        await this.loadGlobalSettings();
    },

    async loadGlobalSettings() {
        try {
            const { data: config, error } = await db
                .from('platform_settings')
                .select('*')
                .limit(1)
                .maybeSingle();

            if (error) throw error;

            if (config) {
                this.settingsId = config.id;

                // 1. Populate Prices
                if (config.pricing) {
                    document.getElementById('priceStarterInput').value = config.pricing.starter || 19;
                    document.getElementById('priceGrowthInput').value = config.pricing.growth || 39;
                    document.getElementById('priceProInput').value = config.pricing.pro || 79;
                }

                // 2. Populate Trial, Discount & Exchange Rate
                document.getElementById('trialDaysInput').value = config.trial_days || 30;
                document.getElementById('annualDiscountInput').value = config.annual_discount || 20;
                document.getElementById('exchangeRateInput').value = config.exchange_rate || 1500;

                // 🟢 Load Gateway Settlement Currency (Defaults to NGN)
                const gatewaySelect = document.getElementById('gatewayCurrencySelect');
                if (gatewaySelect) {
                    gatewaySelect.value = config.gateway_currency || 'NGN';
                }

                // 3. Render Currency Checkboxes
                this.renderCurrencies(config.active_currencies || ['USD', 'NGN', 'GBP', 'EUR']);

                // 4. Populate Features
                if (config.features) {
                    document.getElementById('featBookingsToggle').checked = config.features.bookings !== false;
                    document.getElementById('featFollowUpToggle').checked = config.features.follow_up !== false;
                    document.getElementById('featExportsToggle').checked = config.features.exports !== false;
                    document.getElementById('featCustomBrandingToggle').checked = config.features.custom_branding !== false;
                }

                // 5. Operations
                if (config.operations) {
                    document.getElementById('opAllowSignupsToggle').checked = config.operations.allow_signups !== false;
                    document.getElementById('opMaintenanceToggle').checked = !!config.operations.maintenance_mode;
                    document.getElementById('adminAlertEmailInput').value = config.operations.alert_email || '';
                }
            } else {
                // Initialize default currency view if no config exists yet
                this.renderCurrencies(['USD', 'NGN', 'GBP', 'EUR', 'GHS', 'KES']);
            }

        } catch (err) {
            console.error("Error loading platform settings:", err);
            this.renderCurrencies(['USD', 'NGN', 'GBP', 'EUR']);
        }
    },

    adjustPrice(plan, delta) {
        const inputMap = {
            starter: 'priceStarterInput',
            growth: 'priceGrowthInput',
            pro: 'priceProInput'
        };

        const el = document.getElementById(inputMap[plan]);
        if (!el) return;

        let current = parseInt(el.value, 10) || 0;
        current = Math.max(1, current + delta);
        el.value = current;
    },

    renderCurrencies(activeList) {
        const container = document.getElementById('currencyTogglesGrid');
        if (!container) return;

        const activeSet = new Set(activeList);

        container.innerHTML = this.CURRENCY_CATALOG.map(c => `
            <label class="checkbox-row">
                <input type="checkbox" value="${c.code}" ${activeSet.has(c.code) ? 'checked' : ''} class="curr-checkbox">
                <span>${c.name}</span>
            </label>
        `).join('');
    },

    async saveAll() {
        const btn = document.getElementById('saveAllSettingsBtn');
        btn.innerText = "Saving Platform Configuration...";
        btn.disabled = true;

        try {
            // Collect Active Currencies
            const selectedCurrencies = Array.from(document.querySelectorAll('.curr-checkbox:checked')).map(cb => cb.value);
            if (selectedCurrencies.length === 0) selectedCurrencies.push('USD');

            // 🟢 Read selected Gateway Currency
            const gatewaySelect = document.getElementById('gatewayCurrencySelect');
            const gatewayCurrency = gatewaySelect ? gatewaySelect.value : 'NGN';

            const payload = {
                pricing: {
                    starter: parseInt(document.getElementById('priceStarterInput').value, 10) || 19,
                    growth: parseInt(document.getElementById('priceGrowthInput').value, 10) || 39,
                    pro: parseInt(document.getElementById('priceProInput').value, 10) || 79
                },
                trial_days: parseInt(document.getElementById('trialDaysInput').value, 10) || 30,
                annual_discount: parseInt(document.getElementById('annualDiscountInput').value, 10) || 20,
                exchange_rate: parseFloat(document.getElementById('exchangeRateInput').value) || 1500,
                gateway_currency: gatewayCurrency, // 🟢 Saved to Supabase
                active_currencies: selectedCurrencies,
                features: {
                    bookings: document.getElementById('featBookingsToggle').checked,
                    follow_up: document.getElementById('featFollowUpToggle').checked,
                    exports: document.getElementById('featExportsToggle').checked,
                    custom_branding: document.getElementById('featCustomBrandingToggle').checked
                },
                operations: {
                    allow_signups: document.getElementById('opAllowSignupsToggle').checked,
                    maintenance_mode: document.getElementById('opMaintenanceToggle').checked,
                    alert_email: document.getElementById('adminAlertEmailInput').value.trim()
                },
                updated_at: new Date()
            };

            let saveError = null;

            if (this.settingsId) {
                const { error } = await db
                    .from('platform_settings')
                    .update(payload)
                    .eq('id', this.settingsId);
                saveError = error;
            } else {
                const { data, error } = await db
                    .from('platform_settings')
                    .insert(payload)
                    .select()
                    .single();
                if (data) this.settingsId = data.id;
                saveError = error;
            }

            if (saveError) throw saveError;

            alert("Platform Settings Saved Successfully! ✨\nNew prices, trial duration, and exchange rates are now active globally.");

        } catch (err) {
            alert("Failed to save settings: " + err.message);
        } finally {
            btn.innerText = "Save Global Platform Settings";
            btn.disabled = false;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => AdminSettings.init());