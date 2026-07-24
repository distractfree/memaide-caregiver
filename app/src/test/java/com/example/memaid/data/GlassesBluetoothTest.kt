package com.example.memaid.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlassesBluetoothTest {

    @Test
    fun isMetaGlasses_matchesRbPrefix() {
        assertTrue(GlassesBluetooth.isMetaGlasses("RB-1A2B"))
        assertTrue(GlassesBluetooth.isMetaGlasses("rb meta"))
    }

    @Test
    fun isMetaGlasses_matchesKnownNames() {
        assertTrue(GlassesBluetooth.isMetaGlasses("Ray-Ban Meta"))
        assertTrue(GlassesBluetooth.isMetaGlasses("meta glasses"))
        assertTrue(GlassesBluetooth.isMetaGlasses("Ray-Ban Stories"))
    }

    @Test
    fun isMetaGlasses_rejectsOthers() {
        assertFalse(GlassesBluetooth.isMetaGlasses("Pixel Buds"))
        assertFalse(GlassesBluetooth.isMetaGlasses("Galaxy Watch"))
        assertFalse(GlassesBluetooth.isMetaGlasses(""))
        assertFalse(GlassesBluetooth.isMetaGlasses(null))
    }

    @Test
    fun shouldCapture_trueWhenAnyMetaConnected() {
        assertTrue(GlassesBluetooth.shouldCapture(listOf("Galaxy Watch", "RB-9Z8Y")))
    }

    @Test
    fun shouldCapture_falseWhenNoneMatchOrEmpty() {
        assertFalse(GlassesBluetooth.shouldCapture(listOf("Galaxy Watch", "Pixel Buds")))
        assertFalse(GlassesBluetooth.shouldCapture(emptyList()))
    }
}
