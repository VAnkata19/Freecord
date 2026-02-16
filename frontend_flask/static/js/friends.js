// Friends page JavaScript
// Expects window.CONFIG with: apiUrl, token

const apiUrl = window.CONFIG.apiUrl;
const token = window.CONFIG.token;
const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json" };

function showTab(name) {
    document.querySelectorAll('.friends-list').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.friends-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + name).style.display = '';
    event.target.classList.add('active');
}

async function sendFriendRequest() {
    const input = document.getElementById('addFriendInput');
    const errorEl = document.getElementById('addFriendError');
    errorEl.style.display = 'none';

    try {
        const resp = await fetch(apiUrl + '/friends/request', {
            method: 'POST', headers, body: JSON.stringify({ username: input.value.trim() })
        });
        if (resp.ok) {
            document.getElementById('addFriendModal').classList.remove('active');
            input.value = '';
            location.reload();
        } else {
            const data = await resp.json();
            errorEl.textContent = data.detail || 'Failed';
            errorEl.style.display = '';
        }
    } catch (e) { errorEl.textContent = 'Network error'; errorEl.style.display = ''; }
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

async function unblockUser(userId) {
    await fetch(apiUrl + '/friends/block/' + userId, { method: 'DELETE', headers });
    location.reload();
}

// Handle Enter key in add friend input
document.getElementById('addFriendInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendFriendRequest();
});
