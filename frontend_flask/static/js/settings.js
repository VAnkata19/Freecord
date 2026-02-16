// Settings page JavaScript

// Live preview of selected avatar
document.getElementById('avatarInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        const existing = document.querySelector('.settings-avatar-img');
        const placeholder = document.querySelector('.settings-avatar-placeholder');
        if (existing) {
            existing.src = ev.target.result;
        } else if (placeholder) {
            const img = document.createElement('img');
            img.src = ev.target.result;
            img.className = 'settings-avatar-img';
            img.alt = 'Avatar';
            placeholder.replaceWith(img);
        }
    };
    reader.readAsDataURL(file);
});
