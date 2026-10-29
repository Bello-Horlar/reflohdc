/* TITLE: assets/js/config.js */

const REFLO_CONFIG = {
    // ==========================================
    // 1. SUPABASE CLOUD BACKEND
    // ==========================================
    SUPABASE_URL: "https://jqsdiyrvdzwmqazdotci.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxc2RpeXJ2ZHp3bXFhemRvdGNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMjk0MDAsImV4cCI6MjEwNDkwNTQwMH0._syYsiWtVfe6vZ678Oent7r1di_1VUpqjYBn8mMqR6o",

    // ==========================================
    // 2. PAYSTACK PAYMENT GATEWAY
    // ==========================================
    // Replace with your live public key (pk_live_...) when ready to launch
    PAYSTACK_PUBLIC_KEY: "pk_live_f3efcd69d71dfe5503c4513d9f1810b351dc7ac9",
    
    // Currency Mode:
    // 'AUTO' = Charges Nigerian businesses in NGN (Local cards, Bank Transfer), 
    //          and charges Global businesses in USD (settles to Domiciliary Account)
    PAYSTACK_MERCHANT_CURRENCY: "AUTO", 
    PAYSTACK_FALLBACK_INTERNATIONAL_CURRENCY: "USD",
    PAYSTACK_FALLBACK_LOCAL_CURRENCY: "NGN",

    // Fallback USD to NGN rate if not dynamically loaded from platform_settings ($1 = ₦1,500)
    EXCHANGE_RATE_USD_TO_NGN: 1500,

    // Helper: Resolves transaction currency based on business profile
    getChargeCurrency(bizCurrency) {
        if (this.PAYSTACK_MERCHANT_CURRENCY === "AUTO") {
            return (bizCurrency && bizCurrency.toUpperCase() === "NGN") ? "NGN" : "USD";
        }
        return this.PAYSTACK_MERCHANT_CURRENCY;
    },

    // ==========================================
    // 3. WEB PUSH NOTIFICATIONS
    // ==========================================
    VAPID_PUBLIC_KEY: "BPYfUauQAY2L2x0ro5JMRzXrdZP8nOlmhhr868u1buJOnaaCz1MoBlTMGD8pz1z66uytQpqweNVk73IQWDBLz7s",

    // ==========================================
    // 4. APPLICATION BRANDING & ENVIRONMENT
    // ==========================================
    APP_NAME: "REFLO",
    APP_TAGLINE: "Customer Feedback, Recovery & Bookings",
    APP_LOGO: "/assets/images/reflo-logo.png",
    APP_ICON: "/assets/images/reflo-icon.png",
    DEFAULT_AVATAR: "/assets/images/default-business-logo.png",
    BASE_URL: window.location.origin,

    // ==========================================
    // 5. FREE TRIAL SPECIFICATIONS
    // ==========================================
    TRIAL_DAYS: 30,
    TRIAL_PLAN: "growth",

    // ==========================================
    // 6. DEFAULT BASE PRICING (USD)
    // ==========================================
    // (Overrides dynamically if changed in Supabase platform_settings)
    PLANS: {
        STARTER: { id: 'starter', price: 19, name: 'Starter' },
        GROWTH: { id: 'growth', price: 39, name: 'Growth' },
        PRO: { id: 'pro', price: 79, name: 'Pro Unlimited' }
    },

    // ==========================================
    // 7. SUPPORTED CURRENCIES CATALOG
    // ==========================================
    CURRENCIES: {
        GLOBAL: [
            { code: 'USD', symbol: '$', name: 'US Dollar' },
            { code: 'EUR', symbol: '€', name: 'Euro' },
            { code: 'GBP', symbol: '£', name: 'British Pound' },
            { code: 'AED', symbol: 'DH', name: 'UAE Dirham' }
        ],
        WEST_AFRICA: [
            { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
            { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
            { code: 'XOF', symbol: 'CFA', name: 'West African CFA' }
        ],
        EAST_AFRICA: [
            { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
            { code: 'ZAR', symbol: 'R', name: 'South African Rand' }
        ]
    }
};

// Freeze configuration to prevent unauthorized runtime tampering
Object.freeze(REFLO_CONFIG);