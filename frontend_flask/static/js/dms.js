// DMs page JavaScript
// Expects window.CONFIG with: apiUrl, token

const apiUrl = window.CONFIG.apiUrl;
const token = window.CONFIG.token;
const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json" };

// Tab switching
function showDmTab(name, btn) {
    document.querySelectorAll('.friends-list').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.friends-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('dm-tab-' + name).style.display = '';
    if (btn) btn.classList.add('active');
}

// Sidebar friend search
function filterFriends() {
    const q = document.getElementById('friendSearchInput').value.toLowerCase();
    document.querySelectorAll('.dm-friend-item').forEach(el => {
        const name = el.getAttribute('data-username').toLowerCase();
        el.style.display = name.includes(q) ? '' : 'none';
    });
}

// Start DM with a friend (for friends without existing conversation)
async function startDmWith(username) {
    try {
        const resp = await fetch(apiUrl + '/dms/', {
            method: 'POST', headers, body: JSON.stringify({ username: username })
        });
        if (resp.ok) {
            const data = await resp.json();
            window.location.href = '/dms/' + data.id;
        }
    } catch (e) {}
}

// Friend request actions
async function sendFriendRequest() {
    const input = document.getElementById('addFriendInput');
    const msgEl = document.getElementById('addFriendMsg');
    const username = input.value.trim();
    if (!username) return;

    try {
        const resp = await fetch(apiUrl + '/friends/request', {
            method: 'POST', headers, body: JSON.stringify({ username: username })
        });
        if (resp.ok) {
            msgEl.textContent = 'Friend request sent to ' + username + '!';
            msgEl.className = 'add-friend-msg success';
            msgEl.style.display = '';
            input.value = '';
        } else {
            const data = await resp.json();
            msgEl.textContent = data.detail || 'Failed to send request';
            msgEl.className = 'add-friend-msg error';
            msgEl.style.display = '';
        }
    } catch (e) {
        msgEl.textContent = 'Network error';
        msgEl.className = 'add-friend-msg error';
        msgEl.style.display = '';
    }
}

async function acceptRequest(id) {
    await fetch(apiUrl + '/friends/request/' + id + '/accept', { method: 'POST', headers });
    location.reload();
}

async function denyRequest(id) {
    await fetch(apiUrl + '/friends/request/' + id + '/deny', { method: 'POST', headers });
    location.reload();
}

async function cancelRequest(id) {
    await fetch(apiUrl + '/friends/request/' + id, { method: 'DELETE', headers });
    location.reload();
}

async function removeFriend(userId) {
    if (!confirm('Remove this friend?')) return;
    await fetch(apiUrl + '/friends/' + userId, { method: 'DELETE', headers });
    location.reload();
}

// Handle Enter key in add friend input
document.getElementById('addFriendInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendFriendRequest();
});
