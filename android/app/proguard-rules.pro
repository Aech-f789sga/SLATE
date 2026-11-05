# Keep the JS bridge surface reachable after R8 shrinking.
-keepclassmembers class app.slate.notes.** {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class app.slate.notes.NativeBridge { *; }
