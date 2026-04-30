package com.ccdesignstudio.mtv2026;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.widget.ImageView;

import android.view.Window;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.content.res.Configuration;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.view.Display;
import android.view.WindowManager;
import android.app.ActivityOptions;
import android.app.Activity;
import android.app.Application;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;

// BILLING
import com.android.billingclient.api.*;
import java.util.Collections;
import java.util.List;

// ADMOB
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.AdError;
import androidx.annotation.NonNull;

public class MainActivity extends BridgeActivity {
    
    // --- CONFIG ---
    private static final String TAG = "MTV2026_Native";
    private final String PRODUCT_ID = "reklam_kaldir";
    
    // ADS UNIT IDS (PRODUCTION MODE)
    private final String BANNER_AD_UNIT_ID = "ca-app-pub-2408945787433054/3980771597";
    private final String INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-2408945787433054/7108432152";

    // --- BILLING OBJECTS ---
    private BillingClient billingClient;
    private boolean isPremium = false;

    // --- ADMOB OBJECTS ---
    private FrameLayout adViewContainer;
    private InterstitialAd mInterstitialAd;
    private boolean manualDarkMode = true; // Uygulama içi tema takibi

    private int fixedBannerHeight = 0; // BANNER FIX: Yüksekliği sabitlemek için
    private int cachedNavBarHeight = 0; // NAV BAR: Doğrudan kaynaktan ölçülen yükseklik

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 0. NOTCH/CUTOUT FIX: Yatayda siyah boşluğu engelle
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = 
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // 1. SETUP WEBVIEW
        setupWebView();

        // 2. SETUP THEME
        applyAbsoluteTheme();

        // 4. REKLAM ACTIVITY YAKALAYICI (Beyaz ekranın gerçek çözümü)
        // AdMob'un kendi Activity'sini yakalayıp pencere arka planını
        // ve animasyonunu doğrudan kontrol eder.
        registerAdActivityInterceptor();

        // 5. INITIALIZE BILLING
        setupBilling();

        // 6. INITIALIZE ADS
        initAds();
    }



    /**
     * BEYAZ EKRAN SORUNUNUN KÖK ÇÖZÜMÜ:
     * Application.ActivityLifecycleCallbacks kullanarak
     * AdMob SDK'sının açtığı Activity'leri (reklam Activity'si)
     * doğrudan yakalayıp:
     * 1. Pencere arka planını tema rengine zorlar
     * 2. Geçiş animasyonunu reklam Activity'si üzerinde kapatır
     * 3. Window animasyonlarını sıfırlar
     *
     * ÖNCEKİ YAKLAŞIM NEDEN BAŞARISIZDI:
     * overridePendingTransition() ve windowAnimationStyle sadece
     * bizim Activity'miz üzerinde etkili. Reklam Activity'si
     * AdMob SDK'sı tarafından bağımsız yönetiliyor.
     */
    private void registerAdActivityInterceptor() {
        getApplication().registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            private void forceThemeOnActivity(Activity activity) {
                if (activity instanceof MainActivity) return;
                try {
                    // REKLAM SIRASINDA HER ŞEY SİYAH OLMALI (Yan boşluklar dahil)
                    int blackColor = Color.BLACK;
                    Window w = activity.getWindow();
                    if (w != null) {
                        // REKLAM AKTİVİTESİNİN İÇİNE, REKLAMIN ALTINA SİYAH KATMAN EKLE
                        // Bu katman reklam penceresiyle birlikte yaşar ve biter.
                        FrameLayout adRoot = (FrameLayout) w.getDecorView().findViewById(android.R.id.content);
                        if (adRoot != null) {
                            View blackCover = new View(activity);
                            blackCover.setBackgroundColor(Color.BLACK);
                            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT, 
                                ViewGroup.LayoutParams.MATCH_PARENT
                            );
                            adRoot.addView(blackCover, 0, lp); // 0 indexi ile en alta koy
                        }

                        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                        w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                        
                        // Pencere arka planını ve barları da siyah yap
                        w.setBackgroundDrawable(new ColorDrawable(Color.BLACK));
                        w.getDecorView().setBackgroundColor(Color.BLACK);
                        w.setNavigationBarColor(Color.BLACK);
                        w.setStatusBarColor(Color.BLACK);
                        
                        w.setWindowAnimations(0);
                    }
                    activity.overridePendingTransition(0, 0);
                } catch (Exception e) {
                    Log.e(TAG, "Ad activity theme error: " + e.getMessage());
                }
            }

            @Override
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                forceThemeOnActivity(activity);
            }
            @Override
            public void onActivityStarted(Activity activity) {
                forceThemeOnActivity(activity);
            }
            @Override
            public void onActivityResumed(Activity activity) {
                forceThemeOnActivity(activity);
                if (!(activity instanceof MainActivity)) {
                    activity.overridePendingTransition(0, 0);
                }
            }
            @Override
            public void onActivityPaused(Activity activity) {
                if (!(activity instanceof MainActivity)) {
                    activity.overridePendingTransition(0, 0);
                }
            }
            @Override
            public void onActivityStopped(Activity activity) {
                if (!(activity instanceof MainActivity)) {
                    activity.overridePendingTransition(0, 0);
                }
            }
            @Override
            public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
            @Override
            public void onActivityDestroyed(Activity activity) {
                if (!(activity instanceof MainActivity)) {
                    activity.overridePendingTransition(0, 0);
                }
            }
        });
    }

    private void setupWebView() {
        View webViewView = getBridge().getWebView();
        if (webViewView instanceof WebView) {
            WebView webView = (WebView) webViewView;
            
            // Köprüyü ekle
            webView.addJavascriptInterface(new WebAppInterface(this), "AndroidTheme");

            // WebView Ayarları
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                webView.getSettings().setForceDark(android.webkit.WebSettings.FORCE_DARK_OFF);
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                webView.getSettings().setAlgorithmicDarkeningAllowed(false);
            }
            
            // Performans Ayarları
            webView.getSettings().setRenderPriority(WebSettings.RenderPriority.HIGH);
            // KRITIK: LAYER_TYPE_HARDWARE KULLANILAMAZ!
            // Bu ayar WebView'ın SurfaceView'ının arka plandan dönüşte
            // beyaz flash yapmasına neden oluyordu.
            webView.setLayerType(View.LAYER_TYPE_NONE, null);
            
            // BEYAZ EKRAN KÖKLÜ FIX: WebView'ı şeffaf yap.
            // Bu sayede WebView render ederken (boşken) arkadaki Window tema rengi görünür.
            webView.setBackgroundColor(Color.TRANSPARENT);

            // Pencere (Window) Ayarları - Solid tema rengi (WebView arkasında kalacak)
            int solidBg = manualDarkMode ? Color.parseColor("#0a192f") : Color.WHITE;
            getWindow().getDecorView().setBackgroundColor(solidBg);
            getWindow().setBackgroundDrawable(new ColorDrawable(solidBg));
            
            // MODERN EDGE-TO-EDGE: FLAG_LAYOUT_NO_LIMITS yerine WindowCompat kullan.
            // FLAG_LAYOUT_NO_LIMITS açıkken WindowInsets.bottom = 0 dönüyor,
            // bu yüzden banner navigation bar'ın ARKASINA gizleniyordu.
            // WindowCompat.setDecorFitsSystemWindows(false) aynı görsel sonucu
            // verir ve Insets düzgün çalışır.
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            // cachedNavBarHeight burada ölçülmez — view henüz layout'a eklenmedi,
            // insets hazır olmayabiliyor. setupBannerContainer'da ölçülecek.

            webView.setOverScrollMode(View.OVER_SCROLL_NEVER); // Kaydırma beyazlığını sil
            webView.setPadding(0, 0, 0, 0);
            
            webView.setOnLongClickListener(v -> true);
            webView.setLongClickable(false);
            webView.setHapticFeedbackEnabled(false);
        }
    }

    // --- BILLING LOGIC ---
    private void setupBilling() {
        billingClient = BillingClient.newBuilder(this)
                .setListener(purchaseUpdateListener)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder()
                        .enableOneTimeProducts()
                        .build())
                .build();
        startBillingConnection();
    }

    private void startBillingConnection() {
        if (billingClient != null && !billingClient.isReady()) {
            billingClient.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(BillingResult billingResult) {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        checkPremiumStatus();
                    } else {
                        initAds(); 
                    }
                }
                @Override
                public void onBillingServiceDisconnected() {
                }
            });
        }
    }

    private void checkPremiumStatus() {
        if (billingClient == null) return;
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (billingResult, purchases) -> {
                boolean found = false;
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    for (Purchase purchase : purchases) {
                        if (purchase.getProducts().contains(PRODUCT_ID) && purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            found = true;
                            break;
                        }
                    }
                }
                setPremiumUser(found);
                if (!found) {
                    runOnUiThread(() -> {
                        initAds();
                        sendJsEvent("onPurchaseNotFound", "false");
                    });
                } else {
                    runOnUiThread(() -> {
                        removeBanner();
                        sendJsEvent("onPurchaseSuccess", "true");
                    });
                }
            }
        );
    }

    private final PurchasesUpdatedListener purchaseUpdateListener = (billingResult, purchases) -> {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) handlePurchase(purchase);
        } else if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            sendJsEvent("onPurchaseError", "İşlem iptal edildi.");
        } else {
            sendJsEvent("onPurchaseError", "Hata: " + billingResult.getResponseCode());
        }
    };

    private void handlePurchase(Purchase purchase) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            if (!purchase.isAcknowledged()) {
                AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.getPurchaseToken()).build();
                billingClient.acknowledgePurchase(params, billingResult -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        setPremiumUser(true);
                        sendJsEvent("onPurchaseSuccess", "true");
                    }
                });
            } else {
                setPremiumUser(true);
                sendJsEvent("onPurchaseSuccess", "true");
            }
        }
    }

    private void initiatePurchase() {
        if (billingClient == null) {
            sendJsEvent("onPurchaseError", "Ödeme sistemi başlatılamadı.");
            return;
        }
        List<QueryProductDetailsParams.Product> productList = Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.INAPP).build());
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(productList).build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
            List<ProductDetails> productDetailsList = productDetailsResult.getProductDetailsList();
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && productDetailsList != null && !productDetailsList.isEmpty()) {
                ProductDetails productDetails = productDetailsList.get(0);
                List<BillingFlowParams.ProductDetailsParams> flowParams = Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(productDetails).build());
                BillingFlowParams billingFlowParams = BillingFlowParams.newBuilder().setProductDetailsParamsList(flowParams).build();
                billingClient.launchBillingFlow(this, billingFlowParams);
            } else {
                sendJsEvent("onPurchaseError", "Ürün bilgisi alınamadı.");
            }
        });
    }


    private void setPremiumUser(boolean premium) {
        this.isPremium = premium;
    }

    // --- ADMOB LOGIC ---
    private void initAds() {
        if (isPremium) return;
        runOnUiThread(() -> {
            MobileAds.initialize(this, initializationStatus -> {
                setupBannerContainer();
                loadAdaptiveBanner();
                loadInterstitial();
            });
        });
    }

    private void setupBannerContainer() {
        if (isPremium || adViewContainer != null) return;
        ViewGroup rootView = (ViewGroup) findViewById(android.R.id.content);
        if (rootView != null) {
            adViewContainer = new FrameLayout(this);
            adViewContainer.setBackgroundColor(Color.TRANSPARENT);
            
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, 
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
            params.bottomMargin = 0;
            
            rootView.addView(adViewContainer, params);
            adViewContainer.bringToFront();

            // ═══════════════════════════════════════════════════════════
            // 3 KATMANLI NAV BAR YÜKSEKLİĞİ SİSTEMİ
            // ─────────────────────────────────────────────────────────
            // KATMAN 1: OnApplyWindowInsetsListener (asıl kaynak)
            //   WindowCompat.setDecorFitsSystemWindows(false) ile
            //   insets düzgün iletiliyor. Her layout geçişinde güncellenir.
            // KATMAN 2: ViewTreeObserver.OnGlobalLayoutListener
            //   View hiyerarşisi hazır olduğunda rootWindowInsets'ten okur.
            //   Bazı cihazlarda insets listener gecikmeli ateşlenir,
            //   bu listener anında çalışarak boşluğu kapatır.
            // KATMAN 3: getNavBarHeightPx() sistem kaynağı fallback
            //   İki yöntem de 0 dönerse Android'in dimen kaynağından okur.
            // ═══════════════════════════════════════════════════════════

            // KATMAN 1: WindowInsets listener
            ViewCompat.setOnApplyWindowInsetsListener(adViewContainer, (v, insets) -> {
                int insetsBottom = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
                applyNavBarMargin(insetsBottom);
                return insets;
            });

            // KATMAN 2: View attach olduğunda rootWindowInsets'ten anlık oku
            adViewContainer.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
                @Override
                public void onViewAttachedToWindow(View v) {
                    // rootWindowInsets — view hiyerarşisine bağlandıktan sonra güvenilir
                    WindowInsetsCompat rootInsets = ViewCompat.getRootWindowInsets(v);
                    int insetsBottom = 0;
                    if (rootInsets != null) {
                        insetsBottom = rootInsets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
                    }
                    applyNavBarMargin(insetsBottom);
                    ViewCompat.requestApplyInsets(v); // Listener'ı da zorla tetikle
                }
                @Override
                public void onViewDetachedFromWindow(View v) {}
            });
        }
    }

    /**
     * Nav bar margin'ini güvenli şekilde uygular.
     * 0 gelirse sistem kaynağından (KATMAN 3) fallback alır.
     */
    /**
     * Nav bar bottom margin'ini ORIENTATION-AWARE şekilde uygular.
     *
     * Landscape modda (3-buton nav) system bar YANDA olur, insetsBottom = 0 döner.
     * Bu durumda portrait nav height'ı yanlışlıkla uygulamak banner'ı
     * ortada sıkıştırır. 0 geçerli bir landscape değeridir.
     *
     * Sadece portrait modda ve insets henüz gelmemişse
     * getNavBarHeightPx() fallback'i kullanılır.
     */
    private void applyNavBarMargin(int insetsBottom) {
        if (adViewContainer == null) return;
        int finalMargin;
        if (insetsBottom > 0) {
            // Sistem insets'ten gelen gerçek değer — her zaman doğru
            cachedNavBarHeight = insetsBottom;
            finalMargin = insetsBottom;
        } else {
            // insetsBottom == 0:
            // → Landscape + yan nav bar: geçerli, margin 0 olmalı
            // → Portrait + ilk yükleme (insets henüz gelmedi): resource fallback
            boolean isPortrait = getResources().getConfiguration().orientation
                    == android.content.res.Configuration.ORIENTATION_PORTRAIT;
            if (isPortrait && cachedNavBarHeight == 0) {
                // İlk yükleme, portrait, insets henüz dispatch olmadı
                int resource = getNavBarHeightPx();
                finalMargin = resource;
                if (resource > 0) cachedNavBarHeight = resource;
            } else {
                // Landscape veya zaten cache var: 0 DOĞRU
                finalMargin = 0;
            }
        }
        Log.d(TAG, "applyNavBarMargin → insetsBottom=" + insetsBottom
                + " cached=" + cachedNavBarHeight + " final=" + finalMargin + "px"
                + " portrait=" + (getResources().getConfiguration().orientation
                    == android.content.res.Configuration.ORIENTATION_PORTRAIT));
        final int margin = finalMargin;
        runOnUiThread(() -> {
            if (adViewContainer == null) return;
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) adViewContainer.getLayoutParams();
            lp.bottomMargin = margin;
            adViewContainer.setLayoutParams(lp);
        });
    }

    private void loadAdaptiveBanner() {
        if (isPremium || adViewContainer == null) return;
        runOnUiThread(() -> {
            try {
                // 1. Ekran genişliğini doğru ölç (orientation-aware)
                // getDefaultDisplay().getMetrics() deprecated ve landscape'de
                // yanlış değer dönebiliyor. getResources().getDisplayMetrics()
                // her zaman güncel orientation'ı yansıtır.
                DisplayMetrics outMetrics = getResources().getDisplayMetrics();
                float density = outMetrics.density;
                int adWidth = (int) (outMetrics.widthPixels / density);

                AdSize adSize = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, adWidth);
                fixedBannerHeight = adSize.getHeightInPixels(this);
                
                AdView adView = new AdView(this);
                adView.setAdSize(adSize);
                adView.setAdUnitId(BANNER_AD_UNIT_ID);
                adView.setBackgroundColor(Color.TRANSPARENT);
                
                adViewContainer.removeAllViews();
                adViewContainer.addView(adView);
                
                adViewContainer.setBackgroundColor(Color.TRANSPARENT);
                
                // Layout'u sabit yükseklikle zorla
                adjustBannerLayout(getResources().getConfiguration().orientation);

                adView.loadAd(new AdRequest.Builder().build());
            } catch (Exception e) {
                Log.e(TAG, "Banner error: " + e.getMessage());
            }
        });
    }

    public void adjustBannerLayout(int orientation) {
        if (adViewContainer == null) return;
        
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) adViewContainer.getLayoutParams();
        params.width = FrameLayout.LayoutParams.MATCH_PARENT; 
        
        // BANNER FIX: Yükseklik yüklenmişse sabitle, yoksa wrap_content
        if (fixedBannerHeight > 0) {
            params.height = fixedBannerHeight;
        } else {
            params.height = FrameLayout.LayoutParams.WRAP_CONTENT;
        }
        
        params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        // ORIENTATION-AWARE bottomMargin:
        // Portrait: nav bar altta → margin = cachedNavBarHeight
        // Landscape: nav bar yanda → margin = 0 (insets listener zaten doğru ayarlar)
        boolean isPortrait = orientation == android.content.res.Configuration.ORIENTATION_PORTRAIT;
        if (isPortrait) {
            params.bottomMargin = cachedNavBarHeight > 0 ? cachedNavBarHeight : getNavBarHeightPx();
        }
        // Landscape'de bottomMargin'e dokunmuyoruz — applyNavBarMargin zaten 0 set eder
        
        adViewContainer.setLayoutParams(params);
        adViewContainer.requestLayout();
        // Listener'ı tekrar tetikleyerek insets'i yenile
        ViewCompat.requestApplyInsets(adViewContainer);
    }


    private void removeBanner() {
        runOnUiThread(() -> {
            if (adViewContainer != null) {
                ViewGroup parent = (ViewGroup) adViewContainer.getParent();
                if (parent != null) {
                    parent.removeView(adViewContainer);
                }
                adViewContainer.removeAllViews();
                adViewContainer = null;
            }
        });
    }

    private void loadInterstitial() {
         if (isPremium) return;
         runOnUiThread(() -> {
             InterstitialAd.load(this, INTERSTITIAL_AD_UNIT_ID, new AdRequest.Builder().build(),
                 new InterstitialAdLoadCallback() {
                     @Override
                     public void onAdLoaded(@NonNull InterstitialAd interstitialAd) {
                         mInterstitialAd = interstitialAd;
                         mInterstitialAd.setFullScreenContentCallback(new FullScreenContentCallback(){
                            @Override
                            public void onAdShowedFullScreenContent() {
                                // REKLAM OYNARKEN: Durum çubuğu ve navigasyon barını simsiyah yap
                                runOnUiThread(() -> {
                                    Window w = getWindow();
                                    w.setStatusBarColor(Color.BLACK);
                                    w.setNavigationBarColor(Color.BLACK);
                                    
                                    WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(w, w.getDecorView());
                                    if (controller != null) {
                                        controller.setAppearanceLightStatusBars(false); // Beyaz ikonlar
                                        controller.setAppearanceLightNavigationBars(false);
                                    }
                                });
                            }
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                mInterstitialAd = null;
                                // 1. Geçiş animasyonunu kapat
                                overridePendingTransition(0, 0);
                                
                                // 2. Tema renklerine anında geri dön
                                applyAbsoluteTheme();
                                
                                // 3. 500ms sonra banner'ı dikey/yatay mod için tazele
                                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                                    applyAbsoluteTheme();
                                    
                                    // BANNER FIX: Kesin çözüm için layout'u milimetrik tazele
                                    if (adViewContainer != null) {
                                        adjustBannerLayout(getResources().getConfiguration().orientation);
                                        adViewContainer.requestLayout();
                                        adViewContainer.invalidate();
                                    }
                                    
                                    sendJsEvent("onAdDismissed", "true");
                                }, 500);
                                loadInterstitial();
                            }
                            @Override
                            public void onAdFailedToShowFullScreenContent(AdError adError) {
                                mInterstitialAd = null;
                                applyAbsoluteTheme();
                                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                                    sendJsEvent("onAdDismissed", "true");
                                }, 50);
                                loadInterstitial();
                            }
                        });
                     }
                     @Override
                     public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                         mInterstitialAd = null;
                     }
                 });
         });
    }

    public void applyAbsoluteTheme() {
        runOnUiThread(() -> {
            Window window = getWindow();
            boolean isDark = manualDarkMode;
            int themeColor = isDark ? Color.parseColor("#0a192f") : Color.WHITE;

            // STATUS & NAV BAR
            window.setStatusBarColor(themeColor);
            window.setNavigationBarColor(themeColor);
            
            // WINDOW BACKGROUND (Tüm katmanları kapsar)
            window.getDecorView().setBackgroundColor(themeColor);
            window.setBackgroundDrawable(new ColorDrawable(themeColor));

            // WEBVIEW BACKGROUND (Beyaz flash'ı engeller - en kritik katman)
            View webViewView = getBridge().getWebView();
            if (webViewView instanceof WebView) {
                ((WebView) webViewView).setBackgroundColor(themeColor);
            }

            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(!isDark);
                controller.setAppearanceLightNavigationBars(!isDark);
            }

            // EN ÖNEMLİ KISIM: Activity temasından (`android:background="@drawable/splash_screen_v2"`)
            // kaynaklı olarak uygulamanın ana taşıyıcı katmanında (android.R.id.content) splash görseli kalabiliyor.
            // Bu görseli siliyoruz ki yırtıklarda veya boşluklarda bir daha görünemesin.
            ViewGroup rootView = (ViewGroup) window.findViewById(android.R.id.content);
            if (rootView != null) {
                rootView.setBackground(null); 
            }
        });
    }

    private void showInterstitial() {
        if (isPremium) {
            sendJsEvent("onAdDismissed", "true");
            return;
        }
        runOnUiThread(() -> {
            View webViewView = getBridge().getWebView();
            if (webViewView != null) {
                webViewView.post(() -> {
                    // REKLAM ÖNCESİ KARARTMA (AdActivity altına siyah zemin hazırla)
                    Window window = getWindow();
                    window.setStatusBarColor(Color.BLACK);
                    window.setNavigationBarColor(Color.BLACK);
                    window.getDecorView().setBackgroundColor(Color.BLACK);
                    window.setBackgroundDrawable(new ColorDrawable(Color.BLACK));
                    if (webViewView instanceof WebView) {
                        ((WebView) webViewView).setBackgroundColor(Color.BLACK);
                    }
                    
                    overridePendingTransition(0, 0);
                    
                    if (mInterstitialAd != null) {
                        mInterstitialAd.show(MainActivity.this);
                        overridePendingTransition(0, 0);
                    } else {
                        applyAbsoluteTheme();
                        sendJsEvent("onAdDismissed", "true");
                        loadInterstitial();
                    }
                });
            }
        });
    }

    private void updateSystemBars(String colorStr) {
        try {
            int color = Color.parseColor(colorStr);
            Window window = getWindow();
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);

            boolean isLightColor = isColorLight(color);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller != null) {
                controller.setAppearanceLightStatusBars(isLightColor);
                controller.setAppearanceLightNavigationBars(isLightColor);
            }
        } catch (Exception e) {
            Log.e(TAG, "Color error: " + e.getMessage());
        }
    }

    /**
     * Navigation bar yüksekliğini Android sistem kaynağından doğrudan okur.
     * FLAG_LAYOUT_NO_LIMITS aktifken WindowInsets.bottom = 0 döndüğü için
     * bu yöntem tek güvenilir alternatiftir.
     */
    private int getNavBarHeightPx() {
        try {
            int resourceId = getResources().getIdentifier("navigation_bar_height", "dimen", "android");
            if (resourceId > 0) {
                int height = getResources().getDimensionPixelSize(resourceId);
                Log.d(TAG, "NavBar height from resource: " + height + "px");
                return height;
            }
        } catch (Exception e) {
            Log.e(TAG, "getNavBarHeightPx error: " + e.getMessage());
        }
        return 0;
    }

    private boolean isColorLight(int color) {
        double darkness = 1 - (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255;
        return darkness < 0.5;
    }

    private void sendJsEvent(String functionName, String data) {
        runOnUiThread(() -> {
            View webViewView = getBridge().getWebView();
            if (webViewView instanceof WebView) {
                ((WebView) webViewView).evaluateJavascript("try { " + functionName + "('" + data + "'); } catch(e) {}", null);
            }
        });
    }

    public class WebAppInterface {
        MainActivity mActivity;
        WebAppInterface(MainActivity c) { mActivity = c; }
        
        @android.webkit.JavascriptInterface
        public void removeAds() { mActivity.runOnUiThread(() -> mActivity.initiatePurchase()); }
        
        @android.webkit.JavascriptInterface
        public void checkPremium() { mActivity.runOnUiThread(() -> mActivity.checkPremiumStatus()); }

        @android.webkit.JavascriptInterface
        public void showInterstitial() { mActivity.runOnUiThread(() -> mActivity.showInterstitial()); }
        
        @android.webkit.JavascriptInterface
        public void setStatusBarColor(String color) { 
            mActivity.runOnUiThread(() -> mActivity.updateSystemBars(color)); 
        }
        
        @android.webkit.JavascriptInterface
        public void removeAdsBanner() {
             mActivity.runOnUiThread(() -> mActivity.removeBanner());
        }

        @android.webkit.JavascriptInterface
        public void setDarkMode(boolean active) {
            mActivity.runOnUiThread(() -> {
                mActivity.manualDarkMode = active;
                mActivity.applyAbsoluteTheme();
            });
        } 

    }
    
    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyAbsoluteTheme();
        if (adViewContainer != null) {
            runOnUiThread(() -> {
                adjustBannerLayout(newConfig.orientation);
                loadAdaptiveBanner(); // Yatay/Dikey geçişinde reklamı boydan boya yeniden boyutlandır
            });
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Activity arka plana giderken (reklam açılırken) animasyonu kapat
        overridePendingTransition(0, 0);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Reklam Activity'sinden dönüşte animasyonu kaldır
        overridePendingTransition(0, 0);
        // Pencere arka planını zorla tema rengine ayarla
        int themeColor = manualDarkMode ? Color.parseColor("#0a192f") : Color.WHITE;
        getWindow().setBackgroundDrawable(new ColorDrawable(themeColor));
        getWindow().getDecorView().setBackgroundColor(themeColor);
        applyAbsoluteTheme();
    }
}
