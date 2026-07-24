package com.example.memaid.data

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.util.Log

// Decides whether Meta glasses are currently connected to the *phone* over Bluetooth. Used to
// auto-enable glasses vision for a help session (phone- or watch-started) without a manual
// toggle. The name matchers are pure and unit-tested; connectedDeviceNames() is the thin,
// permission-guarded Android query.
object GlassesBluetooth {

    private const val TAG = "GlassesBluetooth"

    // Ray-Ban Meta glasses expose a default Bluetooth name beginning with "RB". Match that
    // prefix plus other known/alternate names, case-insensitively.
    private val SUBSTRINGS = listOf("ray-ban", "meta", "stories")

    fun isMetaGlasses(name: String?): Boolean {
        val n = name?.trim()?.lowercase() ?: return false
        if (n.isEmpty()) return false
        if (n.startsWith("rb")) return true
        return SUBSTRINGS.any { n.contains(it) }
    }

    fun shouldCapture(connectedNames: List<String>): Boolean =
        connectedNames.any { isMetaGlasses(it) }

    // Names of bonded devices that are *currently connected*. BluetoothDevice.isConnected() is a
    // hidden-but-stable API reached by reflection — the standard way to check connection without a
    // profile-proxy round trip. Needs BLUETOOTH_CONNECT (already requested in MainActivity); any
    // failure (no adapter, denied permission, reflection/SecurityException) -> emptyList.
    fun connectedDeviceNames(context: Context): List<String> {
        return try {
            val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter: BluetoothAdapter = manager?.adapter ?: return emptyList()
            if (!adapter.isEnabled) return emptyList()
            adapter.bondedDevices.orEmpty()
                .filter { device ->
                    try {
                        device.javaClass.getMethod("isConnected").invoke(device) as? Boolean ?: false
                    } catch (e: Exception) {
                        false
                    }
                }
                .mapNotNull { runCatching { it.name }.getOrNull() }
        } catch (e: SecurityException) {
            Log.w(TAG, "BLUETOOTH_CONNECT not granted: ${e.message}")
            emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "Bluetooth query failed: ${e.message}")
            emptyList()
        }
    }

    fun glassesConnected(context: Context): Boolean =
        shouldCapture(connectedDeviceNames(context))
}
