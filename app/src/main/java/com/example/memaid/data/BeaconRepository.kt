package com.example.memaid.data

/**
 * Real, physical beacon configuration for the deployed KBeacons.
 * This is genuine setup data (real UUIDs/Majors/Minors mapped to real rooms),
 * NOT demo/fake data — hence it lives separately from FakeDataRepository.
 *
 * Long-term, this mapping likely belongs on the backend, fetched per patient
 * alongside reminders (a caregiver configures which beacon is in which room).
 * For now it's hardcoded here.
 */
object BeaconRepository {

    fun getBeaconConfigs(): List<BeaconConfig> = listOf(
        BeaconConfig(
            beaconId = "b001",
            roomName = "Living Room",
            beaconUuid = "11111111-2222-4333-8444-555555555555",
            major = 7,
            minor = 33905,
            thresholdDistanceM = 3.0,
            dwellSeconds = 5
        ),
        BeaconConfig(
            beaconId = "b002",
            roomName = "Bedroom",
            beaconUuid = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
            major = 7,
            minor = 33882,
            thresholdDistanceM = 3.0,
            dwellSeconds = 5
        )
    )
}
