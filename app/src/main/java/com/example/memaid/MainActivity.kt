package com.example.memaid

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.memaid.data.ReminderNotifier
import com.example.memaid.navigation.Screen
import com.example.memaid.ui.MainViewModel
import com.example.memaid.ui.screens.*
import com.example.memaid.ui.theme.MemAidTheme

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Create the notification channel
        ReminderNotifier.createChannel(this)

        // Request notification + Bluetooth + location permissions
        val permissionsToRequest = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionsToRequest.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_SCAN)
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)

        val multiPermissionLauncher = registerForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions()
        ) { /* results — we just continue */ }

        if (permissionsToRequest.isNotEmpty()) {
            multiPermissionLauncher.launch(permissionsToRequest.toTypedArray())
        }

        setContent {
            MemAidTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val openReminderId = intent.getStringExtra("openReminderId")
                    MemAideNavigation(viewModel, openReminderId)
                }
            }
        }
    }
}

@Composable
fun MemAideNavigation(viewModel: MainViewModel, openReminderId: String? = null) {
    val navController = rememberNavController()

    // If opened from a notification, jump to that reminder once
    LaunchedEffect(openReminderId) {
        if (openReminderId != null) {
            navController.navigate(Screen.ReminderDetail.createRoute(openReminderId))
        }
    }

    NavHost(
        navController = navController,
        startDestination = Screen.Splash.route
    ) {
        composable(Screen.Splash.route) {
            SplashScreen(
                viewModel = viewModel,
                onNavigateToLogin = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                },
                onNavigateToHome = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Splash.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Login.route) {
            LoginScreen(
                viewModel = viewModel,
                onLoginSuccess = {
                    // Phone login already identified the patient (via the token), so go
                    // straight to their reminders — no patient-select step.
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.BeaconDebug.route) {
            BeaconDebugScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.GlassesRegister.route) {
            GlassesRegisterScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Home.route) {
            val context = androidx.compose.ui.platform.LocalContext.current
            LaunchedEffect(Unit) {
                if (com.example.memaid.data.ReminderRepository.demoMode) {
                    viewModel.refreshReminderStatuses()
                } else {
                    viewModel.loadRemindersFromBackend()
                }
                // Schedule alarms for all pending reminders
                com.example.memaid.data.ReminderScheduler.scheduleAll(
                    context,
                    viewModel.reminders.value
                )
            }
            HomeScreen(
                viewModel = viewModel,
                onReminderClick = { reminderId ->
                    navController.navigate(Screen.ReminderDetail.createRoute(reminderId))
                },
                onSettingClick = {
                    navController.navigate(Screen.Settings.route)
                },
            )
        }

        composable(Screen.ReminderList.route) {
            ReminderListScreen(
                viewModel = viewModel,
                onReminderClick = { reminderId ->
                    navController.navigate(Screen.ReminderDetail.createRoute(reminderId))
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.ReminderDetail.route,
            arguments = listOf(navArgument("reminderId") { type = NavType.StringType })
        ) { backStackEntry ->
            val reminderId = backStackEntry.arguments?.getString("reminderId") ?: ""
            ReminderDetailScreen(
                reminderId = reminderId,
                viewModel = viewModel,
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                viewModel = viewModel,
                onBack = { navController.popBackStack() },
                onLogout = {
                    viewModel.logout()
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onRegisterGlasses = {
                    navController.navigate(Screen.GlassesRegister.route)
                }
            )
        }
    }
}