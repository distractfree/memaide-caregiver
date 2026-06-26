package com.memaide.bridge.ws

import android.util.Log
import com.memaide.bridge.model.PatientContext
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One WebSocket connection to the MemAide server. Sends `hello` on open, exposes decoded
 * inbound messages as a Flow, and reconnects with exponential backoff until `close()`.
 * Reconnect uses a fresh `hello` (the server's VoiceLoop is per-connection — no resume).
 */
class BridgeSocket(
    private val url: String,
    private val patient: PatientContext,
    private val sessionId: String,
    private val client: OkHttpClient = OkHttpClient(),
    private val backoff: Backoff = Backoff(),
) {
    private val _inbound = MutableSharedFlow<Inbound>(
        extraBufferCapacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val inbound: SharedFlow<Inbound> = _inbound

    @Volatile private var ws: WebSocket? = null
    private val running = AtomicBoolean(false)

    fun connect() {
        running.set(true)
        open()
    }

    private fun open() {
        if (!running.get()) return
        val request = Request.Builder().url(url).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                backoff.reset()
                webSocket.send(
                    WsCodec.encode(
                        Outbound.Hello(sessionId, PatientDto(patient.patientId, patient.name))
                    )
                )
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                WsCodec.decode(text)?.let { _inbound.tryEmit(it) }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w("BridgeSocket", "socket failed; reconnecting", t)
                reconnectLater()
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                reconnectLater()
            }
        })
    }

    private fun reconnectLater() {
        if (!running.get()) return
        val delay = backoff.next()
        Thread {
            Thread.sleep(delay)
            open()
        }.start()
    }

    fun send(msg: Outbound): Boolean = ws?.send(WsCodec.encode(msg)) ?: false

    fun close() {
        running.set(false)
        ws?.close(1000, "bye")
        ws = null
    }
}
