// Channel chat page JavaScript
// Expects window.CONFIG with: wsUrl, uploadUrl, baseApiUrl, searchApiUrl, token, apiUrl, 
//                               serverId, channelId, username, currentUserId, isServerOwner,
//                               currentChannelName, isChannelLocked

const wsUrl = window.CONFIG.wsUrl;
const uploadUrl = window.CONFIG.uploadUrl;
const baseApiUrl = window.CONFIG.baseApiUrl;
const searchApiUrl = window.CONFIG.searchApiUrl;
const token = window.CONFIG.token;
const apiUrl = window.CONFIG.apiUrl;
const serverId = window.CONFIG.serverId;
const channelId = window.CONFIG.channelId;
const currentUsername = window.CONFIG.username;
const currentUserId = window.CONFIG.currentUserId;
const isServerOwner = window.CONFIG.isServerOwner;

const container = document.getElementById('messagesContainer');
const input = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const filePreview = document.getElementById('filePreview');
const searchInput = document.getElementById('searchInput');
let selectedFile = null;
const seenMessageIds = new Set();
let editingMessageId = null;

const EMOJIS = ['👍','👎','❤️','😂','😮','😢','😡','🎉','🔥','👀','✅','❌','💯','🙏','👏'];

// Scroll to bottom on load
container.scrollTop = container.scrollHeight;

// ── WebSocket ──
let ws;
let reconnectInterval = 1000;
let typingTimeout = null;
let isTyping = false;

function connectWebSocket() {
    ws = new WebSocket(wsUrl);
    ws.onopen = function() {
        reconnectInterval = 1000;
    };
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        handleWsMessage(data);
    };
    ws.onclose = function() {
        setTimeout(connectWebSocket, reconnectInterval);
        reconnectInterval = Math.min(reconnectInterval * 2, 10000);
    };
    ws.onerror = function() {};
}
connectWebSocket();

function handleWsMessage(data) {
    const type = data.type || 'message';

    if (type === 'message') {
        appendMessage(data);
    } else if (type === 'message_edited') {
        const el = document.getElementById('msg-text-' + data.message_id);
        if (el) {
            el.textContent = data.new_content;
            // Add (edited) indicator
            const msgEl = document.querySelector(`[data-msg-id="${data.message_id}"] .message-header`);
            if (msgEl && !msgEl.querySelector('.message-edited')) {
                const edited = document.createElement('span');
                edited.className = 'message-edited';
                edited.textContent = '(edited)';
                msgEl.appendChild(edited);
            }
        }
    } else if (type === 'message_deleted') {
        const msgDiv = document.querySelector(`[data-msg-id="${data.message_id}"]`);
        if (msgDiv) {
            msgDiv.classList.add('deleted');
            const body = msgDiv.querySelector('.message-body');
            const textEl = body.querySelector('.message-text');
            if (textEl) textEl.textContent = 'This message was deleted';
            if (textEl) textEl.className = 'message-text deleted-text';
            const actions = body.querySelector('.message-actions');
            if (actions) actions.remove();
            const attachment = body.querySelector('.message-attachment');
            if (attachment) attachment.remove();
            const reactions = body.querySelector('.reactions-container');
            if (reactions) reactions.innerHTML = '';
        }
    } else if (type === 'reaction_update') {
        updateReactionUI(data.message_id, data.emoji, data.count);
    } else if (type === 'typing_start') {
        showTyping(data.username);
    } else if (type === 'typing_stop') {
        hideTyping(data.username);
    } else if (type === 'status_update') {
        // Could update sidebar user status indicators
    }
}

// ── Render content with @mention highlighting ──
function renderContent(text) {
    let html = escapeHtml(text);
    html = html.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    return html;
}

function buildAttachmentHtml(msg) {
    const mime = msg.attachment_mime || '';
    const url = apiUrl + msg.attachment_url;
    const name = escapeHtml(msg.attachment_name || 'file');
    const sizeMB = (msg.attachment_size / 1024 / 1024).toFixed(2);

    if (mime.startsWith('image/')) {
        return `<div class="message-attachment"><img src="${url}" class="embed-image" onclick="openImagePreview('${url}')" alt="${name}"></div>`;
    } else if (mime.startsWith('video/')) {
        return `<div class="message-attachment"><video controls class="embed-video" preload="metadata"><source src="${url}" type="${mime}"></video></div>`;
    } else if (mime.startsWith('audio/')) {
        return `<div class="message-attachment"><audio controls class="embed-audio" preload="metadata"><source src="${url}" type="${mime}"></audio></div>`;
    } else {
        return `<div class="message-attachment"><div class="embed-file-card">
            <span class="file-icon">&#128196;</span>
            <div class="file-info"><a href="${url}" download="${name}" class="file-name">${name}</a><span class="file-size">${sizeMB} MB</span></div>
            <a href="${url}" download="${name}" class="file-download-btn" title="Download">&#11015;</a>
        </div></div>`;
    }
}

// ── Append message ──
function appendMessage(msg) {
    if (msg.id && seenMessageIds.has(msg.id)) return;
    if (msg.id) seenMessageIds.add(msg.id);

    const div = document.createElement('div');
    div.className = 'message' + (msg.is_deleted ? ' deleted' : '');
    div.setAttribute('data-msg-id', msg.id);
    div.setAttribute('data-user-id', msg.user_id);

    const time = msg.created_at ? msg.created_at.substring(0, 16).replace('T', ' ') : '';
    const displayName = msg.display_name || msg.username;
    const avatarHtml = msg.avatar_url
        ? `<img src="${apiUrl}${msg.avatar_url}" class="message-avatar-img" alt="">`
        : `<div class="message-avatar">${displayName[0].toUpperCase()}</div>`;

    let contentHtml = '';
    if (msg.is_deleted) {
        contentHtml = '<div class="message-text deleted-text">This message was deleted</div>';
    } else if (msg.content) {
        contentHtml = `<div class="message-text" id="msg-text-${msg.id}">${renderContent(msg.content)}</div>`;
    }

    let attachmentHtml = '';
    if (msg.attachment_url && !msg.is_deleted) {
        attachmentHtml = buildAttachmentHtml(msg);
    }

    let actionsHtml = '';
    if (!msg.is_deleted) {
        let editBtn = msg.user_id === currentUserId
            ? `<button class="msg-action-btn" onclick="startEdit(${msg.id})" title="Edit">&#9998;</button>` : '';
        let deleteBtn = (msg.user_id === currentUserId || isServerOwner)
            ? `<button class="msg-action-btn" onclick="deleteMessage(${msg.id})" title="Delete">&#128465;</button>` : '';
        let pinBtn = isServerOwner
            ? `<button class="msg-action-btn" onclick="pinMessage(${msg.id})" title="Pin">&#128204;</button>` : '';
        actionsHtml = `<div class="message-actions">
            ${editBtn}${deleteBtn}${pinBtn}
            <button class="msg-action-btn" onclick="showEmojiPicker(${msg.id})" title="React">&#128578;</button>
        </div>`;
    }

    const editedHtml = msg.edited_at ? '<span class="message-edited">(edited)</span>' : '';

    let reactionsHtml = `<div class="reactions-container" id="reactions-${msg.id}">`;
    if (msg.reactions && msg.reactions.length > 0) {
        msg.reactions.forEach(r => {
            reactionsHtml += `<button class="reaction-btn" onclick="toggleReaction(${msg.id}, '${r.emoji}')" title="${r.users.join(', ')}">${r.emoji} ${r.count}</button>`;
        });
    }
    reactionsHtml += '</div>';

    div.innerHTML = `
        ${avatarHtml}
        <div class="message-body">
            <div class="message-header">
                <span class="message-username">${escapeHtml(displayName)}</span>
                <span class="message-time">${time}</span>
                ${editedHtml}
                ${actionsHtml}
            </div>
            ${contentHtml}
            ${attachmentHtml}
            ${reactionsHtml}
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ── Send message ──
function sendMessage() {
    const content = input.value.trim();
    if (selectedFile) { sendMessageWithFile(content); return; }
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'message', content: content }));
    input.value = '';
    stopTyping();
}

async function sendMessageWithFile(content) {
    const formData = new FormData();
    formData.append('content', content);
    if (selectedFile) formData.append('file', selectedFile);
    try {
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (response.ok) {
            const msg = await response.json();
            appendMessage(msg);
            input.value = '';
            clearFileSelection();
        } else {
            const error = await response.json();
            alert('Failed to send: ' + (error.detail || 'Unknown error'));
        }
    } catch (err) {
        alert('Failed to upload file');
    }
}

// ── File handling ──
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function() {
    if (fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        const sizeMB = (selectedFile.size / 1024 / 1024).toFixed(2);
        filePreview.innerHTML = `Selected: ${escapeHtml(selectedFile.name)} (${sizeMB} MB) <button type="button" onclick="clearFileSelection()" class="file-clear-btn">&times;</button>`;
        filePreview.style.display = 'block';
    }
});
function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.style.display = 'none';
    filePreview.innerHTML = '';
}

// ── Typing indicator ──
input.addEventListener('input', function() {
    if (!isTyping && ws && ws.readyState === WebSocket.OPEN) {
        isTyping = true;
        ws.send(JSON.stringify({ type: 'typing_start' }));
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 3000);
});

function stopTyping() {
    if (isTyping && ws && ws.readyState === WebSocket.OPEN) {
        isTyping = false;
        ws.send(JSON.stringify({ type: 'typing_stop' }));
    }
    clearTimeout(typingTimeout);
}

const typingUsers = new Set();
function showTyping(username) {
    typingUsers.add(username);
    updateTypingDisplay();
    // Auto-clear after 4s
    setTimeout(() => { typingUsers.delete(username); updateTypingDisplay(); }, 4000);
}
function hideTyping(username) {
    typingUsers.delete(username);
    updateTypingDisplay();
}
function updateTypingDisplay() {
    const el = document.getElementById('typingIndicator');
    const textEl = document.getElementById('typingText');
    if (typingUsers.size === 0) {
        el.style.display = 'none';
    } else {
        const names = Array.from(typingUsers);
        textEl.textContent = names.length === 1
            ? `${names[0]} is typing...`
            : `${names.join(', ')} are typing...`;
        el.style.display = 'block';
    }
}

// ── Message editing ──
function startEdit(messageId) {
    editingMessageId = messageId;
    const textEl = document.getElementById('msg-text-' + messageId);
    document.getElementById('editContent').value = textEl ? textEl.textContent : '';
    document.getElementById('editModal').classList.add('active');
}

async function submitEdit() {
    if (!editingMessageId) return;
    const content = document.getElementById('editContent').value.trim();
    if (!content) return;
    try {
        const resp = await fetch(`${baseApiUrl}/${editingMessageId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        });
        if (!resp.ok) {
            const err = await resp.json();
            alert(err.detail || 'Edit failed');
        }
    } catch (e) {
        alert('Edit failed');
    }
    document.getElementById('editModal').classList.remove('active');
    editingMessageId = null;
}

// ── Message deletion ──
async function deleteMessage(messageId) {
    if (!confirm('Delete this message?')) return;
    try {
        await fetch(`${baseApiUrl}/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) {
        alert('Delete failed');
    }
}

// ── Emoji reactions ──
let reactionTargetId = null;
function showEmojiPicker(messageId) {
    reactionTargetId = messageId;
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.onclick = () => {
            toggleReaction(messageId, emoji);
            document.getElementById('emojiPickerModal').classList.remove('active');
        };
        grid.appendChild(btn);
    });
    document.getElementById('emojiPickerModal').classList.add('active');
}

async function toggleReaction(messageId, emoji) {
    try {
        await fetch(`${baseApiUrl}/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) {}
}

function updateReactionUI(messageId, emoji, count) {
    const container = document.getElementById('reactions-' + messageId);
    if (!container) return;
    let btn = container.querySelector(`[data-emoji="${emoji}"]`);
    if (count === 0 && btn) {
        btn.remove();
    } else if (btn) {
        btn.textContent = `${emoji} ${count}`;
    } else if (count > 0) {
        btn = document.createElement('button');
        btn.className = 'reaction-btn';
        btn.setAttribute('data-emoji', emoji);
        btn.textContent = `${emoji} ${count}`;
        btn.onclick = () => toggleReaction(messageId, emoji);
        container.appendChild(btn);
    }
}

// ── Search ──
let searchDebounce;
searchInput.addEventListener('input', function() {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (!q) { closeSearch(); return; }
    searchDebounce = setTimeout(() => performSearch(q), 400);
});

async function performSearch(q) {
    try {
        const resp = await fetch(`${searchApiUrl}?q=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) {
            const results = await resp.json();
            showSearchResults(results);
        }
    } catch (e) {}
}

function showSearchResults(results) {
    const panel = document.getElementById('searchResults');
    const list = document.getElementById('searchResultsList');
    list.innerHTML = '';
    if (results.length === 0) {
        list.innerHTML = '<div class="search-empty">No results found</div>';
    } else {
        results.forEach(msg => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            const dn = msg.display_name || msg.username;
            div.innerHTML = `<span class="search-result-user">${escapeHtml(dn)}</span>
                <span class="search-result-text">${escapeHtml(msg.content)}</span>
                <span class="search-result-time">${msg.created_at.substring(0,16).replace('T',' ')}</span>`;
            list.appendChild(div);
        });
    }
    panel.style.display = 'block';
}

function closeSearch() {
    document.getElementById('searchResults').style.display = 'none';
    searchInput.value = '';
}

// ── Event listeners ──
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
});
input.focus();

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Highlight mentions in server-rendered messages ──
document.querySelectorAll('.message-text:not(.deleted-text)').forEach(el => {
    el.innerHTML = el.innerHTML.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
});

// ── Pinned messages ──
async function pinMessage(messageId) {
    try {
        const resp = await fetch(`${baseApiUrl}/${messageId}/pin`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) { alert('Message pinned!'); }
        else { const e = await resp.json(); alert(e.detail || 'Pin failed'); }
    } catch (e) { alert('Pin failed'); }
}

async function unpinMessage(messageId) {
    try {
        const resp = await fetch(`${baseApiUrl}/${messageId}/pin`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok) { showPinnedMessages(); }
        else { const e = await resp.json(); alert(e.detail || 'Unpin failed'); }
    } catch (e) { alert('Unpin failed'); }
}

async function showPinnedMessages() {
    const list = document.getElementById('pinnedList');
    list.innerHTML = '<div class="browse-empty">Loading...</div>';
    document.getElementById('pinnedModal').classList.add('active');
    try {
        const resp = await fetch(`${baseApiUrl}/pinned`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (resp.ok) {
            const pins = await resp.json();
            if (pins.length === 0) {
                list.innerHTML = '<div class="browse-empty">No pinned messages.</div>';
            } else {
                list.innerHTML = '';
                pins.forEach(p => {
                    const div = document.createElement('div');
                    div.className = 'pinned-message-item';
                    div.innerHTML = `<div class="pinned-msg-content">${escapeHtml(p.content || '(attachment)')}</div>
                        <div class="pinned-msg-meta">Pinned at ${p.pinned_at ? p.pinned_at.substring(0,16).replace('T',' ') : ''}</div>
                        ${isServerOwner ? `<button class="btn-small btn-danger" onclick="unpinMessage(${p.message_id})" style="margin-top:4px;">Unpin</button>` : ''}`;
                    list.appendChild(div);
                });
            }
        }
    } catch (e) { list.innerHTML = '<div class="browse-empty">Failed to load.</div>'; }
}

// ── Invite system ──
async function showInviteModal() {
    document.getElementById('inviteLinkBox').style.display = 'none';
    document.getElementById('createInviteBtn').style.display = '';
    document.getElementById('inviteModal').classList.add('active');
}

async function createInvite() {
    const maxUses = parseInt(document.getElementById('inviteMaxUses').value) || 0;
    try {
        const resp = await fetch(`${apiUrl}/invites/servers/${serverId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ max_uses: maxUses > 0 ? maxUses : null })
        });
        if (resp.ok) {
            const inv = await resp.json();
            const link = window.location.origin + '/invite/' + inv.code;
            document.getElementById('inviteLinkInput').value = link;
            document.getElementById('inviteLinkBox').style.display = '';
            document.getElementById('createInviteBtn').style.display = 'none';
        } else {
            const e = await resp.json();
            alert(e.detail || 'Failed to create invite');
        }
    } catch (e) { alert('Failed to create invite'); }
}

function copyInviteLink() {
    const input = document.getElementById('inviteLinkInput');
    input.select();
    navigator.clipboard.writeText(input.value);
}

// ── Image preview ──
function openImagePreview(url) {
    document.getElementById('imagePreviewImg').src = url;
    document.getElementById('imagePreviewModal').classList.add('active');
}

// ── Notifications ──
let notifOpen = false;
async function toggleNotifications() {
    const dd = document.getElementById('notifDropdown');
    notifOpen = !notifOpen;
    if (!notifOpen) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;">Loading...</div>';
    try {
        const resp = await fetch(`${apiUrl}/notifications/`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (resp.ok) {
            const notifs = await resp.json();
            if (notifs.length === 0) {
                dd.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;">No notifications</div>';
            } else {
                dd.innerHTML = `<div style="padding:8px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);">
                    <span style="font-weight:700;font-size:13px;">Notifications</span>
                    <button class="btn-small btn-secondary" onclick="markAllRead()" style="font-size:11px;padding:4px 8px;">Mark all read</button>
                </div>`;
                notifs.slice(0, 20).forEach(n => {
                    const cls = n.is_read ? 'notif-item read' : 'notif-item';
                    dd.innerHTML += `<div class="${cls}" onclick="markRead(${n.id})">${escapeHtml(n.content)}<div class="notif-time">${n.created_at.substring(0,16).replace('T',' ')}</div></div>`;
                });
            }
        }
    } catch (e) { dd.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:13px;">Error</div>'; }
}

async function markRead(id) {
    await fetch(`${apiUrl}/notifications/${id}/read`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    fetchNotifCount();
}

async function markAllRead() {
    await fetch(`${apiUrl}/notifications/read-all`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    document.getElementById('notifBadge').style.display = 'none';
    toggleNotifications();
    toggleNotifications();
}

async function fetchNotifCount() {
    try {
        const resp = await fetch(`${apiUrl}/notifications/unread-count`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (resp.ok) {
            const data = await resp.json();
            const badge = document.getElementById('notifBadge');
            if (data.count > 0) { badge.textContent = data.count; badge.style.display = ''; }
            else { badge.style.display = 'none'; }
        }
    } catch (e) {}
}
fetchNotifCount();
setInterval(fetchNotifCount, 30000);

// ── Moderation ──
let currentModTab = 'members';

function showModerationPanel() {
    document.getElementById('modModal').classList.add('active');
    showModTab('members');
}

function showModTab(tab) {
    currentModTab = tab;
    document.querySelectorAll('.mod-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    const content = document.getElementById('modContent');
    content.innerHTML = '<div class="browse-empty">Loading...</div>';

    if (tab === 'members') loadMembers();
    else if (tab === 'bans') loadBans();
    else if (tab === 'channel') loadChannelMod();
}

async function loadMembers() {
    const content = document.getElementById('modContent');
    try {
        const resp = await fetch(`${apiUrl}/servers/${serverId}/mod/members`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (resp.ok) {
            const members = await resp.json();
            content.innerHTML = '';
            members.forEach(m => {
                const div = document.createElement('div');
                div.className = 'friend-card';
                div.innerHTML = `<div class="friend-avatar">${(m.display_name || m.username)[0].toUpperCase()}</div>
                    <div class="friend-info"><span class="friend-name">${escapeHtml(m.display_name || m.username)}</span><span class="friend-status-text">@${escapeHtml(m.username)}</span></div>
                    <div class="friend-actions">
                        <button class="btn-small btn-danger" onclick="kickUser(${m.id})">Kick</button>
                        <button class="btn-small btn-danger" onclick="banUser(${m.id})">Ban</button>
                    </div>`;
                content.appendChild(div);
            });
        }
    } catch (e) { content.innerHTML = '<div class="browse-empty">Error loading members</div>'; }
}

async function loadBans() {
    const content = document.getElementById('modContent');
    try {
        const resp = await fetch(`${apiUrl}/servers/${serverId}/mod/bans`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (resp.ok) {
            const bans = await resp.json();
            if (bans.length === 0) { content.innerHTML = '<div class="browse-empty">No banned users.</div>'; return; }
            content.innerHTML = '';
            bans.forEach(b => {
                const div = document.createElement('div');
                div.className = 'friend-card';
                div.innerHTML = `<div class="friend-avatar">B</div>
                    <div class="friend-info"><span class="friend-name">User #${b.user_id}</span><span class="friend-status-text">${b.reason || 'No reason'}</span></div>
                    <div class="friend-actions"><button class="btn-small btn-secondary" onclick="unbanUser(${b.user_id})">Unban</button></div>`;
                content.appendChild(div);
            });
        }
    } catch (e) { content.innerHTML = '<div class="browse-empty">Error loading bans</div>'; }
}

function loadChannelMod() {
    const content = document.getElementById('modContent');
    const isLocked = window.CONFIG.isChannelLocked;
    const channelName = window.CONFIG.currentChannelName;
    content.innerHTML = `<div style="padding:12px;">
        <p style="margin-bottom:12px;color:var(--text-secondary);">Channel: #${channelName}</p>
        <button class="btn-small ${isLocked ? 'btn-primary' : 'btn-danger'}" onclick="${isLocked ? 'unlockChannel()' : 'lockChannel()'}">${isLocked ? 'Unlock Channel' : 'Lock Channel'}</button>
    </div>`;
}

async function kickUser(userId) {
    if (!confirm('Kick this user?')) return;
    await fetch(`${apiUrl}/servers/${serverId}/mod/kick`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
    });
    loadMembers();
}

async function banUser(userId) {
    const reason = prompt('Ban reason (optional):') || '';
    await fetch(`${apiUrl}/servers/${serverId}/mod/ban`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, reason: reason })
    });
    loadMembers();
}

async function unbanUser(userId) {
    await fetch(`${apiUrl}/servers/${serverId}/mod/ban/${userId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    });
    loadBans();
}

async function lockChannel() {
    await fetch(`${apiUrl}/servers/${serverId}/mod/channels/${channelId}/lock`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    });
    location.reload();
}

async function unlockChannel() {
    await fetch(`${apiUrl}/servers/${serverId}/mod/channels/${channelId}/unlock`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
    });
    location.reload();
}

// Close dropdowns on outside click
document.addEventListener('click', function(e) {
    if (notifOpen && !e.target.closest('.notification-bell-wrapper')) {
        notifOpen = false;
        document.getElementById('notifDropdown').style.display = 'none';
    }
});
