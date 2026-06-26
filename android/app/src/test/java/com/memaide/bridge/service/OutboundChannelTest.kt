package com.memaide.bridge.service

import com.memaide.bridge.ws.Outbound
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class OutboundChannelTest {
    @Test fun drops_oldest_frame_when_full_but_keeps_audio() = runTest {
        val ch = OutboundChannel(frameCapacity = 2)
        // Three frames into a 2-slot frame buffer: the oldest is dropped.
        ch.offerFrame(Outbound.Frame("f1"))
        ch.offerFrame(Outbound.Frame("f2"))
        ch.offerFrame(Outbound.Frame("f3"))
        ch.offerAudio(Outbound.Audio("a1"))
        ch.close()

        val drained = ch.drain()
        val frames = drained.filterIsInstance<Outbound.Frame>().map { it.dataUrl }
        val audios = drained.filterIsInstance<Outbound.Audio>().map { it.pcm }
        assertEquals(listOf("f2", "f3"), frames)   // f1 dropped
        assertEquals(listOf("a1"), audios)         // audio never dropped
    }
}
