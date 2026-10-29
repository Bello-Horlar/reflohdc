/* TITLE: assets/js/supabase.js */
/**
 * REFLO SUPABASE CORE ENGINE
 * Globally binds 'window.db' and 'window.storage' for all pages
 * Requires: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */

// 1. SAFE CLIENT INITIALIZATION (Ensures non-blocking global attachment)
let refloClient = null;

function initSupabaseClient() {
    if (typeof supabase !== 'undefined' && typeof REFLO_CONFIG !== 'undefined') {
        if (!refloClient) {
            try {
                refloClient = supabase.createClient(
                    REFLO_CONFIG.SUPABASE_URL, 
                    REFLO_CONFIG.SUPABASE_ANON_KEY,
                    {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    }
                );
                window.refloDb = refloClient;
                window.db = refloClient;
            } catch (e) {
                console.error("REFLO: Supabase client initialization error:", e);
            }
        }
    }
    return refloClient;
}

// Initialize immediately
initSupabaseClient();

// ============================================================================
// 2. MASTER STORAGE, REAL-TIME & DATABASE UTILITIES
// ============================================================================
const SupabaseService = {
    
    // 1. Get Public Logo URL (Handles default avatar & full URLs cleanly)
    getLogoUrl(path) {
        if (!path) return (typeof REFLO_CONFIG !== 'undefined' ? REFLO_CONFIG.DEFAULT_AVATAR : '/assets/images/default-business-logo.png');
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        
        const client = window.db || initSupabaseClient();
        if (!client) return (typeof REFLO_CONFIG !== 'undefined' ? REFLO_CONFIG.DEFAULT_AVATAR : '');
        
        const { data } = client.storage.from('logos').getPublicUrl(path);
        return data.publicUrl;
    },

    // 2. Get Support Chat Image URL
    getSupportImageUrl(path) {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://')) return path;

        const client = window.db || initSupabaseClient();
        if (!client) return '';

        const { data } = client.storage.from('support-images').getPublicUrl(path);
        return data.publicUrl;
    },

    // 3. Upload Business Logo (to 'logos' bucket)
    async uploadLogo(file, businessId) {
        const client = window.db || initSupabaseClient();
        if (!client) throw new Error("Database client offline.");

        const fileExt = file.name.split('.').pop();
        const fileName = `${businessId}-${Date.now()}.${fileExt}`;
        const filePath = `business-logos/${fileName}`;

        const { error: uploadError } = await client.storage
            .from('logos')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;
        return filePath;
    },

    // 4. Upload Support Attachment (to 'support-images' bucket)
    async uploadSupportImage(file, userId) {
        const client = window.db || initSupabaseClient();
        if (!client) throw new Error("Database client offline.");

        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}-${Date.now()}.${fileExt}`;
        const filePath = `chat-images/${fileName}`;

        const { error: uploadError } = await client.storage
            .from('support-images')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;
        return filePath;
    },

    // 5. Real-Time Listener for Urgent Low Ratings (1-3 Stars)
    subscribeToFeedback(businessId, callback) {
        const client = window.db || initSupabaseClient();
        if (!client) return null;

        return client
            .channel(`low-rating-${businessId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'feedback',
                filter: `business_id=eq.${businessId}`
            }, (payload) => {
                if (payload.new.rating <= 3) {
                    callback(payload.new);
                }
            })
            .subscribe();
    },

    // 6. Resilient Business Status Query
    async getBusinessStatus(ownerId) {
        const client = window.db || initSupabaseClient();
        if (!client) return null;

        const { data, error } = await client
            .from('businesses')
            .select('*')
            .eq('owner_id', ownerId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("Could not retrieve business status:", error);
            return null;
        }
        return data;
    }
};

// 3. EXPLICIT GLOBAL BINDINGS (Accessible to all scripts and pages)
window.storage = SupabaseService;
window.refloDb = window.db || refloClient;
window.db = window.db || refloClient;

const db = window.db;
const storage = window.storage;