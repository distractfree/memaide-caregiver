package com.example.memaid

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.memaid.ui.MainViewModel
import com.example.memaid.ui.screens.HomeScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HomeScreenTest {

    @get:Rule
    val composeRule = createComposeRule()

    private fun setHome() {
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        val viewModel = MainViewModel(app)
        composeRule.setContent {
            HomeScreen(
                viewModel = viewModel,
                onReminderClick = {},
                onSettingClick = {}
            )
        }
    }

    @Test
    fun helpAndCallCaregiver_areDisplayed() {
        setHome()
        composeRule.onNodeWithText("HELP").assertIsDisplayed()
        composeRule.onNodeWithText("Call Caregiver").assertIsDisplayed()
    }

    @Test
    fun glassesVisionSwitch_isAbsent() {
        setHome()
        composeRule.onNodeWithText("Include glasses vision", substring = true).assertDoesNotExist()
    }
}
