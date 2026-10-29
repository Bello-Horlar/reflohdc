/* TITLE: assets/js/utils.js */
const Utils = {
    // 1. SMART RELATIVE TIME ENGINE (Issue 9)
    // Renders "NEW (Just now)" under 15m, then auto-transitions to relative time
    formatTimeBadge(timestamp) {
        if (!timestamp) return { text: '--', isNew: false };
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // Under 15 minutes: Show Pulsing NEW Badge
        if (diffMins < 15) {
            return {
                text: 'NEW (Just now)',
                isNew: true
            };
        }

        if (diffMins < 60) return { text: `${diffMins}m ago`, isNew: false };
        if (diffHours < 24) return { text: `${diffHours}h ago`, isNew: false };
        if (diffDays === 1) return { text: 'Yesterday', isNew: false };
        if (diffDays < 7) return { text: `${diffDays}d ago`, isNew: false };

        return {
            text: past.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            isNew: false
        };
    },

    // 2. Multi-Currency Formatter
    formatCurrency(amount, currencyCode = 'USD') {
        const symbolMap = {
            USD: '$', EUR: '€', GBP: '£', NGN: '₦', GHS: 'GH₵',
            KES: 'KSh', ZAR: 'R', AED: 'DH', EGP: 'E£', INR: '₹',
            TZS: 'TSh', UGX: 'Ush', RWF: 'RF', XOF: 'CFA'
        };
        const symbol = symbolMap[currencyCode] || '$';
        const num = parseFloat(amount || 0);
        return `${symbol}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    // 3. Date & Time Formatters
    formatDate(dateStr) {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // 4. Safe URL Parameter Extractor
    getURLParam(paramName) {
        return new URLSearchParams(window.location.search).get(paramName);
    },

    // 5. String Truncator
    truncate(str, length = 60) {
        if (!str) return '';
        return str.length > length ? `${str.substring(0, length)}...` : str;
    }
};