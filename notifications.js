/* TITLE: assets/js/notifications.js */
/* REFLO In-App Notifications Inbox & Realtime Feed Controller */

const NotificationsApp = {
    userId: null,
    bizId: null,
    notifications: [],
    currentFilter: 'all',
    realtimeChannel: null,

    TYPE_CONFIG: {
        low_rating: { icon: '⚠️', class: 'type-low_rating', defaultTitle: 'New Low Rating Feedback' },
        new_booking: { icon: '📅', class: 'type-new_booking', defaultTitle: 'New Booking Request' },
        booking_status: { icon: '🔄', class: 'type-booking_status', defaultTitle: 'Booking Status Updated' },
        payment_success: { icon: '💳', class: 'type-payment_success', defaultTitle: 'Payment Confirmed' },
        trial_warning: { icon: '⏳', class: 'type-trial_warning', defaultTitle: 'Trial Expiring Soon' },
        sub_expired: { icon: '🛑', class: 'type-sub_expired', defaultTitle: 'Subscription Expired' },
        support_reply: { icon: '💬', class: 'type-support_reply', defaultTitle: 'New Support Message' },
        admin_message: { icon: '📢', class: 'type-admin_message', defaultTitle: 'Message from Admin' }
    },

    // Intelligent deduplication engine to stop dual inserts (Trigger + Client)
    deduplicateNotifications(list) {
        if (!Array.isArray(list) || list.length === 0) return [];

        const unique = [];
        const redundantIds = [];

        for (let i = 0; i < list.length; i++) {
            const current = list[i];
            let isDuplicate = false;

            for (let j = 0; j < unique.length; j++) {
                const existing = unique[j];

                // 1. Direct ID match
                if (current.id && existing.id && current.id === existing.id) {
                    isDuplicate = true;
                    break;
                }

                const timeDiff = Math.abs(new Date(current.created_at).getTime() - new Date(existing.created_at).getTime());
                const isWithin5Mins = !isNaN(timeDiff) && timeDiff < (5 * 60 * 1000);

                // 2. Duplicate Support Replies (Admin reply trigger + direct client insert)
                const isSupportA = current.type === 'support_reply' || current.type === 'admin_message';
                const isSupportB = existing.type === 'support_reply' || existing.type === 'admin_message';

                if (isSupportA && isSupportB && isWithin5Mins) {
                    isDuplicate = true;
                    // Prefer the notification with fuller message text
                    if ((current.message || '').length > (existing.message || '').length) {
                        redundantIds.push(existing.id);
                        unique[j] = current;
                    } else {
                        redundantIds.push(current.id);
                    }
                    break;
                }

                // 3. Duplicate Booking Notifications (e.g. "New Appointment Booking" vs "📅 New Booking Request")
                const isBookingA = current.type === 'new_booking' || (current.title && current.title.toLowerCase().includes('booking'));
                const isBookingB = existing.type === 'new_booking' || (existing.title && existing.title.toLowerCase().includes('booking'));

                if (isBookingA && isBookingB && isWithin5Mins) {
                    const msgA = (current.message || '').toLowerCase();
                    const msgB = (existing.message || '').toLowerCase();

                    // Check if they refer to the same date (YYYY-MM-DD) or share customer keywords
                    const dateA = msgA.match(/\d{4}-\d{2}-\d{2}/);
                    const dateB = msgB.match(/\d{4}-\d{2}-\d{2}/);
                    const sameDate = dateA && dateB && dateA[0] === dateB[0];

                    const wordsA = msgA.split(/\s+/).filter(w => w.length > 3);
                    const commonWords = wordsA.filter(w => msgB.includes(w));
                    const highOverlap = wordsA.length > 0 && (commonWords.length / wordsA.length) >= 0.35;

                    if (sameDate || highOverlap || timeDiff < 15000) {
                        isDuplicate = true;
                        // Keep the richer card (contains time '@' or longer details)
                        const scoreA = (current.message || '').includes('@') ? 2 : 1;
                        const scoreB = (existing.message || '').includes('@') ? 2 : 1;

                        if (scoreA > scoreB || (scoreA === scoreB && (current.message || '').length > (existing.message || '').length)) {
                            redundantIds.push(existing.id);
                            unique[j] = current;
                        } else {
                            redundantIds.push(current.id);
                        }
                        break;
                    }
                }

                // 4. Identical titles/messages within 5 minutes
                if (current.type === existing.type && isWithin5Mins) {
                    if (current.message === existing.message || current.title === existing.title) {
                        isDuplicate = true;
                        redundantIds.push(current.id);
                        break;
                    }
                }
            }

            if (!isDuplicate) {
                unique.push(current);
            }
        }

        // Clean up redundant rows from the database in the background
        if (redundantIds.length > 0) {
            this.purgeDuplicateIds(redundantIds);
        }

        return unique;
    },

    async purgeDuplicateIds(ids) {
        if (!ids || ids.length === 0) return;
        try {
            await db.from('notifications').delete().in('id', ids);
        } catch (_) {}
    },

    async init() {
        const session = await Auth.checkSession();
        if (!session || !session.user) return;
        this.userId = session.user.id;

        const { data: biz } = await db
            .from('businesses')
            .select('id')
            .eq('owner_id', this.userId)
            .maybeSingle();

        if (biz) this.bizId = biz.id;

        this.registerServiceWorkerSilently();

        if (typeof RefloPush !== 'undefined') {
            if (RefloPush.autoSubscribe) {
                RefloPush.autoSubscribe(this.userId);
            } else if (RefloPush.requestPermission) {
                RefloPush.requestPermission();
            }
        }

        await this.loadNotifications();
        this.setupRealtime();

        if (window.location.pathname.includes('notifications.html')) {
            setTimeout(() => this.autoMarkVisibleAsRead(), 1200);
        }
    },

    registerServiceWorkerSilently() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
    },

    async loadNotifications() {
        const { data, error } = await db
            .from('notifications')
            .select('*')
            .eq('user_id', this.userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching notifications:', error);
            return;
        }

        // Apply deduplication so no twin notifications are stored or shown
        this.notifications = this.deduplicateNotifications(data || []);
        this.updateUnreadBadge();
        this.render();
    },

    updateUnreadBadge() {
        const unreadCount = this.notifications.filter(n => !n.is_read).length;
        const badge = document.getElementById('unreadCountBadge');
        if (badge) {
            if (unreadCount > 0) {
                badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (typeof App !== 'undefined' && App.setBadge) {
            App.setBadge(unreadCount);
        }
    },

    async autoMarkVisibleAsRead() {
        const unreadIds = this.notifications.filter(n => !n.is_read).map(n => n.id);
        if (unreadIds.length === 0) return;

        await db
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', this.userId)
            .eq('is_read', false);

        this.notifications.forEach(n => n.is_read = true);
        this.updateUnreadBadge();
        
        document.querySelectorAll('.unread-dot').forEach(dot => dot.remove());
        document.querySelectorAll('.notif-card.unread').forEach(c => c.classList.remove('unread'));
    },

    setFilter(filter, btn) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.render();
    },

    render() {
        const container = document.getElementById('notifications-feed');
        if (!container) return;

        let filtered = this.notifications;
        if (this.currentFilter === 'unread') {
            filtered = this.notifications.filter(n => !n.is_read);
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="settings-card" style="text-align: center; padding: 50px 20px; background: var(--bg-card); border-radius: 22px; border: 1px solid var(--border);">
                    <div style="font-size: 2.5rem; margin-bottom: 10px;">🔔</div>
                    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 5px; color: var(--text-main);">No notifications yet</h3>
                    <p class="text-muted" style="font-size: 0.85rem; margin: 0;">You will receive live updates when customers leave reviews, book visits, or when support responds.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(notif => {
            const config = this.TYPE_CONFIG[notif.type] || {
                icon: '📌',
                class: 'type-new_booking',
                defaultTitle: 'System Notification'
            };

            const timeStr = this.formatTime(notif.created_at);
            const isUnread = !notif.is_read;

            return `
                <div class="notif-card ${isUnread ? 'unread' : ''}" onclick="NotificationsApp.handleCardClick('${notif.id}', '${notif.link || ''}')">
                    <div class="notif-icon-box ${config.class}">
                        ${config.icon}
                    </div>
                    <div class="notif-body">
                        <div class="notif-title">
                            <span>${notif.title || config.defaultTitle}</span>
                            ${isUnread ? '<span class="unread-dot"></span>' : ''}
                        </div>
                        <div class="notif-msg">${notif.message}</div>
                        <div class="notif-time">${timeStr}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    async handleCardClick(id, targetLink) {
        await db.from('notifications').update({ is_read: true }).eq('id', id);

        const item = this.notifications.find(n => n.id === id);
        if (item) item.is_read = true;

        this.updateUnreadBadge();

        if (targetLink && targetLink !== 'null' && targetLink !== '') {
            window.location.href = targetLink;
        } else {
            this.render();
        }
    },

    async markAllAsRead() {
        const unreadIds = this.notifications.filter(n => !n.is_read).map(n => n.id);
        if (unreadIds.length === 0) return;

        const { error } = await db
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', this.userId)
            .eq('is_read', false);

        if (!error) {
            this.notifications.forEach(n => n.is_read = true);
            this.updateUnreadBadge();
            this.render();
        }
    },

    setupRealtime() {
        if (this.realtimeChannel) {
            db.removeChannel(this.realtimeChannel);
        }

        this.realtimeChannel = db.channel(`user-notifs-${this.userId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${this.userId}`
            }, payload => {
                const combined = [payload.new, ...this.notifications];
                const deduped = this.deduplicateNotifications(combined);

                // If this incoming payload was a twin duplicate, discard silently
                const isUnique = deduped.some(n => n.id === payload.new.id);
                this.notifications = deduped;
                this.updateUnreadBadge();
                this.render();

                if (!isUnique) return;

                if ('vibrate' in navigator) {
                    try { navigator.vibrate([400, 150, 400]); } catch (_) {}
                }

                if (typeof App !== 'undefined' && App.toast) {
                    App.toast(payload.new.message, 'info', payload.new.title);
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${this.userId}`
            }, payload => {
                const idx = this.notifications.findIndex(n => n.id === payload.new.id);
                if (idx !== -1) {
                    this.notifications[idx] = payload.new;
                    this.notifications = this.deduplicateNotifications(this.notifications);
                    this.updateUnreadBadge();
                    this.render();
                }
            })
            .subscribe();
    },

    formatTime(timestamp) {
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

document.addEventListener('DOMContentLoaded', () => NotificationsApp.init());