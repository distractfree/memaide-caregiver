package com.example.memaid.ui

import com.example.memaid.data.TimeUtils
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.example.memaid.data.FakeDataRepository
import com.example.memaid.data.Patient
import com.example.memaid.data.Reminder
import com.example.memaid.data.ReminderStatus
import com.example.memaid.data.SessionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import com.example.memaid.data.ReminderAckEvent
import androidx.lifecycle.viewModelScope
import com.example.memaid.data.HelpEvent
import com.example.memaid.data.ReminderRepository
import kotlinx.coroutines.launch
import com.example.memaid.data.ReminderScheduler
import com.example.memaid.data.BeaconScanner
import com.example.memaid.data.DetectedBeacon
import com.example.memaid.data.BeaconEvent

class MainViewModel(application: Application) : AndroidViewModel(application) {

    val sessionManager = SessionManager(application)

    private val _reminders = MutableStateFlow(loadRemindersWithStatus())
    val reminders: StateFlow<List<Reminder>> = _reminders.asStateFlow()

    private val _currentRoom = MutableStateFlow("Unknown")
    val currentRoom: StateFlow<String> = _currentRoom.asStateFlow()

    private val _watchConnected = MutableStateFlow(false)
    val watchConnected: StateFlow<Boolean> = _watchConnected.asStateFlow()

    private val _patientName = MutableStateFlow(
        sessionManager.getPatientName() ?: "Patient"
    )
    val patientName: StateFlow<String> = _patientName.asStateFlow()

    private val _patients = MutableStateFlow(FakeDataRepository.getFakePatients())
    val patients: StateFlow<List<Patient>> = _patients.asStateFlow()

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError: StateFlow<String?> = _loginError.asStateFlow()

    // Beacon scanner
    private val beaconScanner = BeaconScanner(application)

    private val _detectedBeacon = MutableStateFlow<DetectedBeacon?>(null)
    val detectedBeacon: StateFlow<DetectedBeacon?> = _detectedBeacon.asStateFlow()

    // Track dwell: when we first saw the current room
    private var roomFirstSeenAt: Long = 0L
    private var lastEventRoom: String? = null

    fun startBeaconScanning(): Boolean {
        val started = beaconScanner.startScanning()
        if (started) {
            viewModelScope.launch {
                beaconScanner.currentBeacon.collect { beacon ->
                    _detectedBeacon.value = beacon
                    handleBeaconDwell(beacon)
                }
            }
        }
        return started
    }

    fun stopBeaconScanning() {
        beaconScanner.stopScanning()
    }

    // Apply 5-second dwell logic, update room, and send event once
    private fun handleBeaconDwell(beacon: DetectedBeacon?) {
        if (beacon == null) {
            return
        }

        val now = System.currentTimeMillis()

        // New room detected — start the dwell timer
        if (_currentRoom.value != beacon.roomName) {
            // Only update "current room" display immediately
            _currentRoom.value = beacon.roomName
            roomFirstSeenAt = now
            lastEventRoom = null // reset so we can send a new event after dwell
        }

        // If we've dwelled 5+ seconds and haven't sent an event for this room yet
        val dwelledMs = now - roomFirstSeenAt
        if (dwelledMs >= 5000 && lastEventRoom != beacon.roomName) {
            lastEventRoom = beacon.roomName
            sendBeaconEvent(beacon)
        }
    }

    private fun sendBeaconEvent(beacon: DetectedBeacon) {
        val event = BeaconEvent(
            patientId = sessionManager.getPatientId() ?: FakeDataRepository.PATIENT_ID,
            beaconId = beacon.beaconId,
            roomName = beacon.roomName,
            detectedAt = TimeUtils.nowIsoUtc(),
            estimatedDistanceM = beacon.estimatedDistanceM,
            dwellSeconds = 5
        )
        println("📍 Beacon event: $event")
        // TODO: send to backend via repository in live mode (Week 8 integration)
    }

    fun login(email: String, password: String, onSuccess: () -> Unit) {
        if (email.isBlank() || password.isBlank()) {
            _loginError.value = "Please enter your email and password."
            return
        }

        viewModelScope.launch {
            val result = ReminderRepository.login(email, password)
            result.fold(
                onSuccess = { response ->
                    sessionManager.saveToken(response.token)
                    sessionManager.saveCaregiverName(response.name)
                    _loginError.value = null
                    onSuccess()
                },
                onFailure = { error ->
                    _loginError.value = "Login failed: ${error.message}"
                }
            )
        }
    }

    fun selectPatient(patient: Patient, onSuccess: () -> Unit) {
        sessionManager.saveSelectedPatient(patient.patientId, patient.name)
        // Save the real device ID so reminders load for THIS patient
        patient.deviceId?.let { sessionManager.saveDeviceId(it) }
        _patientName.value = patient.name
        onSuccess()
    }

    fun logout() {
        sessionManager.logout()
        _patientName.value = "Patient"
    }

    fun acknowledgeReminder(reminderId: String, sourceDevice: String = "phone") {
        _reminders.update { list ->
            list.map { reminder ->
                if (reminder.reminderId == reminderId)
                    reminder.copy(status = ReminderStatus.ACKNOWLEDGED)
                else reminder
            }
        }

        sessionManager.markReminderAcknowledged(reminderId)

        // Cancel the scheduled alarm since it's done
        ReminderScheduler.cancel(getApplication(), reminderId)

        viewModelScope.launch {
            val deviceId = sessionManager.getDeviceId()
            val result = ReminderRepository.sendAck(deviceId, reminderId, sourceDevice)
            result.fold(
                onSuccess = { println("✅ Ack sent successfully") },
                onFailure = { error -> println("⚠️ Ack failed: ${error.message}") }
            )
        }
    }

    fun getReminderById(reminderId: String): Reminder? {
        return _reminders.value.find { it.reminderId == reminderId }
    }

    fun sendHelpEvent(sourceDevice: String = "phone") {
        viewModelScope.launch {
            val deviceId = sessionManager.getDeviceId()
            val whatsapp = FakeDataRepository.CAREGIVER_WHATSAPP_NUMBER.let { "+$it" }
            val result = ReminderRepository.sendHelp(deviceId, sourceDevice, whatsapp)
            result.fold(
                onSuccess = { println("✅ Help event sent") },
                onFailure = { error -> println("⚠️ Help failed: ${error.message}") }
            )
        }
    }

    fun loadPatients() {
        viewModelScope.launch {
            val token = sessionManager.getToken() ?: ""
            val result = ReminderRepository.getPatients(token)
            result.fold(
                onSuccess = { patientList ->
                    _patients.value = patientList
                    println("✅ Loaded ${patientList.size} patients")
                },
                onFailure = { error ->
                    println("⚠️ Failed to load patients: ${error.message}")
                }
            )
        }
    }

    fun clearLoginError() {
        _loginError.value = null
    }

    // Loads fake reminders, then applies saved acknowledgments and missed logic
    private fun loadRemindersWithStatus(): List<Reminder> {
        val acknowledgedIds = sessionManager.getAcknowledgedIds()
        return FakeDataRepository.getFakeReminders().map { reminder ->
            when {
                // Already acknowledged (from a previous session) -> keep it acknowledged
                acknowledgedIds.contains(reminder.reminderId) ->
                    reminder.copy(status = ReminderStatus.ACKNOWLEDGED)

                // Past its time + grace period, never acknowledged -> missed
                reminder.status != ReminderStatus.ACKNOWLEDGED &&
                        TimeUtils.isPastWithGrace(reminder.timeOfDay, 5) ->
                    reminder.copy(status = ReminderStatus.MISSED)

                // Otherwise leave as-is
                else -> reminder
            }
        }
    }

    // Call this to recompute missed status (e.g. when returning to the app)
    fun refreshReminderStatuses() {
        _reminders.value = loadRemindersWithStatus()
    }

    fun loadRemindersFromBackend() {
        viewModelScope.launch {
            val deviceId = sessionManager.getDeviceId()
            val result = ReminderRepository.getRemindersWithPatient(deviceId)
            result.fold(
                onSuccess = { (patientName, serverReminders) ->
                    // Save and show the real patient name from the backend
                    if (patientName.isNotBlank()) {
                        sessionManager.saveSelectedPatient(deviceId, patientName)
                        _patientName.value = patientName
                    }
                    val acknowledgedIds = sessionManager.getAcknowledgedIds()
                    _reminders.value = serverReminders.map { reminder ->
                        when {
                            acknowledgedIds.contains(reminder.reminderId) ->
                                reminder.copy(status = ReminderStatus.ACKNOWLEDGED)
                            TimeUtils.isPastWithGrace(reminder.timeOfDay, 5) ->
                                reminder.copy(status = ReminderStatus.MISSED)
                            else -> reminder
                        }
                    }
                    println("✅ Loaded ${serverReminders.size} reminders for $patientName")
                },
                onFailure = { error ->
                    println("⚠️ Failed to load reminders: ${error.message}")
                }
            )
        }
    }
}