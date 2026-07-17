package com.example.memaid.data

import com.example.memaid.data.HelpSessionManager.Owner
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HelpSessionManagerTest {

    @After
    fun reset() {
        // Shared object state — clear it back to NONE between tests.
        HelpSessionManager.release(HelpSessionManager.owner)
    }

    @Test
    fun `first acquirer becomes the owner`() {
        assertTrue(HelpSessionManager.tryAcquire(Owner.PHONE))
        assertEquals(Owner.PHONE, HelpSessionManager.owner)
        assertTrue(HelpSessionManager.isActive)
    }

    @Test
    fun `the other device is rejected while a session is active`() {
        assertTrue(HelpSessionManager.tryAcquire(Owner.WATCH))
        assertFalse(HelpSessionManager.tryAcquire(Owner.PHONE))
        // The active session keeps its owner — the loser does not steal it.
        assertEquals(Owner.WATCH, HelpSessionManager.owner)
    }

    @Test
    fun `re-acquiring from the same device is idempotent`() {
        assertTrue(HelpSessionManager.tryAcquire(Owner.PHONE))
        assertTrue(HelpSessionManager.tryAcquire(Owner.PHONE))
        assertEquals(Owner.PHONE, HelpSessionManager.owner)
    }

    @Test
    fun `release frees the session for the other device`() {
        HelpSessionManager.tryAcquire(Owner.PHONE)
        HelpSessionManager.release(Owner.PHONE)
        assertEquals(Owner.NONE, HelpSessionManager.owner)
        assertFalse(HelpSessionManager.isActive)
        assertTrue(HelpSessionManager.tryAcquire(Owner.WATCH))
    }

    @Test
    fun `a stale release from a non-owner is ignored`() {
        HelpSessionManager.tryAcquire(Owner.PHONE)
        HelpSessionManager.release(Owner.WATCH) // watch never owned it
        assertEquals(Owner.PHONE, HelpSessionManager.owner)
        assertFalse(HelpSessionManager.tryAcquire(Owner.WATCH))
    }
}
