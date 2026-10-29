/* TITLE: assets/js/user/Bookings.js */

const BookingsApp = {
    userId: null,
    bizId: null,
    allBookings: [],
    currentFilter: 'all',
    activeBookingId: null,

    // Gallery state
    currentMediaList: [],
    currentMediaIndex: 0,
    zoomScale: 1,
    zoomTranslateX: 0,
    zoomTranslateY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,

    async init() {
        const session = await Auth.checkSession();
        if (!session) return;
        this.userId = session.user.id;

        // 1. Automatically clear booking notifications from the Bell & Alerts badge
        await this.clearBookingNotifications(this.userId);

        // 2. Fetch Business Info
        const { data: biz } = await db
            .from('businesses')
            .select('id')
            .eq('owner_id', this.userId)
            .single();

        if (!biz) return;
        this.bizId = biz.id;

        await this.loadBookings();
        this.setupRealtime();
        this.bindZoomSliderEvents();
    },

    async clearBookingNotifications(userId) {
        try {
            await db
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .in('type', ['new_booking', 'booking_status']);
        } catch (err) {
            console.warn("Notice clearing booking notifications:", err);
        }
    },

    async loadBookings() {
        const { data, error } = await db
            .from('bookings')
            .select('*')
            .eq('business_id', this.bizId)
            .order('booking_date', { ascending: false })
            .order('booking_time', { ascending: false });

        if (error) {
            console.error("Error loading bookings:", error);
            return;
        }

        this.allBookings = data || [];
        this.render();
    },

    setFilter(filter, btn) {
        this.currentFilter = filter;
        document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.render();
    },

    render() {
        const container = document.getElementById('bookings-feed-list');
        if (!container) return;

        const today = new Date().toISOString().split('T')[0];

        let filtered = this.allBookings;
        if (this.currentFilter === 'pending') {
            filtered = this.allBookings.filter(b => b.status === 'pending');
        } else if (this.currentFilter === 'upcoming') {
            filtered = this.allBookings.filter(b => b.status === 'confirmed' && b.booking_date >= today);
        } else if (this.currentFilter === 'completed') {
            filtered = this.allBookings.filter(b => b.status === 'completed');
        } else if (this.currentFilter === 'cancelled') {
            filtered = this.allBookings.filter(b => b.status === 'cancelled');
        }

        if (filtered.length === 0) {
            const emptyStateConfig = {
                all: {
                    icon: '📅',
                    title: 'No appointment records found',
                    desc: 'Customer booking requests will appear here automatically in real time.'
                },
                pending: {
                    icon: '⏳',
                    title: 'No pending requests',
                    desc: 'You have no awaiting appointments requiring confirmation at this time.'
                },
                upcoming: {
                    icon: '📅',
                    title: 'No upcoming visits scheduled',
                    desc: 'Confirmed appointments for today and future dates will appear here.'
                },
                completed: {
                    icon: '✓',
                    title: 'No completed appointments yet',
                    desc: 'Appointments you mark as completed will be archived here for your records.'
                },
                cancelled: {
                    icon: '✕',
                    title: 'No cancelled appointments',
                    desc: 'Cancelled customer bookings will be logged here for your history.'
                }
            }[this.currentFilter] || {
                icon: '📋',
                title: 'No bookings found',
                desc: 'No records match the selected filter.'
            };

            container.innerHTML = `
                <div class="settings-card" style="text-align: center; padding: 45px 20px; background: var(--bg-card); border-radius: 24px; border: 1px solid var(--border);">
                    <div style="font-size: 2.2rem; margin-bottom: 10px;">${emptyStateConfig.icon}</div>
                    <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 6px; color: var(--text-main);">${emptyStateConfig.title}</h3>
                    <p class="text-muted" style="font-size: 0.85rem; margin: 0; max-width: 380px; margin: 0 auto;">${emptyStateConfig.desc}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(bk => {
            const formattedDate = new Date(bk.booking_date).toLocaleDateString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
            });

            return `
                <div class="booking-card-item">
                    <div class="bk-top-row">
                        <div>
                            <div class="bk-customer-name">${bk.customer_name}</div>
                            <span class="bk-service-tag">${bk.service_name || 'General Appointment'}</span>
                        </div>
                        <span class="status-badge status-${bk.status}">${bk.status}</span>
                    </div>

                    <div class="bk-meta-grid">
                        <div class="bk-meta-item">
                            <small>Date & Time</small>
                            <strong>${formattedDate} @ ${bk.booking_time}</strong>
                        </div>
                        <div class="bk-meta-item">
                            <small>Contact</small>
                            <strong>${bk.customer_phone || bk.customer_email || 'No contact provided'}</strong>
                        </div>
                    </div>

                    ${bk.customer_notes ? `<p class="text-muted" style="font-size:0.8rem; margin-bottom:15px; font-style:italic;">"${bk.customer_notes}"</p>` : ''}

                    ${bk.media_attachments && bk.media_attachments.length > 0 ? `
                        <div style="margin-bottom: 16px; padding: 12px 14px; background: var(--bg-body); border-radius: 16px; border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <small style="font-weight: 800; text-transform: uppercase; font-size: 0.68rem; color: var(--text-muted); display: flex; align-items: center; gap: 5px;">
                                    📎 Attached Media (${bk.media_attachments.length})
                                </small>
                                <span style="font-size: 0.7rem; color: var(--primary); font-weight: 800;">
                                    Tap image to inspect
                                </span>
                            </div>
                            <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none;">
                                ${bk.media_attachments.map((m, idx) => m.type === 'video' ? `
                                    <div onclick='BookingsApp.openMediaViewer(${JSON.stringify(bk.media_attachments).replace(/'/g, "&apos;")}, ${idx})' title="Click to inspect video" style="width: 62px; height: 62px; border-radius: 12px; background: #0f172a; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0; cursor: pointer; border: 1.5px solid var(--border); position: relative; box-shadow: var(--shadow);">
                                        🎥
                                        <span style="position: absolute; bottom: 2px; font-size: 0.55rem; font-weight: 900; background: rgba(0,0,0,0.6); padding: 1px 4px; border-radius: 4px;">VIDEO</span>
                                    </div>
                                ` : `
                                    <div onclick='BookingsApp.openMediaViewer(${JSON.stringify(bk.media_attachments).replace(/'/g, "&apos;")}, ${idx})' title="Click to inspect image #${idx + 1}" style="width: 62px; height: 62px; border-radius: 12px; overflow: hidden; border: 1.5px solid var(--border); flex-shrink: 0; cursor: pointer; background: var(--bg-card); position: relative; box-shadow: var(--shadow);">
                                        <img src="${m.url}" style="width: 100%; height: 100%; object-fit: cover; display: block;" loading="lazy">
                                        <span style="position: absolute; bottom: 2px; right: 2px; font-size: 0.55rem; font-weight: 900; background: rgba(0,0,0,0.7); color: #fff; padding: 1px 5px; border-radius: 4px;">#${idx + 1}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="bk-actions-row">
                        ${bk.status === 'pending' ? `
                            <button class="btn-action-sm btn-action-confirm" onclick="BookingsApp.updateStatus('${bk.id}', 'confirmed')">✓ Confirm</button>
                        ` : ''}

                        ${bk.status === 'confirmed' ? `
                            <button class="btn-action-sm btn-action-complete" onclick="BookingsApp.updateStatus('${bk.id}', 'completed')">✓ Complete</button>
                        ` : ''}

                        ${bk.status !== 'completed' && bk.status !== 'cancelled' ? `
                            <button class="btn-action-sm" onclick="BookingsApp.openRescheduleModal('${bk.id}', '${bk.customer_name}', '${bk.booking_date}', '${bk.booking_time}')">📅 Reschedule</button>
                            <button class="btn-action-sm btn-action-cancel" onclick="BookingsApp.updateStatus('${bk.id}', 'cancelled')">✕ Cancel</button>
                        ` : ''}

                        <button class="btn-action-sm" onclick="BookingsApp.openContactModal('${bk.customer_name}', '${bk.customer_phone || ''}', '${bk.customer_email || ''}')">📞 Contact</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    async updateStatus(id, newStatus) {
        const confirmMsg = `Are you sure you want to mark this appointment as ${newStatus.toUpperCase()}?`;
        if (!confirm(confirmMsg)) return;

        try {
            const { error } = await db
                .from('bookings')
                .update({ status: newStatus, updated_at: new Date() })
                .eq('id', id);

            if (error) throw error;

            const item = this.allBookings.find(b => b.id === id);
            if (item) item.status = newStatus;

            this.render();

            const statusMessages = {
                completed: "✓ Appointment completed. Service record updated.",
                confirmed: "✓ Appointment confirmed and locked on schedule.",
                cancelled: "Appointment marked as cancelled."
            };

            if (typeof App !== 'undefined' && App.toast) {
                App.toast(statusMessages[newStatus] || `Status updated to ${newStatus}`, "success");
            }

        } catch (err) {
            alert("Status update failed: " + err.message);
        }
    },

    openRescheduleModal(id, customerName, currentDate, currentTime) {
        this.activeBookingId = id;
        document.getElementById('rescheduleCustomerName').innerText = `Rescheduling for ${customerName}`;
        document.getElementById('rescheduleDateInput').value = currentDate;
        document.getElementById('rescheduleTimeInput').value = currentTime;
        document.getElementById('rescheduleModal').classList.add('active');
    },

    closeRescheduleModal() {
        this.activeBookingId = null;
        document.getElementById('rescheduleModal').classList.remove('active');
    },

    async saveReschedule() {
        const newDate = document.getElementById('rescheduleDateInput').value;
        const newTime = document.getElementById('rescheduleTimeInput').value;

        if (!newDate || !newTime) return alert("Please select both date and time.");

        try {
            const { error } = await db
                .from('bookings')
                .update({
                    booking_date: newDate,
                    booking_time: newTime,
                    status: 'confirmed',
                    updated_at: new Date()
                })
                .eq('id', this.activeBookingId);

            if (error) throw error;

            const item = this.allBookings.find(b => b.id === this.activeBookingId);
            if (item) {
                item.booking_date = newDate;
                item.booking_time = newTime;
                item.status = 'confirmed';
            }

            this.closeRescheduleModal();
            this.render();

            if (typeof App !== 'undefined' && App.toast) {
                App.toast("✓ Appointment successfully rescheduled and confirmed.", "success");
            } else {
                alert("✓ Appointment successfully rescheduled and confirmed.");
            }
        } catch (err) {
            alert("Failed to reschedule: " + err.message);
        }
    },

    openContactModal(name, phone, email) {
        document.getElementById('contactModalTitle').innerText = name;
        const optionsGrid = document.getElementById('contactOptionsGrid');
        optionsGrid.innerHTML = '';

        if (!phone && !email) {
            optionsGrid.innerHTML = '<p class="text-muted" style="padding:15px 0;">No phone or email was provided by this customer.</p>';
        } else {
            if (phone) {
                const cleanPhone = phone.replace(/[^0-9+]/g, '');
                optionsGrid.innerHTML += `
                    <a href="tel:${cleanPhone}" class="btn-action-sm btn-action-confirm" style="padding:14px; text-decoration:none; text-align:center;">
                        📞 Direct Phone Call (${phone})
                    </a>
                    <a href="https://wa.me/${cleanPhone.replace('+', '')}" target="_blank" class="btn-action-sm btn-action-complete" style="padding:14px; text-decoration:none; text-align:center;">
                        💬 WhatsApp Message
                    </a>
                `;
            }
            if (email) {
                optionsGrid.innerHTML += `
                    <a href="mailto:${email}?subject=Regarding your visit with us" class="btn-action-sm" style="padding:14px; text-decoration:none; text-align:center;">
                        📧 Send Email (${email})
                    </a>
                `;
            }
        }

        document.getElementById('contactModal').classList.add('active');
    },

    closeContactModal() {
        document.getElementById('contactModal').classList.remove('active');
    },

    // =========================================================================
    // DEDICATED FULL MEDIA INSPECTOR (PREVENTS OVERLAPPING & ENABLES ZOOM/PAN)
    // =========================================================================
    openMediaViewer(mediaList, startIndex = 0) {
        if (!mediaList || mediaList.length === 0) return;

        this.currentMediaList = mediaList;
        this.currentMediaIndex = Math.max(0, Math.min(startIndex, mediaList.length - 1));

        // Render the Active Item and Thumbnails
        this.renderActiveMediaItem();
        this.renderGalleryThumbs();

        document.getElementById('mediaViewerModal').classList.add('active');
    },

    renderActiveMediaItem() {
        const stage = document.getElementById('galleryStage');
        const counterLabel = document.getElementById('galleryCounterLabel');
        const typeIcon = document.getElementById('galleryTypeIcon');
        const zoomBar = document.getElementById('galleryZoomControls');
        const openFullBtn = document.getElementById('btnOpenFullRes');
        const btnPrev = document.getElementById('btnPrevMedia');
        const btnNext = document.getElementById('btnNextMedia');

        if (!stage || this.currentMediaList.length === 0) return;

        const current = this.currentMediaList[this.currentMediaIndex];
        const isVideo = current.type === 'video';
        const total = this.currentMediaList.length;

        // Reset Zoom & Pan state
        this.resetZoom();

        // Update Counter & Controls
        if (counterLabel) counterLabel.innerText = `${isVideo ? 'Video' : 'Photo'} ${this.currentMediaIndex + 1} of ${total}`;
        if (typeIcon) typeIcon.innerText = isVideo ? '🎥' : '📷';
        if (openFullBtn) openFullBtn.href = current.url;

        if (btnPrev) btnPrev.disabled = this.currentMediaIndex === 0;
        if (btnNext) btnNext.disabled = this.currentMediaIndex === total - 1;

        if (isVideo) {
            // VIDEO RENDER: Full responsive player with controls
            if (zoomBar) zoomBar.style.display = 'none';

            stage.innerHTML = `
                <video src="${current.url}" class="gallery-video-element" controls autoplay playsinline preload="metadata"></video>
            `;
        } else {
            // IMAGE RENDER: Crisp full image with Drag-to-Zoom and Drag-to-Pan
            if (zoomBar) zoomBar.style.display = 'flex';

            stage.innerHTML = `
                <img src="${current.url}" id="activeGalleryImg" class="gallery-display-img" alt="Customer Attachment ${this.currentMediaIndex + 1}">
            `;

            this.bindImagePanEvents();
        }

        // Highlight Active Thumbnail in strip
        document.querySelectorAll('.gallery-thumb-item').forEach((th, idx) => {
            th.classList.toggle('active', idx === this.currentMediaIndex);
        });
    },

    renderGalleryThumbs() {
        const row = document.getElementById('galleryThumbsRow');
        if (!row) return;
        row.innerHTML = '';

        if (this.currentMediaList.length <= 1) {
            row.parentElement.style.display = 'none';
            return;
        } else {
            row.parentElement.style.display = 'block';
        }

        this.currentMediaList.forEach((m, idx) => {
            const isVideo = m.type === 'video';
            const isActive = idx === this.currentMediaIndex;

            const thumb = document.createElement('div');
            thumb.className = `gallery-thumb-item ${isVideo ? 'video-thumb' : ''} ${isActive ? 'active' : ''}`;
            thumb.title = `Switch to ${isVideo ? 'Video' : 'Photo'} #${idx + 1}`;

            if (isVideo) {
                thumb.innerHTML = `🎥<span style="font-size:0.55rem; font-weight:900;">#${idx + 1}</span>`;
            } else {
                thumb.innerHTML = `<img src="${m.url}" loading="lazy"><span style="position:absolute; bottom:1px; right:2px; font-size:0.55rem; font-weight:900; background:rgba(0,0,0,0.7); color:#fff; padding:0 3px; border-radius:3px;">#${idx + 1}</span>`;
            }

            thumb.onclick = () => {
                this.currentMediaIndex = idx;
                this.renderActiveMediaItem();
            };

            row.appendChild(thumb);
        });
    },

    nextMedia() {
        if (this.currentMediaIndex < this.currentMediaList.length - 1) {
            this.currentMediaIndex++;
            this.renderActiveMediaItem();
        }
    },

    prevMedia() {
        if (this.currentMediaIndex > 0) {
            this.currentMediaIndex--;
            this.renderActiveMediaItem();
        }
    },
// Inside your public Booking.js when business data loads:
if (biz.booking_enabled === false) {
    // Hide the booking form and show a clean notice
    document.getElementById('bookingFormContainer').innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 3rem; margin-bottom: 12px;">📅</div>
            <h2 style="font-weight: 900; margin-bottom: 8px;">Bookings Closed</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
                This business is not accepting online appointments at this time.
            </p>
        </div>
    `;
}
    // =========================================================================
    // DRAG-TO-ZOOM & DRAG-TO-PAN CONTROLLER
    // =========================================================================
    bindZoomSliderEvents() {
        const slider = document.getElementById('galleryZoomSlider');
        if (!slider) return;

        slider.addEventListener('input', (e) => {
            this.zoomScale = parseFloat(e.target.value);
            if (this.zoomScale <= 1) {
                this.zoomTranslateX = 0;
                this.zoomTranslateY = 0;
            }
            this.applyZoomTransform();
        });
    },

    stepZoom(delta) {
        this.zoomScale = Math.min(3.5, Math.max(1, +(this.zoomScale + delta).toFixed(2)));
        if (this.zoomScale <= 1) {
            this.zoomTranslateX = 0;
            this.zoomTranslateY = 0;
        }
        this.applyZoomTransform();
    },

    resetZoom() {
        this.zoomScale = 1;
        this.zoomTranslateX = 0;
        this.zoomTranslateY = 0;
        this.applyZoomTransform();
    },

    applyZoomTransform() {
        const img = document.getElementById('activeGalleryImg');
        const text = document.getElementById('galleryZoomText');
        const slider = document.getElementById('galleryZoomSlider');

        if (slider) slider.value = this.zoomScale;
        if (text) text.innerText = `${this.zoomScale.toFixed(1)}x`;

        if (img) {
            img.style.transform = `translate(${this.zoomTranslateX}px, ${this.zoomTranslateY}px) scale(${this.zoomScale})`;
            img.style.cursor = this.zoomScale > 1 ? 'grab' : 'default';
        }
    },

    bindImagePanEvents() {
        const stage = document.getElementById('galleryStage');
        const img = document.getElementById('activeGalleryImg');
        if (!stage || !img) return;

        // 1. Mouse Drag
        stage.onmousedown = (e) => {
            if (this.zoomScale <= 1) return;
            this.isPanning = true;
            this.panStartX = e.clientX - this.zoomTranslateX;
            this.panStartY = e.clientY - this.zoomTranslateY;
            img.classList.add('is-dragging');
            e.preventDefault();
        };

        window.onmousemove = (e) => {
            if (!this.isPanning) return;
            this.zoomTranslateX = e.clientX - this.panStartX;
            this.zoomTranslateY = e.clientY - this.panStartY;
            this.applyZoomTransform();
        };

        window.onmouseup = () => {
            if (this.isPanning) {
                this.isPanning = false;
                img.classList.remove('is-dragging');
            }
        };

        // 2. Touch Drag (Mobile)
        stage.ontouchstart = (e) => {
            if (this.zoomScale <= 1 || e.touches.length !== 1) return;
            this.isPanning = true;
            this.panStartX = e.touches[0].clientX - this.zoomTranslateX;
            this.panStartY = e.touches[0].clientY - this.zoomTranslateY;
            img.classList.add('is-dragging');
        };

        stage.ontouchmove = (e) => {
            if (!this.isPanning || e.touches.length !== 1) return;
            this.zoomTranslateX = e.touches[0].clientX - this.panStartX;
            this.zoomTranslateY = e.touches[0].clientY - this.panStartY;
            this.applyZoomTransform();
        };

        stage.ontouchend = () => {
            this.isPanning = false;
            img.classList.remove('is-dragging');
        };

        // 3. Double-click to Quick Zoom
        stage.ondblclick = () => {
            if (this.zoomScale > 1) {
                this.resetZoom();
            } else {
                this.zoomScale = 2.2;
                this.applyZoomTransform();
            }
        };
    },

    closeMediaViewer() {
        const modal = document.getElementById('mediaViewerModal');
        const stage = document.getElementById('galleryStage');
        if (modal) modal.classList.remove('active');
        if (stage) stage.innerHTML = ''; // Stops any video playback
        this.resetZoom();
    },

    setupRealtime() {
        db.channel(`biz-bookings-${this.bizId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'bookings',
                filter: `business_id=eq.${this.bizId}`
            }, payload => {
                this.allBookings.unshift(payload.new);
                this.render();

                if (typeof App !== 'undefined' && App.toast) {
                    App.toast(`Customer ${payload.new.customer_name} requested a booking on ${payload.new.booking_date} @ ${payload.new.booking_time}`, "info", "🔔 New Appointment Request");
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'bookings',
                filter: `business_id=eq.${this.bizId}`
            }, payload => {
                const idx = this.allBookings.findIndex(b => b.id === payload.new.id);
                if (idx !== -1) {
                    this.allBookings[idx] = payload.new;
                    this.render();
                }
            })
            .subscribe();
    }
};

document.addEventListener('DOMContentLoaded', () => BookingsApp.init());