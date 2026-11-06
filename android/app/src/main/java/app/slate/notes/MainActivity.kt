package app.slate.notes

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Hosts the Slate web app inside a WebView and decides *which* build to host.
 *
 * The update model:
 *   1. Every push builds and deploys to an immutable Vercel URL, and CI records
 *      it in Firestore as `pending` — nobody sees it yet.
 *   2. The admin opens Slate, previews the pending build, and presses Approve.
 *      That copies `pending` onto `approved`.
 *   3. Every APK reads `approved` on launch. So the release reaches users only
 *      when the admin says so, with no APK rebuild and no Play Store review.
 *
 * Because the approved URL is immutable, users keep the version they were
 * approved onto until the next approval — the production alias moving has no
 * effect on them.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var splash: View
    private lateinit var banner: LinearLayout
    private lateinit var bannerLabel: TextView
    private lateinit var store: ReleaseStore
    private val googleSignIn by lazy { GoogleSignIn(this) }

    private var loadedUrl: String? = null
    private var pendingBuild: BuildInfo? = null
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermissionRequest: PermissionRequest? = null
    private var pendingPermissions: Array<String> = emptyArray()
    private var lastBackPress = 0L

    private val fileChooser =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFileCallback
            pendingFileCallback = null
            callback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            )
        }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
            val request = pendingPermissionRequest
            pendingPermissionRequest = null
            if (request == null) return@registerForActivityResult
            val granted = pendingPermissions.filter { grants[it] == true }
            if (granted.isEmpty()) {
                runCatching { request.deny() }
            } else {
                runCatching { request.grant(granted.toTypedArray()) }
            }
        }

    /**
     * Set while the POST_NOTIFICATIONS prompt is up, so the notification we were
     * asked to raise can be raised the moment the user allows it.
     */
    private var notifyAfterGrant: String? = null

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val version = notifyAfterGrant
            notifyAfterGrant = null
            if (granted && version != null) postUpdateNotification(version)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = ReleaseStore(this)

        root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(BG)
        }

        webView = buildWebView()
        splash = buildSplash()
        banner = buildBanner()

        root.addView(webView)
        root.addView(splash)
        root.addView(
            banner,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM
                setMargins(dp(12), 0, dp(12), dp(12))
            }
        )
        setContentView(root)

        installBackHandler()
        boot()
    }

    /* ------------------------------------------------------------------ */
    /* Startup                                                            */
    /* ------------------------------------------------------------------ */

    private fun boot() {
        val cached = store.approvedUrl
        if (cached == null) {
            // Very first launch: we genuinely cannot paint until we know which
            // build the admin has approved, so wait — but only briefly.
            lifecycleScope.launch {
                val config = ReleaseChannel.fetch(FIRST_RUN_TIMEOUT_MS)
                val approved = config?.approved
                val url = approved?.url ?: getString(R.string.slate_default_url)
                store.saveApproved(url, approved?.version ?: "bundled")
                pendingBuild = config?.pending
                load(url)
                failsafeHideSplash()
            }
        } else {
            load(cached)
            failsafeHideSplash()
            lifecycleScope.launch { refreshRelease() }
        }
    }

    /** Cheap background check for a newly approved build. Never blocks the UI. */
    private suspend fun refreshRelease() {
        val config = ReleaseChannel.fetch() ?: return
        store.markChecked()
        pendingBuild = config.pending
        val approved = config.approved ?: return
        if (approved.url != store.approvedUrl) {
            store.saveApproved(approved)
            if (approved.url != loadedUrl) showUpdateBanner(approved)
        }
    }

    private fun failsafeHideSplash() {
        lifecycleScope.launch {
            delay(SPLASH_FAILSAFE_MS)
            hideSplash()
        }
    }

    private fun load(url: String) {
        if (url == loadedUrl) return
        loadedUrl = url
        webView.loadUrl(url)
    }

    /* ------------------------------------------------------------------ */
    /* WebView                                                            */
    /* ------------------------------------------------------------------ */

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): WebView {
        val view = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(BG)
            // A drawing surface must never scroll, bounce, or zoom on its own —
            // the app implements all three itself and native behaviour fights it.
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
        }

        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = true
            loadsImagesAutomatically = true
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            blockNetworkImage = false
        }

        // The app ships its own paper and theme colours; algorithmic darkening
        // would invert the canvas and wreck exported pages.
        runCatching {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(view.settings, false)
            }
        }

        view.addJavascriptInterface(NativeBridge(this), BRIDGE_NAME)

        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean = interceptNavigation(request.url)

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                interceptNavigation(Uri.parse(url))

            override fun onPageFinished(view: WebView, url: String) {
                hideSplash()
                injectShim(view)
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                if (!request.isForMainFrame) return
                hideSplash()
                showToast(getString(R.string.gate_offline))
            }
        }

        view.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = callback
                return try {
                    fileChooser.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    pendingFileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                handleWebPermission(request)
            }
        }

        view.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            handleDownload(url, contentDisposition, mimeType)
        }

        return view
    }

    private fun interceptNavigation(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if (scheme != "http" && scheme != "https") {
            return runCatching {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
                true
            }.getOrDefault(false)
        }
        val host = uri.host.orEmpty()
        if (host.isBlank()) return false
        if (isInternalHost(host)) return false
        openCustomTab(uri)
        return true
    }

    private fun isInternalHost(host: String): Boolean {
        val own = loadedUrl?.let { runCatching { Uri.parse(it).host }.getOrNull() }
        if (own != null && host.equals(own, ignoreCase = true)) return true
        return host.endsWith(".vercel.app") && host.startsWith("slate")
    }

    private fun openCustomTab(uri: Uri) {
        val intent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .build()
        runCatching { intent.launchUrl(this, uri) }
            .onFailure {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
            }
    }

    private fun injectShim(view: WebView) {
        runCatching { view.evaluateJavascript(SHIM_JS, null) }
    }

    /* ------------------------------------------------------------------ */
    /* Media, files, permissions                                          */
    /* ------------------------------------------------------------------ */

    private fun handleWebPermission(request: PermissionRequest) {
        val needed = mutableListOf<String>()
        val resources = request.resources
        if (resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
            needed += Manifest.permission.CAMERA
        }
        if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
            needed += Manifest.permission.RECORD_AUDIO
        }

        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            runCatching { request.grant(resources) }
        } else {
            pendingPermissionRequest = request
            pendingPermissions = missing.toTypedArray()
            runCatching { permissionLauncher.launch(missing.toTypedArray()) }
        }
    }

    private fun handleDownload(url: String, contentDisposition: String?, mimeType: String?) {
        // blob: and data: URLs never reach DownloadManager — the injected shim
        // converts them and calls saveBase64 instead.
        if (url.startsWith("blob:") || url.startsWith("data:")) return
        runCatching {
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                setTitle(name)
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                )
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            }
            (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            showToast("Saving $name…")
        }.onFailure {
            showToast("Could not start the download")
        }
    }

    fun saveBase64(filename: String, mime: String, base64: String): Boolean {
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val safeName = filename
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
                .ifBlank { "slate-export" }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                    put(MediaStore.Downloads.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    values
                ) ?: return false
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
                dir.mkdirs()
                FileOutputStream(File(dir, safeName)).use { it.write(bytes) }
            }
            showToast("Saved $safeName")
            true
        } catch (_: Throwable) {
            showToast("Could not save the file")
            false
        }
    }

    /* ------------------------------------------------------------------ */
    /* Bridge entry points                                                */
    /* ------------------------------------------------------------------ */

    fun hasGoogleSignIn(): Boolean = getString(R.string.slate_google_client_id).isNotBlank()

    fun startGoogleSignIn() {
        val clientId = getString(R.string.slate_google_client_id)
        runOnUiThread {
            lifecycleScope.launch {
                val token = googleSignIn.idToken(clientId)
                if (token == null) {
                    if (clientId.isBlank()) showToast(getString(R.string.google_unavailable))
                    runCatching {
                        webView.evaluateJavascript(
                            "window.__slateGoogleFailed&&window.__slateGoogleFailed()",
                            null
                        )
                    }
                } else {
                    runCatching {
                        webView.evaluateJavascript(
                            "window.__slateGoogleToken&&window.__slateGoogleToken(" +
                                "${JSONObject.quote(token)})",
                            null
                        )
                    }
                }
            }
        }
    }

    fun approvedVersion(): String = store.approvedVersion ?: "bundled"

    fun pendingVersion(): String = pendingBuild?.version.orEmpty()

    fun reloadWithApproved() {
        // Reachable from the JS bridge thread, so hop to the UI thread before
        // touching any view.
        runOnUiThread {
            val url = store.approvedUrl ?: return@runOnUiThread
            hideBanner()
            loadedUrl = null
            showSplash()
            load(url)
            failsafeHideSplash()
        }
    }

    fun showToast(message: String) {
        runOnUiThread {
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        }
    }

    /* ------------------------------------------------------------------ */
    /* Update notifications                                               */
    /* ------------------------------------------------------------------ */

    /**
     * Raised by the page when it finds a newer build while the app is not in
     * the foreground — the only case the in-app card cannot cover.
     *
     * Called from the JS bridge thread, so everything hops to the UI thread.
     * On Android 13+ the permission is requested at this moment rather than at
     * launch: asking before there is anything to say would be noise.
     */
    fun notifyUpdate(version: String) {
        if (version.isBlank()) return
        runOnUiThread {
            val needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED

            if (needsPermission) {
                notifyAfterGrant = version
                runCatching {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }.onFailure { notifyAfterGrant = null }
                return@runOnUiThread
            }
            postUpdateNotification(version)
        }
    }

    private fun postUpdateNotification(version: String) {
        val manager = getSystemService(NotificationManager::class.java) ?: return

        // minSdk is 26, so a channel is always required.
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_UPDATES,
                "App updates",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Tells you when a newer version of Slate is ready."
            }
        )

        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_UPDATES)
            .setSmallIcon(R.drawable.ic_stat_update)
            .setContentTitle("Slate update ready")
            .setContentText("Version $version is available. Tap to install it.")
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("Version $version is available. Open Slate to install it.")
            )
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()

        // A blocked channel or a revoked permission throws; an update prompt is
        // never worth crashing the app over.
        runCatching { manager.notify(NOTIFY_UPDATE, notification) }
    }

    /* ------------------------------------------------------------------ */
    /* Chrome                                                             */
    /* ------------------------------------------------------------------ */

    private fun buildSplash(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(BG)
        layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        addView(TextView(this@MainActivity).apply {
            text = "Slate"
            textSize = 27f
            setTextColor(INK)
            gravity = Gravity.CENTER
        })
        addView(TextView(this@MainActivity).apply {
            text = getString(R.string.gate_loading)
            textSize = 13f
            setTextColor(MUTED)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(22))
        })
        addView(ProgressBar(this@MainActivity).apply { isIndeterminate = true })
    }

    private fun buildBanner(): LinearLayout {
        bannerLabel = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 14f
        }

        val restart = TextView(this).apply {
            text = getString(R.string.restart_now)
            setTextColor(BRAND)
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(dp(14), dp(8), dp(14), dp(8))
            setBackgroundColor(Color.WHITE)
            setOnClickListener { reloadWithApproved() }
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.GONE
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setColor(BRAND)
            }
            setPadding(dp(16), dp(10), dp(10), dp(10))
            addView(
                bannerLabel,
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            )
            addView(restart)
        }
    }

    private fun showUpdateBanner(build: BuildInfo) {
        bannerLabel.text = getString(R.string.update_ready, build.version)
        banner.visibility = View.VISIBLE
    }

    private fun hideBanner() {
        banner.visibility = View.GONE
    }

    private fun showSplash() {
        splash.visibility = View.VISIBLE
    }

    private fun hideSplash() {
        if (splash.visibility != View.GONE) splash.visibility = View.GONE
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    private fun installBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                    return
                }
                val now = System.currentTimeMillis()
                if (now - lastBackPress < DOUBLE_BACK_MS) {
                    finish()
                } else {
                    lastBackPress = now
                    showToast(getString(R.string.exit_confirm))
                }
            }
        })
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                          */
    /* ------------------------------------------------------------------ */

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        webView.onPause()
        webView.pauseTimers()
        super.onPause()
    }

    override fun onDestroy() {
        runCatching {
            root.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    private companion object {
        const val BRIDGE_NAME = "SlateHost"
        const val FIRST_RUN_TIMEOUT_MS = 3500
        const val SPLASH_FAILSAFE_MS = 12_000L
        const val DOUBLE_BACK_MS = 2000L

        const val CHANNEL_UPDATES = "slate_updates"
        const val NOTIFY_UPDATE = 4201

        val BG = Color.parseColor("#E9EEF7")
        val INK = Color.parseColor("#12161F")
        val MUTED = Color.parseColor("#5A6478")
        val BRAND = Color.parseColor("#2F6DF6")

        /**
         * Injected after every page load. Two jobs:
         *  - give the web app a clean `window.SlateNative` surface for native
         *    Google sign-in (and for feature detection, so the web build keeps
         *    working untouched in a normal browser);
         *  - rescue `blob:` downloads, which WebView hands to DownloadManager
         *    but DownloadManager cannot read.
         */
        val SHIM_JS = """
            (function(){
              if (window.__slateNativeShim) return;
              window.__slateNativeShim = true;

              var host = window.SlateHost;
              if (!host) return;

              window.SlateNative = window.SlateNative || {};
              window.SlateNative.appVersion = function(){ try { return host.appVersion(); } catch(e){ return ''; } };
              window.SlateNative.notifyUpdate = function(v){ try { host.notifyUpdate(String(v || '')); } catch(e){} };
              window.SlateNative.hasGoogleSignIn = function(){ try { return host.hasGoogleSignIn(); } catch(e){ return false; } };
              window.SlateNative.signInWithGoogle = function(){
                return new Promise(function(resolve, reject){
                  window.__slateGoogleResolve = resolve;
                  window.__slateGoogleReject = reject;
                  try { host.requestGoogleSignIn(); } catch(e){ reject(e); }
                });
              };
              window.__slateGoogleToken = function(t){
                var r = window.__slateGoogleResolve; window.__slateGoogleResolve = null; if (r) r(t);
              };
              window.__slateGoogleFailed = function(){
                var r = window.__slateGoogleReject; window.__slateGoogleReject = null; if (r) r(new Error('cancelled'));
              };

              document.addEventListener('click', function(e){
                var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
                if (!a) return;
                var href = a.getAttribute('href') || '';
                if (href.indexOf('blob:') !== 0) return;
                e.preventDefault(); e.stopPropagation();
                fetch(href).then(function(r){ return r.blob(); }).then(function(b){
                  var fr = new FileReader();
                  fr.onload = function(){
                    var s = String(fr.result);
                    var i = s.indexOf(',');
                    try {
                      host.saveBase64(
                        a.getAttribute('download') || 'slate-backup',
                        b.type || 'application/octet-stream',
                        s.slice(i + 1)
                      );
                    } catch(_) {}
                  };
                  fr.readAsDataURL(b);
                }).catch(function(){});
              }, true);
            })();
        """.trimIndent()
    }
}
