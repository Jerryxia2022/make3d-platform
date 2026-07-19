param(
  [string]$BaseUrl = "http://127.0.0.1:5177",
  [int]$OrderId = 41
)

$ErrorActionPreference = "Stop"
$status = Invoke-RestMethod -Uri "$BaseUrl/api/local/orders/$OrderId/files"
$syncJobId = [int]$status.files[0].syncJobId
$page = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/orders/$OrderId"
$csrfMatch = [regex]::Match($page.Content, 'name="csrf" value="([^"]+)"')
if (-not $csrfMatch.Success) { throw "CSRF token missing from order page" }
$csrf = $csrfMatch.Groups[1].Value
$headers = @{ Origin = $BaseUrl; Referer = "$BaseUrl/orders/$OrderId" }

$confirm = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri "$BaseUrl/orders/$OrderId/local-slice/confirm" `
  -Headers $headers `
  -Body @{ csrf = $csrf; sync_job_id = [string]$syncJobId }

$stopwatch = [Diagnostics.Stopwatch]::StartNew()
try {
  $run = Invoke-WebRequest -UseBasicParsing -Method Post `
    -Uri "$BaseUrl/orders/$OrderId/local-slice/run" `
    -Headers $headers `
    -Body @{ csrf = $csrf; sync_job_id = [string]$syncJobId }
  $runStatus = [int]$run.StatusCode
  $runBody = $run.Content
} catch {
  $response = $_.Exception.Response
  $reader = New-Object IO.StreamReader($response.GetResponseStream())
  $runStatus = [int]$response.StatusCode
  $runBody = $reader.ReadToEnd()
}
$stopwatch.Stop()

[pscustomobject]@{
  orderId = $OrderId
  syncJobId = $syncJobId
  confirmStatus = [int]$confirm.StatusCode
  runStatus = $runStatus
  successNotice = $runBody -match 'class="ok"'
  partialResult = $runBody -match 'partial'
  elapsedMilliseconds = $stopwatch.ElapsedMilliseconds
} | ConvertTo-Json
