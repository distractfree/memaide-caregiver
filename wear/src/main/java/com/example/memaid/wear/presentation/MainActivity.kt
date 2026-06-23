package com.example.memaid.wear.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.compose.ui.tooling.preview.WearPreviewDevices
import androidx.wear.compose.ui.tooling.preview.WearPreviewFontScales
import com.example.memaid.wear.presentation.theme.MemAidTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WearApp()
        }
    }
}

@Composable
fun WearApp() {
    MemAidTheme {
        // Local state for the standalone version — next week this comes from the phone
        var reminderTitle by remember { mutableStateOf("Afternoon Medication") }
        var reminderDescription by remember {
            mutableStateOf("Take blood pressure pill with water.")
        }
        var acknowledged by remember { mutableStateOf(false) }
        var helpStatus by remember { mutableStateOf<String?>(null) }

        AppScaffold {
            val listState = rememberTransformingLazyColumnState()

            ScreenScaffold(scrollState = listState) { contentPadding ->
                TransformingLazyColumn(
                    contentPadding = contentPadding,
                    state = listState
                ) {
                    // Title header
                    item {
                        ListHeader {
                            Text(text = "MemAide")
                        }
                    }

                    // Reminder card
                    item {
                        Card(
                            onClick = { },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = reminderTitle,
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                text = reminderDescription,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                    }

                    // Acknowledge button
                    item {
                        Button(
                            onClick = { acknowledged = true },
                            enabled = !acknowledged,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = if (acknowledged) "✓ Done" else "I Did This",
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    // Help button
                    item {
                        Button(
                            onClick = { helpStatus = "Help request sent" },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                                contentColor = MaterialTheme.colorScheme.onErrorContainer
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "🆘 Help",
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    // Help status message
                    if (helpStatus != null) {
                        item {
                            Text(
                                text = helpStatus!!,
                                style = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@WearPreviewDevices
@WearPreviewFontScales
@Composable
fun DefaultPreview() {
    WearApp()
}