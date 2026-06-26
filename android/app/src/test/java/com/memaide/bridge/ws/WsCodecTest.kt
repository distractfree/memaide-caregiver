package com.memaide.bridge.ws

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WsCodecTest {
    @Test fun encodes_hello_with_patient() {
        val json = WsCodec.encode(
            Outbound.Hello("s1", PatientDto("p1", "Rose"))
        )
        assertTrue(json.contains("\"type\":\"hello\""))
        assertTrue(json.contains("\"session_id\":\"s1\""))
        assertTrue(json.contains("\"patient_id\":\"p1\""))
    }

    @Test fun encodes_frame_and_audio() {
        assertTrue(WsCodec.encode(Outbound.Frame("data:image/jpeg;base64,QUJD"))
            .contains("\"data_url\":\"data:image/jpeg;base64,QUJD\""))
        assertTrue(WsCodec.encode(Outbound.Audio("QUJD")).contains("\"pcm\":\"QUJD\""))
    }

    // Inbound fixtures below mirror the EXACT payloads src/memaide/server/voice_loop.py and
    // ws.py emit (triggered_by is a JSON array; audio_error carries "text", not "message").
    @Test fun decodes_known_inbound_types() {
        assertTrue(WsCodec.decode("""{"type":"audio_out","pcm":"QUJD","seq":3}""")
                is Inbound.AudioOut)
        assertTrue(WsCodec.decode("""{"type":"subtitle","text":"hi","role":"agent"}""")
                is Inbound.Subtitle)
        assertTrue(WsCodec.decode(
            """{"type":"vision_context","description":"a kitchen","label":"kitchen","advisory_flags":[],"ts":"t"}"""
        ) is Inbound.VisionContext)
        assertTrue(WsCodec.decode(
            """{"type":"escalation","reason":"fall","triggered_by":["vision","keyword"]}"""
        ) is Inbound.Escalation)
        assertTrue(WsCodec.decode("""{"type":"audio_error","text":"I'm here."}""")
                is Inbound.AudioError)
    }

    @Test fun escalation_decodes_triggered_by_list() {
        val msg = WsCodec.decode(
            """{"type":"escalation","reason":"fall","triggered_by":["vision","keyword"]}"""
        ) as Inbound.Escalation
        assertEquals("fall", msg.reason)
        assertEquals(listOf("vision", "keyword"), msg.triggeredBy)
    }

    @Test fun audio_error_decodes_text_field() {
        val msg = WsCodec.decode("""{"type":"audio_error","text":"I'm here."}""") as Inbound.AudioError
        assertEquals("I'm here.", msg.text)
    }

    @Test fun unknown_inbound_is_null() {
        assertEquals(null, WsCodec.decode("""{"type":"nope"}"""))
        assertEquals(null, WsCodec.decode("not json"))
    }

    @Test fun audio_out_carries_payload() {
        val msg = WsCodec.decode("""{"type":"audio_out","pcm":"QUJD","seq":3}""") as Inbound.AudioOut
        assertEquals("QUJD", msg.pcm)
        assertEquals(3, msg.seq)
    }
}
