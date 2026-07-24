package com.example.memaid

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.memaid.ui.MainViewModel
import com.example.memaid.ui.screens.SettingsScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun setSettings() {
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        val viewModel = MainViewModel(app)
        composeRule.setContent {
            SettingsScreen(
                viewModel = viewModel,
                onBack = {},
                onLogout = {},
                onRegisterGlasses = {}
            )
        }
    }

    @Test
    fun keptControls_areDisplayed() {
        setSettings()
        composeRule.onNodeWithText("Register Glasses").assertIsDisplayed()
        composeRule.onNodeWithText("Patient ID").assertIsDisplayed()
        composeRule.onNodeWithText("Logout").assertIsDisplayed()
    }

    @Test
    fun removedControls_areAbsent() {
        setSettings()
        composeRule.onNodeWithText("Settings").assertIsDisplayed()
        composeRule.onNodeWithText("Send Test to Watch", substring = true).assertDoesNotExist()
        composeRule.onNodeWithText("Beacon Debug", substring = true).assertDoesNotExist()
        composeRule.onNodeWithText("Demo Mode", substring = true).assertDoesNotExist()
    }
}
