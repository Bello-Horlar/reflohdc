/* TITLE: assets/js/user/Profile.js */

const ProfileApp = {
    userId: null,
    bizId: null,
    currentPlan: 'trial',

    // Gesture & Drag Zoom State
    scale: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    initialPinchDist: 0,
    initialScale: 1,
    lastTapTime: 0,

    async init() {
        const session = await Auth.checkSession();
        if (!session) return;
        this.userId = session.user.id;

        await this.loadProfileData();

        const bookingToggle = document.getElementById('bookingEnabledToggle');
        if (bookingToggle) {
            bookingToggle.onchange = (e) => {
                const subSec = document.getElementById('bookingSettingsSubSection');
                if (subSec) subSec.style.opacity = e.target.checked ? '1' : '0.4';
            };
        }

        // Initialize drag & zoom gesture engine
        this.initGestureEngine();
    },

    validateMediaPlanSelection(select) {
        if (select.value === 'images_and_videos' && this.currentPlan === 'starter') {
            App.toast("🔒 Video Uploads require a Growth or Pro plan. Upgrade in Subscriptions.", "warning");
            select.value = 'images_only';
        }
    },

    togglePasswordVisibility(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            btn.style.opacity = '1';
        } else {
            input.type = 'password';
            btn.style.opacity = '0.6';
        }
    },

    async loadProfileData() {
        try {
            // 1. Fetch Profile
            const { data: profile } = await db
                .from('profiles')
                .select('*')
                .eq('id', this.userId)
                .maybeSingle();

            // 2. Fetch Business
            const { data: biz } = await db
                .from('businesses')
                .select('*')
                .eq('owner_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (profile) {
                document.getElementById('ownerNameInput').value = profile.full_name || '';
                document.getElementById('heroOwnerName').innerText = profile.full_name || 'Owner Profile';
            }

            document.getElementById('ownerEmailInput').value = (await db.auth.getUser()).data.user?.email || '';

            if (biz) {
                this.bizId = biz.id;
                this.currentPlan = biz.subscription_status || 'trial';

                document.getElementById('heroBizName').innerText = biz.name || 'Your Business';
                document.getElementById('heroBizSlug').innerText = `@${biz.slug || 'handle'}`;

                // Auto-fill form inputs
                document.getElementById('bizNameInput').value = biz.name || '';
                document.getElementById('bizCategoryInput').value = biz.category || 'Restaurant & Cafe';
                document.getElementById('bizDescInput').value = biz.description || '';
                document.getElementById('bizAddressInput').value = biz.address || '';
                document.getElementById('bizPhoneInput').value = biz.phone || '';
                document.getElementById('bizWebsiteInput').value = biz.website_url || '';
                document.getElementById('googleMapsUrlInput').value = biz.google_maps_url || '';

                if (biz.logo_url) {
                    const preview = document.getElementById('bizLogoPreview');
                    if (preview && typeof storage !== 'undefined') {
                        preview.src = storage.getLogoUrl(biz.logo_url);
                    }
                }

                document.getElementById('bookingEnabledToggle').checked = !!biz.booking_enabled;
                if (biz.booking_settings) {
                    document.getElementById('bookingSlotDuration').value = biz.booking_settings.slot_duration || '30';
                    document.getElementById('bookingMaxAdvance').value = biz.booking_settings.max_advance_days || '30';

                    const allowMedia = biz.booking_settings.allow_attachments !== false;
                    const mediaToggle = document.getElementById('profileAllowMediaToggle');
                    const reqSelect = document.getElementById('profileMediaRequiredSelect');
                    const typesSelect = document.getElementById('profileMediaTypesSelect');
                    const optionsWrap = document.getElementById('profileMediaOptionsWrap');

                    if (mediaToggle) mediaToggle.checked = allowMedia;
                    if (reqSelect) reqSelect.value = biz.booking_settings.attachment_required ? 'compulsory' : 'optional';
                    if (typesSelect) typesSelect.value = biz.booking_settings.attachment_types || 'images_only';
                    if (optionsWrap) optionsWrap.style.display = allowMedia ? 'grid' : 'none';

                    if (mediaToggle) {
                        mediaToggle.onchange = (e) => {
                            if (optionsWrap) optionsWrap.style.display = e.target.checked ? 'grid' : 'none';
                        };
                    }
                }

                // API & Webhook Entitlements
                const isProUser = (this.currentPlan === 'pro' || this.currentPlan === 'trial');
                const lockedView = document.getElementById('apiLockedView');
                const activeView = document.getElementById('apiActiveView');

                if (isProUser) {
                    if (lockedView) lockedView.style.display = 'none';
                    if (activeView) activeView.style.display = 'block';

                    if (biz.api_key) {
                        document.getElementById('apiSecretKeyInput').value = biz.api_key;
                    }
                    if (biz.webhook_url) {
                        document.getElementById('webhookUrlInput').value = biz.webhook_url;
                    }
                    document.getElementById('webhookEnabledToggle').checked = !!biz.webhook_enabled;
                } else {
                    if (lockedView) lockedView.style.display = 'block';
                    if (activeView) activeView.style.display = 'none';
                }

            } else {
                let cached = null;
                try { cached = JSON.parse(localStorage.getItem('reflo_reg_data')); } catch(e){}
                if (cached) {
                    if (cached.bizName) document.getElementById('bizNameInput').value = cached.bizName;
                    if (cached.googleUrl) document.getElementById('googleMapsUrlInput').value = cached.googleUrl;
                    if (cached.phone) document.getElementById('bizPhoneInput').value = cached.phone;
                    if (cached.category) document.getElementById('bizCategoryInput').value = cached.category;
                }
            }

            if (profile?.notification_preferences) {
                document.getElementById('notifLowRatingToggle').checked = profile.notification_preferences.low_rating !== false;
                document.getElementById('notifNewBookingToggle').checked = profile.notification_preferences.new_booking !== false;
                document.getElementById('notifBillingToggle').checked = profile.notification_preferences.billing !== false;
            }

        } catch (err) {
            console.error("Profile load notice:", err);
        }
    },

    async handleLogoUpload(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        if (!file.type.startsWith('image/')) {
            App.toast("Please select an image file.", "warning");
            return;
        }

        try {
            const preview = document.getElementById('bizLogoPreview');
            preview.style.opacity = '0.5';

            if (!this.bizId) {
                const { data: b } = await db.from('businesses').select('id').eq('owner_id', this.userId).maybeSingle();
                if (b) this.bizId = b.id;
            }

            const filePath = await storage.uploadLogo(file, this.bizId || this.userId);

            if (this.bizId) {
                await db.from('businesses').update({ logo_url: filePath, updated_at: new Date() }).eq('id', this.bizId);
            }

            preview.src = storage.getLogoUrl(filePath);
            preview.style.opacity = '1';
            App.toast("Logo updated successfully! ✨", "success");
        } catch (err) {
            App.toast("Logo upload failed: " + err.message, "error");
            document.getElementById('bizLogoPreview').style.opacity = '1';
        }
    },

    /* API & DEVELOPER METHODS */
    async generateApiKey() {
        if (!confirm("Are you sure you want to generate a new Secret API Key? Any previous integration using the old key will need to be updated.")) return;

        const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(24)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const newKey = `reflo_live_${randomHex}`;

        try {
            if (this.bizId) {
                const { error } = await db.from('businesses').update({ api_key: newKey, updated_at: new Date() }).eq('id', this.bizId);
                if (error) throw error;
            }

            const keyInput = document.getElementById('apiSecretKeyInput');
            keyInput.value = newKey;
            keyInput.type = 'text';
            App.toast("New API Key generated & saved! 🔑", "success");
        } catch (err) {
            App.toast("Failed to generate API Key: " + err.message, "error");
        }
    },

    toggleApiKeyVisibility(btn) {
        const input = document.getElementById('apiSecretKeyInput');
        if (!input || !input.value) return;
        if (input.type === 'password') {
            input.type = 'text';
            btn.innerText = '🙈 Hide';
        } else {
            input.type = 'password';
            btn.innerText = '👁️ Show';
        }
    },

    copyApiKey() {
        const input = document.getElementById('apiSecretKeyInput');
        if (!input || !input.value) {
            App.toast("No API Key generated yet. Click Generate first.", "warning");
            return;
        }

        navigator.clipboard.writeText(input.value)
            .then(() => App.toast("API Key copied to clipboard! 📋", "success"))
            .catch(() => App.toast("Could not copy key.", "error"));
    },

    async testWebhook() {
        const url = document.getElementById('webhookUrlInput').value.trim();
        if (!url || !url.startsWith('http')) {
            App.toast("Please enter a valid webhook URL (e.g. https://...)", "warning");
            return;
        }

        App.toast("Dispatching test payload...", "info");

        const testPayload = {
            event: "test.ping",
            timestamp: new Date().toISOString(),
            business_name: document.getElementById('bizNameInput').value.trim(),
            message: "REFLO Webhook connection successful! 🚀",
            sample_data: {
                rating: 5,
                customer_name: "Test Customer",
                comment: "Great experience with REFLO!"
            }
        };

        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                mode: 'no-cors',
                body: JSON.stringify(testPayload)
            });

            App.toast("Test payload sent! Check your Zapier / Make inbox. ✨", "success");
        } catch (err) {
            App.toast("Webhook test failed: " + err.message, "error");
        }
    },

    async saveAllProfileData() {
        App.setLoading('saveProfileBtn', true, 'Saving Changes...');

        try {
            if (!this.bizId) {
                const { data: b } = await db.from('businesses').select('id').eq('owner_id', this.userId).maybeSingle();
                if (b) this.bizId = b.id;
            }

            const ownerName = document.getElementById('ownerNameInput').value.trim();
            const bizName = document.getElementById('bizNameInput').value.trim();
            const category = document.getElementById('bizCategoryInput').value;
            const description = document.getElementById('bizDescInput').value.trim();
            const address = document.getElementById('bizAddressInput').value.trim();
            const phone = document.getElementById('bizPhoneInput').value.trim();
            const website = document.getElementById('bizWebsiteInput').value.trim();
            const googleUrl = document.getElementById('googleMapsUrlInput').value.trim();

            const bookingEnabled = document.getElementById('bookingEnabledToggle').checked;
            const slotDuration = document.getElementById('bookingSlotDuration').value;
            const maxAdvance = document.getElementById('bookingMaxAdvance').value;
            const allowMedia = document.getElementById('profileAllowMediaToggle') ? document.getElementById('profileAllowMediaToggle').checked : true;
            const mediaRequired = document.getElementById('profileMediaRequiredSelect') ? document.getElementById('profileMediaRequiredSelect').value === 'compulsory' : false;
            let mediaTypes = document.getElementById('profileMediaTypesSelect') ? document.getElementById('profileMediaTypesSelect').value : 'images_only';

            const webhookUrl = document.getElementById('webhookUrlInput') ? document.getElementById('webhookUrlInput').value.trim() : null;
            const webhookEnabled = document.getElementById('webhookEnabledToggle') ? document.getElementById('webhookEnabledToggle').checked : false;

            if (mediaTypes === 'images_and_videos' && this.currentPlan === 'starter') {
                mediaTypes = 'images_only';
                document.getElementById('profileMediaTypesSelect').value = 'images_only';
                App.toast("Starter plan does not support video uploads. Reverted to Images Only.", "warning");
            }

            const notifPrefs = {
                low_rating: document.getElementById('notifLowRatingToggle').checked,
                new_booking: document.getElementById('notifNewBookingToggle').checked,
                billing: document.getElementById('notifBillingToggle').checked
            };

            // 1. Update Profile
            await db.from('profiles').update({
                full_name: ownerName,
                notification_preferences: notifPrefs
            }).eq('id', this.userId);

            // 2. Update Business (Permanently sets currency to USD)
            if (this.bizId) {
                await db.from('businesses').update({
                    name: bizName,
                    category: category,
                    description: description,
                    address: address,
                    phone: phone,
                    website_url: website,
                    google_maps_url: googleUrl,
                    currency: 'USD',
                    booking_enabled: bookingEnabled,
                    booking_settings: { 
                        slot_duration: slotDuration, 
                        max_advance_days: maxAdvance,
                        allow_attachments: allowMedia,
                        attachment_required: mediaRequired,
                        attachment_types: mediaTypes
                    },
                    webhook_url: webhookUrl,
                    webhook_enabled: webhookEnabled,
                    updated_at: new Date()
                }).eq('id', this.bizId);
            }

            document.getElementById('heroBizName').innerText = bizName;
            document.getElementById('heroOwnerName').innerText = ownerName;

            App.toast("Profile changes saved! ✨", "success");

        } catch (err) {
            App.toast("Failed to save: " + err.message, "error");
        } finally {
            App.setLoading('saveProfileBtn', false, 'Save All Changes');
        }
    },

    async updatePassword() {
        const newPass = document.getElementById('newPasswordInput').value;
        const confirmPass = document.getElementById('confirmPasswordInput').value;

        if (!newPass || newPass.length < 8) {
            App.toast("Password must be at least 8 characters.", "warning");
            return;
        }
        if (newPass !== confirmPass) {
            App.toast("Passwords do not match.", "warning");
            return;
        }

        try {
            const { error } = await db.auth.updateUser({ password: newPass });
            if (error) throw error;

            document.getElementById('newPasswordInput').value = '';
            document.getElementById('confirmPasswordInput').value = '';
            App.toast("Password updated securely! 🔒", "success");
        } catch (err) {
            App.toast("Password update failed: " + err.message, "error");
        }
    },

    /* GESTURE & PINCH-ZOOM */
    openZoomModal() {
        const preview = document.getElementById('bizLogoPreview');
        const modal = document.getElementById('imageZoomModal');
        const targetImg = document.getElementById('zoomTargetImg');

        if (!preview || !modal || !targetImg) return;

        targetImg.src = preview.src;
        this.resetTransform();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeZoomModal() {
        const modal = document.getElementById('imageZoomModal');
        if (modal) modal.classList.remove('active');
        this.resetTransform();
        document.body.style.overflow = '';
    },

    resetTransform() {
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.updateTransform(true);
    },

    updateTransform(smooth = false) {
        const img = document.getElementById('zoomTargetImg');
        if (!img) return;
        img.style.transition = smooth ? 'transform 0.25s ease-out' : 'none';
        img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    },

    initGestureEngine() {
        const viewport = document.getElementById('zoomViewport');
        const modal = document.getElementById('imageZoomModal');
        if (!viewport || !modal) return;

        viewport.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const now = Date.now();
                if (now - this.lastTapTime < 300) {
                    if (this.scale > 1) {
                        this.resetTransform();
                    } else {
                        this.scale = 2.5;
                        this.updateTransform(true);
                    }
                    this.lastTapTime = 0;
                    return;
                }
                this.lastTapTime = now;

                this.isDragging = true;
                this.startX = e.touches[0].clientX - this.panX;
                this.startY = e.touches[0].clientY - this.panY;

            } else if (e.touches.length === 2) {
                this.isDragging = false;
                this.initialPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.initialScale = this.scale;
            }
        }, { passive: false });

        viewport.addEventListener('touchmove', (e) => {
            e.preventDefault();

            if (e.touches.length === 1 && this.isDragging) {
                this.panX = e.touches[0].clientX - this.startX;
                this.panY = e.touches[0].clientY - this.startY;
                this.updateTransform(false);

            } else if (e.touches.length === 2 && this.initialPinchDist > 0) {
                const currentDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const factor = currentDist / this.initialPinchDist;
                this.scale = Math.min(Math.max(0.8, this.initialScale * factor), 4.5);
                this.updateTransform(false);
            }
        }, { passive: false });

        viewport.addEventListener('touchend', () => {
            this.isDragging = false;
            this.initialPinchDist = 0;
            if (this.scale < 1) {
                this.resetTransform();
            }
        });

        viewport.addEventListener('mousedown', (e) => {
            if (e.target.tagName !== 'IMG') {
                this.closeZoomModal();
                return;
            }
            this.isDragging = true;
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.panX = e.clientX - this.startX;
            this.panY = e.clientY - this.startY;
            this.updateTransform(false);
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.3 : -0.3;
            this.scale = Math.min(Math.max(1, this.scale + delta), 4.5);
            if (this.scale === 1) {
                this.panX = 0;
                this.panY = 0;
            }
            this.updateTransform(true);
        }, { passive: false });
    }
};

document.addEventListener('DOMContentLoaded', () => ProfileApp.init());