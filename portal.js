/* TITLE: assets/js/portal.js */
/* Dynamic Header & Safe Logout Controller */

const TopPortalApp = {
    async render() {
        const wrapper = document.getElementById('topPortalWrapper');
        if (!wrapper) return;

        const client = typeof db !== 'undefined' ? db : (typeof supabase !== 'undefined' ? supabase : window.supabase);
        if (!client) return;

        try {
            const { data: { user }, error: authErr } = await client.auth.getUser();
            if (authErr || !user) {
                wrapper.innerHTML = '';
                return;
            }

            // Check if user is admin via database
            let isAdmin = false;
            const { data: adminStatus } = await client.rpc('is_admin');

            if (typeof adminStatus === 'boolean') {
                isAdmin = adminStatus;
            } else {
                const { data: profile } = await client
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .maybeSingle();

                if (profile && profile.role === 'admin') {
                    isAdmin = true;
                }
            }

            if (isAdmin) {
                // DO NOT CREATE DUPLICATE: Keep existing purple admin button, render nothing extra
                wrapper.innerHTML = '';
            } else {
                // NON-ADMIN: Show Red Log Out Button in the middle
                wrapper.innerHTML = `
                    <button type="button" class="btn-top-logout" onclick="TopPortalApp.promptLogout()">
                        🚪 Log Out
                    </button>
                `;
            }

        } catch (err) {
            console.error("TopPortalApp error:", err);
        }
    },

    // 1. Open confirmation popup
    promptLogout() {
        const modal = document.getElementById('refloLogoutModal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            // Fallback if modal HTML isn't added yet
            if (confirm("Are you sure you want to log out of your dashboard?")) {
                this.executeLogout();
            }
        }
    },

    // 2. Cancel and stay on dashboard
    cancelLogout() {
        const modal = document.getElementById('refloLogoutModal');
        if (modal) modal.style.display = 'none';
    },

    // 3. Confirm and redirect to login page
    async executeLogout() {
        const client = typeof db !== 'undefined' ? db : (typeof supabase !== 'undefined' ? supabase : window.supabase);
        try {
            if (client) {
                await client.auth.signOut();
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'login.html';
        } catch (err) {
            console.error("Logout failed:", err);
            window.location.href = 'login.html';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => TopPortalApp.render());