package com.example.memaid.wear.presentation

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.sqrt

// Reads heart rate + accelerometer from the watch's sensors
class VitalsSensorManager(context: Context) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val heartRateSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_HEART_RATE)
    private val accelerometer: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

    private val _heartRate = MutableStateFlow(0)
    val heartRate: StateFlow<Int> = _heartRate.asStateFlow()

    // Simple motion state: "still" or "moving", from accel magnitude variance
    private val _motionState = MutableStateFlow("unknown")
    val motionState: StateFlow<String> = _motionState.asStateFlow()

    private val recentAccel = ArrayDeque<Double>()

    fun start() {
        if (heartRateSensor != null) {
            sensorManager.registerListener(
                this, heartRateSensor, SensorManager.SENSOR_DELAY_NORMAL
            )
            Log.d("Vitals", "❤️ Heart rate sensor registered")
        } else {
            Log.d("Vitals", "⚠️ No heart rate sensor on this device")
        }

        if (accelerometer != null) {
            sensorManager.registerListener(
                this, accelerometer, SensorManager.SENSOR_DELAY_NORMAL
            )
            Log.d("Vitals", "🏃 Accelerometer registered")
        } else {
            Log.d("Vitals", "⚠️ No accelerometer on this device")
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        Log.d("Vitals", "🛑 Sensors unregistered")
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_HEART_RATE -> {
                val bpm = event.values[0].toInt()
                if (bpm > 0) {
                    _heartRate.value = bpm
                    Log.d("Vitals", "❤️ HR=$bpm bpm")
                }
            }
            Sensor.TYPE_ACCELEROMETER -> {
                val (x, y, z) = event.values
                val magnitude = sqrt((x * x + y * y + z * z).toDouble())

                // Keep the last ~20 readings and check variance
                recentAccel.addLast(magnitude)
                if (recentAccel.size > 20) recentAccel.removeFirst()
                if (recentAccel.size >= 10) {
                    val mean = recentAccel.average()
                    val variance = recentAccel.map { (it - mean) * (it - mean) }.average()
                    val newState = if (variance > 0.5) "active" else "idle"
                    if (newState != _motionState.value) {
                        _motionState.value = newState
                        Log.d("Vitals", "🏃 Motion state: $newState")
                    }
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) { /* not needed */ }
}

