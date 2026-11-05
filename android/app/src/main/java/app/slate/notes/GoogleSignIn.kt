package app.slate.notes

import android.app.Activity
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/**
 * Native Google Sign-In.
 *
 * Google refuses to run its OAuth flow inside a WebView (`disallowed_useragent`),
 * so `signInWithPopup` — which is what the web app uses — cannot work inside the
 * APK. Credential Manager runs the real Android account picker instead and hands
 * us a Google ID token, which the web app exchanges for a Firebase session via
 * `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`.
 *
 * Requires an *Android* OAuth client (package name + SHA-1) in the same Google
 * Cloud project as the Firebase web app. Without it this returns null and the
 * caller falls back gracefully.
 */
class GoogleSignIn(private val activity: Activity) {

    suspend fun idToken(serverClientId: String): String? {
        if (serverClientId.isBlank()) return null
        return try {
            val option = GetGoogleIdOption.Builder()
                .setServerClientId(serverClientId)
                .setFilterByAuthorizedAccounts(false)
                .setAutoSelectEnabled(false)
                .build()

            val request = GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build()

            val credential = CredentialManager.create(activity)
                .getCredential(activity, request)
                .credential

            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                GoogleIdTokenCredential.createFrom(credential.data).idToken
            } else {
                Log.w(TAG, "Unexpected credential type: ${credential.type}")
                null
            }
        } catch (_: GetCredentialCancellationException) {
            null
        } catch (e: GetCredentialException) {
            Log.w(TAG, "Credential Manager failed: ${e.message}", e)
            null
        } catch (t: Throwable) {
            Log.w(TAG, "Google sign-in unavailable", t)
            null
        }
    }

    private companion object {
        const val TAG = "SlateGoogle"
    }
}
