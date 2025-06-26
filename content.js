// Listen for messages from popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'setQuality') {
        setPreferredQuality(request.quality, true);
    }
});

// On initial load, auto-apply saved quality
chrome.storage.sync.get('preferredQuality', function (data) {
    const preferredQuality = data.preferredQuality || '1080p60';
    setPreferredQuality(preferredQuality, false);
});

function setPreferredQuality(preferredQuality, shouldReload) {
    // Try to find available qualities from the player (example selector, may need adjustment)
    const qualityButtons = document.querySelectorAll('[data-testid="player-quality-option"]');
    let availableQualities = Array.from(qualityButtons).map(btn => btn.textContent.trim());

    // Fallback: if not found in DOM, just set sessionStorage as before
    if (availableQualities.length === 0) {
        sessionStorage.setItem('stream_quality', preferredQuality);
        if (shouldReload) location.reload();
        return;
    }

    // Find the best match: preferred, or next lower available
    let selectedQuality = preferredQuality;
    if (!availableQualities.includes(preferredQuality)) {
        // Sort qualities descending (assuming format like "1080p60", "720p60", etc.)
        availableQualities.sort((a, b) => parseInt(b) - parseInt(a));
        selectedQuality = availableQualities.find(q => parseInt(q) <= parseInt(preferredQuality)) || availableQualities[0];
    }

    sessionStorage.setItem('stream_quality', selectedQuality);
    if (shouldReload) location.reload();
}

document.querySelectorAll('.i18n').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = chrome.i18n.getMessage(key);
});
