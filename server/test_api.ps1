try {
  $wrongPass = Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/login' -Method Post -Body '{"password": "wrong"}' -ContentType 'application/json'
  Write-Host "Wrong pass succeeded unexpectedly"
} catch {
  Write-Host "Wrong pass failed with $_"
}

$loginRes = Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/login' -Method Post -Body '{"password": "admin123"}' -ContentType 'application/json'
Write-Host "Login token: $($loginRes.token)"
$token = $loginRes.token

$meRes = Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/me' -Method Get -Headers @{Authorization="Bearer $token"}
Write-Host "Me role: $($meRes.admin.role)"

$caregiversRes = Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/caregivers' -Method Get -Headers @{Authorization="Bearer $token"}
Write-Host "Caregivers count: $($caregiversRes.caregivers.Length)"

$caregiverLoginRes = Invoke-RestMethod -Uri 'http://localhost:4000/api/auth/login' -Method Post -Body '{"email": "demo@memaide.local", "password": "Password123!"}' -ContentType 'application/json'
Write-Host "Caregiver token: $($caregiverLoginRes.token)"
