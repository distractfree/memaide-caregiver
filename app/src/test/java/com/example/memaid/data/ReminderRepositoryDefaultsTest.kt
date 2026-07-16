package com.example.memaid.data

import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ReminderRepositoryDefaultsTest {

    // With the Settings demo-mode toggle removed, the app must default to the live
    // backend. If this fails, the app would be stranded on fake data with no UI to fix it.
    @Test
    fun demoMode_defaultsToLiveBackend() {
        assertFalse(
            "ReminderRepository.demoMode must default to false (live backend)",
            ReminderRepository.demoMode
        )
    }
}
