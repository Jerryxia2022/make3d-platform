param(
  [string]$BaseUrl = "http://127.0.0.1:5177",
  [int]$OrderId = 42,
  [int]$SyncJobId = 14
)

$ErrorActionPreference = "Stop"

function Get-CsrfToken([string]$Origin) {
  $page = Invoke-WebRequest -UseBasicParsing -Uri "$Origin/orders/$OrderId"
  $match = [regex]::Match($page.Content, 'name="csrf" value="([^"]+)"')
  if (-not $match.Success) { throw "CSRF token missing from order page" }
  return $match.Groups[1].Value
}

function Invoke-WorkbenchForm(
  [string]$Uri,
  [string]$Origin,
  [hashtable]$Body,
  [hashtable]$ExtraHeaders = @{}
) {
  $headers = @{ Origin = $Origin; Referer = "$Origin/orders/$OrderId" }
  foreach ($key in $ExtraHeaders.Keys) { $headers[$key] = $ExtraHeaders[$key] }
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Uri -Headers $headers -Body $Body
    return [pscustomobject]@{
      status = [int]$response.StatusCode
      content = $response.Content
      contentType = $response.Headers["Content-Type"]
    }
  } catch {
    $response = $_.Exception.Response
    $reader = New-Object IO.StreamReader($response.GetResponseStream())
    return [pscustomobject]@{
      status = [int]$response.StatusCode
      content = $reader.ReadToEnd()
      contentType = $response.ContentType
    }
  }
}

$csrf = Get-CsrfToken $BaseUrl
$status = Invoke-RestMethod -Uri "$BaseUrl/api/local/orders/$OrderId/files"
$pull = Invoke-WorkbenchForm "$BaseUrl/local/files/$SyncJobId/pull" $BaseUrl `
  @{ csrf = $csrf; order_id = [string]$OrderId } @{ Accept = "application/json" }
$sha = Invoke-WorkbenchForm "$BaseUrl/local/files/$SyncJobId/verify-sha" $BaseUrl `
  @{ csrf = $csrf; order_id = [string]$OrderId }
$open = Invoke-WorkbenchForm "$BaseUrl/local/files/$SyncJobId/open-directory" $BaseUrl `
  @{ csrf = $csrf; order_id = [string]$OrderId }
$save = Invoke-WorkbenchForm "$BaseUrl/orders/$OrderId/local-review" $BaseUrl @{
  csrf = $csrf
  state = "REVIEWING"
  suggested_price_yuan = "86.88"
  confirmed_price_yuan = "86.88"
  lead_time_min_hours = "39"
  lead_time_max_hours = "39"
  estimated_ship_at = ""
  reply_template = ""
  reply_draft = ""
  operator_note = "E2E local workbench verification"
}

$localhostOrigin = "http://localhost:5177"
$localhostCsrf = Get-CsrfToken $localhostOrigin
$localhostSha = Invoke-WorkbenchForm "$localhostOrigin/local/files/$SyncJobId/verify-sha" `
  $localhostOrigin @{ csrf = $localhostCsrf; order_id = [string]$OrderId }
$evil = Invoke-WorkbenchForm "$BaseUrl/local/files/$SyncJobId/verify-sha" `
  "http://evil.example" @{ csrf = $csrf; order_id = [string]$OrderId }
$missingCsrf = Invoke-WorkbenchForm "$BaseUrl/local/files/$SyncJobId/verify-sha" `
  $BaseUrl @{ order_id = [string]$OrderId }

$methodStatuses = @{}
foreach ($method in @("PUT", "PATCH", "DELETE")) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method $method -Uri "$BaseUrl/orders/$OrderId"
    $methodStatuses[$method] = [int]$response.StatusCode
  } catch {
    $methodStatuses[$method] = [int]$_.Exception.Response.StatusCode
  }
}

$pullPayload = $pull.content | ConvertFrom-Json
[pscustomobject]@{
  requestUrl = "$BaseUrl/local/files/$SyncJobId/pull"
  requestMethod = "POST"
  origin = $BaseUrl
  referer = "$BaseUrl/orders/$OrderId"
  cookieSent = $false
  csrfSent = $true
  statusApiFileCount = @($status.files).Count
  fileId = $status.files[0].fileId
  syncJobId = $status.files[0].syncJobId
  syncStatus = $status.files[0].status
  savedPath = $status.files[0].savedPath
  sizeBytes = $status.files[0].sizeBytes
  fileExists = $status.files[0].fileExists
  sizeMatches = $status.files[0].sizeMatches
  shaMatches = $status.files[0].shaMatches
  pullStatus = $pull.status
  pullAlreadyExisted = $pullPayload.alreadyExisted
  pullMessage = $pullPayload.message
  shaStatus = $sha.status
  shaNotice = $sha.content -match "SHA"
  openStatus = $open.status
  openNotice = $open.content -match "Windows"
  saveStatus = $save.status
  localhostStatus = $localhostSha.status
  untrustedOriginStatus = $evil.status
  untrustedOriginBody = $evil.content
  missingCsrfStatus = $missingCsrf.status
  missingCsrfBody = $missingCsrf.content
  putStatus = $methodStatuses["PUT"]
  patchStatus = $methodStatuses["PATCH"]
  deleteStatus = $methodStatuses["DELETE"]
} | ConvertTo-Json -Depth 5
