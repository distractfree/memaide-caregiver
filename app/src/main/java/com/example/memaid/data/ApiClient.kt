package com.example.memaid.data

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

// ApiClient builds the Retrofit instance that talks to the backend.
// The BASE_URL is the one thing that changes when Student 2's server is live.
object ApiClient {

    // CHANGE THIS when the real server is ready.
    // Use the IP from your manager. Note the trailing slash — it's required.
    // If HTTP (not HTTPS), see the note in Step 6 about network security config.
    private const val BASE_URL = "https://caregiver.guardianova.com/"
    const val VOICE_WS_URL = "wss://ai.guardianova.com/" // Anthony's server — port/path TBD
    // ^ 10.0.2.2 is a special address: from the Android emulator it means
    //   "the host machine's localhost". Handy for local testing.

    // Logging shows full request/response in Logcat (filter: OkHttp)
    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val client = OkHttpClient.Builder()
        .addInterceptor(logging)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    val api: MemAideApi by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(MemAideApi::class.java)
    }
}