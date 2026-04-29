// --- WEB WORKER INITIALIZATION (SAFE) ---
let mtvWorker = null;

// Global calculation and metadata storage
let calculationResult = null;
let pendingMatrahCallback = null;

try {
    mtvWorker = new Worker('worker.js');

    // CENTRAL WORKER RESPONSE HANDLER
    mtvWorker.onmessage = function (e) {
        const { type, payload } = e.data;

        // Legacy support (if worker returns direct object)
        if (!type && e.data.total) {
            calculationResult = e.data;
            navigateTo('result');
            return;
        }

        if (type === 'calculationResult') {
            calculationResult = payload;
            navigateTo('result');
            // GECIKMELI REKLAM KALDIRILDI - Reklam artık butona basınca tetikleniyor.
        }
        else if (type === 'matrahTiers') {
            if (pendingMatrahCallback) {
                pendingMatrahCallback(payload);
                pendingMatrahCallback = null;
            }
        }
    };

    mtvWorker.onerror = function (err) {
        console.error('Worker error:', err);
        mtvWorker = null; // Fallback to main thread
    };
} catch (e) {
    console.warn('Web Worker not supported, falling back to main thread calculations.');
    mtvWorker = null;
}


// State
let currentView = 'home';
let formData = {
    calculationMode: 'MTV',
    registrationDate: 'after2018',
    registrationYear: 2026,
    vehicleType: '', // e.g. 'otomobil', 'elektrikli_otomobil'
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

// --- PREMIUM & ADS LOGIC (Google Play Billing & AdMob) ---
let isPremium = localStorage.getItem('isPremium') === 'true';
let isRestoring = false;
let isPurchasing = false;

// --- NATIVE BILLING CALLBACKS ---
window.onPurchaseSuccess = (result) => {
    const wasAlreadyPremium = localStorage.getItem('isPremium') === 'true';

    // 1. Durumu Sessizce Güncelle
    isPremium = true;
    localStorage.setItem('isPremium', 'true');

    // 2. UI Elemanlarını ANINDA Gizle
    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.removeAdsBanner) {
        AndroidTheme.removeAdsBanner();
    }
    const premiumElements = document.querySelectorAll('#removeAdsBtn, .premium-btn, .premium-btn-container, .landscape-btn-wrapper');
    premiumElements.forEach(el => {
        el.style.display = 'none';
        el.classList.add('hidden');
    });

    // 3. PROFESYONEL UX KARARI
    // Sadece kullanıcı bir butona bastıysa bilgilendirme yap.
    if (isPurchasing) {
        // Kullanıcı az önce 'Satın Al' butonuna bastı ve işlem bitti.
        showModal(t('iap.info'), t('iap.success'), "info");
        isPurchasing = false;
        setTimeout(() => location.reload(), 2000);
    } else if (isRestoring) {
        // Kullanıcı 'Geri Yükle' butonuna bastı.
        const msg = wasAlreadyPremium
            ? "İşlem Başarılı: Zaten reklamsız sürümü kullanıyorsunuz. Tüm haklarınız aktif!"
            : "Satın alımlarınız başarıyla geri yüklendi. Teşekkür ederiz!";
        showModal(t('iap.info'), msg, "info");
        isRestoring = false;
        setTimeout(() => location.reload(), 2000);
    } else {
        // ARKA PLAN KONTROLÜ (Açılış, Re-install vb.)
        // Hiçbir mesaj gösterme, kullanıcıyı rahatsız etme. 
        // Eğer ilk kez tespit edildiyse (re-install sonrası ilk açılış), arayüzün tam oturması için sessizce yenile.
        if (!wasAlreadyPremium) {
            location.reload();
        }
    }

    isPurchasing = false;
    isRestoring = false;
};

window.onPurchaseNotFound = (result) => {
    if (isRestoring) {
        showModal(t('iap.info'), "Aktif bir satın alma bulunamadı. Lütfen daha önce satın aldığınız Google Hesabı ile Play Store'a giriş yaptığınızdan emin olun.", "warning");
    }
    isRestoring = false;
};

window.onPurchaseError = (error) => {
    isPurchasing = false;
    isRestoring = false;
    if (error && (error.includes("Kullanıcı iptal") || error.toLowerCase().includes("cancel") || error.includes("iptal"))) {
        return;
    }
    showModal(t('iap.error'), error || t('iap.unavailable'), "warning");
};

async function initBilling() {
    // Native Android zaten başlatıyor
    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.checkPremium) {
        AndroidTheme.checkPremium();
    }
}

async function removeAds() {
    playClickSound();

    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.removeAds) {
        isPurchasing = true; // Flag aktifleştirildi
        AndroidTheme.removeAds();
    } else {
        showModal(t('iap.error'), t('iap.unavailable'), "warning");
    }
}

async function restorePurchases() {
    playClickSound();
    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.checkPremium) {
        isRestoring = true;
        AndroidTheme.checkPremium();
        toast("Satın alımlarınız kontrol ediliyor...");
    } else {
        showModal(t('iap.error'), t('iap.unavailable'), "warning");
    }
}

// --- NATIVE ADMOB (BRIDGE) ---
let onAdDismissedCallback = null;

async function initAdMob() {
    // Native tarafında otomatik başlatılıyor, JS tarafında gerekirse hazırlık yapılabilir.
    console.log("AdMob JS bridge initialized.");
}

// Native'den çağrılan callback
window.onAdDismissed = (result) => {
    if (onAdDismissedCallback) {
        onAdDismissedCallback();
        onAdDismissedCallback = null;
    }
};

// YARDIMCI: UYARI MODALI (Toast yerine)
function toast(msg) {
    showModal("Bilgi", msg, "info");
}

// GÜVENLİ REKLAM TETİKLEME (FALLBACK DAHİL)
async function showInterstitialAd() {
    // 1. Premium ise direkt geç
    if (localStorage.getItem('isPremium') === 'true') {
        return Promise.resolve();
    }

    // REKLAM GÖSTERİLİYOR - Native taraf status bar'ı yönetecek, JS tarafından müdahale YAPMA
    // Sadece köprüyü çağır, renk yönetimi tamamen Java tarafında

    return new Promise((resolve) => {
        // Java'dan gelecek yanıtı bekleyen callback'i ayarla
        onAdDismissedCallback = () => {
            // Reklam kapandıktan SONRA: Browser'ın kendine gelmesi için 30ms bekle
            setTimeout(() => {
                restoreStatusBar();
                resolve();
            }, 30);
        };

        // Java Köprüsünü Çağır
        if (typeof AndroidTheme !== 'undefined' && AndroidTheme.showInterstitial) {
            AndroidTheme.showInterstitial();
        } else {
            // Köprü yoksa (Tarayıcıdaysak) direkt geç
            resolve();
        }
    });
}

function clearAppCache() {
    // 1. Önemli verileri yedekle
    const isPremium = localStorage.getItem('isPremium');

    // 2. Her şeyi temizle
    localStorage.clear();

    // 3. Yedeklenen verileri geri yükle
    if (isPremium) {
        localStorage.setItem('isPremium', isPremium);
    }

    if ('caches' in window) {
        caches.keys().then(names => {
            for (let name of names) {
                try { caches.delete(name); } catch (e) { console.error(e); }
            }
        });
    }
    // Delay reload to allow sound to play
    setTimeout(() => location.reload(true), 100);
}



function resetPremium() {
    localStorage.removeItem('isPremium');
    location.reload();
}

function reloadPage() {
    // Delay reload to allow sound to play
    setTimeout(() => location.reload(), 100);
}

// --- SOUND EFFECTS with Web Audio API ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

// Initialize Audio Context on first user interaction
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    return audioCtx;
}

// Calculate Sound - Unique deeper tone
function playCalculateSound() {
    try {
        const ctx = initAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Deeper, more substantial sound for calculation
        oscillator.frequency.value = 400;
        oscillator.type = 'triangle';

        gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
    } catch (e) {
        console.log('Calculate sound error:', e);
    }
}

// Click Sound - Short beep
// Click Sound - Short beep with 50ms Debounce to prevent "double sounds"
let lastClickSoundTime = 0;
function playClickSound() {
    const now = Date.now();
    if (now - lastClickSoundTime < 150) return;
    lastClickSoundTime = now;

    try {
        const ctx = initAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = 800; // Higher pitch for click
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.05);
    } catch (e) {
        console.log('Sound error:', e);
    }
}



// Global Click Listener for Sound
document.addEventListener('click', (e) => {
    // Check if clicked element is a button, input, or interactive card
    const target = e.target.closest('button, .vehicle-card, .primary-btn, .modal-close, .share-menu-btn, input[type="radio"], input[type="checkbox"], option');

    // EXCEPTION: If the target is the "HESAPLA" button, SKIP the generic click sound
    // because it has its own unique 'playCalculateSound()'
    if (target && target.innerText && target.innerText.includes('HESAPLA')) {
        return;
    }

    // EXCEPTION: Select elements (dropdown)
    // Android plays its own native click sound. Mute JS sound to prevent double-click noise.
    if (e.target.tagName === 'SELECT' || e.target.closest('select')) {
        return;
    }

    if (target) {
        playClickSound();
    }
}, true); // Capture phase için true

// Dropdown seçenekleri için ses - IPTAL EDILDI (Sistem sesi yeterli)
/* 
document.addEventListener('change', (e) => {
    if (e.target.tagName === 'SELECT') {
        // Native ses engellemesi için
        e.preventDefault();
        e.stopPropagation();
        playClickSound();
    }
}, true);
*/

// Native touch feedback'i devre dışı bırak (Android için)
// Native touch feedback pasif bırakıldı - IPTAL EDILDI
/*
document.addEventListener('touchstart', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') {
        // Pasif dinleyici kullanarak native feedback'i engelle
        e.stopPropagation();
    }
}, { passive: false });
*/

// REMOVED: Global Change Listener for Select/Dropdown
// This was causing double sound (native click + change event)
/* 
document.addEventListener('change', (e) => {
    if (e.target.tagName === 'SELECT') {
        playClickSound();
    }
}); 
*/

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    navigateTo('home');

    // Initialize Ads and Billing
    initAdMob();
    initBilling();

    // OTOMATIK YENILEME: Uygulama açılışında arka planda sürüm kontrolü veya temizlik simülasyonu
    // Kullanıcıya hissettirmeden en güncel verilerin çekilmesini sağlar.
    setTimeout(() => {
        console.log("Startup maintenance running...");
        // Sayfayı tamamen yenilemek döngüye sokacağı için burada sadece önbellek kontrolü yapılır.
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        }
    }, 1000);

    // Handle Physical Back Button for Android
    if (window.Capacitor && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('backButton', () => {
            if (currentView === 'home') {
                window.Capacitor.Plugins.App.exitApp();
            } else {
                handleBack();
            }
        });
    }

    // --- CAPACITOR POST-SPLASH RE-LOCK ---
    if (window.Capacitor && window.Capacitor.Plugins.SplashScreen) {
        setTimeout(async () => {
            // Splash screen'i manuel kapat
            await window.Capacitor.Plugins.SplashScreen.hide();

            setTimeout(async () => {
                const statusBar = window.Capacitor?.Plugins?.StatusBar;
                if (statusBar) {
                    await statusBar.setStyle({ style: 'DARK' });
                    await statusBar.setBackgroundColor({ color: '#000000' });
                }
            }, 200);
        }, 500); // 500ms bekle ve kapat
    }
});



// --- THEME LOGIC ---
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    // FORCE COLOR SCHEME AT ROOT LEVEL (Android Picker Fix)
    document.documentElement.style.colorScheme = saved;
    updateThemeIcon(saved);

    // FORCE BLACK STATUS BAR ALWAYS + WHITE ICONS (STYLE DARK)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#000000');

    // Use Capacitor StatusBar plugin if available to force light icons
    /*
    if (window.Capacitor && window.Capacitor.Plugins.StatusBar) {
        window.Capacitor.Plugins.StatusBar.setStyle({ style: 'DARK' });
        window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: '#000000' });
    }
    */
    // INITIAL STATUS BAR SET
    restoreStatusBar();

    // ANDROID WEBVIEW FORCE DARK SYNC
    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.setDarkMode) {
        AndroidTheme.setDarkMode(saved === 'dark');
    }

    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

function toggleTheme() {
    playClickSound(); // Explicitly trigger for consistency
    const current = document.documentElement.getAttribute('data-theme');
    const target = current === 'dark' ? 'light' : 'dark';

    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.classList.remove('animate-toggle');
        void btn.offsetWidth; // Force reflow
        btn.classList.add('animate-toggle');
        setTimeout(() => btn.classList.remove('animate-toggle'), 700);
    }

    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    // FORCE COLOR SCHEME AT ROOT LEVEL (Android Picker Fix)
    document.documentElement.style.colorScheme = target;
    updateThemeIcon(target);

    // FORCE BLACK UPDATE
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#000000');

    // ANDROID WEBVIEW FORCE DARK SYNC
    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.setDarkMode) {
        AndroidTheme.setDarkMode(target === 'dark');
    }

    // Update Status Bar to match new theme
    restoreStatusBar();
}

// --- STATUS BAR HELPERS ---
async function setStatusBarColor(color, style = 'DARK') {
    // 1. Meta Tag Update
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);

    // 2. Capacitor Status Bar
    if (window.Capacitor && window.Capacitor.Plugins.StatusBar) {
        try {
            await window.Capacitor.Plugins.StatusBar.setStyle({ style: style });
            await window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: color });
        } catch (e) {
            console.log('StatusBar error:', e);
        }
    }

    // 3. Android Bridge (Helper if exists)
    if (typeof AndroidTheme !== 'undefined' && AndroidTheme.setStatusBarColor) {
        AndroidTheme.setStatusBarColor(color);
    }
}

function restoreStatusBar() {
    const currentTheme = localStorage.getItem('theme') || 'dark';

    if (currentTheme === 'dark') {
        // KOYU MOD: Deep Lacivert bar, BEYAZ ikonlar
        setStatusBarColor('#0a192f', 'LIGHT');
    } else {
        // AÇIK MOD: Beyaz bar, SİYAH ikonlar
        setStatusBarColor('#ffffff', 'DARK');
    }
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;

    // FIX: Dark Mode = Sun (to switch to Light), Light Mode = Moon (to switch to Dark)
    const iconName = theme === 'dark' ? 'sun' : 'moon';
    const colorClass = theme === 'dark' ? 'text-yellow-400' : 'text-electricBlue';

    icon.setAttribute('data-lucide', iconName);
    // Remove old classes and add new ones carefully
    icon.className = `w-5 h-5 ${colorClass}`;
    lucide.createIcons();
}

function updateMetaThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        // CSS ile tam senkron: #0a192f (Deep Navy)
        meta.setAttribute('content', theme === 'dark' ? '#0a192f' : '#f8fafc');
    }
}

function navigateTo(viewName) {
    const appRoot = document.getElementById('app-root');

    // 1. Önce içeriği hazırla (Değişkene al)
    let nextHTML = "";
    if (viewName === 'home') nextHTML = renderHomeView();
    else if (viewName === 'sub_selection') nextHTML = renderElectricSubView();
    else if (viewName === 'details') nextHTML = renderDetailsView();
    else if (viewName === 'result') {
        const temp = document.createElement('div');
        renderResultView(temp);
        nextHTML = temp.innerHTML;
    }

    // 2. ATOMİK SWAP (requestAnimationFrame ile beyaz ekranı engelle)
    requestAnimationFrame(() => {
        appRoot.innerHTML = nextHTML;
        appRoot.className = 'w-full h-full view-' + viewName;

        updateProgressBar(viewName);
        window.scrollTo({ top: 0, behavior: 'instant' });

        // İkonlar ve Animasyonlar için Thread'i serbest bırak
        setTimeout(() => {
            lucide.createIcons();
            if (viewName === 'details') initDetailsHelpers();
            if (viewName === 'result') {
                startResultAnimations();
                // Konfeti kaldırıldı, check işareti CSS ile otomatik animasyonlu gelecek.
            }
            enforceSelectColors();
        }, 16); // ~1 frame delay
    });

    currentView = viewName;
}

// calculateAndShowResult is defined below (with validation) at line ~1780

// Sonuç ekranı animasyonlarını güvenli tetiklemek için yardımcı fonksiyon
function startResultAnimations() {
    if (!calculationResult) return;
    const rawTotal = parseInt(calculationResult.total.replace(/[^0-9]/g, ''));
    const rawInst = rawTotal / 2;

    animateValue("total-tax-anim", 0, rawTotal, 1000, 0);
    animateValue("inst1-anim", 0, rawInst, 1000, 2);
    animateValue("inst2-anim", 0, rawInst, 1000, 2);

    // Işıltı Efekti Gecikmesi: Rakam animasyonu (1000ms) bittikten biraz sonra (1500ms) başlat
    setTimeout(() => {
        const panels = document.querySelectorAll('.result-shine-panel');
        panels.forEach(p => p.classList.add('shine-active'));
    }, 1500);
}

// ANDROID 14+ FIX: DOM'a eklenen yeni select'leri otomatik yakala
const selectObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
                // Eğer eklenen node bir select ise veya içinde select varsa
                if (node.tagName === 'SELECT') {
                    enforceSelectColors();
                } else if (node.querySelectorAll) {
                    const selects = node.querySelectorAll('select');
                    if (selects.length > 0) {
                        enforceSelectColors();
                    }
                }
            }
        });
    });
});

// Observer'ı başlat
if (document.getElementById('app-root')) {
    selectObserver.observe(document.getElementById('app-root'), {
        childList: true,
        subtree: true
    });
}

function updateProgressBar(viewName) {
    let p = 0; let l = '';
    if (viewName === 'home') { p = 25; l = t('progress.vehicleSelect'); }
    if (viewName === 'sub_selection') { p = 50; l = t('progress.typeSelect'); }
    if (viewName === 'details') { p = 75; l = t('progress.details'); }
    if (viewName === 'result') { p = 100; l = t('progress.result'); }

    const fill = document.getElementById('progressFill');
    const pct = document.getElementById('progressPercent');
    const lbl = document.getElementById('stepLabel');
    if (fill) fill.style.width = `${p}%`;
    if (pct) pct.innerText = `${p}%`;
    if (lbl) lbl.innerText = l;
}

// --- ROTATION & RESIZE FIX (AGRESSIVE) ---
function resetScroll() {
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    const main = document.getElementById('main-container');
    const app = document.querySelector('.app-container');
    if (main) main.scrollTop = 0;
    if (app) app.scrollTop = 0;
}

window.addEventListener('resize', resetScroll);
window.addEventListener('orientationchange', () => {
    // Multiple resets to handle animation frame timing
    resetScroll();
    setTimeout(resetScroll, 100);
    setTimeout(resetScroll, 300);
    setTimeout(resetScroll, 600);
});

// --- INIT ---

// --- VIEWS ---

function renderHomeView() {
    return `
    <div class="animate-fade-in flex flex-col flex-1 h-full">
        <h2 class="text-lg font-bold mb-4 flex items-center gap-2 ml-1">
            ${t('home.title')}
        </h2>
        <div class="grid grid-cols-3 gap-2 content-start pt-2 flex-1">
            ${createCard('otomobil', 'car', t('vehicle.car'))}
            ${createCard('elektrikli', 'zap', t('vehicle.electric'), 'text-yellow-400')}
            ${createCard('motosiklet', 'bike', t('vehicle.motorcycle'), 'text-red-400')}
            ${createCard('kamyonet', 'truck', t('vehicle.pickup'), 'text-green-400')}
            ${createCard('minibus', 'bus', t('vehicle.minibus'), 'text-purple-400')}
            ${createCard('panelvan', 'box', t('vehicle.panelvan'), 'text-orange-400')}
            ${createCard('otobus', 'bus-front', t('vehicle.bus'), 'text-blue-400')}
            ${createCard('ucak', 'plane', t('vehicle.plane'), 'text-cyan-400')}
            ${createCard('helikopter', 'fan', t('vehicle.helicopter'), 'text-pink-400')}
        </div>
        
        ${!isPremium ? `
        <div class="premium-btn-container">
            <button id="removeAdsBtn" onclick="removeAds()" class="premium-btn group relative w-full max-w-xs overflow-hidden rounded-xl p-3.5 font-bold text-white shadow-lg shadow-amber-500/10 transition-all hover:shadow-amber-500/20 active:scale-[0.98]">
                <div class="relative flex items-center justify-center gap-2">
                    <i data-lucide="zap" class="w-5 h-5 fill-white"></i> 
                    <span class="tracking-widest">${t('btn.removeAds')}</span>
                </div>
            </button>
        </div>
        ` : ''}
    </div>
    `;
}

function renderElectricSubView() {
    return `
    <div class="animate-slide-up flex flex-col relative">
        <div class="flex-shrink-0">
            <div class="flex justify-between items-center mb-2">
                <h2 class="text-lg font-bold flex items-center gap-2 ml-1">
                    ${t('electric.title')}
                </h2>
            </div>
        </div>
        
        <div id="dynamicInputs">
            <div class="grid grid-cols-3 gap-2 content-start pt-2">
                ${createSubCard('elektrikli_otomobil', 'car', t('electric.car'))}
                ${createSubCard('elektrikli_motosiklet', 'bike', t('electric.motorcycle'))}
                ${createSubCard('elektrikli_minibus', 'bus', t('electric.minibus'))}
                ${createSubCard('elektrikli_panelvan', 'box', t('electric.panelvan'))}
                ${createSubCard('elektrikli_otobus', 'bus-front', t('electric.bus'))}
                ${createSubCard('elektrikli_kamyonet', 'truck', t('electric.truck'))}
            </div>
        </div>
        
        <div class="mt-4 flex flex-col flex-shrink-0">
            <!-- Dikey hizzalama için görünmez HESAPLA butonu (Boşluk koruyucu) -->
            <div style="height: 44px !important;" class="invisible">${t('btn.calculate')}</div>
            
            <button onclick="handleBack()" class="text-back-btn">
                <i data-lucide="arrow-left" class="w-3.5 h-3.5 inline"></i> ${t('btn.back')}
            </button>
        </div>
    </div>
    `;
}

function createCard(type, icon, label, colorClass = 'text-electricBlue') {
    return `
    <div class="vehicle-card cursor-pointer p-2 rounded-xl border border-gray-700 bg-white/5 flex flex-col items-center justify-center gap-2 text-center group"
onclick="handleSelection('${type}')">
        <i data-lucide="${icon}" class="w-10 h-10 ${colorClass} vehicle-icon group-hover:scale-110 transition-transform"></i>
        <span class="text-sm font-bold">${label}</span>
    </div>
    `;
}

function createSubCard(type, icon, label) {
    return `
    <div class="vehicle-card cursor-pointer p-2 rounded-xl border border-gray-700 bg-white/5 flex flex-col items-center justify-center gap-2 text-center group"
onclick="handleSubSelection('${type}')">
        <i data-lucide="${icon}" class="w-10 h-10 text-yellow-400 vehicle-icon group-hover:scale-110 transition-transform"></i>
        <span class="text-sm font-bold">${label}</span>
    </div>
    `;
}

function handleSelection(type) {
    resetState();
    if (type === 'elektrikli') {
        // Go to Sub Selection Screen
        navigateTo('sub_selection');
    } else {
        formData.vehicleType = type;
        navigateTo('details');
    }
}

function handleSubSelection(type) {
    formData.vehicleType = type;
    navigateTo('details');
}

function renderDetailsView() {
    const map = getVehicleMap();
    const title = (map[formData.vehicleType] || t('vehicle.car')) + ' ' + t('details.suffix');

    return `
    <div class="animate-slide-up flex flex-col relative">
        <div class="flex-shrink-0">
            <div class="flex justify-between items-center mb-2">
                <h2 class="text-[15.5px] font-bold flex items-center gap-2 ml-1 truncate pr-2" style="max-width: 65vw;">
                    ${title}
                </h2>
                <div class="flex gap-3">
                     ${getHelpersHTML()}
                </div>
            </div>
        </div>

        <div id="dynamicInputs" class="space-y-2 custom-scrollbar pb-1">
             ${getBodyInputsHTML()}
        </div>

        <div class="mt-4 flex flex-col flex-shrink-0">
            <button onclick="calculateAndShowResult()"
                class="primary-btn px-8 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 w-full justify-center">
                ${t('btn.calculate')} <i data-lucide="calculator" class="w-4 h-4"></i>
            </button>
            <button onclick="handleBack()" class="text-back-btn">
                <i data-lucide="arrow-left" class="w-3.5 h-3.5 inline"></i> ${t('btn.back')}
            </button>
        </div>
    </div>
    `;
}

// ... rest of the file ...

// function goBack() removed - logic moved to handleBack



function renderResultView(container) {
    const res = calculationResult || { total: '0 TL', inst1: '0 TL', inst2: '0 TL' };
    const details = formData.displayDetails;

    const map = getVehicleMap();

    let detailRows = '';
    const addRow = (label, value) => {
        if (value) {
            detailRows += `<div class="flex justify-between border-b border-white/5 py-0.25 last:border-0"><span class="text-gray-400">${label}:</span><span class="font-medium text-white">${value}</span></div>`;
        }
    };

    addRow(t('result.vehicleType'), map[formData.vehicleType] || formData.vehicleType.replace(/_/g, ' ').toUpperCase());

    if (formData.vehicleModelYear) {
        const calculatedAge = 2026 - parseInt(formData.vehicleModelYear) + 1;
        addRow(t('result.modelYear'), `${formData.vehicleModelYear} (${calculatedAge} ${t('result.ageOf')})`);
    } else {
        addRow(t('result.vehicleAge'), details.ageLabel || formData.vehicleAge);
    }

    if (formData.engineSize && (formData.vehicleType === 'otomobil')) { addRow(t('result.engineSize'), details.engineLabel); }
    if (formData.motorPower && formData.vehicleType.startsWith('elektrikli_')) { addRow(t('result.motorPower'), details.powerLabel); }
    if (formData.motoEngine && formData.vehicleType.includes('motosiklet')) { addRow(t('result.engineSize'), details.motoLabel); }
    if (formData.vehicleWeight) {
        const lbl = formData.vehicleType.includes('ucak') || formData.vehicleType.includes('helikopter') ? t('result.maxTakeoffWeight') : t('result.maxWeight');
        addRow(lbl, details.weightLabel);
    }
    if (formData.panelvanEngine && formData.vehicleType.includes('panelvan')) { addRow(t('result.engineType'), details.panelvanLabel); }
    if (formData.vehicleSeat && (formData.vehicleType.includes('minibus') || formData.vehicleType.includes('otobus'))) { addRow(t('result.capacity'), details.seatLabel); }

    if (formData.displayDetails.matrahLabel) { addRow(t('result.matrah'), details.matrahLabel); }

    container.innerHTML = `
    <div class="animate-zoom-in flex flex-col px-0">
        <h2 class="text-xl font-black text-center mx-auto mb-1 leading-tight flex-shrink-0 w-full">${t('result.title')}</h2>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 min-h-0 relative z-0">
            <div class="bg-white/5 rounded-2xl pt-2 px-2 pb-1 border border-white/10 overflow-hidden relative flex-grow flex flex-col justify-center min-h-[120px] result-shine-panel">
                 <div class="text-center mb-0 z-10 relative">
                    <p class="text-[9px] text-gray-400 mb-0 uppercase tracking-widest">${t('result.yearlyTotal')}</p>
                    <div id="total-tax-anim" class="text-3xl font-black text-primary animate-price-pulse">0 TL</div>
                 </div>
                 <div class="grid grid-cols-2 gap-2 mt-0.5 z-10 relative">
                    <div class="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                        <p class="text-[9px] text-gray-400 uppercase tracking-tighter mb-0">${t('result.january')}</p>
                        <p id="inst1-anim" class="text-xl font-black text-white">0 TL</p>
                    </div>
                    <div class="bg-white/5 p-2 rounded-xl border border-white/5 text-center">
                        <p class="text-[9px] text-gray-400 uppercase tracking-tighter mb-0">${t('result.july')}</p>
                        <p id="inst2-anim" class="text-xl font-black text-white">0 TL</p>
                    </div>
                 </div>
                 <p class="text-[11px] text-gray-500 text-center mt-1.5 opacity-80">${t('result.installmentNote')}</p>
            </div>

            <div class="bg-white/3 rounded-2xl p-2.5 text-[11px] space-y-0.5 border border-white/5 flex-grow flex flex-col justify-center">
                 ${detailRows}
            </div>
        </div>

        <div class="landscape-actions-grid w-full mt-2 flex flex-col gap-2 flex-shrink-0 z-50">
            ${!isPremium ? `
            <div class="flex-shrink-0 w-full landscape-btn-wrapper">
                <button onclick="removeAds()" class="premium-btn group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 p-2.5 font-bold text-white shadow-lg transition-all active:scale-[0.98]">
                    <div class="relative flex items-center justify-center gap-2">
                        <i data-lucide="zap" class="w-4 h-4 fill-white"></i> 
                        <span class="tracking-widest">${t('btn.removeAds')}</span>
                    </div>
                </button>
            </div>
            ` : ''}

            <div class="flex-shrink-0 w-full landscape-btn-wrapper">
                <button onclick="shareResult()" class="share-result-btn w-full rounded-xl text-white transition-all active:scale-[0.98]">
                    <i data-lucide="share-2" class="w-3.5 h-3.5"></i> 
                    <span class="btn-text">${t('btn.share')}</span>
                </button>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-2 w-full flex-shrink-0">
            <button onclick="handleBackToDetails()" class="cyan-result-btn w-full rounded-xl transition-all active:scale-[0.98]">
                <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> <span class="btn-text">${t('btn.backShort')}</span>
            </button>
            <button onclick="handleFullReset()" class="cyan-result-btn w-full rounded-xl transition-all active:scale-[0.98]">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> <span class="btn-text">${t('btn.reset')}</span>
            </button>
        </div>

        <div class="mt-3 flex justify-center w-full flex-shrink-0 mb-1">
            <button onclick="openPaymentPage()" class="pay-now-btn flex items-center justify-center gap-2 text-white rounded-lg transition-all active:scale-[0.95]">
                <i data-lucide="credit-card" class="w-3.5 h-3.5"></i>
                <span class="uppercase">${t('btn.payNow')}</span>
            </button>
        </div>
    </div>
    `;

    // Animations removed from here - Triggered in navigateTo for better DOM sync
}

async function openPaymentPage() {
    playClickSound();

    // Önce reklam göster
    if (!localStorage.getItem('isPremium')) {
        await showInterstitialAd();
    }

    // Reklam kapandıktan sonra sayfayı aç
    const url = "https://dijital.gib.gov.tr/hizliOdemeler/MTVTPCOdeme";
    window.open(url, '_system');
}

function animateValue(id, start, end, duration, decimals = 0) {
    const obj = document.getElementById(id);
    if (!obj) return;

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = progress * (end - start) + start;

        // Hide kuruş if it's a whole number at the end, or follow requested decimals
        const hasDecimals = current % 1 !== 0;
        const minFrac = hasDecimals ? 2 : 0;

        obj.innerHTML = new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: minFrac,
            maximumFractionDigits: 2
        }).format(current);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

async function shareResult() {
    const res = calculationResult || { total: '0 TL', inst1: '0 TL', inst2: '0 TL' };
    const details = formData.displayDetails;

    const map = getVehicleMap();

    let text = `${t('share.title')}\n`;
    text += `--------------------------\n`;
    text += `${t('share.vehicleType')}: ${map[formData.vehicleType] || formData.vehicleType}\n`;

    if (formData.vehicleModelYear) {
        const calculatedAge = 2026 - parseInt(formData.vehicleModelYear) + 1;
        text += `${t('share.modelYear')}: ${formData.vehicleModelYear} (${calculatedAge} ${t('share.ageOf')})\n`;
    } else if (formData.vehicleAge) {
        text += `${t('share.vehicleAge')}: ${details.ageLabel || formData.vehicleAge}\n`;
    }

    if (formData.engineSize && formData.vehicleType === 'otomobil') { text += `${t('share.engineSize')}: ${details.engineLabel}\n`; }
    if (formData.motorPower && formData.vehicleType.startsWith('elektrikli_')) { text += `${t('share.motorPower')}: ${details.powerLabel}\n`; }
    if (formData.motoEngine && formData.vehicleType.includes('motosiklet')) { text += `${t('share.motorOption')}: ${details.motoLabel}\n`; }
    if (formData.vehicleWeight) {
        const lbl = formData.vehicleType.includes('ucak') || formData.vehicleType.includes('helikopter') ? t('share.takeoffWeight') : t('share.totalWeight');
        text += `${lbl}: ${details.weightLabel}\n`;
    }
    if (formData.panelvanEngine && formData.vehicleType.includes('panelvan')) { text += `${t('share.engineType')}: ${details.panelvanLabel}\n`; }
    if (formData.vehicleSeat && (formData.vehicleType.includes('minibus') || formData.vehicleType.includes('otobus'))) { text += `${t('share.capacity')}: ${details.seatLabel}\n`; }
    if (details.matrahLabel) { text += `${t('share.matrah')}: ${details.matrahLabel}\n`; }

    text += `--------------------------\n`;
    text += `${t('share.yearlyTotal')}: ${res.total}\n`;
    text += `${t('share.installments')}: ${res.inst1} x 2\n\n`;
    text += t('share.footer');

    const share = window.Capacitor?.Plugins?.Share;
    if (share) {
        share.share({
            title: t('share.title'),
            text: text,
            dialogTitle: t('share.dialogTitle')
        }).catch(e => { });
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
}


// --- GENERATORS ---

function getHelpersHTML() {
    const type = formData.vehicleType;
    let html = '';
    const isAuto = type === 'otomobil' || type === 'elektrikli_otomobil';
    if (isAuto && (type.startsWith('elektrikli_') || formData.registrationDate === 'after2018')) {
        html += `<button onclick="showMatrahInfo()" class="text-[11px] text-text-dim hover:text-accent-primary flex items-center gap-1 transition-colors"><i data-lucide="help-circle" class="w-2.5 h-2.5"></i> ${t('matrah.whatIs')}</button>`;
    }
    if (type.includes('kamyonet')) {
        html += `<button onclick="showKamyonetInfo()" class="text-[11px] text-warningAmber hover:text-white flex items-center gap-1 transition-colors bg-warningAmber/10 px-1.5 py-1 rounded-lg border border-warningAmber/20"><i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i> ${t('matrah.ruhsatWarning')}</button>`;
    }
    return html;
}

function getElectricSwitcherHTML() {
    return `
    <div class="mb-4 p-3 bg-white/5 rounded-2xl border border-white/10">
        <label class="block text-[13px] font-bold text-electricBlue mb-2">Elektrikli Araç Türü</label>
        <div class="grid grid-cols-3 gap-2">
            ${createTypeBtn('Otomobil', 'elektrikli_otomobil', 'car')}
            ${createTypeBtn('Motosiklet', 'elektrikli_motosiklet', 'bike')}
            ${createTypeBtn('Minibüs', 'elektrikli_minibus', 'bus')}
            ${createTypeBtn('Panelvan', 'elektrikli_panelvan', 'box')}
            ${createTypeBtn('Otobüs', 'elektrikli_otobus', 'bus-front')}
            ${createTypeBtn('Kamyon', 'elektrikli_kamyonet', 'truck')}
        </div>
    </div>`;
}

function createTypeBtn(label, value, icon) {
    const isSel = formData.vehicleType === value;
    const activeClass = isSel ? 'bg-electricBlue text-deepNavy border-electricBlue' : 'bg-transparent text-gray-400 border-gray-700 hover:border-gray-500';
    return `<button onclick="switchSubType('${value}')" class="${activeClass} border rounded-xl p-2 flex flex-col items-center gap-1 transition-all text-[11px] font-semibold"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i>${label}</button>`;
}

function getBodyInputsHTML() {
    const type = formData.vehicleType;

    // Strict Routing
    if (type === 'otomobil' || type === 'elektrikli_otomobil') {
        return generateAutoInputs(type);
    }

    if (type === 'motosiklet' || type === 'elektrikli_motosiklet') {
        return generateMotoInputs();
    }

    // Fallback for all other types (Kamyonet, Minibus, Otobus, Panelvan, etc.)
    // Includes both electric and ICE versions
    return generateOtherInputs(type);
}



function generateAutoInputs(type) {
    let dateHTML = '';
    if (!type.startsWith('elektrikli_')) {
        dateHTML = `
        <div class="mb-2">
            <label class="block text-[13px] font-bold text-gray-300 mb-1">${t('label.registrationDate')}</label>
            <div class="grid grid-cols-2 gap-2">
                <label class="cursor-pointer">
                    <input type="radio" name="rdate" value="after2018" class="peer sr-only" ${formData.registrationDate === 'after2018' ? 'checked' : ''} onchange="handleDateSwitch('after2018')">
                    <div class="tescil-btn p-3 rounded-xl text-center h-full flex flex-col justify-center items-center gap-1">
                        <span class="text-[16px] font-bold">${t('label.dateAfterVal')}</span>
                        <span class="text-[13.5px]">${t('label.andAfter')}</span>
                    </div>
                </label>
                <label class="cursor-pointer">
                    <input type="radio" name="rdate" value="before2018" class="peer sr-only" ${formData.registrationDate === 'before2018' ? 'checked' : ''} onchange="handleDateSwitch('before2018')">
                    <div class="tescil-btn p-3.5 rounded-xl text-center h-full flex flex-col justify-center items-center gap-1">
                        <span class="text-[16px] font-bold">${t('label.dateBeforeVal')}</span>
                        <span class="text-[13.5px]">${t('label.andBefore')}</span>
                    </div>
                </label>
            </div>
        </div>`;
    }

    let engineHTML = '';
    if (type === 'otomobil') {
        engineHTML = `<div><label class="block text-[13px] font-bold text-gray-300 mb-1">${t('label.engineSize')}</label>
            <div class="custom-select-trigger" onclick="openEnginePicker()">
                <span id="trigger-engine">${formData.displayDetails.engineLabel || t('label.select')}</span>
                <div class="arrow"></div>
            </div>
        </div>`;
    } else if (type === 'elektrikli_otomobil') {
        engineHTML = `<div><label class="block text-[13px] font-bold text-gray-300 mb-1">${t('label.motorPower')}</label>
        <div class="custom-select-trigger" onclick="openPowerPicker()">
            <span id="trigger-power">${formData.displayDetails.powerLabel || t('label.select')}</span>
            <div class="arrow"></div>
        </div></div>`;
    }

    const infoText = type.startsWith('elektrikli')
        ? t('matrah.infoElectric')
        : t('matrah.infoNormal');

    const ageHtml = getYearAgeHTML(type);
    const isPost2018Auto = (type === 'otomobil' && formData.registrationDate === 'after2018');
    const isElectricAuto = (type === 'elektrikli_otomobil');
    const initialDisplay = (isPost2018Auto || isElectricAuto) ? 'block' : 'none';

    const matrahHtml = `<div id="matrahContainer" style="display:${initialDisplay}">
    <label class="block text-[13px] font-bold text-gray-300 mb-1">${t('label.vehicleValue')}</label>
    <div class="custom-select-trigger" onclick="openMatrahPicker()">
        <span id="trigger-matrah">${formData.displayDetails.matrahLabel || t('label.select')}</span>
        <div class="arrow"></div>
    </div>
    <p class="text-[11px] text-warningAmber mt-1 leading-snug"><i data-lucide="info" class="w-3.5 h-3.5 inline-block mr-0.5"></i> ${infoText}</p>
    </div>`;

    return `<div class="space-y-2">${dateHTML}${engineHTML}${ageHtml}${matrahHtml}</div>`;
}

function generateMotoInputs() {
    const isElectric = formData.vehicleType === 'elektrikli_motosiklet';
    const label = isElectric ? t('label.motorPower') : t('label.engineSize');

    let engineHTML = `<div><label class="block text-[13px] font-bold text-gray-300 mb-2">${label}</label>
    <div class="custom-select-trigger" onclick="openMotoPicker()">
        <span id="trigger-moto">${formData.displayDetails.motoLabel || t('label.select')}</span>
        <div class="arrow"></div>
    </div></div>`;

    return `<div class="space-y-4">${engineHTML}${getYearAgeHTML(formData.vehicleType)}</div>`;
}

function generateOtherInputs(type) {
    let extra = '';
    if (type.includes('kamyonet')) {
        extra = `<div><label class="block text-[13px] font-bold text-gray-300 mb-2">${t('label.maxWeight')}</label>
        <div class="custom-select-trigger" onclick="openWeightPicker()">
            <span id="trigger-weight">${formData.displayDetails.weightLabel || t('label.select')}</span>
            <div class="arrow"></div>
        </div></div>`;
    }
    else if (type.includes('minibus')) {
        extra = `<div><label class="block text-[13px] font-bold text-gray-300 mb-2">${t('label.seatCount')}</label>
        <div class="custom-select-trigger" onclick="openSeatPicker()">
            <span id="trigger-seat">${formData.displayDetails.seatLabel || t('label.select')}</span>
            <div class="arrow"></div>
        </div></div>`;
    }
    else if (type.includes('otobus')) {
        extra = `<div><label class="block text-[13px] font-bold text-gray-300 mb-2">${t('label.seatCount')}</label>
        <div class="custom-select-trigger" onclick="openSeatPicker()">
            <span id="trigger-seat">${formData.displayDetails.seatLabel || t('label.select')}</span>
            <div class="arrow"></div>
        </div></div>`;
    }
    else if (type.includes('panelvan')) {
        extra = `<div><label class="block text-[13px] font-bold text-gray-300 mb-2">${t('label.engineType')}</label>
        <div class="custom-select-trigger" onclick="openPanelvanPicker()">
            <span id="trigger-panelvan">${formData.displayDetails.panelvanLabel || t('label.select')}</span>
            <div class="arrow"></div>
        </div></div>`;
    }
    else if (type === 'ucak' || type === 'helikopter') {
        extra = `<div><label class="block text-[13px] font-bold text-gray-300 mb-2">${t('label.maxTakeoffWeight')}</label>
        <div class="custom-select-trigger" onclick="openWeightPicker()">
            <span id="trigger-weight">${formData.displayDetails.weightLabel || t('label.select')}</span>
            <div class="arrow"></div>
        </div></div>`;
    }

    return `<div class="space-y-4">${extra}${getYearAgeHTML(type)}</div>`;
}

function getYearAgeHTML(type) {
    const isElectric = type.startsWith('elektrikli');
    const isPost2018Auto = (type === 'otomobil' && formData.registrationDate === 'after2018');
    const isPre2018Auto = (type === 'otomobil' && formData.registrationDate === 'before2018');
    const isElectricAuto = (type === 'elektrikli_otomobil');
    const isElectricMoto = (type === 'elektrikli_motosiklet');

    let minYear = 1977;
    let maxYear = 2026;

    if (isElectricAuto) {
        minYear = 2019;
    } else if (isPost2018Auto) {
        minYear = 2018;
    } else if (isPre2018Auto) {
        maxYear = 2017;
    }

    const savedAge = formData.vehicleAge || '';

    let yearOptions = `<option value="" selected>${t('label.select')}</option>`;
    for (let yr = maxYear; yr >= minYear; yr--) {
        yearOptions += `<option value="${yr}">${yr}</option>`;
    }

    if (maxYear >= 2011 && minYear <= 2011) {
        yearOptions += `<option value="2011_down">2011 ${t('picker.yearAndBefore')}</option>`;
    }

    let ageOptions = `<option value="">${t('label.select')}</option>`;
    const isComm = ['minibus', 'otobus', 'kamyonet', 'panelvan', 'elektrikli_minibus', 'elektrikli_otobus', 'elektrikli_kamyonet', 'elektrikli_panelvan'].includes(type) || type.includes('kamyonet');
    const isAir = (type === 'ucak' || type === 'helikopter');

    const addOpt = (val, txt) => `<option value="${val}" ${isSelected(val, savedAge)}>${txt}</option>`;

    if (isAir) {
        ageOptions += addOpt('1-3', `1 - 3 ${t('picker.age')}`);
        ageOptions += addOpt('4-5', `4 - 5 ${t('picker.age')}`);
        ageOptions += addOpt('6-10', `6 - 10 ${t('picker.age')}`);
        ageOptions += addOpt('11+', `11+ ${t('picker.age')}`);
    } else if (isComm) {
        ageOptions += addOpt('1-6', `1 - 6 ${t('picker.age')}`);
        ageOptions += addOpt('7-15', `7 - 15 ${t('picker.age')}`);
        ageOptions += addOpt('16+', t('picker.ageAndAbove'));
    } else if (type === 'motosiklet') {
        ageOptions += addOpt('1-3', `1 - 3 ${t('picker.age')}`);
        ageOptions += addOpt('4-6', `4 - 6 ${t('picker.age')}`);
        ageOptions += addOpt('7-11', `7 - 11 ${t('picker.age')}`);
        ageOptions += addOpt('12-15', `12 - 15 ${t('picker.age')}`);
        ageOptions += addOpt('16+', t('picker.ageAndAbove'));
    } else {
        // Otomobil ve diğerleri (Motosiklet/Ticari hariç)
        if (isPost2018Auto) {
            // 2018 ve sonrası: Sadece genç yaşlar (Maks 2026-2018+1 = 9 yaş)
            ageOptions += addOpt('1-3', `1 - 3 ${t('picker.age')}`);
            ageOptions += addOpt('4-6', `4 - 6 ${t('picker.age')}`);
            ageOptions += addOpt('7-11', `7 - 11 ${t('picker.age')}`);
        } else if (isPre2018Auto) {
            // 2017 ve öncesi: Sadece yaşlı yaşlar (Min 2026-2017+1 = 10 yaş)
            ageOptions += addOpt('7-11', `7 - 11 ${t('picker.age')}`);
            ageOptions += addOpt('12-15', `12 - 15 ${t('picker.age')}`);
            ageOptions += addOpt('16+', t('picker.ageAndAbove'));
        } else {
            // Elektrikli otomobil veya diğer genel durumlar
            ageOptions += addOpt('1-3', `1 - 3 ${t('picker.age')}`);
            ageOptions += addOpt('4-6', `4 - 6 ${t('picker.age')}`);
            ageOptions += addOpt('7-11', `7 - 11 ${t('picker.age')}`);
            ageOptions += addOpt('12-15', `12 - 15 ${t('picker.age')}`);
            ageOptions += addOpt('16+', t('picker.ageAndAbove'));
        }
    }

    // Karşılıklı pasifleştirme mantığı:
    // 1. Model yılı seçilmişse, Yaş alanı hesaplanmış olduğu için "pasif" görünür.
    // 2. Yaş alanı manuel seçilmişse (ve model yılı yoksa), Model Yılı "pasif" görünür.
    const ageDisabled = formData.vehicleModelYear ? 'disabled-field' : '';
    const yearDisabled = (!formData.vehicleModelYear && formData.vehicleAge) ? 'disabled-field' : '';

    return `
    <div class="grid grid-cols-2 gap-4">
        <div>
            <label class="block text-[13px] font-bold text-gray-300 mb-2">${t('label.modelYear')}</label>
            <div class="custom-select-trigger ${yearDisabled}" id="year-trigger" onclick="openCustomYearPicker()">
                <span id="trigger-year">${formData.vehicleModelYear || t('label.select')}</span>
                <div class="arrow"></div>
            </div>
        </div>
        <div>
            <label class="block text-[13px] font-bold text-gray-300 mb-2">${t('label.vehicleAge')}</label>
            <div class="custom-select-trigger ${ageDisabled}" id="age-trigger" onclick="openCustomAgePicker()">
                <span id="trigger-age">${formData.displayDetails.ageLabel || t('label.select')}</span>
                <div class="arrow"></div>
            </div>
        </div>
    </div>`;
}

// --- CUSTOM PICKER CORE LOGIC ---
let currentPickerCallback = null;

function openCustomPicker(title, options, currentVal, callback) {
    const overlay = document.getElementById('picker-overlay');
    const sheet = document.getElementById('picker-sheet');
    const titleEl = document.getElementById('picker-title');
    const optionsEl = document.getElementById('picker-options');

    if (!overlay || !sheet || !titleEl || !optionsEl) return;

    titleEl.innerText = title;
    currentPickerCallback = callback;

    // Build options
    optionsEl.innerHTML = options.map(opt => {
        const isSelected = String(opt.value) === String(currentVal);
        return `
            <button class="picker-option ${isSelected ? 'selected' : ''}" 
                    onclick="handlePickerSelection('${opt.value}', '${opt.label.replace(/'/g, "\\'")}')">
                ${opt.label}
            </button>
        `;
    }).join('') + '<div style="height: 120px; width: 100%; flex-shrink: 0;"></div>'; // Safe Area Spacer for Ads

    overlay.classList.remove('hidden');
    // Force a tiny delay for CSS transition
    setTimeout(() => overlay.classList.add('active'), 10);
    document.body.style.overflow = 'hidden';
}

function handlePickerSelection(value, label) {
    if (currentPickerCallback) {
        currentPickerCallback(value, label);
    }
    closePicker();
}

function closePicker() {
    const overlay = document.getElementById('picker-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }
}

// --- SPECIFIC PICKER HANDLERS ---

function openCustomYearPicker() {
    const type = formData.vehicleType;
    const isPost2018Auto = (type === 'otomobil' && formData.registrationDate === 'after2018');
    const isPre2018Auto = (type === 'otomobil' && formData.registrationDate === 'before2018');
    const isElectricAuto = (type === 'elektrikli_otomobil');

    let minYear = 1977;
    let maxYear = 2026;

    if (isElectricAuto) minYear = 2019;
    else if (isPost2018Auto) minYear = 2018;
    else if (isPre2018Auto) maxYear = 2017;

    const opts = [{ value: '', label: t('label.select') }];
    for (let yr = maxYear; yr >= minYear; yr--) {
        opts.push({ value: String(yr), label: String(yr) });
    }
    if (maxYear >= 2011 && minYear <= 2011) {
        opts.push({ value: '2011_down', label: `2011 ${t('picker.yearAndBefore')}` });
    }

    openCustomPicker(t('picker.selectYear'), opts, formData.vehicleModelYear, (val, lbl) => {
        if (val) {
            // Manuel Model Yılı seçildiğinde varsa manuel Araç Yaşını temizle 
            // (Zaten handleYearSelectLogic tarafından otomatik yaş atanacak)
            formData.vehicleModelYear = val;
            handleYearSelectLogic(val);
        } else {
            formData.vehicleModelYear = '';
            // Opsiyonel: Yılı temizleyince yaşı da temizle? Kullanıcı seçimine kalsın.
        }

        // Refresh triggers
        const yearTrigger = document.getElementById('trigger-year');
        if (yearTrigger) yearTrigger.innerText = lbl || t('label.select');

        const ageTrigger = document.getElementById('trigger-age');
        if (ageTrigger) ageTrigger.innerText = formData.displayDetails.ageLabel || t('label.select');

        // Refresh to update disabled states
        const dynamicInputs = document.getElementById('dynamicInputs');
        if (dynamicInputs) {
            dynamicInputs.innerHTML = getBodyInputsHTML();
            lucide.createIcons();
            runMatrahUpdate();
        }
    });
}

function handleYearSelectLogic(val) {
    if (!val) {
        formData.vehicleAge = '';
        formData.displayDetails.ageLabel = t('label.select');
        return;
    }

    let ageVal;
    if (val === '2011_down') {
        ageVal = 20; // 16+
    } else {
        ageVal = 2026 - parseInt(val) + 1;
    }

    let ageKey = '1-3';
    let label = `1 - 3 ${t('picker.age')}`;

    const type = formData.vehicleType;
    const isCommercial = ['minibus', 'otobus', 'kamyonet', 'panelvan', 'elektrikli_minibus', 'elektrikli_otobus', 'elektrikli_kamyonet', 'elektrikli_panelvan'].includes(type) || type.includes('kamyonet');
    const isAir = (type === 'ucak' || type === 'helikopter');

    if (isAir) {
        if (ageVal <= 3) { ageKey = '1-3'; label = `1 - 3 ${t('picker.age')}`; }
        else if (ageVal <= 5) { ageKey = '4-5'; label = `4 - 5 ${t('picker.age')}`; }
        else if (ageVal <= 10) { ageKey = '6-10'; label = `6 - 10 ${t('picker.age')}`; }
        else { ageKey = '11+'; label = `11+ ${t('picker.age')}`; }
    } else if (isCommercial) {
        if (ageVal <= 6) { ageKey = '1-6'; label = `1 - 6 ${t('picker.age')}`; }
        else if (ageVal <= 15) { ageKey = '7-15'; label = `7 - 15 ${t('picker.age')}`; }
        else { ageKey = '16+'; label = t('picker.ageAndAbove'); }
    } else {
        if (ageVal <= 3) { ageKey = '1-3'; label = `1 - 3 ${t('picker.age')}`; }
        else if (ageVal <= 7) { ageKey = '4-6'; label = `4 - 6 ${t('picker.age')}`; }
        else if (ageVal <= 11) { ageKey = '7-11'; label = `7 - 11 ${t('picker.age')}`; }
        else if (ageVal <= 15) { ageKey = '12-15'; label = `12 - 15 ${t('picker.age')}`; }
        else { ageKey = '16+'; label = t('picker.ageAndAbove'); }
    }

    formData.vehicleAge = ageKey;
    formData.displayDetails.ageLabel = label;
    // Matrah güncellemesini burada çağırmaya gerek yok, picker içinde DOM güncellendikten sonra çağrılıyor.
}

function openCustomAgePicker() {
    const type = formData.vehicleType;
    const isElectric = type.startsWith('elektrikli');
    const isComm = ['minibus', 'otobus', 'kamyonet', 'panelvan', 'elektrikli_minibus', 'elektrikli_otobus', 'elektrikli_kamyonet', 'elektrikli_panelvan'].includes(type) || type.includes('kamyonet');
    const isAir = (type === 'ucak' || type === 'helikopter');
    const isPost2018Auto = (type === 'otomobil' && formData.registrationDate === 'after2018');
    const isPre2018Auto = (type === 'otomobil' && formData.registrationDate === 'before2018');

    const opts = [{ value: '', label: t('label.select') }];

    if (isAir) {
        opts.push({ value: '1-3', label: `1 - 3 ${t('picker.age')}` }, { value: '4-5', label: `4 - 5 ${t('picker.age')}` }, { value: '6-10', label: `6 - 10 ${t('picker.age')}` }, { value: '11+', label: `11+ ${t('picker.age')}` });
    } else if (isComm) {
        opts.push({ value: '1-6', label: `1 - 6 ${t('picker.age')}` }, { value: '7-15', label: `7 - 15 ${t('picker.age')}` }, { value: '16+', label: t('picker.ageAndAbove') });
    } else if (type === 'motosiklet') {
        opts.push({ value: '1-3', label: `1 - 3 ${t('picker.age')}` }, { value: '4-6', label: `4 - 6 ${t('picker.age')}` }, { value: '7-11', label: `7 - 11 ${t('picker.age')}` }, { value: '12-15', label: `12 - 15 ${t('picker.age')}` }, { value: '16+', label: t('picker.ageAndAbove') });
    } else {
        if (isPost2018Auto) {
            opts.push({ value: '1-3', label: `1 - 3 ${t('picker.age')}` }, { value: '4-6', label: `4 - 6 ${t('picker.age')}` }, { value: '7-11', label: `7 - 11 ${t('picker.age')}` });
        } else if (isPre2018Auto) {
            opts.push({ value: '7-11', label: `7 - 11 ${t('picker.age')}` }, { value: '12-15', label: `12 - 15 ${t('picker.age')}` }, { value: '16+', label: t('picker.ageAndAbove') });
        } else {
            opts.push({ value: '1-3', label: `1 - 3 ${t('picker.age')}` }, { value: '4-6', label: `4 - 6 ${t('picker.age')}` }, { value: '7-11', label: `7 - 11 ${t('picker.age')}` }, { value: '12-15', label: `12 - 15 ${t('picker.age')}` }, { value: '16+', label: t('picker.ageAndAbove') });
        }
    }

    openCustomPicker(t('picker.selectAge'), opts, formData.vehicleAge, (val, lbl) => {
        if (val) {
            // Manuel Yaş seçildiğinde Model Yılını tamamen iptal et (Hesaplamadan kopsun)
            formData.vehicleModelYear = '';
            formData.vehicleAge = val;
            formData.displayDetails.ageLabel = lbl;
        } else {
            formData.vehicleAge = '';
            formData.displayDetails.ageLabel = t('label.select');
        }

        const trigger = document.getElementById('trigger-age');
        if (trigger) trigger.innerText = lbl || t('label.select');

        const yearTrigger = document.getElementById('trigger-year');
        if (yearTrigger) yearTrigger.innerText = t('label.select');

        // Refresh to update disabled states
        const dynamicInputs = document.getElementById('dynamicInputs');
        if (dynamicInputs) {
            dynamicInputs.innerHTML = getBodyInputsHTML();
            lucide.createIcons();
            runMatrahUpdate();
        }
    });
}

function openEnginePicker() {
    const opts = [
        { value: '1300_altı', label: `1300 cm³ ${t('picker.andBelow')}` },
        { value: '1301_1600', label: '1301 - 1600 cm³' },
        { value: '1601_1800', label: '1601 - 1800 cm³' },
        { value: '1801_2000', label: '1801 - 2000 cm³' },
        { value: '2001_2500', label: '2001 - 2500 cm³' },
        { value: '2501_3000', label: '2501 - 3000 cm³' },
        { value: '3001_3500', label: '3001 - 3500 cm³' },
        { value: '3501_4000', label: '3501 - 4000 cm³' },
        { value: '4001_üstü', label: `4001 cm³ ${t('picker.andAbove')}` }
    ];
    openCustomPicker(t('picker.selectEngine'), opts, formData.engineSize, (val, lbl) => {
        formData.engineSize = val;
        formData.displayDetails.engineLabel = lbl;
        const trigger = document.getElementById('trigger-engine');
        if (trigger) trigger.innerText = lbl;
        runMatrahUpdate();
    });
}

function openPowerPicker() {
    const opts = [
        { value: '0_70', label: '0 kW - 70 kW' },
        { value: '71_85', label: '71 kW - 85 kW' },
        { value: '86_105', label: '86 kW - 105 kW' },
        { value: '106_120', label: '106 kW - 120 kW' },
        { value: '121_150', label: '121 kW - 150 kW' },
        { value: '151_180', label: '151 kW - 180 kW' },
        { value: '181_210', label: '181 kW - 210 kW' },
        { value: '211_240', label: '211 kW - 240 kW' },
        { value: '241_üstü', label: `241 kW ${t('picker.andAbove')}` }
    ];
    openCustomPicker(t('picker.selectPower'), opts, formData.motorPower, (val, lbl) => {
        formData.motorPower = val;
        formData.displayDetails.powerLabel = lbl;
        const trigger = document.getElementById('trigger-power');
        if (trigger) trigger.innerText = lbl;
        runMatrahUpdate();
    });
}

function openMatrahPicker() {
    let year = formData.vehicleModelYear || "2026";
    if (!formData.vehicleModelYear && formData.vehicleAge) {
        const ageMap = {
            '1-3': '2026', '4-6': '2022', '7-11': '2019',
            '12-15': '2014', '16+': '2010',
            '1-6': '2026', '7-15': '2019',
            '4-5': '2022', '6-10': '2020', '11+': '2015'
        };
        year = ageMap[formData.vehicleAge] || "2026";
    }

    // Doğrudan mtv_data_2026.js fonksiyonlarını kullan (Worker'a gerek yok)
    let tiers = [];
    if (formData.vehicleType.startsWith('elektrikli_')) {
        tiers = getEVMatrahTiers(formData.motorPower || '86_105', year);
    } else {
        tiers = getMatrahTiersForCC(formData.engineSize || '1301_1600', year);
    }

    const f = new Intl.NumberFormat('tr-TR');
    const opts = tiers.map((tier, i) => {
        const lower = i === 0 ? 0 : tiers[i - 1] + 1;
        const label = i === tiers.length - 1 ? `${f.format(lower)} TL ${t('picker.andAbove')}` : `${f.format(lower)} - ${f.format(tier)} TL`;
        return { value: i, label: label };
    });

    openCustomPicker(t('picker.selectValue'), opts, formData.matrahTier, (val, lbl) => {
        formData.matrahTier = parseInt(val);
        formData.displayDetails.matrahLabel = lbl;
        const trigger = document.getElementById('trigger-matrah');
        if (trigger) trigger.innerText = lbl;
    });
}

function openMotoPicker() {
    const isElectric = formData.vehicleType === 'elektrikli_motosiklet';
    let opts = [];
    if (isElectric) {
        opts = [
            { value: '0_6', label: `0 kW - 6 kW ${t('picker.taxFree')}` },
            { value: '7_15', label: '7 kW - 15 kW' },
            { value: '16_40', label: '16 kW - 40 kW' },
            { value: '41_60', label: '41 kW - 60 kW' },
            { value: '61_üstü', label: `61 kW ${t('picker.andAbove')}` }
        ];
    } else {
        opts = [
            { value: '0_99', label: '0 - 99 cm³' },
            { value: '100_250', label: '100 - 250 cm³' },
            { value: '251_650', label: '251 - 650 cm³' },
            { value: '651_1200', label: '651 - 1.200 cm³' },
            { value: '1201_üstü', label: `1.201 cm³ ${t('picker.andAbove')}` }
        ];
    }

    let title = t('picker.selectMoto');
    if (isElectric) title = t('picker.selectMotoPower');

    openCustomPicker(title, opts, formData.motoEngine, (val, lbl) => {
        formData.motoEngine = val;
        formData.displayDetails.motoLabel = lbl;
        const trigger = document.getElementById('trigger-moto');
        if (trigger) trigger.innerText = lbl;
        // Motosiklet için matrah update gerekmez ama future-proof olsun
        runMatrahUpdate();
    });
}

function openWeightPicker() {
    const isAir = (formData.vehicleType === 'ucak' || formData.vehicleType === 'helikopter');
    let opts = [];
    if (isAir) {
        opts = [
            { value: '1150_altı', label: '0 - 1.150 kg' },
            { value: '1151_1800', label: '1.151 - 1.800 kg' },
            { value: '1801_3000', label: '1.801 - 3.000 kg' },
            { value: '3001_5000', label: '3.001 - 5.000 kg' },
            { value: '5001_10000', label: '5.001 - 10.000 kg' },
            { value: '10001_20000', label: '10.001 - 20.000 kg' },
            { value: '20001_üstü', label: `20.001 kg ${t('picker.andAbove')}` }
        ];
    } else {
        opts = [
            { value: '1500', label: '0 - 1.500 kg' },
            { value: '1501_3500', label: '1.501 - 3.500 kg' },
            { value: '3501_5000', label: '3.501 - 5.000 kg' },
            { value: '5001_10000', label: '5.001 - 10.000 kg' },
            { value: '10001_20000', label: '10.001 - 20.000 kg' },
            { value: '20001_üstü', label: `20.001 kg ${t('picker.andAbove2')}` }
        ];
    }
    openCustomPicker(t('picker.selectWeight'), opts, formData.vehicleWeight, (val, lbl) => {
        formData.vehicleWeight = val;
        formData.displayDetails.weightLabel = lbl;
        const trigger = document.getElementById('trigger-weight');
        if (trigger) trigger.innerText = lbl;
    });
}

function openSeatPicker() {
    const isMinibus = formData.vehicleType.includes('minibus');
    let opts = [];
    if (isMinibus) {
        opts = [
            { value: '0_17', label: `0 - 17 ${t('picker.seat')}` },
            { value: '18_25', label: `18 - 25 ${t('picker.seat')}` },
            { value: '26_35', label: `26 - 35 ${t('picker.seat')}` },
            { value: '36_45', label: `36 - 45 ${t('picker.seat')}` },
            { value: '46_üstü', label: `46 ${t('picker.seatAndAbove')}` }
        ];
    } else {
        opts = [
            { value: '0_25', label: `0 - 25 ${t('picker.seat')}` },
            { value: '26_35', label: `26 - 35 ${t('picker.seat')}` },
            { value: '36_45', label: `36 - 45 ${t('picker.seat')}` },
            { value: '46_üstü', label: `46 ${t('picker.seatAndAbove')}` }
        ];
    }
    openCustomPicker(t('picker.selectSeat'), opts, formData.vehicleSeat, (val, lbl) => {
        formData.vehicleSeat = val;
        formData.displayDetails.seatLabel = lbl;
        const trigger = document.getElementById('trigger-seat');
        if (trigger) trigger.innerText = lbl;
    });
}

function openPanelvanPicker() {
    const isElectric = formData.vehicleType.startsWith('elektrikli_');
    let opts = [];
    if (isElectric) {
        opts = [
            { value: '0_115', label: '0 kW - 115 kW' },
            { value: '116_üstü', label: `116 kW ${t('picker.andAbove')}` }
        ];
    } else {
        opts = [
            { value: '1900_altı', label: `1900 ${t('picker.below')}` },
            { value: '1901_üstü', label: `1901 ${t('picker.above')}` }
        ];
    }
    openCustomPicker(t('picker.selectEngineType'), opts, formData.panelvanEngine, (val, lbl) => {
        formData.panelvanEngine = val;
        formData.displayDetails.panelvanLabel = lbl;
        const trigger = document.getElementById('trigger-panelvan');
        if (trigger) trigger.innerText = lbl;
    });
}


// --- LOGIC CONTROLLERS ---

function handleBack() {
    // Use current view state for navigation instead of header text
    if (currentView === 'result') {
        navigateTo('details');
        return;
    }
    if (currentView === 'details') {
        if (formData.vehicleType && formData.vehicleType.startsWith('elektrikli_')) {
            navigateTo('sub_selection');
        } else {
            resetState();
            navigateTo('home');
        }
        return;
    }
    if (currentView === 'sub_selection') {
        resetState();
        navigateTo('home');
        return;
    }
    // Fallback
    resetState();
    navigateTo('home');
}

function handleBackToDetails() { navigateTo('details'); }
function handleFullReset() { resetState(); navigateTo('home'); }

function resetState() {
    formData.registrationDate = 'after2018';
    formData.vehicleType = '';
    formData.engineSize = ''; // Boş yap
    formData.motorPower = ''; // Boş yap
    formData.vehicleValue = 0;
    formData.matrahTier = 0;
    formData.vehicleWeight = ''; // Boş yap
    formData.vehicleAge = ''; // Boş yap
    formData.vehicleModelYear = '';
    formData.vehicleSeat = ''; // Boş yap
    formData.panelvanEngine = ''; // Boş yap
    formData.motoEngine = ''; // Boş yap
    formData.displayDetails = {};
}

function handleDateSwitch(val) {
    formData.registrationDate = val;
    // Reset selections on date change to prevent stale/invalid visual states
    formData.vehicleModelYear = '';
    formData.vehicleAge = '';
    formData.displayDetails.ageLabel = '';
    formData.matrahTier = 0; // Pre-select lowest tier
    formData.displayDetails.matrahLabel = '';

    navigateTo('details');
}

function switchSubType(type) {
    formData.vehicleType = type;
    navigateTo('details');
}

function initDetailsHelpers() {
    runMatrahUpdate();
}

// REDUNDANT FUNCTIONS REMOVED IN FAVOR OF CUSTOM PICKER LOGIC


function runMatrahUpdate() {
    const container = document.getElementById('matrahContainer');
    if (!container) return;

    // Visibility
    let show = false;
    let showInfo = false;
    const isPost2018Auto = (formData.vehicleType === 'otomobil' && formData.registrationDate === 'after2018');
    const isElectricAuto = (formData.vehicleType === 'elektrikli_otomobil');

    if (isElectricAuto || isPost2018Auto) {
        show = true;
        // Matrah artık her yaş grubunda görünür kalacak, otomatik gizleme kaldırıldı.
    }

    // UI Info Update
    const infoId = 'matrahAgeInfo';
    let infoEl = document.getElementById(infoId);

    if (showInfo) {
        if (!infoEl) {
            infoEl = document.createElement('div');
            infoEl.id = infoId;
            infoEl.className = 'p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-electricBlue mt-2 flex items-start gap-2 animate-fade-in';
            container.parentNode.insertBefore(infoEl, container.nextSibling);
        }
        infoEl.innerHTML = `<i data-lucide="info" class="w-4 h-4 shrink-0"></i> <span>Aracınız 7 yaş ve üzerinde olduğu için matrah farkından muaftır, en düşük dilimden hesaplanmıştır.</span>`;
        if (window.lucide) lucide.createIcons();
    } else if (infoEl) {
        infoEl.remove();
    }

    container.style.display = show ? 'block' : 'none';

    // Populate Tiers if shown
    if (show) {
        let year = formData.vehicleModelYear || "2026";
        if (!formData.vehicleModelYear && formData.vehicleAge) {
            const ageMap = {
                '1-3': '2026', '4-6': '2022', '7-11': '2019',
                '12-15': '2014', '16+': '2010',
                '1-6': '2026', '7-15': '2019',
                '4-5': '2022', '6-10': '2020', '11+': '2015'
            };
            year = ageMap[formData.vehicleAge] || "2026";
        }

        // Doğrudan mtv_data_2026.js fonksiyonlarını kullan
        let tiers = [];
        if (formData.vehicleType.startsWith('elektrikli_')) {
            tiers = getEVMatrahTiers(formData.motorPower || '86_105', year);
        } else {
            tiers = getMatrahTiersForCC(formData.engineSize || '1301_1600', year);
        }

        // Update Label if current selection is invalid for new tiers
        if (formData.matrahTier >= tiers.length) formData.matrahTier = 0;

        const f = new Intl.NumberFormat('tr-TR');
        const labels = tiers.map((tier, i) => {
            const lower = i === 0 ? 0 : tiers[i - 1] + 1;
            return i === tiers.length - 1 ? `${f.format(lower)} TL ${t('picker.andAbove')}` : `${f.format(lower)} - ${f.format(tier)} TL`;
        });

        formData.displayDetails.matrahLabel = labels[formData.matrahTier] || t('label.select');
        const trigger = document.getElementById('trigger-matrah');
        if (trigger) trigger.innerText = formData.displayDetails.matrahLabel;
    }
}

async function calculateAndShowResult(event) {
    if (event) event.preventDefault();
    playCalculateSound();

    // 1. Doğrulama (Validation)
    const type = formData.vehicleType;
    const missingFields = [];

    if (!formData.vehicleAge) missingFields.push(`<strong>${t('validation.age')}</strong> ${t('validation.orModelYear')} <strong>${t('validation.modelYear')}</strong>`);
    if (type === 'otomobil' && !formData.engineSize) missingFields.push(`<strong>${t('validation.engineCC')}</strong>`);
    if (type === 'elektrikli_otomobil' && !formData.motorPower) missingFields.push(`<strong>${t('validation.motorPowerKW')}</strong>`);
    if (type.includes('motosiklet') && !formData.motoEngine) {
        const lbl = type === 'elektrikli_motosiklet' ? t('validation.motorPowerKW') : t('validation.engineSizeCC');
        missingFields.push(`<strong>${lbl}</strong>`);
    }
    if ((type.includes('kamyonet') || type.includes('ucak') || type.includes('helikopter')) && !formData.vehicleWeight) {
        const lbl = type.includes('ucak') ? t('validation.maxTakeoffWeight') : t('validation.maxTotalWeight');
        missingFields.push(`<strong>${lbl}</strong>`);
    }
    if ((type.includes('minibus') || type.includes('otobus')) && !formData.vehicleSeat) missingFields.push(`<strong>${t('validation.seatCount')}</strong>`);
    if (type.includes('panelvan') && !formData.panelvanEngine) missingFields.push(`<strong>${t('validation.enginePowerType')}</strong>`);

    const matrahContainer = document.getElementById('matrahContainer');
    if (matrahContainer && matrahContainer.style.display !== 'none' && formData.matrahTier === undefined) {
        missingFields.push(`<strong>${t('validation.vehicleValue')}</strong>`);
    }

    if (missingFields.length > 0) {
        const errorList = missingFields.map(f => `<li>• ${f} ${t('validation.selectSuffix')}</li>`).join('');
        showModal(t('validation.title'), `<div class="text-left space-y-2 text-sm"><p>${t('validation.message')}</p><ul class="mt-2 space-y-1">${errorList}</ul></div>`, "warning");
        return;
    }

    // DOĞRULAMA BAŞARILI: REKLAM GÖSTERİMİ
    // Reklam, boş alanlar varken tetiklenmez. Bilgiler tamamsa gösterilir.
    if (!localStorage.getItem('isPremium')) {
        showInterstitialAd();
    }

    // 2. Hesaplaya Gönder (Reklamın ekranı kapatması için ufak bir gecikme veriyoruz)
    // 150ms gecikme ile hesaplama bitişinin saliselik parlamasını önlemiş oluruz.
    setTimeout(() => {
        if (mtvWorker) {
            mtvWorker.postMessage({ type: 'calculate', payload: formData });
        } else {
            // Fallback: Ana thread'de hesapla
            calculationResult = calculateTaxFromState();
            navigateTo('result');
        }
    }, 150);
}

function calculateTaxFromState() {
    let tax = 0;
    const type = formData.vehicleType;
    const isElectric = type.startsWith('elektrikli_');
    const baseType = isElectric ? type.replace('elektrikli_', '') : type;
    const age = formData.vehicleAge;

    if (baseType === 'otomobil') {
        let engineKey = isElectric ? mapPowerToEngine(formData.motorPower) : formData.engineSize;
        if (formData.registrationDate === 'after2018') {
            if (isElectric && typeof getEVRate_2026 === 'function') {
                tax = getEVRate_2026(formData.motorPower, age, formData.matrahTier) || 0;
            } else {
                tax = calculateMTV_2026_New(engineKey, formData.matrahTier, age);
            }
        } else {
            if (isElectric) {
                tax = 0;
            } else {
                tax = calculatePRE2018(engineKey, age);
            }
        }
    }
    else if (baseType === 'motosiklet') {
        const key = isElectric ? mapMotoPowerToEngine(formData.motoEngine) : formData.motoEngine || '100_250';
        if (isElectric && typeof EV_MOTO_TAX_TABLE_2026 !== 'undefined') {
            const motoKey = formData.motoEngine || '7_15';
            if (EV_MOTO_TAX_TABLE_2026[motoKey]) tax = EV_MOTO_TAX_TABLE_2026[motoKey][age];
        } else {
            if (motosikletler_2026[key]) tax = motosikletler_2026[key][age];
            if (isElectric) tax = Math.floor(tax / 4);
        }
    }
    else if (baseType === 'kamyonet' || type.includes('kamyonet')) {
        const key = 'kamyonet_' + (formData.vehicleWeight || '1500');
        if (tarife_II_2026[key]) tax = tarife_II_2026[key][age];
        if (isElectric) tax = Math.floor(tax / 4);
    }
    else if (baseType === 'panelvan') {
        let panelKey = formData.panelvanEngine || '1900_altı';
        if (isElectric) {
            panelKey = (panelKey === '116_üstü') ? '1901_üstü' : '1900_altı';
        }
        const key = 'panelvan_' + panelKey;
        if (tarife_II_2026[key]) tax = tarife_II_2026[key][age];
        if (isElectric) tax = Math.floor(tax / 4);
    }
    else if (baseType === 'minibus' || baseType === 'otobus') {
        const seatKey = formData.vehicleSeat || (baseType === 'minibus' ? '0_17' : '0_25');
        let key = 'minibus';
        if (baseType === 'minibus') {
            if (seatKey === '0_17') key = 'minibus';
            else if (seatKey === '18_25') key = 'otobus_25';
            else if (seatKey === '26_35') key = 'otobus_26_35';
            else if (seatKey === '36_45') key = 'otobus_36_45';
            else if (seatKey === '46_üstü') key = 'otobus_46_üstü';
        } else {
            if (seatKey === '0_25') key = 'otobus_25';
            else if (seatKey === '26_35') key = 'otobus_26_35';
            else if (seatKey === '36_45') key = 'otobus_36_45';
            else if (seatKey === '46_üstü') key = 'otobus_46_üstü';
            else key = 'otobus_25';
        }
        if (tarife_II_2026[key]) tax = tarife_II_2026[key][age];
        if (isElectric) tax = Math.floor(tax / 4);
    }
    else if (baseType === 'ucak' || baseType === 'helikopter') {
        const key = formData.vehicleWeight || '1150_altı';
        if (tarife_IV_2026[key]) {
            tax = tarife_IV_2026[key][age] || 0;
        }
        if (isElectric) tax = Math.floor(tax / 4);
    }

    const formatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
    const formatInst = (val) => new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: val % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
    }).format(val);

    const inst = tax / 2;
    return {
        total: formatter.format(tax),
        inst1: formatInst(inst),
        inst2: formatInst(inst)
    };
}

function calculatePRE2018(ccKey, ageGroup) {
    if (typeof PRE_2018_RATES === 'undefined') return 0;
    const bracket = PRE_2018_RATES[ccKey];
    if (!bracket) return 0;
    const ageKey = 'y' + ageGroup.replace('-', '_').replace('+', '_plus');
    return bracket[ageKey] || 0;
}

function mapPowerToEngine(powerVal) {
    if (!powerVal) return '1300_altı';
    if (powerVal === '0_70') return '1300_altı';
    if (powerVal === '71_85') return '1301_1600';
    return '1601_1800';
}

function mapMotoPowerToEngine(val) {
    const mapping = {
        "0_6": "0_99",
        "7_15": "100_250",
        "16_40": "251_650",
        "41_60": "651_1200",
        "61_üstü": "1201_üstü"
    };
    return mapping[val] || "100_250";
}

// --- MODAL UTILS ---
function showModal(title, content, type = 'info') {
    const existing = document.getElementById('customModal');
    if (existing) existing.remove();
    const iconColor = type === 'warning' ? 'text-warningAmber' : 'text-electricBlue';
    const iconName = type === 'warning' ? 'alert-triangle' : 'info';
    const modalHTML = `<div class="modal-overlay" id="customModal"><div class="modal-content"><div class="modal-icon"><i data-lucide="${iconName}" class="w-8 h-8 ${iconColor}"></i></div><h3 class="modal-title">${title}</h3><div class="modal-text">${content}</div><button class="modal-close" onclick="closeModal()">${t('modal.close')}</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();

    const modal = document.getElementById('customModal');
    setTimeout(() => modal.classList.add('active'), 10);
    modal.addEventListener('click', (e) => { if (e.target.id === 'customModal') closeModal(); });
}

function closeModal() {
    const m = document.getElementById('customModal');
    if (m) {
        m.classList.remove('active');
        setTimeout(() => m.remove(), 300);
    }
}

function showMatrahInfo() {
    showModal(
        t('modal.matrahTitle'),
        `<ul class="text-left space-y-3 text-sm">
            <li>• ${t('modal.matrahBody1')}</li>
            <li>• ${t('modal.matrahBody2')}</li>
            <li>• ${t('modal.matrahBody3')}</li>
            <li>• ${t('modal.matrahBody4')}</li>
        </ul>`,
        "info"
    );
}

function showKamyonetInfo() {
    showModal(
        t('modal.ruhsatTitle'),
        t('modal.ruhsatBody'),
        "warning"
    );
}

function runConfetti() {
    // Devredışı: Beyaz ekran riski nedeniyle kaldırıldı.
}

// --- INFO MODAL LOGIC ---
function openInfoModal() {
    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);
        document.body.style.overflow = 'hidden';
    }
}

function closeInfoModal() {
    const modal = document.getElementById('infoModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }
}

window.addEventListener('click', (e) => {
    const infoModal = document.getElementById('infoModal');
    if (e.target === infoModal) {
        closeInfoModal();
    }
});

function enforceSelectColors() {
    const theme = document.body.getAttribute('data-theme') || 'dark';
    const selects = document.querySelectorAll('select');
    selects.forEach(sel => {
        if (theme === 'dark') {
            sel.style.backgroundColor = '#0a192f';
            sel.style.color = '#ffffff';
        } else {
            sel.style.backgroundColor = '#ffffff';
            sel.style.color = '#000000';
        }
    });
}

function isSelected(val, current) {
    return val === current ? 'selected' : '';
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initAdMob();
    initBilling();
    navigateTo('home');
});
