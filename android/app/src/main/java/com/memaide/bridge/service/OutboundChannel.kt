package com.memaide.bridge.service

import com.memaide.bridge.ws.Outbound
import kotlinx.coroutines.channels.Channel

/**
 * Frames use a bounded drop-oldest buffer so stale video never backlogs; audio uses an
 * unbounded buffer so speech is never dropped. `drain()` (test/helper) reads everything
 * currently buffered after `close()`. In the Service, a sender coroutine consumes both.
 */
class OutboundChannel(frameCapacity: Int = 4) {
    private val frames = ArrayDeque<Outbound.Frame>()
    private val frameCap = frameCapacity
    private val audio = Channel<Outbound.Audio>(Channel.UNLIMITED)
    private var closed = false

    @Synchronized
    fun offerFrame(f: Outbound.Frame) {
        if (closed) return
        if (frames.size >= frameCap) frames.removeFirst()  // drop oldest
        frames.addLast(f)
    }

    fun offerAudio(a: Outbound.Audio) {
        if (!closed) audio.trySend(a)
    }

    @Synchronized
    fun close() { closed = true; audio.close() }

    /** Helper for tests/flush: snapshot of buffered frames then audio. */
    @Synchronized
    fun drain(): List<Outbound> {
        val out = ArrayList<Outbound>(frames)
        while (true) {
            val a = audio.tryReceive().getOrNull() ?: break
            out.add(a)
        }
        return out
    }

    /** Clear buffered frames on a socket drop so nothing stale flushes on reconnect. */
    @Synchronized
    fun clearFrames() { frames.clear() }
}
