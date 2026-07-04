package com.memaide.bridge.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.memaide.bridge.service.MediaBridgeService
import com.meta.wearable.dat.core.Wearables
import kotlinx.coroutines.launch

/**
 * Minimal launcher for the Part A glasses vision trace (frames-only).
 *
 * One screen: a server-URL field (point at the laptop bridge server), a **Register glasses**
 * button (the one-time Meta Wearables registration flow), and **Start/Stop** for the
 * frames-only [MediaBridgeService]. Requests CAMERA + BLUETOOTH_CONNECT at runtime — no
 * RECORD_AUDIO, since the vision test never opens the mic. A status line mirrors the service's
 * [MediaBridgeService.uiState] so you can see connect/stream state without the debug panel.
 *
 * All reasoning stays server-side; this is just a way to start/stop the stream on the phone.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var status: TextView
    private lateinit var urlField: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        urlField = EditText(this).apply {
            setText(DEFAULT_SERVER_URL)
            hint = "ws://<laptop-LAN-IP>:8765"
        }
        val registerBtn = Button(this).apply {
            text = "Register glasses"
            setOnClickListener { registerGlasses() }
        }
        val startBtn = Button(this).apply {
            text = "Start (frames-only)"
            setOnClickListener { startStreaming() }
        }
        val stopBtn = Button(this).apply {
            text = "Stop"
            setOnClickListener { MediaBridgeService.stop(this@MainActivity) }
        }
        status = TextView(this).apply { text = "Idle." }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 96, 48, 48)
            addView(urlField)
            addView(registerBtn)
            addView(startBtn)
            addView(stopBtn)
            addView(status)
        }
        setContentView(root)

        runCatching { Wearables.initialize(applicationContext) }
            .onFailure { Log.w(TAG, "Wearables.initialize failed", it) }

        // Mirror the service state onto the status line.
        lifecycleScope.launch {
            MediaBridgeService.uiState.collect { s ->
                status.text = buildString {
                    append("Session: ${s.session}")
                    if (s.lastVision.isNotEmpty()) append("\nVision: ${s.lastVision}")
                    if (s.lastEscalation.isNotEmpty()) append("\n⚠ ${s.lastEscalation}")
                }
            }
        }
    }

    private fun registerGlasses() {
        status.text = "Starting glasses registration…"
        runCatching { Wearables.startRegistration(this) }
            .onFailure {
                Log.e(TAG, "startRegistration failed", it)
                status.text = "Registration failed: ${it.message}"
            }
    }

    private fun startStreaming() {
        val missing = REQUIRED_PERMISSIONS.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_PERMS)
            return
        }
        MediaBridgeService.start(
            context = this,
            serverUrl = urlField.text.toString().trim(),
            patientId = "demo",
            patientName = "Patient",
            audioEnabled = false, // Part A: frames-only
        )
        status.text = "Starting stream…"
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_PERMS) {
            if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                startStreaming()
            } else {
                status.text = "CAMERA + BLUETOOTH_CONNECT are required to stream."
            }
        }
    }

    companion object {
        private const val TAG = "MainActivity"
        private const val REQ_PERMS = 1
        private const val DEFAULT_SERVER_URL = "ws://192.168.1.100:8765"
        private val REQUIRED_PERMISSIONS = arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.BLUETOOTH_CONNECT,
        )
    }
}
