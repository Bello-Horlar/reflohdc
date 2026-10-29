/* TITLE: assets/js/user/Dashboard.js */

const DashboardApp = {
    userId: null,
    biz: null,

    async init() {
        try {
            const session = await Auth.checkSession();
            if (!session || !session.user) return;
            this.userId = session.user.id;

            await this.loadBusinessProfile();
            await this.loadDashboardMetrics();
            await this.loadUrgentFeedback();
            await this.loadRecentBookings();
            await this.syncAllBadges(); // Synchronized Master Aggregator
            this.setupRealtimeAlerts();
            this.bindInstantBadgeClearing();

            // Auto-refresh counts whenever owner switches tabs or returns via back button
            window.addEventListener('focus', () => {
                this.loadDashboardMetrics();
                this.loadUrgentFeedback();
                this.loadRecentBookings();
                this.syncAllBadges();
            });
            window.addEventListener('pageshow', () => {
                this.loadDashboardMetrics();
                this.loadUrgentFeedback();
                this.loadRecentBookings();
                this.syncAllBadges();
            });
        } catch (err) {
            console.error("DashboardApp init error:", err);
        }
    },

    // Formats numbers cleanly: 1200 -> 1.2k, 25000 -> 25k, 1000000 -> 1m
    formatCompactNumber(number) {
        const val = Number(number);
        if (!val || isNaN(val)) return '0';
        if (val < 1000) return String(val);
        return new Intl.NumberFormat('en', { 
            notation: 'compact', 
            maximumFractionDigits: 1 
        }).format(val).toLowerCase();
    },

    // Deduplicates notifications to prevent twin inserts
    deduplicateBadgeRecords(records) {
        if (!Array.isArray(records) || records.length === 0) return [];
        const deduped = [];

        for (const item of records) {
            const isTwin = deduped.some(existing => {
                if (existing.id === item.id) return true;
                const timeDiff = Math.abs(new Date(item.created_at).getTime() - new Date(existing.created_at).getTime());
                const isRecent = timeDiff < (5 * 60 * 1000);

                if (isRecent) {
                    if (item.type === existing.type) return true;
                    if ((item.type === 'support_reply' || item.type === 'admin_message') &&
                        (existing.type === 'support_reply' || existing.type === 'admin_message')) return true;
                }
                return false;
            });

            if (!isTwin) {
                deduped.push(item);
            }
        }
        return deduped;
    },

    // =========================================================================
    // MASTER SYNCHRONIZED BADGE ENGINE (Exact 1-to-1 + Master Total Math)
    // =========================================================================
    async syncAllBadges() {
        if (!this.biz || !this.userId) return;
        const bizId = this.biz.id;

        try {
            // 1. Unread Feedback (status = 'new')
            const { count: feedbackCount } = await db
                .from('feedback')
                .select('*', { count: 'exact', head: true })
                .eq('business_id', bizId)
                .eq('status', 'new');

            // 2. Pending Bookings (status = 'pending')
            const { count: bookingsCount } = await db
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('business_id', bizId)
                .eq('status', 'pending');

            // 3. Unread Notifications (Support messages, system alerts)
            const { data: unreadNotifs } = await db
                .from('notifications')
                .select('id, type, created_at, message, title')
                .eq('user_id', this.userId)
                .eq('is_read', false);

            const uniqueNotifs = this.deduplicateBadgeRecords(unreadNotifs || []);

            // Support/Admin replies count
            const supportRepliesCount = uniqueNotifs.filter(n => 
                n.type === 'support_reply' || n.type === 'admin_message'
            ).length;

            // Other system alerts (Excludes feedback & bookings to prevent ANY duplication)
            const otherAlertsCount = uniqueNotifs.filter(n => 
                !['new_booking', 'booking_status', 'low_rating', 'feedback', 'review', 'support_reply', 'admin_message'].includes(n.type)
            ).length;

            const fbTotal = feedbackCount || 0;
            const bkTotal = bookingsCount || 0;
            const spTotal = supportRepliesCount || 0;

            // MASTER TOTAL: Exactly 1 per unread feedback + 1 per pending booking + 1 per admin message
            const masterTotal = fbTotal + bkTotal + spTotal + otherAlertsCount;

            // --- A. UPDATE INDIVIDUAL GATEWAY CARDS ---
            // 1. Feedback Card Badge
            const fbBadge = document.getElementById('fbCardBadge');
            if (fbBadge) {
                fbBadge.innerText = fbTotal > 99 ? '99+' : fbTotal;
                fbBadge.style.display = fbTotal > 0 ? 'flex' : 'none';
            }

            // 2. Bookings Card Badge
            const bkBadge = document.getElementById('bkCardBadge');
            if (bkBadge) {
                bkBadge.innerText = bkTotal > 99 ? '99+' : bkTotal;
                bkBadge.style.display = bkTotal > 0 ? 'flex' : 'none';
            }

            // 3. Support Card Badge
            const supportBadge = document.getElementById('supportCardBadge');
            if (supportBadge) {
                supportBadge.innerText = spTotal > 99 ? '99+' : spTotal;
                supportBadge.style.display = spTotal > 0 ? 'flex' : 'none';
            }

            // --- B. UPDATE MASTER AGGREGATORS (Bell & Alerts Card) ---
            // 4. Header Bell Badge
            const bellBadge = document.getElementById('dashNotifBadge');
            if (bellBadge) {
                bellBadge.innerText = masterTotal > 99 ? '99+' : masterTotal;
                bellBadge.style.display = masterTotal > 0 ? 'flex' : 'none';
            }

            // 5. Alerts Card Badge
            const notifCardBadge = document.getElementById('notifCardBadge');
            if (notifCardBadge) {
                notifCardBadge.innerText = masterTotal > 99 ? '99+' : masterTotal;
                notifCardBadge.style.display = masterTotal > 0 ? 'flex' : 'none';
            }

        } catch (err) {
            console.error("Error syncing dashboard badges:", err);
        }
    },

    // Dual Hardware Alert: Physical Vibration + Audio Chime
    triggerAlertFeedback(vibePattern) {
        if ('vibrate' in navigator) {
            try { navigator.vibrate(vibePattern || [400, 150, 400]); } catch (_) {}
        }

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, ctx.currentTime);
                osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
            }
        } catch (_) {}
    },

    async loadBusinessProfile() {
        const { data: profile } = await db
            .from('profiles')
            .select('full_name, role')
            .eq('id', this.userId)
            .maybeSingle();

        if (profile && profile.role === 'admin') {
            const adminBtn = document.getElementById('secretAdminBtn');
            if (adminBtn) adminBtn.style.display = 'inline-flex';
        }

        const { data: biz } = await db
            .from('businesses')
            .select('*')
            .eq('owner_id', this.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (biz) {
            this.biz = biz;
            document.getElementById('dashBizName').innerText = biz.name || 'My Business';
            document.getElementById('dashOwnerGreeting').innerText = `Hello, ${profile?.full_name || 'Business Owner'}`;
            document.getElementById('dashBizHandle').innerText = `@${biz.slug || 'active'}`;

            if (biz.logo_url) {
                document.getElementById('dashBizLogo').src = (typeof storage !== 'undefined' && storage.getLogoUrl) 
                    ? storage.getLogoUrl(biz.logo_url) 
                    : biz.logo_url;
            }

            this.renderCountdownBanner(biz);
        } else {
            let cached = null;
            try { cached = JSON.parse(localStorage.getItem('reflo_reg_data')); } catch(e){}
            document.getElementById('dashBizName').innerText = cached?.bizName || 'My Business';
            document.getElementById('dashOwnerGreeting').innerText = `Hello, ${profile?.full_name || 'Owner'}`;
            document.getElementById('dashBizHandle').innerText = '@active';
        }
    },

    renderCountdownBanner(biz) {
        const banner = document.getElementById('trialCountdownBanner');
        const statusTag = document.getElementById('membershipStatusTag');
        const heading = document.getElementById('countdownDaysHeading');
        const upgradeBtn = document.getElementById('bannerUpgradeBtn');
        if (!banner) return;

        const status = (biz?.subscription_status || 'trial').toLowerCase();
        const end = new Date(biz?.trial_ends_at || (Date.now() + 30 * 86400000));
        const now = new Date();
        const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

        if (status === 'trial') {
            if (statusTag) statusTag.innerText = '30-DAY GROWTH TRIAL';
            if (diffDays > 7) {
                if (heading) heading.innerText = `${diffDays} Days Remaining`;
                banner.className = 'trial-countdown-banner';
            } else if (diffDays > 0) {
                if (heading) heading.innerText = `${diffDays} Day${diffDays === 1 ? '' : 's'} Left — Trial Ending Soon`;
                banner.className = 'trial-countdown-banner urgent';
            } else {
                if (heading) heading.innerText = 'Free Trial Expired';
                banner.className = 'trial-countdown-banner expired';
                if (upgradeBtn) upgradeBtn.innerText = 'CHOOSE PLAN';
            }
        } else {
            if (statusTag) statusTag.innerText = `${status.toUpperCase()} MEMBERSHIP`;
            if (diffDays > 0) {
                if (heading) heading.innerText = `${diffDays} Days Remaining in Period`;
                banner.className = 'trial-countdown-banner';
                if (upgradeBtn) upgradeBtn.innerText = 'MANAGE';
            } else {
                if (heading) heading.innerText = 'Subscription Expired';
                banner.className = 'trial-countdown-banner expired';
                if (upgradeBtn) upgradeBtn.innerText = 'RENEW';
            }
        }
    },

    async loadDashboardMetrics() {
        if (!this.biz) return;
        const bizId = this.biz.id;

        // Feedback Rating Stats
        const { data: feedbacks } = await db
            .from('feedback')
            .select('rating, status')
            .eq('business_id', bizId);

        if (feedbacks && feedbacks.length > 0) {
            const total = feedbacks.length;
            const sum = feedbacks.reduce((acc, curr) => acc + (curr.rating || 0), 0);
            const avg = (sum / total).toFixed(1);
            const lowCount = feedbacks.filter(f => f.rating <= 3 && f.status !== 'resolved').length;

            document.getElementById('statAvgRating').innerHTML = `${avg} <small style="font-size:1rem;">⭐</small>`;
            document.getElementById('statTotalFeedback').innerText = this.formatCompactNumber(total);
            document.getElementById('statLowRatingCount').innerText = this.formatCompactNumber(lowCount);
        } else {
            document.getElementById('statAvgRating').innerHTML = `0.0 <small style="font-size:1rem;">⭐</small>`;
            document.getElementById('statTotalFeedback').innerText = '0';
            document.getElementById('statLowRatingCount').innerText = '0';
        }

        // Active Bookings Stats
        const { data: bookings } = await db
            .from('bookings')
            .select('status')
            .eq('business_id', bizId);

        if (bookings && bookings.length > 0) {
            const activeCount = bookings.filter(b => ['pending', 'confirmed'].includes(b.status)).length;
            document.getElementById('statActiveBookings').innerText = this.formatCompactNumber(activeCount);
        } else {
            document.getElementById('statActiveBookings').innerText = '0';
        }
    },

    async loadUrgentFeedback() {
        if (!this.biz) return;
        const container = document.getElementById('urgentFeedbackList');
        if (!container) return;

        const { data: urgentItems } = await db
            .from('feedback')
            .select('*')
            .eq('business_id', this.biz.id)
            .lte('rating', 3)
            .neq('status', 'resolved')
            .order('created_at', { ascending: false })
            .limit(3);

        if (!urgentItems || urgentItems.length === 0) {
            container.innerHTML = `
                <div class="settings-card" style="padding: 20px; text-align: center;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">
                        🎉 No urgent customer issues. All caught up!
                    </span>
                </div>
            `;
            return;
        }

        container.innerHTML = urgentItems.map(item => {
            const timeAgo = this.formatTimeAgo(item.created_at);
            const isFresh = (Date.now() - new Date(item.created_at).getTime()) < (20 * 60 * 1000);

            return `
                <a href="feedback-details.html?id=${item.id}" class="clickable-feedback-row urgent-attention">
                    <div class="fb-row-info">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <div class="fb-stars-text">${'⭐'.repeat(item.rating)}</div>
                            <span style="font-size:0.72rem; font-weight:800; color:${isFresh ? '#ef4444' : 'var(--text-muted)'};">
                                ${isFresh ? '🔴 NEW (' + timeAgo + ')' : timeAgo}
                            </span>
                        </div>
                        <div class="fb-quote">"${item.comment ? item.comment.substring(0, 65) + (item.comment.length > 65 ? '...' : '') : 'No written feedback'}"</div>
                        <div class="fb-customer-meta">
                            <strong>👤 ${item.customer_name || 'Anonymous Customer'}</strong>
                            ${item.customer_phone ? '<span style="font-size:0.75rem; margin-left:6px; color:var(--text-muted);">📞 ' + item.customer_phone + '</span>' : ''}
                        </div>
                    </div>
                    <span class="arrow-indicator">→</span>
                </a>
            `;
        }).join('');
    },

    async loadRecentBookings() {
        if (!this.biz) return;
        const container = document.getElementById('recentBookingsList');
        if (!container) return;

        const { data: bookings } = await db
            .from('bookings')
            .select('*')
            .eq('business_id', this.biz.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(3);

        if (!bookings || bookings.length === 0) {
            container.innerHTML = `
                <div class="settings-card" style="padding: 20px; text-align: center;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">
                        🎉 All bookings confirmed & handled!
                    </span>
                </div>
            `;
            return;
        }

        container.innerHTML = bookings.map(bk => {
            const timeAgo = this.formatTimeAgo(bk.created_at);
            return `
                <div class="clickable-feedback-row" onclick="location.href='bookings.html'">
                    <div class="fb-row-info">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                            <strong style="font-size: 0.95rem;">👤 ${bk.customer_name}</strong>
                            <span style="font-size:0.72rem; font-weight:800; color:#ef4444;">🔴 NEW (${timeAgo})</span>
                        </div>
                        <div class="fb-customer-meta">
                            📅 <strong>${new Date(bk.booking_date).toLocaleDateString()} @ ${bk.booking_time}</strong> (${bk.service_name || 'Appointment'})
                        </div>
                    </div>
                    <span class="status-badge status-pending">PENDING</span>
                </div>
            `;
        }).join('');
    },

    bindInstantBadgeClearing() {
        const bellBtn = document.querySelector('.notif-bell-btn');
        if (bellBtn) {
            bellBtn.addEventListener('click', () => {
                const b = document.getElementById('dashNotifBadge');
                if (b) b.style.display = 'none';
            });
        }
    },

    setupRealtimeAlerts() {
        if (!this.biz) return;

        // 1. Live Reviews Listener
        db.channel(`dash-alerts-fb-${this.biz.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'feedback',
                filter: `business_id=eq.${this.biz.id}`
            }, payload => {
                this.loadDashboardMetrics();
                this.loadUrgentFeedback();
                this.syncAllBadges(); // Updates badges in real-time

                if (payload.eventType === 'INSERT') {
                    this.triggerAlertFeedback([400, 150, 400]);
                    if (typeof App !== 'undefined' && App.toast) {
                        const isLow = payload.new.rating <= 3;
                        App.toast(
                            `${payload.new.customer_name || 'A customer'}: "${payload.new.comment || ''}"`,
                            isLow ? 'warning' : 'success',
                            `${isLow ? '🚨 Urgent' : '⭐ New'} ${payload.new.rating}★ Review!`
                        );
                    }
                }
            })
            .subscribe();

        // 2. Live Bookings Listener
        db.channel(`dash-alerts-bk-${this.biz.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'bookings',
                filter: `business_id=eq.${this.biz.id}`
            }, payload => {
                this.loadDashboardMetrics();
                this.loadRecentBookings();
                this.syncAllBadges(); // Updates badges in real-time

                if (payload.eventType === 'INSERT') {
                    this.triggerAlertFeedback([300, 100, 300]);
                    if (typeof App !== 'undefined' && App.toast) {
                        App.toast(
                            `${payload.new.customer_name} booked for ${payload.new.booking_date} @ ${payload.new.booking_time}`,
                            'info',
                            '📅 New Booking Request!'
                        );
                    }
                }
            })
            .subscribe();

        // 3. Live Notifications Listener
        db.channel(`dash-alerts-notif-${this.userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${this.userId}`
            }, payload => {
                this.syncAllBadges(); // Updates badges in real-time

                if (payload.eventType === 'INSERT') {
                    this.triggerAlertFeedback([350, 100, 350]);
                    if (typeof App !== 'undefined' && App.toast) {
                        App.toast(payload.new.message, 'info', payload.new.title);
                    }
                }
            })
            .subscribe();
    },

    formatTimeAgo(timestamp) {
        if (!timestamp) return 'Just now';
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return past.toLocaleDateString();
    }
};

document.addEventListener('DOMContentLoaded', () => DashboardApp.init());