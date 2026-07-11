package com.example.memaid.data

import android.util.Base64
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

// Bridges watch audio to the backend voice server over a WebSocket.
class VoiceBridge {

    private val client = OkHttpClient()
    private var webSocket: WebSocket? = null

    @Volatile var isConnected = false
        private set

    // Called when audio_out frames arrive back from the server
    var onAudioOut: ((ByteArray) -> Unit)? = null

    // Connect using a prebuilt hello message (from Koko's /ai-sessions/start response)
    fun connectWithHello(url: String, helloMessage: String) {
        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected = true
                Log.d("VoiceBridge", "✅ WebSocket connected to $url")
                webSocket.send(helloMessage)
                Log.d("VoiceBridge", "👋 Sent hello: $helloMessage")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("\"audio_out\"")) {
                    val pcmB64 = Regex("\"pcm\"\\s*:\\s*\"([^\"]*)\"").find(text)?.groupValues?.get(1)
                    if (pcmB64 != null) {
                        val pcm = Base64.decode(pcmB64, Base64.NO_WRAP)
                        Log.d("VoiceBridge", "🔊 audio_out received: ${pcm.size} bytes")
                        onAudioOut?.invoke(pcm)
                    }
                } else {
                    Log.d("VoiceBridge", "📩 Server message: ${text.take(200)}")
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                isConnected = false
                Log.e("VoiceBridge", "⚠️ WebSocket failed: ${t.message}")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                isConnected = false
                Log.d("VoiceBridge", "WebSocket closed: $reason")
            }
        })
    }

    // Legacy: connect with a hardcoded hello (used for echo-server testing)
    fun connect(url: String, sessionId: String = "test-session") {
        val hello = """{"type":"hello","session_id":"$sessionId","patient":{"patient_id":"demo","name":"Patient"}}"""
        connectWithHello(url, hello)
    }

    // Send a chunk of PCM audio up to the server as base64 JSON
    fun sendAudio(pcm: ByteArray, length: Int) {
        if (!isConnected) return
        val b64 = Base64.encodeToString(pcm, 0, length, Base64.NO_WRAP)
        webSocket?.send("""{"type":"audio","pcm":"$b64"}""")
    }

    // Mark the end of the current utterance (patient paused). The server transcribes
    // the buffered audio now and replies, without closing the connection.
    fun sendAudioEnd() {
        if (!isConnected) return
        webSocket?.send("""{"type":"audio_end"}""")
        Log.d("VoiceBridge", "🔚 Sent audio_end")
    }

    // Send a captured glasses frame as a JPEG data-URL (server demuxes on "type":"frame").
    // dataUrl is "data:image/jpeg;base64,<...>" — only URL-safe base64 chars, safe to inline.
    fun sendFrame(dataUrl: String) {
        if (!isConnected) return
        webSocket?.send("""{"type":"frame","data_url":"$dataUrl"}""")
    }

    // Mark the end of the whole turn (patient held out the full silence). The server speaks
    // the buffered reply as one utterance now.
    fun sendCommit() {
        if (!isConnected) return
        webSocket?.send("""{"type":"commit"}""")
        Log.d("VoiceBridge", "✅ Sent commit")
    }

    fun close() {
        webSocket?.send("""{"type":"bye"}""")
        webSocket?.close(1000, "bye")
        webSocket = null
        isConnected = false
    }
}