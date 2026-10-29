/* TITLE: assets/js/public/Review.js */

const PublicReview = {
    bizSlug: null,
    businessData: null,
    selectedRating: 0,
    isAnonymous: false,

    RATING_LABELS: {
        1: '1/5 — Terrible 😞',
        2: '2/5 — Poor 😕',
        3: '3/5 — Average 😐',
        4: '4/5 — Great 😊',
        5: '5/5 — Outstanding! 🌟'
    },

    async init() {
        const params = new URLSearchParams(window.location.search);
        this.bizSlug = params.get('biz') || params.get('business');

        if (!this.bizSlug) {
            this.loadPreviewState();
            return;
        }

        await this.loadBusiness();
    },

    loadPreviewState() {
        this.bizSlug = 'sample-business';
        this.businessData = {
            id: 'demo-biz-id',
            name: 'Sample Business'
        };
        document.getElementById('reviewBizName').innerText = "Sample Business";
    },

    async loadBusiness() {
        try {
            const { data: biz, error } = await db
                .from('businesses')
                .select('id, owner_id, name, slug, logo_url, google_maps_url')
                .eq('slug', this.bizSlug)
                .maybeSingle();

            if (error || !biz) {
                document.getElementById('reviewBizName').innerText = this.bizSlug.replace(/-/g, ' ').toUpperCase();
                return;
            }

            this.businessData = biz;

            document.title = `Leave Feedback | ${biz.name}`;
            document.getElementById('reviewBizName').innerText = biz.name;

            if (biz.logo_url) {
                const logoEl = document.getElementById('reviewBizLogo');
                if (logoEl) {
                    logoEl.src = (typeof storage !== 'undefined' && storage.getLogoUrl) 
                        ? storage.getLogoUrl(biz.logo_url) 
                        : biz.logo_url;
                }
            }

        } catch (err) {
            console.error("Error loading business info:", err);
        }
    },

    setRating(stars) {
        this.selectedRating = stars;
        const buttons = document.querySelectorAll('.star-tap-btn');
        
        buttons.forEach((btn, idx) => {
            if (idx < stars) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        const label = document.getElementById('ratingLabel');
        label.innerText = this.RATING_LABELS[stars] || 'Select your rating';
        label.style.color = stars <= 3 ? '#ea580c' : '#16a34a';
    },

    toggleAnonymous(checked) {
        this.isAnonymous = checked;
        const container = document.getElementById('contactFieldsContainer');
        const nameInput = document.getElementById('custNameInput');
        const phoneInput = document.getElementById('custPhoneInput');
        const emailInput = document.getElementById('custEmailInput');

        if (checked) {
            container.style.opacity = '0.35';
            container.style.pointerEvents = 'none';
            nameInput.value = '';
            phoneInput.value = '';
            emailInput.value = '';
        } else {
            container.style.opacity = '1';
            container.style.pointerEvents = 'auto';
        }
    },

    async handleSubmit(e) {
        e.preventDefault();

        if (this.selectedRating === 0) {
            alert("Please tap a star to choose your rating (1 to 5 stars).");
            return;
        }

        const comment = document.getElementById('reviewCommentInput').value.trim();
        if (!comment) {
            alert("Please share a brief comment about your experience.");
            return;
        }

        const name = this.isAnonymous ? null : document.getElementById('custNameInput').value.trim() || null;
        const phone = this.isAnonymous ? null : document.getElementById('custPhoneInput').value.trim() || null;
        const email = this.isAnonymous ? null : document.getElementById('custEmailInput').value.trim() || null;

        const btn = document.getElementById('submitReviewBtn');
        btn.innerText = "Submitting Feedback...";
        btn.disabled = true;

        try {
            let feedbackId = 'demo-id';

            // Insert Feedback
            if (this.businessData && this.businessData.id !== 'demo-biz-id') {
                const { data: feedback, error: fbErr } = await db
                    .from('feedback')
                    .insert({
                        business_id: this.businessData.id,
                        rating: this.selectedRating,
                        comment: comment,
                        customer_name: name,
                        customer_phone: phone,
                        customer_email: email,
                        status: 'new',
                        google_clicked: false
                    })
                    .select()
                    .single();

                if (fbErr) throw fbErr;
                if (feedback) feedbackId = feedback.id;
            }

            // Clean Root Navigation to /success (Eliminates 404)
            const slug = encodeURIComponent(this.bizSlug || 'sample-business');
            const encodedComment = encodeURIComponent(comment);
            const hasPhone = phone ? 'true' : 'false';
            const isAnon = this.isAnonymous ? 'true' : 'false';

            window.location.href = `/success?type=review&biz=${slug}&rating=${this.selectedRating}&id=${feedbackId}&has_phone=${hasPhone}&anon=${isAnon}&comment=${encodedComment}`;

        } catch (err) {
            alert("Submission error: " + err.message);
            btn.innerText = "Submit Feedback";
            btn.disabled = false;
        }
    },

    returnToHub() {
        const slug = encodeURIComponent(this.bizSlug || 'sample-business');
        window.location.href = `/?biz=${slug}`;
    }
};

document.addEventListener('DOMContentLoaded', () => PublicReview.init());