package com.example.memaid.data

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.Manifest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.pow
import android.os.Build

data class DetectedBeacon(
    val roomName: String,
    val beaconId: String,
    val major: Int,
    val minor: Int,
    val rssi: Int,
    val estimatedDistanceM: Double
)

class BeaconScanner(private val context: Context) {

    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val adapter: BluetoothAdapter? = bluetoothManager.adapter
    private var scanner: BluetoothLeScanner? = null

    private val configs = BeaconRepository.getBeaconConfigs()

    private val _currentBeacon = MutableStateFlow<DetectedBeacon?>(null)
    val currentBeacon: StateFlow<DetectedBeacon?> = _currentBeacon.asStateFlow()

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            parseResult(result)
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            results.forEach { parseResult(it) }
        }

        override fun onScanFailed(errorCode: Int) {
            println("⚠️ Scan FAILED errorCode=$errorCode")
        }
    }

    private fun parseResult(result: ScanResult) {
        val record = result.scanRecord ?: return

        // Log FULL raw bytes for your beacons by MAC
        val addr = result.device.address
        if (addr.startsWith("DD:34:02")) {
            val raw = record.bytes?.joinToString(" ") { "%02X".format(it) } ?: "null"
            println("⭐ MYBEACON $addr RSSI=${result.rssi}")
            println("   RAW=$raw")
        }

        val manuData = record.manufacturerSpecificData ?: return

        for (idx in 0 until manuData.size()) {
            val companyId = manuData.keyAt(idx)
            val data = manuData.valueAt(idx) ?: continue

            val looksLikeIBeacon = (companyId == 0x004C || companyId == 0x4C00) &&
                    data.size >= 23 &&
                    (data[0].toInt() and 0xFF) == 0x02 &&
                    (data[1].toInt() and 0xFF) == 0x15

            if (!looksLikeIBeacon) continue

            val uuidBytes = data.copyOfRange(2, 18)
            val uuid = uuidBytes.joinToString("") { "%02X".format(it) }
                .replaceFirst(
                    Regex("([0-9A-F]{8})([0-9A-F]{4})([0-9A-F]{4})([0-9A-F]{4})([0-9A-F]{12})"),
                    "$1-$2-$3-$4-$5"
                )
            val major = ((data[18].toInt() and 0xFF) shl 8) or (data[19].toInt() and 0xFF)
            val minor = ((data[20].toInt() and 0xFF) shl 8) or (data[21].toInt() and 0xFF)
            val txPower = data[22].toInt()

            println("🔵 Raw iBeacon: UUID=$uuid Major=$major Minor=$minor RSSI=${result.rssi} from ${result.device.address}")

            val match = configs.find {
                it.beaconUuid.equals(uuid, ignoreCase = true) &&
                        it.major == major &&
                        it.minor == minor
            } ?: continue

            val distance = estimateDistance(result.rssi, txPower)
            _currentBeacon.value = DetectedBeacon(
                roomName = match.roomName,
                beaconId = match.beaconId,
                major = major,
                minor = minor,
                rssi = result.rssi,
                estimatedDistanceM = distance
            )
        }
    }

    private fun estimateDistance(rssi: Int, txPower: Int): Double {
        if (rssi == 0) return -1.0
        val ratio = rssi.toDouble() / txPower.toDouble()
        return if (ratio < 1.0) {
            ratio.pow(10.0)
        } else {
            0.89976 * ratio.pow(7.7095) + 0.111
        }
    }

    fun startScanning(): Boolean {
        if (adapter == null || !adapter.isEnabled) {
            println("⚠️ Bluetooth off/unavailable")
            return false
        }
        val hasScan = ContextCompat.checkSelfPermission(
            context, Manifest.permission.BLUETOOTH_SCAN
        ) == PackageManager.PERMISSION_GRANTED
        val hasLoc = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasScan && !hasLoc) {
            println("⚠️ Missing permission")
            return false
        }

        scanner = adapter.bluetoothLeScanner ?: return false
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
            .setNumOfMatches(ScanSettings.MATCH_NUM_MAX_ADVERTISEMENT)
            .setReportDelay(0)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    setLegacy(true)
                    setPhy(ScanSettings.PHY_LE_ALL_SUPPORTED)
                }
            }
            .build()

        return try {
            scanner?.startScan(null, settings, scanCallback)
            println("📡 Raw scanning started")
            true
        } catch (e: SecurityException) {
            println("⚠️ Scan error: ${e.message}")
            false
        }
    }

    fun stopScanning() {
        try {
            scanner?.stopScan(scanCallback)
            println("📡 Raw scanning stopped")
        } catch (e: SecurityException) {
            // ignore
        }
    }
}