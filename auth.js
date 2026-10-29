/* TITLE: assets/js/auth.js */
const Auth = {
    // Helper to resolve correct relative path whether called from root or /app/ or /admin/
    getRelativePath(targetFile) {
        const path = window.location.pathname;
        if (path.includes('/app/') || path.includes('/admin/') || path.includes('/public/')) {
            return `../${targetFile}`;
        }
        return targetFile;
    },

    // 1. REGISTRATION WITH ANTI-ABUSE LOCATION SHIELD
    async signUp(email, password, fullName, bizName, googleUrl, category = 'Restaurant & Cafe', currency = 'USD') {
        try {
            const cleanEmail = (email || '').toLowerCase().trim();
            const cleanGoogleUrl = (googleUrl || '').trim();

            // Anti-abuse check for duplicate Google Maps URL
            const { data: existingBiz } = await db
                .from('businesses')
                .select('id, name')
                .eq('google_maps_url', cleanGoogleUrl)
                .maybeSingle();

            if (existingBiz) {
                throw new Error("This Google Business location is already registered. Please sign in to your original account.");
            }

            // Create Supabase Auth User
            const { data: authData, error: authError } = await db.auth.signUp({
                email: cleanEmail,
                password: password,
                options: { 
                    data: { 
                        full_name: fullName,
                        biz_name: bizName,
                        google_url: cleanGoogleUrl,
                        category: category,
                        currency: currency
                    } 
                }
            });

            if (authError) throw authError;
            const userId = authData.user?.id;
            if (!userId) throw new Error("Registration initiated. Please verify your email.");

            // Fallback for direct business initialization if trigger didn't fire
            const trialDays = (typeof REFLO_CONFIG !== 'undefined' && REFLO_CONFIG.TRIAL_DAYS) ? REFLO_CONFIG.TRIAL_DAYS : 30;
            
            try {
                await db.rpc('initialize_new_business', {
                    p_user_id: userId,
                    p_full_name: fullName,
                    p_biz_name: bizName,
                    p_google_url: cleanGoogleUrl,
                    p_currency: currency,
                    p_trial_days: trialDays
                });
            } catch(rpcErr) {
                // If the automatic handle_new_user trigger already created it, proceed smoothly
            }

            window.location.href = this.getRelativePath('app/onboarding.html');
            return authData;

        } catch (err) {
            console.error("Sign up error:", err);
            throw err;
        }
    },

    // 2. SIGN IN WITH SERVER-VERIFIED ROLE ROUTING
    async signIn(email, password) {
        try {
            const cleanEmail = (email || '').toLowerCase().trim();
            const { data, error } = await db.auth.signInWithPassword({ email: cleanEmail, password });
            if (error) throw error;

            const userId = data.user?.id;
            if (!userId) throw new Error("Authentication failed.");

            // Fetch verified server role from profiles table
            const { data: profile, error: pErr } = await db
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .maybeSingle();

            if (pErr || !profile) {
                window.location.href = this.getRelativePath('app/dashboard.html');
                return data;
            }

            // Secure Role Redirection
            if (profile.role === 'admin') {
                window.location.href = this.getRelativePath('admin/dashboard.html');
            } else {
                window.location.href = this.getRelativePath('app/dashboard.html');
            }

            return data;

        } catch (err) {
            console.error("Sign in error:", err);
            throw err;
        }
    },

    // 3. GOOGLE OAUTH ONE-CLICK SIGN IN
    async signInWithGoogle() {
        try {
            const { error } = await db.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/app/onboarding.html`
                }
            });
            if (error) throw error;
        } catch (err) {
            console.error("Google sign in error:", err);
            throw err;
        }
    },

    // 4. SIGN OUT
    async signOut() {
        try {
            await db.auth.signOut();
        } catch (e) {
            console.warn("Sign out notice:", e);
        } finally {
            window.location.href = this.getRelativePath('login.html');
        }
    },

    // 5. SESSION VERIFICATION & ACCESS GUARD (Safe from infinite redirect loops)
    async checkSession(requiredRole = null, redirectOnFail = true) {
        try {
            const { data: { session }, error } = await db.auth.getSession();
            
            if (error || !session || !session.user) {
                const isAuthPage = window.location.pathname.includes('login.html') || 
                                   window.location.pathname.includes('register.html') ||
                                   window.location.pathname.includes('index.html') ||
                                   window.location.pathname.includes('forgot-password.html');

                if (redirectOnFail && !isAuthPage) {
                    window.location.href = this.getRelativePath('login.html');
                }
                return null;
            }

            // If a specific role is required (e.g. 'admin')
            if (requiredRole) {
                const { data: profile } = await db
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (!profile || profile.role !== requiredRole) {
                    if (typeof App !== 'undefined' && App.toast) {
                        App.toast("Administrative clearance required.", "error");
                    }
                    window.location.href = this.getRelativePath('app/dashboard.html');
                    return null;
                }
            }

            return session;
        } catch (err) {
            console.error("Session check notice:", err);
            return null;
        }
    }
};