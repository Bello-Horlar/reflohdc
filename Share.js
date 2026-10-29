/* TITLE: assets/js/user/Share.js */

const ShareApp = {
    biz: null,
    hubUrl: '',
    qrInstance: null,

    async init() {
        try {
            const session = await Auth.checkSession();
            if (!session || !session.user) return;

            // Fetch Business Details
            const { data: biz, error } = await db
                .from('businesses')
                .select('id, name, slug, logo_url')
                .eq('owner_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.warn("Error fetching business for share page:", error);
            }

            const slug = biz?.slug || 'my-business';
            const name = biz?.name || 'My Business';

            const heading = document.getElementById('bizNameHeading');
            if (heading) heading.innerText = name;

            const printHeading = document.getElementById('printBizName');
            if (printHeading) printHeading.innerText = name;

            // 🟢 Generates the clean social-shareable short link (e.g. https://reflohdc.netlify.app/r/horlar-shop-2645)
            const origin = window.location.origin;
            this.hubUrl = `${origin}/r/${slug}`;

            const input = document.getElementById('directHubUrlInput');
            if (input) input.value = this.hubUrl;

            // Render QR Code immediately
            this.generateQRCode();
        } catch (err) {
            console.error("ShareApp initialization error:", err);
        }
    },

    generateQRCode() {
        const target = document.getElementById('qrPreviewBox');
        if (!target) return;
        target.innerHTML = '';

        if (typeof QRCode !== 'undefined') {
            this.qrInstance = new QRCode(target, {
                text: this.hubUrl || window.location.origin,
                width: 210,
                height: 210,
                colorDark: "#0f172a",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            target.innerHTML = '<p class="text-muted" style="font-size:0.8rem; padding:20px;">Generating QR Code...</p>';
        }
    },

    async copyLink() {
        const input = document.getElementById('directHubUrlInput');
        const btn = document.getElementById('copyLinkBtn');

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(this.hubUrl);
            } else if (input) {
                input.select();
                document.execCommand('copy');
            }

            if (btn) {
                const oldText = btn.innerText;
                btn.innerText = 'Copied! ✓';
                btn.style.background = 'var(--success, #22c55e)';

                setTimeout(() => {
                    btn.innerText = oldText;
                    btn.style.background = '';
                }, 2000);
            }

            if (typeof App !== 'undefined' && App.toast) {
                App.toast("Short link copied to clipboard! 🔗", "success");
            }
        } catch (err) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast("Could not copy link: " + err, "error");
            }
        }
    },

    downloadPNG() {
        const img = document.querySelector('#qrPreviewBox img');
        const canvas = document.querySelector('#qrPreviewBox canvas');

        let downloadUrl = '';
        if (img && img.src) {
            downloadUrl = img.src;
        } else if (canvas) {
            downloadUrl = canvas.toDataURL("image/png");
        }

        if (!downloadUrl) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast("QR Code is rendering, please try again in a second.", "warning");
            }
            return;
        }

        const link = document.createElement('a');
        link.download = `REFLO-Customer-QR.png`;
        link.href = downloadUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (typeof App !== 'undefined' && App.toast) {
            App.toast("QR Code downloaded! 📥", "success");
        }
    },

    // 🟢 Bulletproof Print Execution
    printQR() {
        const previewImg = document.querySelector('#qrPreviewBox img') || document.querySelector('#qrPreviewBox canvas');
        const printTarget = document.getElementById('printQrTarget');

        if (!previewImg) {
            App.toast("Please wait for QR code to finish rendering.", "warning");
            return;
        }

        if (printTarget) {
            printTarget.innerHTML = '';
            const img = document.createElement('img');
            img.src = previewImg.src || (previewImg.toDataURL ? previewImg.toDataURL("image/png") : '');
            img.style.width = '240px';
            img.style.height = '240px';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            printTarget.appendChild(img);
        }

        window.print();
    }
};

document.addEventListener('DOMContentLoaded', () => ShareApp.init());