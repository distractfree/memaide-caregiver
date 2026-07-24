package com.example.memaid.navigation

sealed class Screen(val route: String) {
    object Splash : Screen("splash")
    object Login : Screen("login")
    object PatientSelect : Screen("patient_select")

    object Home : Screen("home")
    object ReminderList : Screen("reminder_list")
    object ReminderDetail : Screen("reminder_detail/{reminderId}") {
        fun createRoute(reminderId: String) = "reminder_detail/$reminderId"
    }
    object Settings : Screen("settings")
    object BeaconDebug : Screen("beacon_debug")
    object GlassesRegister : Screen("glasses_register")
}