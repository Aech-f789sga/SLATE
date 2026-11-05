package app.slate.notes

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * A single published web build.
 *
 * [url] must be an *immutable* deployment URL (Vercel gives every deployment a
 * permanent one). If it pointed at the production alias instead, the alias would
 * silently follow the newest deploy and the admin gate would be pointless.
 */
data class BuildInfo(
    val version: String,
    val url: String,
    val notes: String = "",
    val commit: String = "",
    val at: Long = 0L,
)

data class ReleaseConfig(
    val approved: BuildInfo? = null,
    val pending: BuildInfo? = null,
    val channel: String = "gated",
) {
    /** True when CI has published a build the admin has not released yet. */
    val hasUnapprovedBuild: Boolean
        get() = pending != null && pending.url != approved?.url
}

/**
 * Reads the release pointer out of Firestore.
 *
 * `app_config/release` is world-readable and admin-writable (see firestore.rules),
 * so the APK can read it with no sign-in at all — which matters because the
 * gate has to work before the user has authenticated.
 */
object ReleaseChannel {

    private const val PROJECT = "project-d6c1fcd0-76ec-4d52-b97"
    private const val DATABASE = "ai-studio-slate-289ffd97-dd6b-4b1f-9f9d-93b8e9fea93e"
    private const val API_KEY = "AIzaSyAh5C2jXdxXP_-DxzRQJicT7xuOyiQAIUo"
    private const val PATH = "app_config/release"

    private fun endpoint(): String =
        "https://firestore.googleapis.com/v1/projects/$PROJECT" +
            "/databases/$DATABASE/documents/$PATH?key=$API_KEY"

    /**
     * Fetches the release document. Returns null on any failure — no network,
     * timeout, missing document, or malformed JSON. Callers must treat null as
     * "keep using what we already have", never as "go blank".
     */
    suspend fun fetch(timeoutMs: Int = 4000): ReleaseConfig? = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(endpoint()).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return@withContext null
            val body = conn.inputStream.bufferedReader().use(BufferedReader::readText)
            parse(JSONObject(body))
        } catch (_: Throwable) {
            null
        } finally {
            runCatching { conn?.disconnect() }
        }
    }

    private fun parse(root: JSONObject): ReleaseConfig {
        val fields = root.optJSONObject("fields") ?: JSONObject()

        val approved = buildFrom(fields.optJSONObject("approved"))
            ?: flatBuild(fields, "approved")
        val pending = buildFrom(fields.optJSONObject("pending"))
            ?: flatBuild(fields, "pending")

        val channel = fields.optJSONObject("channel")?.optString("stringValue").orEmpty()
            .ifBlank { "gated" }

        return ReleaseConfig(approved = approved, pending = pending, channel = channel)
    }

    /** Handles the nested `{ mapValue: { fields: { ... } } }` shape. */
    private fun buildFrom(wrapper: JSONObject?): BuildInfo? {
        val f = wrapper?.optJSONObject("mapValue")?.optJSONObject("fields") ?: return null
        val url = str(f, "url")
        if (url.isBlank()) return null
        return BuildInfo(
            version = str(f, "version").ifBlank { "unknown" },
            url = url,
            notes = str(f, "notes"),
            commit = str(f, "commit"),
            at = num(f, "at"),
        )
    }

    /** Handles the flat `approvedUrl` / `approvedVersion` shape, for when the
     *  document is written by hand in the Firebase console. */
    private fun flatBuild(fields: JSONObject, prefix: String): BuildInfo? {
        val url = str(fields, "${prefix}Url")
        if (url.isBlank()) return null
        return BuildInfo(
            version = str(fields, "${prefix}Version").ifBlank { "unknown" },
            url = url,
            notes = str(fields, "${prefix}Notes"),
            commit = str(fields, "${prefix}Commit"),
            at = num(fields, "${prefix}At"),
        )
    }

    private fun str(o: JSONObject, key: String): String =
        o.optJSONObject(key)?.optString("stringValue").orEmpty().trim()

    private fun num(o: JSONObject, key: String): Long {
        val v = o.optJSONObject(key) ?: return 0L
        v.optString("integerValue").toLongOrNull()?.let { return it }
        v.optString("doubleValue").toDoubleOrNull()?.let { return it.toLong() }
        return 0L
    }
}

/**
 * Local cache of the approved build. Lets the app open instantly and keeps
 * working offline, which a notes app has to do.
 */
class ReleaseStore(context: Context) {

    private val prefs = context.getSharedPreferences("slate_release", Context.MODE_PRIVATE)

    var approvedUrl: String?
        get() = prefs.getString(KEY_URL, null)
        private set(v) = prefs.edit().putString(KEY_URL, v).apply()

    var approvedVersion: String?
        get() = prefs.getString(KEY_VERSION, null)
        private set(v) = prefs.edit().putString(KEY_VERSION, v).apply()

    var lastCheck: Long
        get() = prefs.getLong(KEY_CHECK, 0L)
        private set(v) = prefs.edit().putLong(KEY_CHECK, v).apply()

    fun saveApproved(build: BuildInfo) {
        approvedUrl = build.url
        approvedVersion = build.version
        lastCheck = System.currentTimeMillis()
    }

    fun saveApproved(url: String, version: String) {
        approvedUrl = url
        approvedVersion = version
        lastCheck = System.currentTimeMillis()
    }

    fun markChecked() {
        lastCheck = System.currentTimeMillis()
    }

    private companion object {
        const val KEY_URL = "approved_url"
        const val KEY_VERSION = "approved_version"
        const val KEY_CHECK = "last_check"
    }
}
