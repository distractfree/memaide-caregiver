package com.example.memaid.data

// Single source of truth for which device (if any) owns the active help / AI voice session.
// Both the phone-local path (PhoneVoiceSession) and the watch path (PhoneListenerService's
// audio channel) run inside the phone process, so this shared arbiter enforces exactly one
// owner at a time. The second requester is rejected, which keeps mic input and speaker output
// on the single device that started the session instead of splitting across both.
object HelpSessionManager {

    enum class Owner { NONE, PHONE, WATCH }

    @Volatile
    var owner: Owner = Owner.NONE
        private set

    val isActive: Boolean
        get() = owner != Owner.NONE

    // Become the session owner. Returns true if acquired (or already held by [who]), false if
    // the other device already owns it.
    @Synchronized
    fun tryAcquire(who: Owner): Boolean {
        require(who != Owner.NONE) { "cannot acquire ownership for NONE" }
        if (owner != Owner.NONE && owner != who) return false
        owner = who
        return true
    }

    // Release only if [who] currently holds it. A stale release from the other device is a no-op
    // so a late teardown can't hand the session away from its real owner.
    @Synchronized
    fun release(who: Owner) {
        if (owner == who) owner = Owner.NONE
    }
}
