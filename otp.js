/* TITLE: assets/js/otp.js */
/* REFLO Universal 20-Minute OTP Client Engine (Signup & Recovery) */

const RefloOTP = {
    EXPIRY_MINUTES: 20,

    // 1. Request OTP for Signup OR Password Recovery
    async requestOtp(email, type = 'signup') {
        const cleanEmail = (email || '').toLowerCase().trim();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            throw new Error("Please enter a valid email address.");
        }

        const client = typeof db !== 'undefined' ? db : (typeof supabase !== 'undefined' ? supabase : window.supabase);
        if (!client) {
            throw new Error("Supabase client is not initialized.");
        }

        try {
            let error = null;

            if (type === 'recovery') {
                // Dispatches the "Reset Password" email template via Gmail SMTP
                const res = await client.auth.resetPasswordForEmail(cleanEmail);
                error = res.error;
            } else {
                // Dispatches the "Signup / Magic Link OTP" email template via Gmail SMTP
                const res = await client.auth.signInWithOtp({
                    email: cleanEmail,
                    options: { shouldCreateUser: true }
                });
                error = res.error;
            }

            if (error) throw error;

            const expiresAt = Date.now() + (this.EXPIRY_MINUTES * 60 * 1000);
            this.saveActiveSession(cleanEmail, type, expiresAt);

            return {
                success: true,
                email: cleanEmail,
                isReused: false,
                expiresAt: expiresAt,
                minutesRemaining: this.EXPIRY_MINUTES
            };

        } catch (err) {
            console.error("RefloOTP request error:", err);
            throw new Error(err.message || "Failed to send verification code.");
        }
    },

    // 2. Verify OTP for Signup OR Recovery
    async verifyOtp(email, code, type = 'signup') {
        const cleanEmail = (email || '').toLowerCase().trim();
        const cleanCode = (code || '').trim();

        if (!cleanCode || cleanCode.length !== 6) {
            throw new Error("Please enter the complete 6-digit code.");
        }

        const client = typeof db !== 'undefined' ? db : (typeof supabase !== 'undefined' ? supabase : window.supabase);
        if (!client) {
            throw new Error("Supabase client is not initialized.");
        }

        try {
            // Verifies the code with Supabase Auth
            const { data, error } = await client.auth.verifyOtp({
                email: cleanEmail,
                token: cleanCode,
                type: type === 'recovery' ? 'recovery' : 'email'
            });

            if (error) throw error;

            this.clearActiveSession();
            return true;
        } catch (err) {
            console.error("RefloOTP verification error:", err);
            throw new Error(err.message || "Invalid or expired verification code.");
        }
    },

    // 3. Persistent Session Management
    saveActiveSession(email, type, expiresAt) {
        const sessionPayload = {
            email: email,
            type: type,
            expiresAt: expiresAt || (Date.now() + this.EXPIRY_MINUTES * 60 * 1000)
        };
        localStorage.setItem('reflo_active_otp_session', JSON.stringify(sessionPayload));
    },

    getActiveSession(type = null) {
        const raw = localStorage.getItem('reflo_active_otp_session');
        if (!raw) return null;

        try {
            const session = JSON.parse(raw);
            const now = Date.now();

            if (now > session.expiresAt || (type && session.type !== type)) {
                this.clearActiveSession();
                return null;
            }

            const remainingSeconds = Math.max(0, Math.floor((session.expiresAt - now) / 1000));
            return {
                email: session.email,
                type: session.type,
                expiresAt: session.expiresAt,
                remainingSeconds: remainingSeconds
            };
        } catch (e) {
            this.clearActiveSession();
            return null;
        }
    },

    clearActiveSession() {
        localStorage.removeItem('reflo_active_otp_session');
    }
};

window.RefloOTP = RefloOTP;