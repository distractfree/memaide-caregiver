package com.memaide.bridge.ws

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class PatientDto(
    @SerialName("patient_id") val patientId: String,
    val name: String,
)

/** Messages the client sends. Field names match src/memaide/server/ws.py. */
sealed interface Outbound {
    @Serializable
    data class Hello(
        @SerialName("session_id") val sessionId: String,
        val patient: PatientDto,
        val type: String = "hello",
    ) : Outbound

    @Serializable
    data class Frame(
        @SerialName("data_url") val dataUrl: String,
        val type: String = "frame",
    ) : Outbound

    @Serializable
    data class Audio(val pcm: String, val type: String = "audio") : Outbound

    @Serializable
    data class Bye(val type: String = "bye") : Outbound
}

/** Messages the client receives. */
sealed interface Inbound {
    data class VisionContext(
        val description: String,
        val label: String,
        val advisoryFlags: List<String>,
        val ts: String,
    ) : Inbound

    data class Subtitle(val text: String, val role: String) : Inbound
    data class Escalation(val reason: String, val triggeredBy: List<String>) : Inbound
    data class AudioOut(val pcm: String, val seq: Int) : Inbound
    data class AudioError(val text: String) : Inbound
}

object WsCodec {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun encode(msg: Outbound): String = when (msg) {
        is Outbound.Hello -> json.encodeToString(Outbound.Hello.serializer(), msg)
        is Outbound.Frame -> json.encodeToString(Outbound.Frame.serializer(), msg)
        is Outbound.Audio -> json.encodeToString(Outbound.Audio.serializer(), msg)
        is Outbound.Bye -> json.encodeToString(Outbound.Bye.serializer(), msg)
    }

    fun decode(raw: String): Inbound? {
        val obj: JsonObject = try {
            json.parseToJsonElement(raw).jsonObject
        } catch (_: Throwable) {
            return null
        }
        fun str(k: String) = obj[k]?.jsonPrimitive?.content ?: ""
        return when (str("type")) {
            "vision_context" -> Inbound.VisionContext(
                str("description"), str("label"),
                (obj["advisory_flags"] as? kotlinx.serialization.json.JsonArray)
                    ?.map { it.jsonPrimitive.content } ?: emptyList(),
                str("ts"),
            )
            "subtitle" -> Inbound.Subtitle(str("text"), str("role"))
            "escalation" -> Inbound.Escalation(
                str("reason"),
                (obj["triggered_by"] as? kotlinx.serialization.json.JsonArray)
                    ?.map { it.jsonPrimitive.content } ?: emptyList(),
            )
            "audio_out" -> Inbound.AudioOut(
                str("pcm"), obj["seq"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0
            )
            "audio_error" -> Inbound.AudioError(str("text"))
            else -> null
        }
    }
}
