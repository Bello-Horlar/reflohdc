/* TITLE: assets/js/admin/Activity.js */

const AdminActivity = {
    adminId: null,
    allLogs: [],
    currentFilter: 'all',
    searchQuery: '',
    isFeedHidden: false,

    EVENT_CONFIG: {
        registration: { icon: '👤', class: 'evt-registration', label: 'REGISTRATION' },
        signup:       { icon: '👤', class: 'evt-registration', label: 'REGISTRATION' },
        login:        { icon: '🔑', class: 'evt-login', label: 'LOGIN' },
        subscription: { icon: '🔄', class: 'evt-subscription', label: 'SUBSCRIPTION' },
        payment:      { icon: '💳', class: 'evt-payment', label: 'PAYMENT' },
        feedback:     { icon: '⭐', class: 'evt-feedback', label: 'FEEDBACK' },
        review:       { icon: '⭐', class: 'evt-feedback', label: 'FEEDBACK' },
        booking:      { icon: '📅', class: 'evt-booking', label: 'BOOKING' },
        support:      { icon: '💬', class: 'evt-support', label: 'SUPPORT' },
        admin_action: { icon: '🛡️', class: 'evt-admin_action', label: 'ADMIN ACTION' }
    },

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
        const container = document.getElementById('activityEventFeed');
        const btn = document.getElementById('toggleActivityFeedBtn');

        if (container) {
            container.style.display = this.isFeedHidden ? 'none' : 'block';
        }

        if (btn) {
            btn.innerHTML = this.isFeedHidden ? '👁️ Show Activities' : '👁️ Hide Activities';
        }
    },

    async init() {
        try {
            // 1. Check Authenticated Session
            const session = await Auth.checkSession();
            if (!session || !session.user) {
                window.location.href = '../login.html';
                return;
            }

            this.adminId = session.user.id;

            // 2. Strict Database Role Verification (No Hardcoded Emails)
            const { data: profile, error: profileError } = await db
                .from('profiles')
                .select('role')
                .eq('id', this.adminId)
                .maybeSingle();

            if (profileError || !profile || profile.role !== 'admin') {
                console.warn("Unauthorized access attempt. Admin role required.");
                alert("ACCESS DENIED: Administrative clearance required.");
                window.location.href = '../app/dashboard.html';
                return;
            }

            // 3. Load Initial Activity Logs and Setup Real-time Telemetry
            await this.loadLogs();
            this.setupRealtime();
        } catch (err) {
            console.error("Initialization error in AdminActivity:", err);
            if (typeof App !== 'undefined' && App.toast) {
                App.toast("Failed to initialize activity logs.", "error");
            }
        }
    },

    async loadLogs() {
        try {
            // Fetch logs along with related business information
            const { data: logs, error } = await db
                .from('activity_logs')
                .select(`
                    id, event_type, title, description, created_at, business_id, actor_id, metadata,
                    businesses:business_id(name, slug)
                `)
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) {
                console.warn("Relational query note, fallback to standard query:", error);
                const { data: fallbackLogs, error: fallbackError } = await db
                    .from('activity_logs')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(200);

                if (fallbackError) {
                    console.error("Error loading activity logs fallback:", fallbackError);
                    this.allLogs = [];
                } else {
                    this.allLogs = fallbackLogs || [];
                }
            } else {
                this.allLogs = logs || [];
            }

            this.render();
        } catch (err) {
            console.error("Failed to load activity logs:", err);
            this.allLogs = [];
            this.render();
        }
    },

    setFilter(filterType, btnElement) {
        this.currentFilter = (filterType || 'all').toLowerCase();
        
        // Update active filter pill style
        document.querySelectorAll('.adm-filter-pill').forEach(btn => {
            btn.classList.remove('active');
        });

        if (btnElement) {
            btnElement.classList.add('active');
        }

        this.render();
    },

    handleSearch(queryText) {
        this.searchQuery = (queryText || '').toLowerCase().trim();
        this.render();
    },

    render() {
        const container = document.getElementById('activityEventFeed');
        const countLabel = document.getElementById('activityCountLabel');
        if (!container) return;

        let filtered = this.allLogs;

        // 1. Apply Category Filters with synonym normalization
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(log => {
                const evt = (log.event_type || '').toLowerCase();
                if (this.currentFilter === 'payment') {
                    return evt === 'payment' || evt === 'subscription';
                }
                if (this.currentFilter === 'registration') {
                    return evt === 'registration' || evt === 'signup';
                }
                if (this.currentFilter === 'feedback') {
                    return evt === 'feedback' || evt === 'review';
                }
                return evt === this.currentFilter;
            });
        }

        // 2. Apply Text Search (Matches title, description, or business name)
        if (this.searchQuery) {
            filtered = filtered.filter(log => {
                const title = (log.title || '').toLowerCase();
                const desc = (log.description || '').toLowerCase();
                const bizName = (log.businesses?.name || '').toLowerCase();
                return title.includes(this.searchQuery) || 
                       desc.includes(this.searchQuery) || 
                       bizName.includes(this.searchQuery);
            });
        }

        // 3. Update Count Badge with Short Format (e.g. 1k instead of 1000)
        if (countLabel) {
            const shortCount = this.formatShortNumber(filtered.length);
            countLabel.innerText = `Showing ${shortCount} event${filtered.length === 1 ? '' : 's'}`;
        }

        // Maintain display state when collapsed
        container.style.display = this.isFeedHidden ? 'none' : 'block';

        // 4. Render Empty State
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="settings-card" style="text-align: center; padding: 45px 20px; background: var(--bg-card); border-radius: 22px; border: 1px solid var(--border);">
                    <div style="font-size: 2.2rem; margin-bottom: 10px;">📜</div>
                    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 4px; color: var(--text-main);">No activity logs found</h3>
                    <p class="text-muted" style="font-size: 0.85rem; color: var(--text-muted); margin: 0;">No telemetry events match your selected criteria.</p>
                </div>
            `;
            return;
        }

        // 5. Render Event Cards
        container.innerHTML = filtered.map(log => {
            const evtKey = (log.event_type || 'login').toLowerCase();
            const config = this.EVENT_CONFIG[evtKey] || { icon: '📌', class: 'evt-login', label: evtKey.toUpperCase() };
            
            const logDate = log.created_at ? new Date(log.created_at) : new Date();
            const timeStr = logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = logDate.toLocaleDateString();
            const bizName = log.businesses?.name || null;

            return `
                <div class="event-log-card">
                    <div class="event-icon-avatar ${config.class}">
                        ${config.icon}
                    </div>
                    <div class="event-body-content">
                        <div class="event-top-meta">
                            <span class="event-title-text">${log.title || 'System Event'}</span>
                            <span class="event-time-stamp">${dateStr} @ ${timeStr}</span>
                        </div>
                        <div class="event-desc-text">${log.description || 'No additional details provided.'}</div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                            ${bizName ? `<span class="event-entity-tag" style="background:rgba(99,102,241,0.1); color:var(--adm-primary); border-color:rgba(99,102,241,0.2);">Entity: ${bizName}</span>` : ''}
                            <span class="event-entity-tag" style="font-size:0.65rem; opacity:0.8;">${config.label}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    exportCSV() {
        if (!this.allLogs || this.allLogs.length === 0) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast("No activity logs available to export.", "warning");
            } else {
                alert("No activity logs available to export.");
            }
            return;
        }

        const headers = ["Timestamp", "Event Type", "Title", "Description", "Business"];
        const rows = this.allLogs.map(log => [
            log.created_at ? new Date(log.created_at).toISOString() : new Date().toISOString(),
            log.event_type || 'N/A',
            `"${(log.title || '').replace(/"/g, '""')}"`,
            `"${(log.description || '').replace(/"/g, '""')}"`,
            `"${(log.businesses?.name || 'N/A').replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `REFLO-Audit-Log-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (typeof App !== 'undefined' && App.toast) {
            App.toast("Audit logs exported to CSV! 📥", "success");
        }
    },

    setupRealtime() {
        if (typeof db === 'undefined' || !db.channel) return;

        db.channel('realtime-activity-telemetry')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, async (payload) => {
                if (!payload || !payload.new) return;

                // Fetch business entity name if business_id exists
                if (payload.new.business_id) {
                    const { data: biz } = await db
                        .from('businesses')
                        .select('name, slug')
                        .eq('id', payload.new.business_id)
                        .maybeSingle();

                    payload.new.businesses = biz || null;
                }

                this.allLogs.unshift(payload.new);
                this.render();
            })
            .subscribe();
    }
};

document.addEventListener('DOMContentLoaded', () => AdminActivity.init());