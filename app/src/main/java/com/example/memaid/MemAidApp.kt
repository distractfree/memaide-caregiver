package com.example.memaid

import android.app.Application
import com.example.memaid.data.ApiClient

// Runs once, before any activity or service, so the API client always has a
// context to read the login token from when it attaches the Bearer header.
class MemAidApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ApiClient.init(this)
    }
}
