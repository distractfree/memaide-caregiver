package com.memaide.bridge.ws

import com.memaide.bridge.model.PatientContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.onSubscription
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// Real-time test: BridgeSocket drives real OkHttp/MockWebServer background threads, so this
// must NOT run under runTest's virtual clock (a virtual delay would fast-forward the timeout
// before the real round trip completes). We use real threads + a CountDownLatch, and
// onSubscription to ensure the collector is registered before connect() — the inbound
// SharedFlow has no replay, so an emission before subscription would be lost. The server-side
// WebSocket is captured and closed before server.shutdown() (MockWebServer otherwise hangs
// waiting on the still-open upgraded connection).
class BridgeSocketTest {
    private lateinit var server: MockWebServer
    private val client = OkHttpClient()

    @Volatile private var serverWs: okhttp3.WebSocket? = null

    @Before fun setUp() { server = MockWebServer(); server.start() }

    @After fun tearDown() {
        serverWs?.close(1000, null)
        client.connectionPool.evictAll()
        server.shutdown()
    }

    @Test fun sends_hello_on_open_and_emits_decoded_inbound() {
        // Server echoes one audio_out frame back after it receives the hello.
        server.enqueue(
            MockResponse().withWebSocketUpgrade(object : okhttp3.WebSocketListener() {
                override fun onOpen(webSocket: okhttp3.WebSocket, response: okhttp3.Response) {
                    serverWs = webSocket
                }
                override fun onMessage(webSocket: okhttp3.WebSocket, text: String) {
                    if (text.contains("\"type\":\"hello\"")) {
                        webSocket.send("""{"type":"audio_out","pcm":"QUJD","seq":1}""")
                    }
                }
            })
        )
        val url = server.url("/").toString().replace("http", "ws")
        val socket = BridgeSocket(url, PatientContext("p1", "Rose"), sessionId = "s1", client = client)

        val received = CopyOnWriteArrayList<Inbound>()
        val subscribed = CountDownLatch(1)
        val gotAudioOut = CountDownLatch(1)
        val scope = CoroutineScope(Dispatchers.Default)
        val job = scope.launch {
            socket.inbound
                .onSubscription { subscribed.countDown() }
                .collect {
                    received.add(it)
                    if (it is Inbound.AudioOut) gotAudioOut.countDown()
                }
        }

        assertTrue("collector did not subscribe", subscribed.await(2, TimeUnit.SECONDS))
        socket.connect()
        assertTrue("never received audio_out", gotAudioOut.await(5, TimeUnit.SECONDS))

        socket.close()
        job.cancel()

        val request = server.takeRequest()
        assertEquals("/", request.path)
        val audioOut = received.filterIsInstance<Inbound.AudioOut>().single()
        assertEquals("QUJD", audioOut.pcm)
        assertEquals(1, audioOut.seq)
    }
}
