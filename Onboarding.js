/* TITLE: assets/js/user/Onboarding.js */
const OnboardingApp = {
    userId: null,
    bizId: null,
    currentPlan: 'trial',
    selectedLogoFile: null,
    DAYS_OF_WEEK: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],

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

        // Render Schedule HTML Grid
        this.renderScheduleGrid();

        // 1. Read Registration Cache
        let regData = null;
        try {
            const raw = localStorage.getItem('reflo_reg_data') || sessionStorage.getItem('reflo_reg_data');
            if (raw) regData = JSON.parse(raw);
        } catch (e) {}

        // 2. Fetch Business Record in Supabase
        let { data: biz } = await db
            .from('businesses')
            .select('*')
            .eq('owner_id', this.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (biz) {
            this.bizId = biz.id;
            this.currentPlan = biz.subscription_status || 'trial';

            // Populate inputs from Database & Cache
            document.getElementById('obBizName').value = biz.name || regData?.bizName || '';
            document.getElementById('obGoogleUrl').value = biz.google_maps_url || regData?.googleUrl || '';
            document.getElementById('obCategory').value = biz.category || regData?.category || 'Restaurant & Cafe';
            
            const currencyVal = biz.currency || regData?.currency || 'USD';
            const select = document.getElementById('obCurrency');
            const hasOption = Array.from(select.options).some(opt => opt.value === currencyVal);
            if (hasOption) {
                select.value = currencyVal;
            } else {
                select.value = 'OTHER';
                document.getElementById('customCurrencyWrap').style.display = 'block';
                document.getElementById('obCustomCurrency').value = currencyVal;
            }

            if (biz.phone || regData?.phone) document.getElementById('obPhone').value = biz.phone || regData?.phone || '';
            if (biz.address) document.getElementById('obAddress').value = biz.address;
            if (biz.website_url) document.getElementById('obWebsite').value = biz.website_url;
            if (biz.timezone) document.getElementById('obTimezone').value = biz.timezone;
            if (biz.description) document.getElementById('obDescription').value = biz.description;

            // SYNC CHECK: If logo already exists from Profile or DB, show it here!
            if (biz.logo_url) {
                const preview = document.getElementById('obLogoPreview');
                if (preview) {
                    preview.src = (typeof storage !== 'undefined' && storage.getLogoUrl) 
                        ? storage.getLogoUrl(biz.logo_url) 
                        : biz.logo_url;
                }
            }

            if (biz.operating_hours) {
                this.loadSavedSchedule(biz.operating_hours);
            }

            // Load saved media settings
            if (biz.booking_settings) {
                const allowMedia = biz.booking_settings.allow_attachments !== false;
                const mediaToggle = document.getElementById('obAllowMediaToggle');
                const reqSelect = document.getElementById('obMediaRequiredSelect');
                const typesSelect = document.getElementById('obMediaTypesSelect');
                const optionsWrap = document.getElementById('obMediaOptionsWrap');

                if (mediaToggle) mediaToggle.checked = allowMedia;
                if (reqSelect) reqSelect.value = biz.booking_settings.attachment_required ? 'compulsory' : 'optional';
                if (typesSelect) typesSelect.value = biz.booking_settings.attachment_types || 'images_only';
                if (optionsWrap) optionsWrap.style.display = allowMedia ? 'grid' : 'none';
            }

            const mediaToggleEl = document.getElementById('obAllowMediaToggle');
            if (mediaToggleEl) {
                mediaToggleEl.onchange = (e) => {
                    const wrap = document.getElementById('obMediaOptionsWrap');
                    if (wrap) wrap.style.display = e.target.checked ? 'grid' : 'none';
                };
            }

            // Navigation stepper jump
            if (biz.google_maps_url) {
                const verifiedNotice = document.getElementById('step1VerifiedNotice');
                if (verifiedNotice) verifiedNotice.style.display = 'flex';

                if (biz.phone && biz.address) {
                    this.goToStep(3);
                } else {
                    this.goToStep(2);
                }
            } else {
                this.goToStep(1);
            }
        } else {
            this.goToStep(1);
        }

        // Initialize drag & zoom gesture engine
        this.initGestureEngine();
    },

    validateMediaPlanSelection(select) {
        if (select.value === 'images_and_videos' && this.currentPlan === 'starter') {
            alert("🔒 Video Uploads require a Growth or Pro plan.\n\nYour current plan is Starter (Images Only). Upgrade anytime in Subscriptions.");
            select.value = 'images_only';
        }
    },

    handleCurrencyChange(val) {
        const wrap = document.getElementById('customCurrencyWrap');
        if (val === 'OTHER') {
            wrap.style.display = 'block';
            document.getElementById('obCustomCurrency').focus();
        } else {
            wrap.style.display = 'none';
        }
    },

    renderScheduleGrid() {
        const container = document.getElementById('workingHoursContainer');
        if (!container) return;

        container.innerHTML = this.DAYS_OF_WEEK.map(day => {
            const isSunday = day === 'Sunday';
            return `
                <div class="day-hour-row ${isSunday ? 'closed-day' : ''}" id="row-${day}">
                    <div class="day-label-group">
                        <input type="checkbox" id="chk-${day}" class="day-toggle-chk" ${isSunday ? '' : 'checked'} onchange="OnboardingApp.toggleDayRow('${day}', this.checked)">
                        <span class="day-name">${day}</span>
                    </div>
                    <div class="time-pickers-wrap">
                        <input type="time" id="open-${day}" class="time-box-input" value="09:00" ${isSunday ? 'disabled' : ''}>
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">to</span>
                        <input type="time" id="close-${day}" class="time-box-input" value="18:00" ${isSunday ? 'disabled' : ''}>
                    </div>
                </div>
            `;
        }).join('');
    },

    toggleDayRow(day, isOpen) {
        const row = document.getElementById(`row-${day}`);
        const openInput = document.getElementById(`open-${day}`);
        const closeInput = document.getElementById(`close-${day}`);

        if (isOpen) {
            row.classList.remove('closed-day');
            openInput.disabled = false;
            closeInput.disabled = false;
        } else {
            row.classList.add('closed-day');
            openInput.disabled = true;
            closeInput.disabled = true;
        }
    },

    loadSavedSchedule(savedHours) {
        this.DAYS_OF_WEEK.forEach(day => {
            const schedule = savedHours[day];
            if (schedule) {
                const chk = document.getElementById(`chk-${day}`);
                const openInput = document.getElementById(`open-${day}`);
                const closeInput = document.getElementById(`close-${day}`);

                if (chk) chk.checked = schedule.is_open;
                if (openInput && schedule.open) openInput.value = schedule.open;
                if (closeInput && schedule.close) closeInput.value = schedule.close;

                this.toggleDayRow(day, schedule.is_open);
            }
        });
    },

    collectScheduleData() {
        const schedule = {};
        this.DAYS_OF_WEEK.forEach(day => {
            const chk = document.getElementById(`chk-${day}`);
            const isOpen = chk ? chk.checked : true;
            const openTime = document.getElementById(`open-${day}`)?.value || '09:00';
            const closeTime = document.getElementById(`close-${day}`)?.value || '18:00';

            schedule[day] = {
                is_open: isOpen,
                open: isOpen ? openTime : null,
                close: isOpen ? closeTime : null
            };
        });
        return schedule;
    },

    goToStep(stepNumber) {
        document.getElementById('step1Card').style.display = stepNumber === 1 ? 'block' : 'none';
        document.getElementById('step2Card').style.display = stepNumber === 2 ? 'block' : 'none';
        document.getElementById('step3Card').style.display = stepNumber === 3 ? 'block' : 'none';

        document.getElementById('stepLabel1').className = stepNumber >= 1 ? 'active' : '';
        document.getElementById('stepLabel2').className = stepNumber >= 2 ? 'active' : '';
        document.getElementById('stepLabel3').className = stepNumber >= 3 ? 'active' : '';

        const progressPercent = stepNumber === 1 ? '33%' : stepNumber === 2 ? '66%' : '100%';
        document.getElementById('stepperProgress').style.width = progressPercent;

        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async handleStep1(e) {
        e.preventDefault();

        const btn = document.getElementById('btnStep1Next');
        const bizName = document.getElementById('obBizName').value.trim();
        const googleUrl = document.getElementById('obGoogleUrl').value.trim();
        const category = document.getElementById('obCategory').value;
        const curSelect = document.getElementById('obCurrency').value;
        
        let currency = curSelect === 'OTHER' ? (document.getElementById('obCustomCurrency').value.trim().toUpperCase() || 'USD') : curSelect;

        if (!bizName || !googleUrl) {
            App.toast("Please enter business name and Google Maps link.", "warning");
            return;
        }

        btn.innerText = "Saving Location...";
        btn.disabled = true;

        try {
            if (!this.bizId) {
                const { data: b } = await db.from('businesses').select('id').eq('owner_id', this.userId).maybeSingle();
                if (b) this.bizId = b.id;
            }

            if (this.bizId) {
                await db.from('businesses').update({
                    name: bizName,
                    google_maps_url: googleUrl,
                    category: category,
                    currency: currency,
                    updated_at: new Date()
                }).eq('id', this.bizId);
            }

            this.goToStep(2);
        } catch (err) {
            App.toast("Error: " + err.message, "error");
        } finally {
            btn.innerText = "Continue to Schedule & Hours →";
            btn.disabled = false;
        }
    },

    async handleStep2(e) {
        e.preventDefault();

        const address = document.getElementById('obAddress').value.trim();
        const phone = document.getElementById('obPhone').value.trim();
        const website = document.getElementById('obWebsite').value.trim();
        const timezone = document.getElementById('obTimezone').value;
        const bookingEnabled = document.getElementById('obBookingToggle').checked;
        const allowMedia = document.getElementById('obAllowMediaToggle') ? document.getElementById('obAllowMediaToggle').checked : true;
        const mediaRequired = document.getElementById('obMediaRequiredSelect') ? document.getElementById('obMediaRequiredSelect').value === 'compulsory' : false;
        const mediaTypes = document.getElementById('obMediaTypesSelect') ? document.getElementById('obMediaTypesSelect').value : 'images_only';
        const operatingHours = this.collectScheduleData();

        try {
            if (!this.bizId) {
                const { data: b } = await db.from('businesses').select('id').eq('owner_id', this.userId).maybeSingle();
                if (b) this.bizId = b.id;
            }

            if (this.bizId) {
                await db.from('businesses').update({
                    address: address,
                    phone: phone,
                    website_url: website,
                    timezone: timezone,
                    booking_enabled: bookingEnabled,
                    booking_settings: {
                        slot_duration: 30,
                        max_advance_days: 30,
                        allow_attachments: allowMedia,
                        attachment_required: mediaRequired,
                        attachment_types: mediaTypes
                    },
                    operating_hours: operatingHours,
                    updated_at: new Date()
                }).eq('id', this.bizId);
            }

            this.goToStep(3);
        } catch (err) {
            App.toast("Failed to save schedule: " + err.message, "error");
        }
    },

    previewLogo(input) {
        if (input.files && input.files[0]) {
            this.selectedLogoFile = input.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('obLogoPreview').src = e.target.result;
            };
            reader.readAsDataURL(this.selectedLogoFile);
        }
    },

    async handleStep3(e) {
        e.preventDefault();

        const btn = document.getElementById('btnFinishSetup');
        App.setLoading('btnFinishSetup', true, 'Saving to Database & Launching...');

        const description = document.getElementById('obDescription').value.trim();

        try {
            if (!this.bizId) {
                const { data: b } = await db.from('businesses').select('id').eq('owner_id', this.userId).maybeSingle();
                if (b) this.bizId = b.id;
            }

            let logoPath = null;
            if (this.selectedLogoFile && this.bizId) {
                logoPath = await storage.uploadLogo(this.selectedLogoFile, this.bizId);
            }

            const updates = {
                description: description,
                updated_at: new Date()
            };
            if (logoPath) updates.logo_url = logoPath;

            if (this.bizId) {
                await db.from('businesses').update(updates).eq('id', this.bizId);
            }

            localStorage.removeItem('reflo_reg_data');
            sessionStorage.removeItem('reflo_reg_data');

            App.toast("Setup complete! Welcome to REFLO. 🚀", "success");
            setTimeout(() => window.location.href = 'dashboard.html', 800);

        } catch (err) {
            App.toast("Setup error: " + err.message, "error");
            App.setLoading('btnFinishSetup', false, 'Launch Dashboard 🚀');
        }
    },

    /* ======================================================================
       INTERACTIVE LOGO INSPECT & DRAG-ZOOM VIEWER
       ====================================================================== */
    openZoomModal() {
        const preview = document.getElementById('obLogoPreview');
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

        // Mobile touch events
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

        viewport.addEventListener('touchend', (e) => {
            this.isDragging = false;
            this.initialPinchDist = 0;
            if (this.scale < 1) {
                this.resetTransform();
            }
        });

        // Mouse drag and scroll wheel
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

document.addEventListener('DOMContentLoaded', () => OnboardingApp.init());