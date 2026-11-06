package app.slate.notes

import android.webkit.JavascriptInterface

/**
 * The native side of the JS bridge, exposed to the page as `SlateHost`.
 *
 * Named `SlateHost` rather than `SlateNative` on purpose: the injected shim
 * defines a friendlier `window.SlateNative` wrapper in JavaScript, and reusing
 * the same name would shadow the native object and recurse infinitely.
 */
class NativeBridge(private val host: MainActivity) {

    @JavascriptInterface
    fun appVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun approvedVersion(): String = host.approvedVersion()

    @JavascriptInterface
    fun pendingVersion(): String = host.pendingVersion()

    @JavascriptInterface
    fun hasGoogleSignIn(): Boolean = host.hasGoogleSignIn()

    @JavascriptInterface
    fun requestGoogleSignIn() = host.startGoogleSignIn()

    @JavascriptInterface
    fun saveBase64(filename: String, mime: String, base64: String): Boolean =
        host.saveBase64(filename, mime, base64)

    @JavascriptInterface
    fun reloadApproved() = host.reloadWithApproved()

    @JavascriptInterface
    fun toast(message: String) = host.showToast(message)

    /**
     * Raises a system notification when the page finds a newer build while the
     * app is backgrounded. The in-app card handles the foreground case; this
     * exists only for when the user is not looking at the app, and it refuses to
     * do anything while the app is on screen.
     */
    @JavascriptInterface
    fun notifyUpdate(version: String) = host.notifyUpdate(version)

    /**
     * Lets the page ask the shell whether it is actually on screen, instead of
     * trusting `document.visibilityState`, which a WebView can report wrongly.
     */
    @JavascriptInterface
    fun isForeground(): Boolean = host.isForeground()
}
