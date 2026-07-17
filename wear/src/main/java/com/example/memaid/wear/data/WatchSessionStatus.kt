package com.example.memaid.wear.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// Shared between the listener service (which hears "/session_busy" from the phone when the phone
// already owns a session) and the UI. The counter is a one-shot signal: the Composable reacts to
// each increment by tearing its own streaming state down, so this object never touches the UI.
object WatchSessionStatus {

    private val _busySignals = MutableStateFlow(0)
    val busySignals: StateFlow<Int> = _busySignals.asStateFlow()

    fun signalBusy() {
        _busySignals.value = _busySignals.value + 1
    }
}
