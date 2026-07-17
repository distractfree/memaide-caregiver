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
import com.example.memaid.data.ReminderSync
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import com.example.memaid.data.ReminderScheduler
import com.example.memaid.data.BeaconScanner
import com.example.memaid.data.DetectedBeacon
import com.example.memaid.data.BeaconEvent
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await

class MainViewModel(application: Application) : AndroidViewModel(application) {

    val sessionManager = SessionManager(application)

    // Starts empty, not with fake data: this list gets mirrored to the watch, and pushing
    // FakeDataRepository's reminders would show the patient medications that aren't theirs.
    private val _reminders = MutableStateFlow<List<Reminder>>(emptyList())
    val reminders: StateFlow<List<Reminder>> = _reminders.asStateFlow()

    // Nothing is pushed to the watch until the real list has been loaded at least once.
    private var remindersLoaded = false

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

    init {
        // The watch mirrors whatever the phone is showing, so push from one place rather
        // than from each call site that can change the list.
        viewModelScope.launch {
            combine(_reminders, _patientName) { reminders, name -> name to reminders }
                .collect { (name, reminders) ->
                    if (!remindersLoaded) return@collect
                    ReminderSync.push(getApplication(), name, reminders)
                }
        }

        // Reflect the real watch link in the UI instead of leaving the flag hardcoded false.
        // A cheap NodeClient poll; a few seconds' latency on connect/disconnect is acceptable.
        viewModelScope.launch {
            while (true) {
                _watchConnected.value = try {
                    Wearable.getNodeClient(getApplication<Application>())
                        .connectedNodes.await().isNotEmpty()
                } catch (e: Exception) {
                    false
                }
                delay(5_000)
            }
        }
    }

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
        println("💾 Selecting patient: ${patient.name}, deviceId=${patient.deviceId}")
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
        val reminder = getReminderById(reminderId) ?: return
        val previousStatus = reminder.status

        // Show it as done straight away so the tap feels instant, but don't commit it
        // anywhere until the backend confirms — a rejected ack must not leave the phone
        // believing a medication was taken.
        setStatus(reminderId, ReminderStatus.ACKNOWLEDGED)

        viewModelScope.launch {
            val deviceId = sessionManager.getDeviceId()
            if (deviceId == null) {
                setStatus(reminderId, previousStatus)
                println("⚠️ No patient selected — ack not sent")
                return@launch
            }
            val result = ReminderRepository.sendAck(
                deviceId, reminderId, sourceDevice, reminder.timeOfDay
            )
            result.fold(
                onSuccess = {
                    sessionManager.markReminderAcknowledged(reminderId)
                    ReminderScheduler.cancel(getApplication(), reminderId)
                    println("✅ Ack sent successfully")
                },
                onFailure = { error ->
                    // Put it back so the caregiver can retry.
                    setStatus(reminderId, previousStatus)
                    println("⚠️ Ack failed, reverted: ${error.message}")
                }
            )
        }
    }

    private fun setStatus(reminderId: String, status: ReminderStatus) {
        _reminders.update { list ->
            list.map { reminder ->
                if (reminder.reminderId == reminderId) reminder.copy(status = status)
                else reminder
            }
        }
    }

    fun getReminderById(reminderId: String): Reminder? {
        return _reminders.value.find { it.reminderId == reminderId }
    }

    fun sendHelpEvent(sourceDevice: String = "phone") {
        viewModelScope.launch {
            val deviceId = sessionManager.getDeviceId()
            if (deviceId == null) {
                println("⚠️ No patient selected — help event not sent")
                return@launch
            }
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
            val result = ReminderRepository.getPatients()
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
        remindersLoaded = true
        _reminders.value = loadRemindersWithStatus()
    }

    fun loadRemindersFromBackend() {
        viewModelScope.launch {
            val deviceId = sessionManager.getDeviceId()
            if (deviceId == null) {
                println("⚠️ No patient selected — not loading reminders")
                return@launch
            }
            println("📋 Loading reminders for deviceId=$deviceId")
            val result = ReminderRepository.getRemindersWithPatient(deviceId)
            result.fold(
                onSuccess = { (patientName, serverReminders) ->
                    // Save and show the real patient name from the backend
                    if (patientName.isNotBlank()) {
                        sessionManager.saveSelectedPatient(deviceId, patientName)
                        _patientName.value = patientName
                    }
                    val acknowledgedIds = sessionManager.getAcknowledgedIds()
                    remindersLoaded = true
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