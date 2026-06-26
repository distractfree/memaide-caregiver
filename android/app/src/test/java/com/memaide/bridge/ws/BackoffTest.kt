package com.memaide.bridge.ws

import org.junit.Assert.assertEquals
import org.junit.Test

class BackoffTest {
    @Test fun doubles_until_cap_then_resets() {
        val b = Backoff(initialMs = 500, maxMs = 4000)
        assertEquals(500, b.next())
        assertEquals(1000, b.next())
        assertEquals(2000, b.next())
        assertEquals(4000, b.next())
        assertEquals(4000, b.next())
        b.reset()
        assertEquals(500, b.next())
    }
}
