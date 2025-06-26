// This file contains JavaScript code that detects the browser's default language and updates the content of the webpage accordingly.

document.addEventListener("DOMContentLoaded", function() {
    const lang = navigator.language || navigator.userLanguage; 
    const content = {
        en: {
            title: "Kick Quality Enforcer",
            description: "This browser extension helps you maintain high-quality content.",
            instructions: "To use this extension, simply install it and follow the on-screen instructions."
        },
        tr: {
            title: "Kick Kalite Zorlayıcı",
            description: "Bu tarayıcı uzantısı, yüksek kaliteli içeriği korumanıza yardımcı olur.",
            instructions: "Bu uzantıyı kullanmak için, sadece yükleyin ve ekrandaki talimatları izleyin."
        }
    };

    const translations = {
        en: {
            "desc-title": "What is Kick Quality Enforcer?",
            "desc-text": "Kick Quality Enforcer is a browser extension that automatically sets the highest stream quality on Kick.com. Enjoy your favorite streams in the best possible quality without manual adjustments!",
            "screenshots-title": "Screenshots"
        },
        tr: {
            "desc-title": "Kick Quality Enforcer Nedir?",
            "desc-text": "Kick Quality Enforcer, Kick.com'da en yüksek yayın kalitesini otomatik olarak ayarlayan bir tarayıcı eklentisidir. Sevdiğiniz yayınları her zaman en iyi kalitede izleyin, manuel ayarlarla uğraşmayın!",
            "screenshots-title": "Ekran Görüntüleri"
        }
    };

    function setLanguage(lang) {
        for (const id in translations[lang]) {
            document.getElementById(id).textContent = translations[lang][id];
        }
        document.title = content[lang].title;
        document.getElementById("description").textContent = content[lang].description;
        document.getElementById("instructions").textContent = content[lang].instructions;
        document.documentElement.lang = lang;
    }

    window.setLanguage = setLanguage;
    const userLang = navigator.language.startsWith('tr') ? 'tr' : 'en';
    setLanguage(userLang);

    const selectedLang = lang.startsWith("tr") ? "tr" : "en";

    document.title = content[selectedLang].title;
    document.getElementById("description").textContent = content[selectedLang].description;
    document.getElementById("instructions").textContent = content[selectedLang].instructions;

    setLanguage(selectedLang);
});