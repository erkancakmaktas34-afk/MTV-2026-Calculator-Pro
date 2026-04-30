// --- VIRTUAL ROUTER & STATE ---
let currentView = 'home';
let formData = {
    calculationMode: 'MTV',
    registrationDate: 'after2018',
    registrationYear: 2026,
    vehicleType: '',
    engineSize: '',
    motorPower: '',
    vehicleValue: 0,
    matrahTier: 0,
    vehicleWeight: '',
    vehicleAge: '',
    vehicleModelYear: '',
    vehicleSeat: '',
    panelvanEngine: '',
    motoEngine: '',
    displayDetails: {}
};

// --- PREMIUM & ADS BRIDGE ---
let isPremium = localStorage.getItem('isPremium') === 'true';

window.onPurchaseSuccess = (result) => {
    isPremium = true;
    localStorage.setItem('isPremium', 'true');
    updateAdsVisibility();
    showModal("Tebrikler!", "Reklamlar kalıcı olarak kaldırıldı.", "info");
    navigateTo('home');
};

window.onPurchaseError = (error) => {
    if (error && error.includes("Kullanıcı iptal")) return;
    showModal("Bilgi", error, "info");
};

async function removeAds() {
    playClickSound();
    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.removeAds) {
        AndroidTheme.removeAds();
    } else {
        showModal("Hata", "Ödeme sistemi hazır değil.", "warning");
    }
}

let onAdDismissedCallback = null;
window.onAdDismissed = (result) => {
    if (onAdDismissedCallback) {
        onAdDismissedCallback();
        onAdDismissedCallback = null;
    }
};

async function showInterstitialAd() {
    if (isPremium) return Promise.resolve();
    return new Promise((resolve) => {
        onAdDismissedCallback = resolve;
        if (typeof AndroidTheme !== 'undefined' && AndroidTheme.showInterstitial) {
            AndroidTheme.showInterstitial();
        } else {
            resolve();
        }
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    navigateTo('home');

    if (window.Capacitor && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('backButton', () => {
            if (currentView === 'home') window.Capacitor.Plugins.App.exitApp();
            else handleBack();
        });
    }

    // Splash Screen Kapanış ve Status Bar Ayarı
    if (window.Capacitor && window.Capacitor.Plugins.SplashScreen) {
        setTimeout(async () => {
            await window.Capacitor.Plugins.SplashScreen.hide();
            setTimeout(async () => {
                const statusBar = window.Capacitor?.Plugins?.StatusBar;
                if (statusBar) {
                    await statusBar.setStyle({ style: 'DARK' }); // BEYAZ ikonlar
                    await statusBar.setBackgroundColor({ color: '#000000' });
                }
            }, 200);
        }, 500);
    }
});

// --- THEME & SCROLL FIXES ---
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.documentElement.style.colorScheme = saved;

    if (window.Capacitor && window.Capacitor.Plugins.StatusBar) {
        window.Capacitor.Plugins.StatusBar.setStyle({ style: 'DARK' });
        window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: '#000000' });
    }
}

function resetScroll() {
    window.scrollTo(0, 0);
    const main = document.getElementById('main-container');
    if (main) main.scrollTop = 0;
}
window.addEventListener('resize', resetScroll);
window.addEventListener('orientationchange', () => {
    resetScroll();
    setTimeout(resetScroll, 300);
});

// --- NAVIGATION ---
function navigateTo(viewName) {
    const appRoot = document.getElementById('app-root');
    appRoot.innerHTML = '';
    appRoot.className = 'w-full h-full view-' + viewName;

    updateProgressBar(viewName);

    if (viewName === 'home') appRoot.innerHTML = renderHomeView();
    else if (viewName === 'sub_selection') appRoot.innerHTML = renderElectricSubView();
    else if (viewName === 'details') {
        appRoot.innerHTML = renderDetailsView();
        runMatrahUpdate();
    } else if (viewName === 'result') {
        renderResultView(appRoot);
        runConfetti();
    }

    if (window.lucide) lucide.createIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    currentView = viewName;
}

// --- VIEWS (Örnek Fonksiyonlar - Tam Dosyada Daha Uzun) ---
function renderDetailsView() {
    return `
    <div class="animate-slide-up flex flex-col relative pb-8">
        <h2 class="text-lg font-bold mb-4">Araç Detayları</h2>
        <div id="dynamicInputs" class="space-y-4">
             ${getBodyInputsHTML()}
        </div>
        <div class="mt-6 flex flex-col gap-2">
            <button onclick="calculateAndShowResult()" class="primary-btn">
                HESAPLA <i data-lucide="calculator" class="w-4 h-4"></i>
            </button>
            <button onclick="handleBack()" class="text-back-btn">Geri Dön</button>
        </div>
    </div>`;
}

// ... Diğer tüm veri ve hesaplama mantığı burada devam eder ...