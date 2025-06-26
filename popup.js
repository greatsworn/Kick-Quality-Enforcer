const select = document.getElementById('qualitySelect');

// Load saved value
chrome.storage.sync.get('preferredQuality', function (data) {
    if (data.preferredQuality) {
        select.value = data.preferredQuality;
    } else {
        select.value = ""; // "Seçiniz" seçili kalır
    }
});

// When selection changes
select.addEventListener('change', function () {
    const selectedQuality = select.value;

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
