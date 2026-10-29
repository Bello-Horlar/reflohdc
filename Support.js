/* TITLE: assets/js/user/Support.js */

const SupportApp = {
    userId: null,
    bizId: null,
    ticketId: new URLSearchParams(window.location.search).get('id'),
    
    selectedMsg: null,
    pendingDeleteTicketId: null,
    longPressTimer: null,

    async init() {
        const session = await Auth.checkSession();
        if (!session || !session.user) return;
        this.userId = session.user.id;

        const isListPage = document.getElementById('ticket-list');
        const isChatPage = document.getElementById('chat-flow');

        if (isListPage) {
            this.initList();
        } else if (isChatPage) {
            this.initChat();
        }
    },

    /* =========================================================
       1. TICKET LIST LOGIC (support.html)
    ========================================================= */
    async initList() {
        // Automatically clear support notifications from badge when viewing ticket list
        await this.clearSupportNotifications();

        await this.loadTickets();

        const openBtn = document.getElementById('openModalBtn');
        const cancelBtn = document.getElementById('cancelModalBtn');
        const modalOverlay = document.getElementById('ticketModal');

        if (openBtn) openBtn.onclick = () => this.toggleModal(true);
        if (cancelBtn) cancelBtn.onclick = () => this.toggleModal(false);
        if (modalOverlay) {
            modalOverlay.onclick = (e) => {
                if (e.target === modalOverlay) this.toggleModal(false);
            };
        }
    },

    async loadTickets() {
        try {
            const { data: tickets, error } = await db
                .from('support_tickets')
                .select(`
                    id, subject, status, created_at, updated_at,
                    support_messages(id, message_text, image_url, sender_role, created_at)
                `)
                .eq('user_id', this.userId)
                .order('updated_at', { ascending: false });

            const container = document.getElementById('ticket-list');
            if (!container) return;
            container.innerHTML = '';

            if (error || !tickets || tickets.length === 0) {
                container.innerHTML = '<p class="text-muted text-center" style="padding: 30px;">No support tickets yet. Need help? Tap the button above.</p>';
                return;
            }

            tickets.forEach(ticket => {
                const msgs = ticket.support_messages || [];
                msgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const latest = msgs[0];

                const hasAdminReply = latest && latest.sender_role === 'admin';

                let snippetText = 'No messages yet';
                if (latest) {
                    const senderPrefix = latest.sender_role === 'admin' ? '🛡️ Admin: ' : 'You: ';
                    if (latest.message_text) {
                        snippetText = `${senderPrefix}${latest.message_text}`;
                    } else if (latest.image_url) {
                        snippetText = `${senderPrefix}📷 Photo Attachment`;
                    }
                }

                const lastTimestamp = latest?.created_at || ticket.updated_at || ticket.created_at;
                const dateStr = this.formatTimeAgo(lastTimestamp);

                let statusBadgeHtml = '';
                if (hasAdminReply) {
                    statusBadgeHtml = `<span class="status-tag" style="background: rgba(34, 197, 94, 0.2); color: #16a34a; border: 1px solid #22c55e; font-weight:900;">🟢 NEW REPLY</span>`;
                } else {
                    statusBadgeHtml = `<span class="status-tag status-${ticket.status}">${ticket.status}</span>`;
                }

                const card = document.createElement('div');
                card.className = `ticket-card ${hasAdminReply ? 'has-new-reply' : ''}`;
                card.innerHTML = `
                    <div class="ticket-info">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
                            <h3>${ticket.subject}</h3>
                        </div>
                        <span class="ticket-last-snippet">${snippetText}</span>
                        <span class="ticket-meta-date">Active: ${dateStr}</span>
                    </div>
                    ${statusBadgeHtml}
                `;

                card.onclick = () => {
                    if (!card.dataset.longPressed) {
                        window.location.href = `support-view.html?id=${ticket.id}`;
                    }
                };

                card.addEventListener('touchstart', () => {
                    card.dataset.longPressed = '';
                    this.longPressTimer = setTimeout(() => {
                        card.dataset.longPressed = 'true';
                        if (navigator.vibrate) navigator.vibrate(40);
                        this.openDeleteTicketModal(ticket.id, ticket.subject);
                    }, 500);
                }, { passive: true });

                card.addEventListener('touchend', () => clearTimeout(this.longPressTimer));
                card.addEventListener('touchmove', () => clearTimeout(this.longPressTimer));

                card.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.openDeleteTicketModal(ticket.id, ticket.subject);
                });

                container.appendChild(card);
            });
        } catch (err) {
            console.error("Error loading support tickets:", err);
        }
    },

    openDeleteTicketModal(ticketId, subject) {
        this.pendingDeleteTicketId = ticketId;
        const display = document.getElementById('deleteTicketSubjectDisplay');
        if (display) display.innerText = `Delete "${subject}" and all messages permanently?`;
        const modal = document.getElementById('longPressDeleteModal');
        if (modal) modal.classList.add('active');
    },

    closeDeleteTicketModal() {
        this.pendingDeleteTicketId = null;
        const modal = document.getElementById('longPressDeleteModal');
        if (modal) modal.classList.remove('active');
    },

    async executeDeleteTicket() {
        if (!this.pendingDeleteTicketId) return;

        try {
            const { error } = await db
                .from('support_tickets')
                .delete()
                .eq('id', this.pendingDeleteTicketId);

            if (error) throw error;

            App.toast("Support ticket deleted.", "info");
            this.closeDeleteTicketModal();
            await this.loadTickets();
        } catch (err) {
            App.toast("Failed to delete ticket: " + err.message, "error");
        }
    },

    toggleModal(show) {
        const modal = document.getElementById('ticketModal');
        if (modal) modal.classList.toggle('active', show);
    },

    async submitNewTicket() {
        const subject = document.getElementById('newSubject').value.trim();
        const message = document.getElementById('newMessage').value.trim();
        const fileInput = document.getElementById('newImage');

        if (!subject || !message) {
            App.toast("Please fill in both Subject and Message.", "warning");
            return;
        }

        App.setLoading('submitTicketBtn', true, 'Creating Ticket...');

        try {
            const { data: ticket, error: tErr } = await db.from('support_tickets').insert({
                user_id: this.userId,
                subject: subject,
                status: 'open'
            }).select().single();

            if (tErr) throw tErr;

            let imageUrl = null;
            if (fileInput && fileInput.files.length > 0) {
                imageUrl = await storage.uploadSupportImage(fileInput.files[0], this.userId);
            }

            await db.from('support_messages').insert({
                ticket_id: ticket.id,
                sender_id: this.userId,
                sender_role: 'owner',
                message_text: message,
                image_url: imageUrl
            });

            this.toggleModal(false);
            document.getElementById('newSubject').value = '';
            document.getElementById('newMessage').value = '';
            if (fileInput) fileInput.value = '';

            App.toast("Ticket created! We will reply shortly. 🚀", "success");
            await this.loadTickets();

        } catch (err) {
            App.toast("Error creating ticket: " + err.message, "error");
        } finally {
            App.setLoading('submitTicketBtn', false, 'Submit Ticket');
        }
    },

    /* =========================================================
       2. CHAT VIEW LOGIC (support-view.html)
    ========================================================= */
    async initChat() {
        if (!this.ticketId) {
            window.location.href = 'support.html';
            return;
        }

        await this.clearSupportNotifications();
        await this.loadTicketMeta();
        await this.loadMessages();
        this.setupRealtime();
    },

    // Clears both support_reply and admin_message notifications
    async clearSupportNotifications() {
        try {
            await db
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', this.userId)
                .in('type', ['support_reply', 'admin_message']);
        } catch (e) {
            console.warn("Cleared support notifications notice:", e);
        }
    },

    async loadTicketMeta() {
        const { data: ticket } = await db.from('support_tickets').select('*').eq('id', this.ticketId).maybeSingle();
        if (ticket) {
            document.getElementById('ticket-subject').innerText = ticket.subject;
            const badge = document.getElementById('status-badge');
            if (badge) {
                badge.innerText = ticket.status.toUpperCase();
                badge.className = `status-pill status-${ticket.status}`;
            }
        }
    },

    async loadMessages() {
        const { data: messages } = await db
            .from('support_messages')
            .select('*')
            .eq('ticket_id', this.ticketId)
            .order('created_at', { ascending: true });

        const container = document.getElementById('chat-flow');
        if (!container) return;
        container.innerHTML = '';
        if (messages) messages.forEach(msg => this.renderMessage(msg));
        container.scrollTop = container.scrollHeight;
    },

    renderMessage(msg) {
        const container = document.getElementById('chat-flow');
        if (!container) return;

        if (document.getElementById(`msg-${msg.id}`)) return;

        const isOwner = msg.sender_role === 'owner';
        const div = document.createElement('div');
        div.id = `msg-${msg.id}`;
        div.className = `msg-bubble ${isOwner ? 'msg-owner' : 'msg-admin'}`;

        let imgHtml = '';
        if (msg.image_url) {
            const finalImgUrl = (typeof storage !== 'undefined' && storage.getSupportImageUrl) 
                ? storage.getSupportImageUrl(msg.image_url) 
                : msg.image_url;
            imgHtml = `<img src="${finalImgUrl}" class="msg-image" onclick="App.previewImage(this.src, 'Attachment')" alt="Attachment">`;
        }

        div.innerHTML = `
            ${msg.message_text ? `<div>${msg.message_text}</div>` : ''}
            ${imgHtml}
            <span class="msg-time">${new Date(msg.created_at || Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        `;

        div.addEventListener('touchstart', () => {
            this.longPressTimer = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate(40);
                this.openActionSheet(msg);
            }, 450);
        }, { passive: true });

        div.addEventListener('touchend', () => clearTimeout(this.longPressTimer));
        div.addEventListener('touchmove', () => clearTimeout(this.longPressTimer));

        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.openActionSheet(msg);
        });

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    openActionSheet(msg) {
        this.selectedMsg = msg;
        const sheet = document.getElementById('chatActionSheet');
        if (sheet) sheet.classList.add('active');
    },

    closeActionSheet() {
        this.selectedMsg = null;
        const sheet = document.getElementById('chatActionSheet');
        if (sheet) sheet.classList.remove('active');
    },

    async executeCopyMessage() {
        if (!this.selectedMsg) return;
        const textToCopy = this.selectedMsg.message_text || this.selectedMsg.image_url || '';

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = textToCopy;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            App.toast("Message copied to clipboard! 📋", "success");
        } catch (err) {
            App.toast("Copy failed: " + err, "error");
        } finally {
            this.closeActionSheet();
        }
    },

    async executeShareMessage() {
        if (!this.selectedMsg) return;
        const textToShare = this.selectedMsg.message_text || 'REFLO Support Attachment';

        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'REFLO Support Message',
                    text: textToShare
                });
            } else {
                await this.executeCopyMessage();
            }
        } catch (err) {
            if (err.name !== 'AbortError') this.executeCopyMessage();
        } finally {
            this.closeActionSheet();
        }
    },

    async executeDeleteMessage() {
        if (!this.selectedMsg) return;
        const msgId = this.selectedMsg.id;

        try {
            const { error } = await db
                .from('support_messages')
                .delete()
                .eq('id', msgId);

            if (error) throw error;

            document.getElementById(`msg-${msgId}`)?.remove();
            App.toast("Message deleted.", "info");
        } catch (err) {
            App.toast("Failed to delete message: " + err.message, "error");
        } finally {
            this.closeActionSheet();
        }
    },

    async sendReply() {
        const input = document.getElementById('msgInput');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';

        try {
            const { data: newMsg, error } = await db
                .from('support_messages')
                .insert({
                    ticket_id: this.ticketId,
                    sender_id: this.userId,
                    sender_role: 'owner',
                    message_text: text
                })
                .select()
                .single();

            if (error) throw error;
            if (newMsg) this.renderMessage(newMsg);

            await db.from('support_tickets').update({ status: 'open', updated_at: new Date() }).eq('id', this.ticketId);

        } catch (err) {
            App.toast("Failed to send message: " + err.message, "error");
        }
    },

    async handleUserImageUpload(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        try {
            App.toast("Uploading photo...", "info");
            let imageUrl = null;

            if (typeof storage !== 'undefined' && storage.uploadSupportImage) {
                imageUrl = await storage.uploadSupportImage(file, this.userId);
            } else {
                const fileExt = file.name.split('.').pop();
                const filePath = `${this.userId}/${Date.now()}.${fileExt}`;
                const { error: upErr } = await db.storage.from('support-images').upload(filePath, file);
                if (upErr) throw upErr;
                imageUrl = filePath;
            }

            const { data: newMsg, error } = await db
                .from('support_messages')
                .insert({
                    ticket_id: this.ticketId,
                    sender_id: this.userId,
                    sender_role: 'owner',
                    image_url: imageUrl
                })
                .select()
                .single();

            if (error) throw error;
            if (newMsg) this.renderMessage(newMsg);

            await db.from('support_tickets').update({ status: 'open', updated_at: new Date() }).eq('id', this.ticketId);
            App.toast("Photo sent! 📷", "success");

        } catch (err) {
            App.toast("Photo upload failed: " + err.message, "error");
        } finally {
            input.value = '';
        }
    },

    setupRealtime() {
        db.channel(`user-chat-${this.ticketId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'support_messages', 
                filter: `ticket_id=eq.${this.ticketId}` 
            }, payload => {
                this.renderMessage(payload.new);
                this.clearSupportNotifications();
            })
            .on('postgres_changes', { 
                event: 'DELETE', 
                schema: 'public', 
                table: 'support_messages' 
            }, payload => {
                document.getElementById(`msg-${payload.old.id}`)?.remove();
            })
            .subscribe();
    },

    formatTimeAgo(timestamp) {
        if (!timestamp) return 'Just now';
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return past.toLocaleDateString();
    }
};

document.addEventListener('DOMContentLoaded', () => SupportApp.init());