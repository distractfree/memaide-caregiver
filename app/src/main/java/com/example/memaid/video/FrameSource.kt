package com.example.memaid.video

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow

/** Capture seam: MockDevice / real-glasses / phone-camera all implement this. */
interface FrameSource {
    fun frames(): Flow<RawFrame>
}

/** Test/dev source that replays a fixed list of frames. */
class StubFrameSource(private val items: List<RawFrame>) : FrameSource {
    override fun frames(): Flow<RawFrame> = items.asFlow()
}
