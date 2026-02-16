// Dashboard page JavaScript

// Handle join server form
document.getElementById('joinForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const serverId = document.getElementById('joinServerId').value;
    if (serverId) {
        // POST to join endpoint
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/servers/' + serverId + '/join';
        document.body.appendChild(form);
        form.submit();
    }
});
