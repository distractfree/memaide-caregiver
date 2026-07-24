package com.example.memaid.data

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log

// Keeps voice-communication audio (the AI reply played through AudioTrack) on the phone's own
// speaker even when Meta glasses are connected over Bluetooth — the platform otherwise tends to
// route voice audio to the paired glasses (SCO/HFP). Uses AudioManager.setCommunicationDevice
// (API 31+); on older devices it is a no-op and the platform default applies.
object GlassesAudioRoute {

    private const val TAG = "GlassesAudioRoute"

    // Force the phone's built-in speaker as the communication device, so the assistant is heard
    // on the phone rather than the glasses. Returns true if the speaker was selected.
    fun routeToPhoneSpeaker(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
        val speaker = am.availableCommunicationDevices
            .firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        if (speaker == null) {
            Log.w(TAG, "no built-in speaker communication device available")
            return false
        }
        return try {
            val ok = am.setCommunicationDevice(speaker)
            Log.d(TAG, "route to phone speaker (type=${speaker.type}) ok=$ok")
            ok
        } catch (e: Exception) {
            Log.e(TAG, "setCommunicationDevice failed: ${e.message}")
            false
        }
    }

    // Undo routeToPhoneSpeaker(): hand audio routing back to the platform default.
    fun clear(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            am.clearCommunicationDevice()
            Log.d(TAG, "cleared communication device")
        } catch (e: Exception) {
            Log.w(TAG, "clearCommunicationDevice failed: ${e.message}")
        }
    }
}
