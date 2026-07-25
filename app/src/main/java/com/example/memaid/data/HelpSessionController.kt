package com.example.memaid.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// Ends any open AI help session, whether owned by the phone (PhoneVoiceSession) or by the watch
// (streamed over the /help_audio_stream channel). Used by "Call Caregiver" so a call always
// starts from a clean state. Safe to call when nothing is active.
object HelpSessionController {

    fun endAll(context: Context) {
        // Stop a phone-local session. No-op if not active; releases PHONE ownership.
        PhoneVoiceSession.stop()
        // Tell the watch to tear its session down too (no-op there if it isn't streaming). The
        // watch stopping its stream closes the channel, which releases WATCH ownership.
        CoroutineScope(Dispatchers.IO).launch {
            PhoneMessenger.sendMessage(context.applicationContext, "/end_session", "call_caregiver")
        }
    }
}
