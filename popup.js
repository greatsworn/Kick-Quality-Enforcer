const qualityOptions = document.getElementById('qualitySelect');

// Load saved value
chrome.storage.sync.get('preferredQuality', function (data) {
    if (data.preferredQuality) {
        // Find and check the radio button for saved quality
        const radio = document.querySelector(`input[type="radio"][value="${data.preferredQuality}"]`);
        if (radio) {
            radio.checked = true;
        }
    }
});

// When radio selection changes
qualityOptions.addEventListener('change', function (event) {
    // Only handle radio button changes
    if (!event.target.matches('input[type="radio"]')) return;
    
    const selectedQuality = event.target.value;

    // Save selected quality
    chrome.storage.sync.set({ preferredQuality: selectedQuality }, function () {
        console.log('Saved preferred quality:', selectedQuality);

        // Send message to content script in active tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'setQuality',
                quality: selectedQuality
            });
        });
    });
});

document.querySelectorAll('.i18n').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = chrome.i18n.getMessage(key);
});
