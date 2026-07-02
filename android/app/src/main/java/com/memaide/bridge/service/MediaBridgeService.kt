package com.memaide.bridge.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.util.Log
import com.memaide.bridge.audio.AudioEngine
import com.memaide.bridge.model.PatientContext
import com.memaide.bridge.model.SessionState
import com.memaide.bridge.video.FrameEncoder
import com.memaide.bridge.video.FrameSource
import com.memaide.bridge.video.GlassesFrameSource
import com.memaide.bridge.ws.BridgeSocket
import com.memaide.bridge.ws.Inbound
import com.memaide.bridge.ws.Outbound
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Foreground service that owns a streaming session: it wires the glasses camera + Bluetooth mic
 * to the MemAide WebSocket server and plays the server's audio replies back. A dumb pipe — no
 * phone-side VAD/brain/safety; all reasoning stays server-side.
 *
 * Coroutines launched per session:
 *  - **frame producer**: `FrameEncoder.encode(frameSource.frames())` -> [OutboundChannel.offerFrame]
 *  - **mic producer**: `AudioEngine.micPcm()` -> [OutboundChannel.offerAudio]
 *  - **frame sender**: [OutboundChannel.pollFrame] -> [BridgeSocket.send] (best-effort, drop-oldest)
 *  - **audio sender**: [OutboundChannel.receiveAudioOrNull] -> [BridgeSocket.send] (never dropped)
 *  - **inbound**: `AudioOut` -> [AudioEngine.play]; subtitles/vision/escalation -> [uiState]
 *  - **reconnect watcher**: on socket drop, [OutboundChannel.clearFrames] so nothing stale flushes
 *
 * [uiState] is exposed as a process-global `StateFlow` for the debug Activity (Task 12) to render.
 */
class MediaBridgeService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var socket: BridgeSocket? = null
    private var audio: AudioEngine? = null
    private var channel: OutboundChannel? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val url = intent?.getStringExtra(EXTRA_SERVER_URL)
            ?: return START_NOT_STICKY.also { stopSelf() }
        val patient = PatientContext(
            patientId = intent.getStringExtra(EXTRA_PATIENT_ID) ?: "unknown",
            name = intent.getStringExtra(EXTRA_PATIENT_NAME) ?: "Patient",
        )
        startAsForeground()
        startSession(url, patient)
        return START_STICKY
    }

    private fun startSession(url: String, patient: PatientContext) {
        val ch = OutboundChannel().also { channel = it }
        val sock = BridgeSocket(url, patient, sessionId = UUID.randomUUID().toString())
            .also { socket = it }
        val eng = AudioEngine(applicationContext).also { audio = it }
        val frameSource: FrameSource = GlassesFrameSource(applicationContext)
        val encoder = FrameEncoder()

        _uiState.update { it.copy(session = SessionState.Connecting) }
        eng.start()
        sock.connect()

        // Frame producer (CPU-bound JPEG encode on Default).
        scope.launch {
            runCatching {
                encoder.encode(frameSource.frames()).collect { ch.offerFrame(Outbound.Frame(it)) }
            }.onFailure { Log.e(TAG, "frame producer stopped", it) }
        }
        // Mic producer (blocking reads on IO).
        scope.launch(Dispatchers.IO) {
            runCatching { eng.micPcm().collect { ch.offerAudio(it) } }
                .onFailure { Log.e(TAG, "mic producer stopped", it) }
        }
        // Frame sender — best-effort; idles briefly when the buffer is empty.
        scope.launch {
            while (isActive) {
                val f = ch.pollFrame()
                if (f == null) { delay(FRAME_IDLE_MS); continue }
                sock.send(f)
            }
        }
        // Audio sender — suspends on the channel; audio is never dropped.
        scope.launch {
            while (isActive) {
                val a = ch.receiveAudioOrNull() ?: break
                sock.send(a)
            }
        }
        // Inbound: play audio, surface text state.
        scope.launch {
            sock.inbound.collect { msg ->
                when (msg) {
                    is Inbound.AudioOut -> eng.play(msg.pcm)
                    is Inbound.Subtitle -> _uiState.update { it.copy(lastSubtitle = msg.text) }
                    is Inbound.VisionContext ->
                        _uiState.update { it.copy(lastVision = msg.description) }
                    is Inbound.Escalation ->
                        _uiState.update { it.copy(lastEscalation = msg.reason) }
                    is Inbound.AudioError -> Log.w(TAG, "server audio_error: ${msg.text}")
                }
            }
        }
        // Reconnect watcher: drop stale frames whenever the socket goes down, and reflect state.
        scope.launch {
            var wasConnected = false
            sock.connected.collect { up ->
                if (!up && wasConnected) ch.clearFrames()
                wasConnected = up
                _uiState.update {
                    it.copy(session = if (up) SessionState.Streaming else SessionState.Reconnecting)
                }
            }
        }
    }

    private fun startAsForeground() {
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "MemAide Bridge", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notification: Notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("MemAide Bridge")
            .setContentText("Streaming glasses camera and audio")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .build()
        startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA,
        )
    }

    override fun onDestroy() {
        runCatching { socket?.send(Outbound.Bye()) }
        scope.cancel()
        runCatching { audio?.stop() }
        runCatching { socket?.close() }
        runCatching { channel?.close() }
        _uiState.update { it.copy(session = SessionState.Disconnected) }
        super.onDestroy()
    }

    /** State the debug Activity renders. */
    data class UiState(
        val session: SessionState = SessionState.Disconnected,
        val lastSubtitle: String = "",
        val lastVision: String = "",
        val lastEscalation: String = "",
    )

    companion object {
        private const val TAG = "MediaBridgeService"
        private const val CHANNEL_ID = "memaide_bridge"
        private const val NOTIFICATION_ID = 1
        private const val FRAME_IDLE_MS = 15L

        const val ACTION_STOP = "com.memaide.bridge.STOP"
        const val EXTRA_SERVER_URL = "server_url"
        const val EXTRA_PATIENT_ID = "patient_id"
        const val EXTRA_PATIENT_NAME = "patient_name"

        private val _uiState = MutableStateFlow(UiState())
        val uiState: StateFlow<UiState> = _uiState

        /** Convenience launcher for the Activity (Task 12). */
        fun start(context: Context, serverUrl: String, patientId: String, patientName: String) {
            val intent = Intent(context, MediaBridgeService::class.java).apply {
                putExtra(EXTRA_SERVER_URL, serverUrl)
                putExtra(EXTRA_PATIENT_ID, patientId)
                putExtra(EXTRA_PATIENT_NAME, patientName)
            }
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, MediaBridgeService::class.java).setAction(ACTION_STOP)
            )
        }
    }
}
