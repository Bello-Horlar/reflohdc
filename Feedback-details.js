/* TITLE: assets/js/user/Feedback-details.js */

const FeedbackDetailsApp = {
    feedbackId: new URLSearchParams(window.location.search).get('id'),
    feedbackItem: null,
    biz: null,

    async init() {
        try {
            const session = await Auth.checkSession();
            if (!session || !session.user) {
                window.location.href = '../login.html';
                return;
            }

            if (!this.feedbackId) {
                window.location.href = 'feedback.html';
                return;
            }

            // Fetch Business Record with Google Maps URL
            const { data: biz, error } = await db
                .from('businesses')
                .select('id, name, google_maps_url')
                .eq('owner_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (biz) this.biz = biz;

            await this.loadDetails();
        } catch (err) {
            console.error("FeedbackDetailsApp init error:", err);
        }
    },

    async loadDetails() {
        try {
            const { data: item, error } = await db
                .from('feedback')
                .select('*')
                .eq('id', this.feedbackId)
                .maybeSingle();

            if (error || !item) {
                console.error("Could not load feedback details:", error);
                alert("Feedback record not found.");
                window.location.href = 'feedback.html';
                return;
            }

            this.feedbackItem = item;
            this.renderUI(item);
            this.checkRelatedBooking(item);
        } catch (err) {
            console.error("Error loading feedback details:", err);
        }
    },

    renderUI(item) {
        const ratingNum = parseInt(item.rating, 10) || 5;
        const isLow = ratingNum <= 3;
        const isHappy = ratingNum >= 4;
        const hasClickedGoogle = !!item.google_clicked;

        // 1. Hero Rating Card Styling
        const heroCard = document.getElementById('ratingHeroCard');
        if (heroCard) {
            heroCard.className = `rating-hero-card ${isLow ? 'rating-low' : 'rating-high'}`;
        }

        // Stars & Score
        const starStr = '★'.repeat(ratingNum) + '☆'.repeat(5 - ratingNum);
        const starEl = document.getElementById('starDisplay');
        if (starEl) {
            starEl.innerText = starStr;
            starEl.style.color = isLow ? '#ef4444' : '#f59e0b';
        }
        document.getElementById('scoreTag').innerText = `${ratingNum}.0`;

        // Overall Status Badge
        const statusBadge = document.getElementById('overallStatusBadge');
        if (statusBadge) {
            statusBadge.innerText = (item.status || 'new').replace('_', ' ');
            statusBadge.className = `status-badge-pill status-${item.status || 'new'}`;
        }

        // 2. Google Maps Status Badge & Pro-Tip
        const badgeArea = document.getElementById('googleStatusBadgeArea');
        const tipBox = document.getElementById('googleFollowupTipBox');

        if (isHappy) {
            if (hasClickedGoogle) {
                badgeArea.innerHTML = `
                    <div class="google-status-pill clicked">
                        <span>🟢</span>
                        <span>Customer Visited Google Maps to Review ✓</span>
                    </div>
                `;
                if (tipBox) tipBox.style.display = 'none';
            } else {
                badgeArea.innerHTML = `
                    <div class="google-status-pill unclicked">
                        <span>🟡</span>
                        <span>Has Not Clicked Google Link Yet</span>
                    </div>
                `;
                if (tipBox) tipBox.style.display = 'block';
            }
        } else {
            badgeArea.innerHTML = '';
            if (tipBox) tipBox.style.display = 'none';
        }

        // Feedback Quote
        document.getElementById('feedbackText').innerText = item.comment 
            ? `"${item.comment}"` 
            : 'No written comments were submitted with this rating.';

        // Submission Date
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '--';
        document.getElementById('feedbackDate').innerText = `Submitted: ${dateStr}`;

        // Priority Notice
        const urgencyEl = document.getElementById('urgencyNotice');
        if (urgencyEl) {
            urgencyEl.style.display = (isLow && item.status !== 'resolved') ? 'block' : 'none';
        }

        // Customer Contact Information
        document.getElementById('custName').innerText = item.customer_name || 'Anonymous Customer';
        document.getElementById('custPhone').innerText = item.customer_phone || 'Not provided';
        document.getElementById('custEmail').innerText = item.customer_email || 'Not provided';
        
        const hasContact = !!(item.customer_phone || item.customer_email);
        document.getElementById('contactPermission').innerText = hasContact ? 'Voluntarily Provided' : 'Anonymous Submission';

        // Setup Contact Actions (WhatsApp template adapts if customer gave 5 stars)
        this.setupContactButtons(item, isHappy, hasClickedGoogle);

        // Status Indicators
        document.getElementById('contactStatusText').innerText = (item.status === 'contacted' || item.status === 'resolved') ? 'Contacted ✓' : 'Not Contacted';
        document.getElementById('resolutionStatusText').innerText = item.status === 'resolved' ? 'Resolved ✓' : 'Unresolved';

        // 3. Dynamic Section 2 Buttons (Requirement #3)
        this.renderWorkflowButtons(item, isHappy, hasClickedGoogle);

        // Internal Notes
        document.getElementById('internalNotesInput').value = item.internal_notes || '';
    },

    setupContactButtons(item, isHappy, hasClickedGoogle) {
        const btnCall = document.getElementById('btnCall');
        const btnWhatsApp = document.getElementById('btnWhatsApp');
        const btnEmail = document.getElementById('btnEmail');
        const noContactMsg = document.getElementById('noContactMsg');

        let contactAvailable = false;

        if (item.customer_phone) {
            contactAvailable = true;
            const cleanPhone = item.customer_phone.replace(/[^0-9+]/g, '');
            btnCall.href = `tel:${cleanPhone}`;
            btnCall.style.display = 'inline-flex';

            const waPhone = cleanPhone.replace('+', '');
            let waMsg = '';

            // Smart WhatsApp Templates:
            if (isHappy && !hasClickedGoogle) {
                // Friendly Google Review invitation for satisfied customer
                const googleLink = this.biz?.google_maps_url || '';
                waMsg = encodeURIComponent(`Hello ${item.customer_name || 'there'}, thank you so much for your positive review! We're thrilled you had a great experience. If you have a quick moment, could you please tap here to share your rating on Google Maps? ${googleLink}\n\nWe truly appreciate your support! ✨`);
            } else {
                // Recovery message for low rating / issue resolution
                waMsg = encodeURIComponent(`Hello ${item.customer_name || ''}, thank you for your feedback regarding your recent visit with ${this.biz?.name || 'us'}. We would love to address your concerns and ensure you have a wonderful experience.`);
            }

            btnWhatsApp.href = `https://wa.me/${waPhone}?text=${waMsg}`;
            btnWhatsApp.style.display = 'inline-flex';
        } else {
            btnCall.style.display = 'none';
            btnWhatsApp.style.display = 'none';
        }

        if (item.customer_email) {
            contactAvailable = true;
            const subject = encodeURIComponent(`Following up on your feedback with ${this.biz?.name || 'REFLO'}`);
            const body = encodeURIComponent(`Dear ${item.customer_name || 'Customer'},\n\nThank you for sharing your feedback with us. We value your experience and appreciate your support.\n\nBest regards,\n${this.biz?.name || 'Customer Service'}`);
            btnEmail.href = `mailto:${item.customer_email}?subject=${subject}&body=${body}`;
            btnEmail.style.display = 'inline-flex';
        } else {
            btnEmail.style.display = 'none';
        }

        if (noContactMsg) {
            noContactMsg.style.display = contactAvailable ? 'none' : 'block';
        }
    },

    // Dynamic Recovery Workflow Buttons (Requirement #3)
    renderWorkflowButtons(item, isHappy, hasClickedGoogle) {
        const area = document.getElementById('dynamicWorkflowButtonsArea');
        if (!area) return;

        // SCENARIO 1: 4–5 Stars AND Clicked Google -> Only 1 Button: [Mark as Seen]
        if (isHappy && hasClickedGoogle) {
            area.innerHTML = `
                <div style="display: flex;">
                    <button type="button" id="btnMarkSeen" class="btn-primary" style="width: 100%; padding: 14px; background: #2563eb !important; font-weight: 800;" onclick="FeedbackDetailsApp.updateStatus('resolved')">
                        👁️ Mark as Seen & Acknowledged ✓
                    </button>
                </div>
            `;
        } 
        // SCENARIO 2: 1–3 Stars OR 4–5 Stars (Not Clicked Google) -> Show 2 Buttons: [Mark Contacted] & [Mark Resolved]
        else {
            area.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <button type="button" id="btnMarkContacted" class="btn-outline" style="padding: 14px; font-weight: 800;" onclick="FeedbackDetailsApp.updateStatus('contacted')">
                        🟡 Mark as Contacted
                    </button>
                    <button type="button" id="btnMarkResolved" class="btn-primary" style="padding: 14px; background: #16a34a !important; font-weight: 800;" onclick="FeedbackDetailsApp.updateStatus('resolved')">
                        🟢 Mark as Resolved ✓
                    </button>
                </div>
            `;
        }
    },

    async updateStatus(newStatus) {
        try {
            const { error } = await db
                .from('feedback')
                .update({ 
                    status: newStatus,
                    updated_at: new Date()
                })
                .eq('id', this.feedbackId);

            if (error) throw error;

            this.feedbackItem.status = newStatus;
            this.renderUI(this.feedbackItem);

            if (typeof App !== 'undefined' && App.toast) {
                App.toast(`Feedback status updated to: ${newStatus.toUpperCase()}! ✨`, "success");
            } else {
                alert(`Feedback status updated to: ${newStatus.toUpperCase()}! ✨`);
            }

        } catch (err) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('Failed to update status: ' + err.message, "error");
            } else {
                alert('Failed to update status: ' + err.message);
            }
        }
    },

    async saveNotes() {
        const notes = document.getElementById('internalNotesInput').value.trim();
        const btn = document.getElementById('btnSaveNote');
        btn.innerText = 'Saving Note...';
        btn.disabled = true;

        try {
            const { error } = await db
                .from('feedback')
                .update({ 
                    internal_notes: notes,
                    updated_at: new Date()
                })
                .eq('id', this.feedbackId);

            if (error) throw error;

            this.feedbackItem.internal_notes = notes;
            
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('Internal note saved successfully! 🔒', "success");
            } else {
                alert('Internal note saved successfully! 🔒');
            }

        } catch (err) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('Failed to save note: ' + err.message, "error");
            } else {
                alert('Failed to save note: ' + err.message);
            }
        } finally {
            btn.innerText = '💾 Save Internal Note';
            btn.disabled = false;
        }
    },

    async checkRelatedBooking(item) {
        if (!this.biz || (!item.customer_phone && !item.customer_email)) return;

        try {
            let query = db
                .from('bookings')
                .select('*')
                .eq('business_id', this.biz.id)
                .limit(1);

            if (item.customer_phone) {
                query = query.eq('customer_phone', item.customer_phone);
            } else if (item.customer_email) {
                query = query.eq('customer_email', item.customer_email);
            }

            const { data: bookings } = await query;

            if (bookings && bookings.length > 0) {
                const booking = bookings[0];
                const section = document.getElementById('relatedBookingSection');
                document.getElementById('relatedBookingService').innerText = `Appointment Booking (${(booking.status || 'pending').toUpperCase()})`;
                
                const bDate = booking.booking_date ? new Date(booking.booking_date).toDateString() : 'Date';
                const bTime = booking.booking_time ? booking.booking_time.substring(0, 5) : '';
                document.getElementById('relatedBookingDate').innerText = `${bDate} at ${bTime}`;
                
                if (section) section.style.display = 'block';
            }
        } catch (err) {
            console.warn("Related booking check notice:", err);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => FeedbackDetailsApp.init());