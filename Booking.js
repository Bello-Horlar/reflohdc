/* TITLE: assets/js/public/Booking.js */
const PublicBooking = {
    bizSlug: null,
    businessData: null,
    selectedFiles: [],
    maxFiles: 1,
    allowVideos: false,
    isRequired: false,

    async init() {
        const params = new URLSearchParams(window.location.search);
        this.bizSlug = params.get('biz') || params.get('business');

        const dateInput = document.getElementById('custDateInput');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;
            dateInput.value = today;
        }

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
            name: 'Sample Business',
            booking_enabled: true
        };
        document.getElementById('bookingBizName').innerText = "Sample Business";
    },

    async loadBusiness() {
        try {
            const { data: biz, error } = await db
                .from('businesses')
                .select('id, owner_id, name, slug, logo_url, booking_enabled, booking_settings, subscription_status')
                .eq('slug', this.bizSlug)
                .single();

            if (error || !biz) {
                document.getElementById('bookingBizName').innerText = this.bizSlug.replace(/-/g, ' ').toUpperCase();
                return;
            }

            this.businessData = biz;

            document.title = `Book Visit | ${biz.name}`;
            document.getElementById('bookingBizName').innerText = biz.name;

            if (biz.logo_url) {
                document.getElementById('bookingBizLogo').src = storage.getLogoUrl(biz.logo_url);
            }

            // 🟢 If business owner turned OFF bookings: hide form and show paused notice
            if (biz.booking_enabled === false) {
                const formSec = document.getElementById('bookingFormSection');
                const pausedSec = document.getElementById('bookingPausedSection');
                if (formSec) formSec.style.display = 'none';
                if (pausedSec) pausedSec.style.display = 'block';
            }

            // Configure Media Attachment Rules & Tier Entitlements
            const bSettings = biz.booking_settings || {};
            const plan = biz.subscription_status || 'trial';
            const allowMedia = bSettings.allow_attachments !== false;

            if (allowMedia) {
                const mediaSection = document.getElementById('custMediaUploadSection');
                const fileInput = document.getElementById('custMediaFileInput');
                const badge = document.getElementById('custMediaBadge');
                const helpText = document.getElementById('custMediaHelpText');

                if (mediaSection) mediaSection.style.display = 'block';

                this.isRequired = !!bSettings.attachment_required;
                if (badge) {
                    badge.innerText = this.isRequired ? 'Required *' : 'Optional';
                    badge.style.background = this.isRequired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37,99,235,0.1)';
                    badge.style.color = this.isRequired ? '#ef4444' : 'var(--primary)';
                }

                if (plan === 'starter') {
                    this.maxFiles = 1;
                    this.allowVideos = false;
                    if (fileInput) {
                        fileInput.removeAttribute('multiple');
                        fileInput.accept = 'image/*';
                    }
                    if (helpText) helpText.innerText = 'Max 1 image (JPG, PNG up to 5MB)';
                } else if (plan === 'growth' || plan === 'trial') {
                    this.maxFiles = 5;
                    this.allowVideos = bSettings.attachment_types === 'images_and_videos';
                    if (fileInput) {
                        fileInput.setAttribute('multiple', 'true');
                        fileInput.accept = this.allowVideos ? 'image/*,video/*' : 'image/*';
                    }
                    if (helpText) helpText.innerText = this.allowVideos ? 'Up to 5 images or 1 short video (Max 25MB)' : 'Up to 5 images (Max 10MB each)';
                } else {
                    this.maxFiles = 10;
                    this.allowVideos = bSettings.attachment_types === 'images_and_videos';
                    if (fileInput) {
                        fileInput.setAttribute('multiple', 'true');
                        fileInput.accept = this.allowVideos ? 'image/*,video/*' : 'image/*';
                    }
                    if (helpText) helpText.innerText = 'Unlimited HD media uploads supported';
                }
            }
        } catch (err) {
            console.error("Error loading business info:", err);
        }
    },

    handleMediaSelection(input) {
        if (!input.files || input.files.length === 0) return;

        const files = Array.from(input.files);
        for (const file of files) {
            if (this.selectedFiles.length >= this.maxFiles) {
                alert(`You can only upload a maximum of ${this.maxFiles} file(s).`);
                break;
            }

            const isVideo = file.type.startsWith('video/');
            const isImage = file.type.startsWith('image/');

            if (!isImage && !isVideo) {
                alert(`File format not supported: ${file.name}`);
                continue;
            }

            if (isVideo && !this.allowVideos) {
                alert(`Videos are not enabled for this service. Please select images only.`);
                continue;
            }

            if (file.size > 30 * 1024 * 1024) {
                alert(`File "${file.name}" exceeds the 30MB size limit.`);
                continue;
            }

            this.selectedFiles.push(file);
        }

        input.value = '';
        this.renderMediaPreviews();
    },

    removeMedia(index) {
        this.selectedFiles.splice(index, 1);
        this.renderMediaPreviews();
    },

    renderMediaPreviews() {
        const grid = document.getElementById('custMediaPreviewGrid');
        if (!grid) return;
        grid.innerHTML = '';

        this.selectedFiles.forEach((file, idx) => {
            const isVideo = file.type.startsWith('video/');
            const item = document.createElement('div');
            item.style.cssText = 'position: relative; width: 75px; height: 75px; border-radius: 12px; overflow: hidden; border: 1.5px solid var(--border); background: var(--bg-card);';

            if (isVideo) {
                item.innerHTML = `
                    <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#111; color:#fff; font-size:0.65rem; text-align:center; padding:4px;">
                        <span style="font-size:1.2rem;">🎥</span>
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:65px;">Video</span>
                    </div>
                `;
            } else {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                item.appendChild(img);
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.innerHTML = '✕';
            removeBtn.style.cssText = 'position:absolute; top:2px; right:2px; background:rgba(239,68,68,0.9); color:#fff; border:none; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;';
            removeBtn.onclick = (e) => { e.stopPropagation(); this.removeMedia(idx); };
            item.appendChild(removeBtn);

            grid.appendChild(item);
        });
    },

    async uploadAttachments() {
        if (this.selectedFiles.length === 0) return [];
        const uploaded = [];

        for (const file of this.selectedFiles) {
            const ext = file.name.split('.').pop() || 'bin';
            const cleanName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
            const path = `bookings/${this.businessData?.id || 'demo'}/${cleanName}`;

            const { data, error } = await db.storage
                .from('booking-attachments')
                .upload(path, file, { cacheControl: '3600', upsert: false });

            if (!error && data) {
                const { data: pubUrl } = db.storage.from('booking-attachments').getPublicUrl(path);
                uploaded.push({
                    url: pubUrl.publicUrl,
                    type: file.type.startsWith('video/') ? 'video' : 'image',
                    name: file.name
                });
            }
        }
        return uploaded;
    },

    async handleSubmit(e) {
        e.preventDefault();

        // 🟢 Extra guard: Block submission if business owner disabled bookings
        if (this.businessData && this.businessData.booking_enabled === false) {
            alert("Bookings are currently disabled by this business.");
            return;
        }

        const btn = document.getElementById('submitBookingBtn');
        btn.innerText = "Checking availability...";
        btn.disabled = true;

        const customerName = document.getElementById('custNameInput').value.trim();
        const customerPhone = document.getElementById('custPhoneInput').value.trim();
        const customerEmail = document.getElementById('custEmailInput').value.trim();
        const serviceName = document.getElementById('custServiceSelect').value;
        const bookingDate = document.getElementById('custDateInput').value;
        const bookingTime = document.getElementById('custTimeInput').value;
        const customerNotes = document.getElementById('custNotesInput').value.trim();

        if (!customerName || !customerPhone || !bookingDate || !bookingTime) {
            alert("Please complete all required fields.");
            btn.innerText = "Confirm & Submit Booking Request";
            btn.disabled = false;
            return;
        }

        if (this.isRequired && this.selectedFiles.length === 0) {
            alert("Please attach the required photo/video before submitting your appointment.");
            btn.innerText = "Confirm & Submit Booking Request";
            btn.disabled = false;
            return;
        }

        try {
            // Collision Check
            if (this.businessData && this.businessData.id !== 'demo-biz-id') {
                const { data: existingBooking } = await db
                    .from('bookings')
                    .select('id')
                    .eq('business_id', this.businessData.id)
                    .eq('booking_date', bookingDate)
                    .eq('booking_time', bookingTime)
                    .in('status', ['pending', 'confirmed'])
                    .maybeSingle();

                if (existingBooking) {
                    alert(`⚠️ Slot Already Booked:\n${bookingDate} at ${bookingTime} is taken by another customer.\n\nPlease select a different date or time.`);
                    btn.innerText = "Confirm & Submit Booking Request";
                    btn.disabled = false;
                    return;
                }
            }

            btn.innerText = "Uploading files & submitting...";
            const uploadedMedia = await this.uploadAttachments();

            if (this.businessData && this.businessData.id !== 'demo-biz-id') {
                const { error: bkErr } = await db
                    .from('bookings')
                    .insert({
                        business_id: this.businessData.id,
                        customer_name: customerName,
                        customer_phone: customerPhone,
                        customer_email: customerEmail || null,
                        service_name: serviceName,
                        booking_date: bookingDate,
                        booking_time: bookingTime,
                        customer_notes: customerNotes || null,
                        media_attachments: uploadedMedia,
                        status: 'pending'
                    });

                if (bkErr) throw bkErr;
            }

            // Clean Root Navigation to /success (Eliminates 404)
            const slug = encodeURIComponent(this.bizSlug || 'sample-business');
            const name = encodeURIComponent(customerName);
            window.location.href = `/success?type=booking&biz=${slug}&name=${name}`;

        } catch (err) {
            alert("Failed to submit booking: " + err.message);
            btn.innerText = "Confirm & Submit Booking Request";
            btn.disabled = false;
        }
    },

    returnToHub() {
        const slug = encodeURIComponent(this.bizSlug || 'sample-business');
        window.location.href = `/?biz=${slug}`;
    }
};

document.addEventListener('DOMContentLoaded', () => PublicBooking.init());