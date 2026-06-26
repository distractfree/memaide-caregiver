package com.memaide.bridge.ws

import kotlin.math.min

/** Pure exponential backoff: doubles each call up to a cap; reset on a good connect. */
class Backoff(private val initialMs: Long = 500, private val maxMs: Long = 10_000) {
    private var current = initialMs
    fun next(): Long {
        val v = current
        current = min(current * 2, maxMs)
        return v
    }
    fun reset() { current = initialMs }
}
