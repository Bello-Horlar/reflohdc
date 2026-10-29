/* TITLE: assets/js/user/Feedback.js */

const FeedbackApp = {
    bizId: null,
    allFeedback: [],

    async init() {
        try {
            const session = await Auth.checkSession();
            if (!session || !session.user) return;

            // 1. Automatically clear review notifications from the Bell & Alerts badge
            await this.clearReviewNotifications(session.user.id);

            // 2. Fetch Business Record safely
            const { data: biz, error } = await db
                .from('businesses')
                .select('id')
                .eq('owner_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error || !biz) {
                console.error("Could not fetch business for feedback:", error);
                document.getElementById('feedbackListContainer').innerHTML = `
                    <div class="settings-card" style="text-align: center; padding: 40px 20px;">
                        <p style="color: var(--danger, #ef4444); font-weight: 800;">No business profile linked to this account.</p>
                    </div>
                `;
                return;
            }

            this.bizId = biz.id;

            // 3. Mark all 'new' feedback as 'viewed' so Dashboard badge clears to 0 and Bell reduces
            await this.markNewFeedbackAsViewed(this.bizId);

            await this.loadFeedbackData();
        } catch (err) {
            console.error("FeedbackApp init error:", err);
        }
    },

    // Marks unread feedback notifications as read
    async clearReviewNotifications(userId) {
        try {
            await db
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .in('type', ['low_rating', 'new_feedback', 'feedback', 'review']);
        } catch (err) {
            console.warn("Notice clearing review notifications:", err);
        }
    },

    // Updates feedback rows in the database from 'new' to 'viewed'
    async markNewFeedbackAsViewed(bizId) {
        try {
            await db
                .from('feedback')
                .update({ status: 'viewed' })
                .eq('business_id', bizId)
                .eq('status', 'new');
        } catch (err) {
            console.warn("Notice marking feedback as viewed:", err);
        }
    },

    async loadFeedbackData() {
        try {
            const { data, error } = await db
                .from('feedback')
                .select('*')
                .eq('business_id', this.bizId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error loading feedback:", error);
                document.getElementById('feedbackListContainer').innerHTML = `
                    <div class="settings-card" style="text-align: center; padding: 40px 20px;">
                        <p style="color: var(--danger, #ef4444); font-weight: 800;">Failed to load feedback. Please try again.</p>
                    </div>
                `;
                return;
            }

            this.allFeedback = data || [];
            this.applyFilters();
        } catch (err) {
            console.error("Error in loadFeedbackData:", err);
        }
    },

    // Intelligent Filter Coordinator
    handleFilterChange(changedFilterType) {
        const statusEl = document.getElementById('filterStatus');
        const contactedEl = document.getElementById('filterContacted');
        const resolvedEl = document.getElementById('filterResolved');

        if (changedFilterType === 'status' && statusEl && statusEl.value !== 'all') {
            if (contactedEl) contactedEl.value = 'all';
            if (resolvedEl) resolvedEl.value = 'all';
        } else if (changedFilterType === 'contacted' && contactedEl && contactedEl.value !== 'all') {
            if (statusEl) statusEl.value = 'all';
            if (resolvedEl) resolvedEl.value = 'all';
        } else if (changedFilterType === 'resolved' && resolvedEl && resolvedEl.value !== 'all') {
            if (statusEl) statusEl.value = 'all';
            if (contactedEl) contactedEl.value = 'all';
        }

        this.applyFilters();
    },

    applyFilters() {
        const searchInput = document.getElementById('feedbackSearchInput');
        const search = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const ratingFilter = document.getElementById('filterRating')?.value || 'all';
        const dateFilter = document.getElementById('filterDate')?.value || 'all';
        const statusFilter = document.getElementById('filterStatus')?.value || 'all';
        const contactedFilter = document.getElementById('filterContacted')?.value || 'all';
        const resolvedFilter = document.getElementById('filterResolved')?.value || 'all';

        const now = new Date();

        const filtered = this.allFeedback.filter(item => {
            // 1. Text Search Filter (Name, Phone, or Comment)
            const name = (item.customer_name || '').toLowerCase();
            const phone = (item.customer_phone || '').toLowerCase();
            const comment = (item.comment || '').toLowerCase();

            const matchesSearch = !search || name.includes(search) || phone.includes(search) || comment.includes(search);

            // 2. Star Rating Filter
            let matchesRating = true;
            const itemRating = parseInt(item.rating, 10);

            if (ratingFilter === 'needs_attention') {
                matchesRating = itemRating <= 3;
            } else if (ratingFilter === 'positive') {
                matchesRating = itemRating >= 4;
            } else if (ratingFilter !== 'all') {
                matchesRating = itemRating === parseInt(ratingFilter, 10);
            }

            // 3. Date Filter (Precise calendar comparison)
            let matchesDate = true;
            if (dateFilter !== 'all' && item.created_at) {
                const itemDate = new Date(item.created_at);
                const diffMs = now.getTime() - itemDate.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                if (dateFilter === 'today') {
                    matchesDate = itemDate.toDateString() === now.toDateString();
                } else if (dateFilter === '7days') {
                    matchesDate = diffDays <= 7;
                } else if (dateFilter === '30days') {
                    matchesDate = diffDays <= 30;
                }
            }

            // 4. Status / Contacted / Resolved Dynamic Matching
            let matchesStatusWorkflow = true;
            const itemStatus = (item.status || 'new').toLowerCase();

            if (statusFilter !== 'all') {
                matchesStatusWorkflow = itemStatus === statusFilter.toLowerCase();
            } else if (contactedFilter !== 'all') {
                if (contactedFilter === 'contacted') {
                    matchesStatusWorkflow = (itemStatus === 'contacted' || itemStatus === 'resolved');
                } else if (contactedFilter === 'not_contacted') {
                    // Both 'new' and 'viewed' count as not contacted yet
                    matchesStatusWorkflow = (itemStatus === 'new' || itemStatus === 'viewed' || itemStatus === 'in_progress');
                }
            } else if (resolvedFilter !== 'all') {
                if (resolvedFilter === 'resolved') {
                    matchesStatusWorkflow = itemStatus === 'resolved';
                } else if (resolvedFilter === 'unresolved') {
                    matchesStatusWorkflow = itemStatus !== 'resolved';
                }
            }

            return matchesSearch && matchesRating && matchesDate && matchesStatusWorkflow;
        });

        this.render(filtered);
    },

    render(items) {
        const container = document.getElementById('feedbackListContainer');
        const countLabel = document.getElementById('feedbackCountLabel');
        const alertTag = document.getElementById('urgentAlertCount');
        if (!container) return;

        if (countLabel) {
            countLabel.innerText = `Showing ${items.length} feedback record${items.length === 1 ? '' : 's'}`;
        }

        const urgentCount = items.filter(i => parseInt(i.rating, 10) <= 3 && i.status !== 'resolved').length;
        if (alertTag) {
            if (urgentCount > 0) {
                alertTag.innerText = `⚠️ ${urgentCount} urgent item${urgentCount > 1 ? 's' : ''} require recovery`;
                alertTag.style.display = 'inline';
            } else {
                alertTag.style.display = 'none';
            }
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div class="settings-card" style="text-align: center; padding: 60px 20px; background: var(--bg-card); border-radius: 22px; border: 1px solid var(--border);">
                    <div style="font-size: 2.5rem; margin-bottom: 12px;">⭐</div>
                    <h3 style="font-size: 1.15rem; font-weight: 900; margin-bottom: 6px; color: var(--text-main);">No feedback found</h3>
                    <p class="text-muted" style="font-size: 0.85rem; max-width: 380px; margin: 0 auto 20px;">
                        No feedback entries match your active filter settings. Share your QR Hub to gather more reviews.
                    </p>
                    <a href="share.html" class="btn-primary" style="display: inline-block; width: auto; padding: 10px 22px; font-size: 0.85rem; font-weight: 800; text-decoration: none; border-radius: 12px;">
                        Get Customer Hub QR
                    </a>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => {
            const ratingNum = parseInt(item.rating, 10) || 5;
            const isLowRating = ratingNum <= 3;
            const starStr = '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum);
            
            const dateFormatted = item.created_at 
                ? new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Recent';
            
            const author = item.customer_name ? item.customer_name : 'Anonymous Customer';

            const statusClass = `status-${item.status || 'new'}`;
            const statusLabel = (item.status || 'new').replace('_', ' ');

            return `
                <a href="feedback-details.html?id=${item.id}" class="feedback-item-card ${isLowRating ? 'rating-low' : 'rating-high'}">
                    <div class="card-top-row">
                        <div class="stars-badge-wrap">
                            <span class="stars-display" style="color: ${isLowRating ? '#ef4444' : '#f59e0b'};">${starStr}</span>
                            <span class="rating-num-tag ${isLowRating ? 'tag-low' : 'tag-high'}">${ratingNum}.0</span>
                        </div>
                        <span class="status-pill-badge ${statusClass}">${statusLabel}</span>
                    </div>

                    <div class="customer-comment-text">
                        "${item.comment ? this.escapeHtml(item.comment) : 'No written feedback provided.'}"
                    </div>

                    <div class="card-footer-meta">
                        <div class="customer-author">
                            <span>👤</span> ${this.escapeHtml(author)}
                            ${item.customer_phone ? '<span title="Phone provided" style="font-size: 0.85rem; margin-left: 4px;">📞</span>' : ''}
                        </div>
                        <span class="text-muted" style="font-weight: 600;">${dateFormatted}</span>
                    </div>
                </a>
            `;
        }).join('');
    },

    resetFilters() {
        const searchInput = document.getElementById('feedbackSearchInput');
        if (searchInput) searchInput.value = '';

        const filterIds = ['filterRating', 'filterDate', 'filterStatus', 'filterContacted', 'filterResolved'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = 'all';
        });

        this.applyFilters();
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => FeedbackApp.init());