param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Make3DExplorerWindow {
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);
  [DllImport("user32.dll")] public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@

function Write-Result {
  param([hashtable]$Value, [int]$ExitCode = 0)
  $Value | ConvertTo-Json -Compress -Depth 4
  exit $ExitCode
}

function Normalize-PathValue {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  try {
    return [System.IO.Path]::GetFullPath($Value).TrimEnd('\').ToLowerInvariant()
  } catch {
    return $Value.TrimEnd('\').ToLowerInvariant()
  }
}

function Normalize-LocationUrl {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  try {
    return [System.Uri]::UnescapeDataString(([System.Uri]$Value).AbsoluteUri).TrimEnd('/').ToLowerInvariant()
  } catch {
    return $Value.TrimEnd('/').ToLowerInvariant()
  }
}

function Get-TargetLocationUrl {
  param([string]$Path)
  try { return ([System.Uri]::new($Path)).AbsoluteUri } catch { return "" }
}

function Find-ExplorerWindow {
  param($Shell, [string]$CanonicalPath, [string]$LocationUrl)
  $normalizedPath = Normalize-PathValue $CanonicalPath
  $normalizedUrl = Normalize-LocationUrl $LocationUrl
  foreach ($window in @($Shell.Windows())) {
    try {
      $windowPath = Normalize-PathValue ([string]$window.Document.Folder.Self.Path)
      $windowUrl = Normalize-LocationUrl ([string]$window.LocationURL)
      if (($windowPath -and $windowPath -eq $normalizedPath) -or ($windowUrl -and $windowUrl -eq $normalizedUrl)) {
        return $window
      }
    } catch {
      continue
    }
  }
  return $null
}

try {
  $canonicalTarget = [System.IO.Path]::GetFullPath($Target)
  if (-not (Test-Path -LiteralPath $canonicalTarget -PathType Container)) {
    Write-Result @{ status = "directory-not-found"; message = "Target directory does not exist."; foregroundVerified = $false } 2
  }

  $targetLocationUrl = Get-TargetLocationUrl $canonicalTarget
  $shell = New-Object -ComObject Shell.Application
  $window = Find-ExplorerWindow $shell $canonicalTarget $targetLocationUrl
  $windowFound = $null -ne $window
  $openedNewWindow = $false

  if (-not $window) {
    Start-Process -FilePath "explorer.exe" -ArgumentList @($canonicalTarget) | Out-Null
    $openedNewWindow = $true
    for ($attempt = 0; $attempt -lt 30 -and -not $window; $attempt++) {
      Start-Sleep -Milliseconds 150
      $window = Find-ExplorerWindow $shell $canonicalTarget $targetLocationUrl
    }
  }

  if (-not $window) {
    Write-Result @{
      status = "directory-open-failed"
      message = "Explorer did not expose a window for the requested directory."
      windowFound = $windowFound
      openedNewWindow = $openedNewWindow
      restored = $false
      foregroundVerified = $false
    } 3
  }

  $hwnd = [IntPtr][int64]$window.HWND
  $initialForegroundHwnd = [Make3DExplorerWindow]::GetForegroundWindow()
  $restored = $false
  if ([Make3DExplorerWindow]::IsIconic($hwnd)) {
    [void][Make3DExplorerWindow]::ShowWindowAsync($hwnd, 9)
    $restored = $true
    Start-Sleep -Milliseconds 120
  } else {
    [void][Make3DExplorerWindow]::ShowWindowAsync($hwnd, 5)
  }

  $foregroundVerified = $false
  $powershellProcess = [System.Diagnostics.Process]::GetCurrentProcess()
  $targetProcess = $null
  $lastSetForegroundResult = $false
  $lastAttachedForeground = $false
  $lastAttachedTarget = $false
  $lastAttachedTargetToForeground = $false
  $lastTargetProcessId = 0
  $lastForegroundProcessId = 0
  $lastForegroundThread = 0
  $lastTargetThread = 0
  $lastCurrentThread = 0
  $lastShowWindowResult = $false
  $lastBringWindowResult = $false
  $lastTopmostResult = $false
  $lastNotTopmostResult = $false
  for ($attempt = 0; $attempt -lt 3 -and -not $foregroundVerified; $attempt++) {
    $foregroundBefore = [Make3DExplorerWindow]::GetForegroundWindow()
    $foregroundProcessId = 0
    $targetProcessId = 0
    $foregroundThread = [Make3DExplorerWindow]::GetWindowThreadProcessId($foregroundBefore, [ref]$foregroundProcessId)
    $targetThread = [Make3DExplorerWindow]::GetWindowThreadProcessId($hwnd, [ref]$targetProcessId)
    $currentThread = [Make3DExplorerWindow]::GetCurrentThreadId()
    $lastForegroundProcessId = $foregroundProcessId
    $lastForegroundThread = $foregroundThread
    $lastTargetThread = $targetThread
    $lastCurrentThread = $currentThread
    $attachedForeground = $foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and [Make3DExplorerWindow]::AttachThreadInput($currentThread, $foregroundThread, $true)
    $attachedTarget = $targetThread -ne 0 -and $targetThread -ne $currentThread -and [Make3DExplorerWindow]::AttachThreadInput($currentThread, $targetThread, $true)
    $attachedTargetToForeground = $targetThread -ne 0 -and $foregroundThread -ne 0 -and $targetThread -ne $foregroundThread -and [Make3DExplorerWindow]::AttachThreadInput($targetThread, $foregroundThread, $true)
    $lastAttachedForeground = $attachedForeground
    $lastAttachedTarget = $attachedTarget
    $lastAttachedTargetToForeground = $attachedTargetToForeground
    $lastTargetProcessId = $targetProcessId
    if ($attempt -gt 0 -and $targetProcessId -gt 0) {
      try { [void](New-Object -ComObject WScript.Shell).AppActivate([int]$targetProcessId) } catch { }
    }
    if ($attempt -eq 2) {
      [Make3DExplorerWindow]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
      [Make3DExplorerWindow]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    }
    $lastShowWindowResult = [Make3DExplorerWindow]::ShowWindowAsync($hwnd, 5)
    $lastTopmostResult = [Make3DExplorerWindow]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0013)
    $lastBringWindowResult = [Make3DExplorerWindow]::BringWindowToTop($hwnd)
    $lastSetForegroundResult = [Make3DExplorerWindow]::SetForegroundWindow($hwnd)
    [Make3DExplorerWindow]::SwitchToThisWindow($hwnd, $true)
    [void][Make3DExplorerWindow]::SetActiveWindow($hwnd)
    [void][Make3DExplorerWindow]::SetFocus($hwnd)
    $lastNotTopmostResult = [Make3DExplorerWindow]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x0013)
    Start-Sleep -Milliseconds 180
    $foregroundVerified = [Make3DExplorerWindow]::GetForegroundWindow() -eq $hwnd
    if ($attachedTargetToForeground) { [void][Make3DExplorerWindow]::AttachThreadInput($targetThread, $foregroundThread, $false) }
    if ($attachedTarget) { [void][Make3DExplorerWindow]::AttachThreadInput($currentThread, $targetThread, $false) }
    if ($attachedForeground) { [void][Make3DExplorerWindow]::AttachThreadInput($currentThread, $foregroundThread, $false) }
  }

  try { $targetProcess = [System.Diagnostics.Process]::GetProcessById([int]$lastTargetProcessId) } catch { }
  $diagnostics = @{
    windowsUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    powershellProcessId = $powershellProcess.Id
    powershellSessionId = $powershellProcess.SessionId
    interactiveExplorerSessionId = if ($targetProcess) { $targetProcess.SessionId } else { $null }
    nonInteractiveServiceSession = if ($targetProcess) { $powershellProcess.SessionId -ne $targetProcess.SessionId } else { $null }
    targetProcessId = $lastTargetProcessId
    targetThreadId = $lastTargetThread
    foregroundHwndBefore = $initialForegroundHwnd.ToInt64()
    foregroundProcessIdBefore = $lastForegroundProcessId
    foregroundThreadIdBefore = $lastForegroundThread
    powershellThreadId = $lastCurrentThread
    setForegroundResult = $lastSetForegroundResult
    bringWindowToTopResult = $lastBringWindowResult
    showWindowAsyncResult = $lastShowWindowResult
    topmostResult = $lastTopmostResult
    notTopmostResult = $lastNotTopmostResult
    attachedForeground = $lastAttachedForeground
    attachedTarget = $lastAttachedTarget
    attachedTargetToForeground = $lastAttachedTargetToForeground
  }

  if ($foregroundVerified) {
    Write-Result @{
      status = "directory-focused"
      message = "Explorer opened the requested directory and verified foreground focus."
      windowFound = $true
      openedNewWindow = $openedNewWindow
      restored = $restored
      foregroundVerified = $true
      targetHwnd = $hwnd.ToInt64()
      foregroundHwnd = ([Make3DExplorerWindow]::GetForegroundWindow()).ToInt64()
      locationUrl = [string]$window.LocationURL
      diagnostics = $diagnostics
    }
  }

  Write-Result @{
    status = "directory-opened-not-focused"
    message = "Explorer opened the requested directory but Windows did not grant foreground focus."
    windowFound = $true
    openedNewWindow = $openedNewWindow
    restored = $restored
    foregroundVerified = $false
    targetHwnd = $hwnd.ToInt64()
    foregroundHwnd = ([Make3DExplorerWindow]::GetForegroundWindow()).ToInt64()
    locationUrl = [string]$window.LocationURL
    diagnostics = $diagnostics
  }
} catch {
  Write-Result @{
    status = "directory-open-failed"
    message = $_.Exception.Message
    windowFound = $false
    restored = $false
    foregroundVerified = $false
  } 4
}
