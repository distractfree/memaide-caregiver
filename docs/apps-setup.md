# Running the Phone & Watch Apps

How to build, install, and launch the MemAide phone and Wear OS apps on
physical devices from this repo.

## Modules

`settings.gradle.kts` defines two app modules:

| Module  | Target        | Namespace                  | applicationId       |
|---------|---------------|----------------------------|---------------------|
| `:app`  | Phone         | `com.example.memaid`       | `com.example.memaid` |
| `:wear` | Wear OS watch | `com.example.memaid.wear`  | `com.example.memaid` |

> Both modules share the **same** `applicationId` (`com.example.memaid`),
> so each APK must be installed to its own device. Don't rely on Gradle's
> "install to all connected devices" — install per device (see below) so
> the phone APK never lands on the watch and vice versa.

Launcher activities:

- Phone: `com.example.memaid/.MainActivity`
- Watch: `com.example.memaid/.wear.presentation.MainActivity`

## Prerequisites

- Android SDK at `C:/Users/Anthony/AppData/Local/Android/Sdk`
  (`sdk.dir` in `local.properties`). `adb` lives in `platform-tools/`.
- Both devices connected and authorized for USB/Wi-Fi debugging:
  - Phone — Pixel 7a
  - Watch — Galaxy Watch (SM-R940), paired over Wi-Fi ADB
- Optional: a GitHub PAT with `read:packages` in `GITHUB_TOKEN` or a
  `github_token` line in `local.properties`, for the Meta Wearables DAT
  toolkit. Without it the `mwdat` deps stay off and the build still
  resolves.

## 1. Confirm devices are attached

```bash
ADB="C:/Users/Anthony/AppData/Local/Android/Sdk/platform-tools/adb.exe"
"$ADB" devices -l
```

Expected (serials/transport-ids will vary):

```
35091JEHN04722                                   device  model:Pixel_7a  transport_id:22
adb-RFAW70AE07Y-8AjgOa (2)._adb-tls-connect._tcp device  model:SM_R940   transport_id:23
```

> The Wi-Fi-connected watch shows up with an mDNS "serial" containing a
> space and `(2)`, which `adb -s` chokes on. Target it by
> **transport-id** (`adb -t <id>`) instead. Transport-ids can change
> between reconnects, so look them up fresh each session rather than
> hard-coding.

## 2. Build both debug APKs

```powershell
.\gradlew.bat :app:assembleDebug :wear:assembleDebug --console=plain
```

Outputs:

- `app/build/outputs/apk/debug/app-debug.apk`
- `wear/build/outputs/apk/debug/wear-debug.apk`

## 3. Install each APK to its device

```bash
ADB="C:/Users/Anthony/AppData/Local/Android/Sdk/platform-tools/adb.exe"

# Phone (by serial)
"$ADB" -s 35091JEHN04722 install -r app/build/outputs/apk/debug/app-debug.apk

# Watch (by transport-id, looked up fresh)
WTID=$("$ADB" devices -l | grep -i 'model:SM_R940' \
        | grep -o 'transport_id:[0-9]*' | cut -d: -f2)
"$ADB" -t "$WTID" install -r wear/build/outputs/apk/debug/wear-debug.apk
```

## 4. Launch each app

```bash
# Phone
"$ADB" -s 35091JEHN04722 shell am start \
  -n com.example.memaid/com.example.memaid.MainActivity

# Watch
"$ADB" -t "$WTID" shell am start \
  -n com.example.memaid/com.example.memaid.wear.presentation.MainActivity
```

## 5. Verify on-screen (screenshots)

```bash
"$ADB" -s 35091JEHN04722 exec-out screencap -p > phone.png
"$ADB" -t "$WTID"        exec-out screencap -p > watch.png
```

- Phone: MemAide home — "Hello, alex", Current Room / Watch status cards,
  red **HELP** button, "Today's Reminders".
- Watch: reminder screen with **I Did This / End Session / Call Caregiver**.

## Notes

- The phone home screen may show **Watch: Not Connected**. The two apps
  run independently; that status reflects the phone↔watch data-layer
  pairing, which is separate from simply having both apps installed.
