/* TITLE: assets/js/public/Flow.js */

const PublicFlow = {
    bizSlug: null,

    // Gesture & Drag Engine State
    scale: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    initialPinchDist: 0,
    initialScale: 1,
    lastTapTime: 0,

    getSlugFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const querySlug = params.get('biz') || params.get('business');
        if (querySlug) return querySlug.trim();

        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        const rIndex = pathSegments.indexOf('r');
        if (rIndex !== -1 && pathSegments[rIndex + 1]) {
            return decodeURIComponent(pathSegments[rIndex + 1].trim());
        }

        return null;
    },

    async init() {
        this.bizSlug = this.getSlugFromUrl();

        // 1. MASK URL BAR: Hide "/public/flow.html" completely
        if (this.bizSlug && window.location.pathname.includes('flow.html')) {
            const cleanUrl = `${window.location.origin}/?biz=${encodeURIComponent(this.bizSlug)}`;
            window.history.replaceState({}, document.title, cleanUrl);
        }

        // 2. Configure Action Buttons (Preserve correct .html file paths)
        const reviewBtn = document.getElementById('btnLeaveFeedback');
        const bookingBtn = document.getElementById('btnBookVisit');

        if (this.bizSlug) {
            const cleanSlug = encodeURIComponent(this.bizSlug);
            if (reviewBtn) reviewBtn.href = `review.html?biz=${cleanSlug}`;
            if (bookingBtn) bookingBtn.href = `booking.html?biz=${cleanSlug}`;
        } else {
            if (reviewBtn) reviewBtn.href = `review.html?biz=sample-business`;
            if (bookingBtn) bookingBtn.href = `booking.html?biz=sample-business`;
        }

        // 3. Fetch Business Data & Attach Gesture Controls
        if (this.bizSlug && typeof db !== 'undefined') {
            await this.fetchBusinessData();
        }

        this.initGestureEngine();
    },

    async fetchBusinessData() {
        try {
            let biz = null;

            // 1. Safe query: select('*') prevents PGRST204 errors from missing columns
            const { data, error } = await db
                .from('businesses')
                .select('*')
                .eq('slug', this.bizSlug)
                .maybeSingle();

            if (!error && data) {
                biz = data;
            } else {
                // Guaranteed fallback: fetch core columns if select('*') has restrictions
                const fallback = await db
                    .from('businesses')
                    .select('name, description, logo_url')
                    .eq('slug', this.bizSlug)
                    .maybeSingle();
                if (fallback.data) {
                    biz = fallback.data;
                }
            }

            if (!biz) {
                console.warn("Could not find business profile for slug:", this.bizSlug);
                return;
            }

            // 2. Update Title and Business Info
            document.title = `${biz.name} | Customer Hub`;
            
            const nameEl = document.getElementById('bizHubName');
            if (nameEl && biz.name) {
                nameEl.innerText = biz.name;
            }
            
            const descEl = document.getElementById('bizHubDesc');
            if (descEl && biz.description) {
                descEl.innerText = biz.description;
            }

            // 3. Update Logo
            const logoEl = document.getElementById('bizHubLogo');
            if (logoEl && biz.logo_url) {
                if (typeof storage !== 'undefined' && storage.getLogoUrl) {
                    logoEl.src = storage.getLogoUrl(biz.logo_url);
                } else {
                    logoEl.src = biz.logo_url;
                }
            }

            // 4. Update Location Badge (Supports 'location', 'address', 'city', or 'category')
            const locBadge = document.getElementById('bizHubLocationBadge');
            const locText = document.getElementById('bizHubLocationText');

            let displayLocation = biz.location || [biz.address, biz.city, biz.state].filter(Boolean).join(', ') || biz.address || biz.city || '';
            
            if (!displayLocation && biz.category) {
                displayLocation = `Verified ${biz.category}`;
            }

            if (displayLocation && locBadge && locText) {
                locText.innerText = displayLocation;
                locBadge.style.display = 'inline-flex';
            }

        } catch (err) {
            console.warn("Public flow loader notice:", err);
        }
    },

    /* ======================================================================
       GESTURE-BASED DRAG & PINCH-ZOOM ENGINE
       ====================================================================== */
    openZoomModal() {
        const logo = document.getElementById('bizHubLogo');
        const modal = document.getElementById('imageZoomModal');
        const targetImg = document.getElementById('zoomTargetImg');

        if (!logo || !modal || !targetImg) return;

        targetImg.src = logo.src;
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

        // 1. TOUCH EVENTS (Mobile / Tablets)
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

        // 2. MOUSE DRAG & SCROLL-WHEEL (PC / Laptop)
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

document.addEventListener('DOMContentLoaded', () => PublicFlow.init());