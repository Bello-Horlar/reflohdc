/* TITLE: assets/js/admin/Businesses.js */
const AdminBusinesses = {
    adminId: null,
    allBusinesses: [],
    currentFilter: 'all',
    searchQuery: '',
    selectedBizId: null,
    isFeedHidden: false,

    // Formats numbers concisely (e.g., 1000 -> 1k, 1500 -> 1.5k, 1000000 -> 1M)
    formatShortNumber(num) {
        if (!num && num !== 0) return '0';
        const n = Math.abs(num);
        if (n < 1000) return num.toString();
        if (n >= 1000 && n < 1000000) {
            const formatted = (num / 1000).toFixed(1).replace(/\.0$/, '');
            return `${formatted}k`;
        }
        if (n >= 1000000 && n < 1000000000) {
            const formatted = (num / 1000000).toFixed(1).replace(/\.0$/, '');
            return `${formatted}M`;
        }
        return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
    },

    // Toggle feed to quickly reach bottom navigation
    toggleFeed() {
        this.isFeedHidden = !this.isFeedHidden;
        const container = document.getElementById('businessesFeedList');
        const btn = document.getElementById('toggleBizFeedBtn');

        if (container) {
            container.style.display = this.isFeedHidden ? 'none' : 'block';
        }

        if (btn) {
            btn.innerHTML = this.isFeedHidden ? '👁️ Show Directory' : '👁️ Hide Directory';
        }
    },

    async init() {
        const session = await Auth.checkSession();
        if (!session) return;
        this.adminId = session.user.id;

        await this.loadBusinesses();
    },

    async loadBusinesses() {
        // Resilient query: fetches businesses and owner profile safely
        const { data: businesses, error } = await db
            .from('businesses')
            .select(`
                id, name, slug, google_maps_url, category, description, address, phone, website_url, logo_url, currency, booking_enabled, subscription_status, trial_ends_at, created_at, updated_at, owner_id,
                profiles:owner_id(full_name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error loading businesses, falling back to simple query:", error);
            const { data: simpleBiz } = await db.from('businesses').select('*').order('created_at', { ascending: false });
            this.allBusinesses = simpleBiz || [];
        } else {
            this.allBusinesses = businesses || [];
        }

        this.render();
    },

    setFilter(filter, btn) {
        this.currentFilter = filter;
        document.querySelectorAll('.adm-filter-pill').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.render();
    },

    handleSearch(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.render();
    },

    render() {
        const container = document.getElementById('businessesFeedList');
        const countLabel = document.getElementById('bizCountLabel');
        if (!container) return;

        const now = new Date();
        let filtered = this.allBusinesses;

        if (this.currentFilter === 'active') {
            filtered = filtered.filter(b => ['starter', 'growth', 'pro'].includes(b.subscription_status));
        } else if (this.currentFilter === 'trial') {
            filtered = filtered.filter(b => b.subscription_status === 'trial' && new Date(b.trial_ends_at) > now);
        } else if (this.currentFilter === 'expired') {
            filtered = filtered.filter(b => b.subscription_status === 'expired' || (b.subscription_status === 'trial' && new Date(b.trial_ends_at) <= now));
        } else if (this.currentFilter === 'suspended') {
            filtered = filtered.filter(b => b.subscription_status === 'suspended');
        }

        if (this.searchQuery) {
            filtered = filtered.filter(b => 
                (b.name && b.name.toLowerCase().includes(this.searchQuery)) ||
                (b.slug && b.slug.toLowerCase().includes(this.searchQuery)) ||
                (b.profiles?.full_name && b.profiles.full_name.toLowerCase().includes(this.searchQuery)) ||
                (b.phone && b.phone.includes(this.searchQuery))
            );
        }

        // Short result counts (e.g., 1k instead of 1000)
        if (countLabel) {
            const shortCount = this.formatShortNumber(filtered.length);
            countLabel.innerText = `Showing ${shortCount} business${filtered.length === 1 ? '' : 'es'}`;
        }

        // Maintain display state when collapsed
        container.style.display = this.isFeedHidden ? 'none' : 'block';

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="settings-card" style="text-align: center; padding: 45px 20px;">
                    <div style="font-size: 2.2rem; margin-bottom: 10px;">🏢</div>
                    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 4px;">No businesses found</h3>
                    <p class="text-muted" style="font-size: 0.85rem;">No commercial records match your filter or search criteria.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(b => {
            const isSuspended = b.subscription_status === 'suspended';
            const regDate = b.created_at ? new Date(b.created_at).toLocaleDateString() : '--';
            const lastActive = b.updated_at ? new Date(b.updated_at).toLocaleDateString() : regDate;
            
            const trialEnd = new Date(b.trial_ends_at);
            const diffDays = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
            let trialText = `${diffDays} days left`;
            if (diffDays <= 0) trialText = 'Expired';

            const logoSrc = b.logo_url ? storage.getLogoUrl(b.logo_url) : '../assets/images/default-business-logo.png';
            const statusKey = b.subscription_status || 'trial';
            const ownerName = b.profiles?.full_name || 'Business Owner';

            return `
                <div class="biz-directory-card ${isSuspended ? 'status-suspended-border' : ''}">
                    <div class="biz-top-row">
                        <div class="biz-identity-wrap">
                            <div class="biz-avatar-thumb">
                                <img src="${logoSrc}" alt="Logo">
                            </div>
                            <div>
                                <div class="biz-name-text">${b.name}</div>
                                <div class="biz-owner-text">Owner: ${ownerName} • ${b.phone || 'No phone'}</div>
                            </div>
                        </div>
                        <span class="badge-status badge-${statusKey}">${statusKey.toUpperCase()}</span>
                    </div>

                    <div class="biz-details-grid">
                        <div class="biz-detail-item">
                            <small>1. Plan Tier</small>
                            <strong>${(b.subscription_status || 'Trial').toUpperCase()}</strong>
                        </div>
                        <div class="biz-detail-item">
                            <small>2. Trial Status</small>
                            <strong style="color:${diffDays <= 3 ? '#ef4444' : 'inherit'}">${trialText}</strong>
                        </div>
                        <div class="biz-detail-item">
                            <small>3. Currency</small>
                            <strong>${b.currency || 'USD'}</strong>
                        </div>
                        <div class="biz-detail-item">
                            <small>4. Registered</small>
                            <strong>${regDate}</strong>
                        </div>
                        <div class="biz-detail-item">
                            <small>5. Last Activity</small>
                            <strong>${lastActive}</strong>
                        </div>
                        <div class="biz-detail-item">
                            <small>6. Handle</small>
                            <strong>@${b.slug}</strong>
                        </div>
                        <div class="biz-detail-item">
                            <small>7. Category</small>
                            <strong>${b.category || 'General'}</strong>
                        </div>
                        <div class="biz-detail-item">
                            <small>8. Booking</small>
                            <strong style="color:${b.booking_enabled ? '#22c55e' : '#ef4444'}">${b.booking_enabled ? 'ENABLED' : 'DISABLED'}</strong>
                        </div>
                    </div>

                    <div class="biz-actions-row">
                        <button type="button" class="btn-biz-action" onclick="AdminBusinesses.openViewModal('${b.id}')">
                            👁️ View Details
                        </button>
                        <button type="button" class="btn-biz-action" onclick="AdminBusinesses.openReviewSubModal('${b.id}', '${b.name}', '${b.subscription_status}', '${b.trial_ends_at}')">
                            💳 Review Plan
                        </button>
                        <button type="button" class="btn-biz-action" onclick="location.href='activity.html?biz=${b.id}'">
                            📜 Audit Logs
                        </button>
                        ${isSuspended ? `
                            <button type="button" class="btn-biz-action btn-action-activate" onclick="AdminBusinesses.confirmActivate('${b.id}', '${b.name}')">
                                ⚡ Activate
                            </button>
                        ` : `
                            <button type="button" class="btn-biz-action btn-action-suspend" onclick="AdminBusinesses.confirmSuspend('${b.id}', '${b.name}')">
                                🚫 Suspend
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    },

    openViewModal(bizId) {
        const biz = this.allBusinesses.find(b => b.id === bizId);
        if (!biz) return;

        document.getElementById('modalBizName').innerText = biz.name;
        document.getElementById('modalBizSlug').innerText = `@${biz.slug}`;
        document.getElementById('modalOwnerName').innerText = biz.profiles?.full_name || 'Business Owner';
        document.getElementById('modalOwnerEmail').innerText = 'Verified On File';
        document.getElementById('modalAddress').innerText = biz.address || 'No physical address provided';
        document.getElementById('modalPhone').innerText = biz.phone || 'No phone provided';
        document.getElementById('modalWebsite').innerText = biz.website_url || 'None';
        
        const googleLink = document.getElementById('modalGoogleLink');
        if (biz.google_maps_url) {
            googleLink.href = biz.google_maps_url;
            googleLink.innerText = biz.google_maps_url;
        } else {
            googleLink.innerText = 'No link on file';
            googleLink.removeAttribute('href');
        }

        const hubLink = document.getElementById('modalPublicHubLink');
        hubLink.href = `${window.location.origin}/public/flow.html?biz=${biz.slug}`;

        document.getElementById('viewDossierModal').classList.add('active');
    },

    async confirmActivate(bizId, bizName) {
        if (!confirm(`CONFIRM ACTIVATION:\nRestore active access for "${bizName}"?`)) return;

        try {
            await db
                .from('businesses')
                .update({ subscription_status: 'growth', updated_at: new Date() })
                .eq('id', bizId);

            App.toast(`"${bizName}" activated successfully!`, "success");
            await this.loadBusinesses();
        } catch (err) {
            App.toast("Activation failed: " + err.message, "error");
        }
    },

    async confirmSuspend(bizId, bizName) {
        if (!confirm(`DANGEROUS ACTION:\nSuspend "${bizName}"?\nThis locks their paid features and customer hub.`)) return;

        try {
            await db
                .from('businesses')
                .update({ subscription_status: 'suspended', updated_at: new Date() })
                .eq('id', bizId);

            App.toast(`"${bizName}" has been suspended.`, "info");
            await this.loadBusinesses();
        } catch (err) {
            App.toast("Suspension failed: " + err.message, "error");
        }
    },

    openReviewSubModal(bizId, bizName, currentPlan, currentExpiry) {
        this.selectedBizId = bizId;
        document.getElementById('reviewSubBizTitle').innerText = `Managing plan for ${bizName}`;
        document.getElementById('subPlanSelect').value = currentPlan || 'growth';

        if (currentExpiry) {
            document.getElementById('subExpiryDateInput').value = new Date(currentExpiry).toISOString().split('T')[0];
        }

        document.getElementById('reviewSubModal').classList.add('active');
    },

    async saveSubscriptionReview() {
        if (!this.selectedBizId) return;

        const newPlan = document.getElementById('subPlanSelect').value;
        const newExpiryDate = document.getElementById('subExpiryDateInput').value;

        if (!newExpiryDate) return App.toast("Please select an expiration date.", "warning");

        try {
            await db
                .from('businesses')
                .update({
                    subscription_status: newPlan,
                    trial_ends_at: new Date(newExpiryDate).toISOString(),
                    updated_at: new Date()
                })
                .eq('id', this.selectedBizId);

            App.toast("Subscription plan updated successfully!", "success");
            this.closeModals();
            await this.loadBusinesses();
        } catch (err) {
            App.toast("Update failed: " + err.message, "error");
        }
    },

    closeModals() {
        this.selectedBizId = null;
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
};

document.addEventListener('DOMContentLoaded', () => AdminBusinesses.init());