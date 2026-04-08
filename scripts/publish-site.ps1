# 어나더 지오엑스 — 사이트 링크 동기화 + GitHub 푸시 (PowerShell)
# 사용: .\scripts\publish-site.ps1
#       .\scripts\publish-site.ps1 -Message "그래프 범례 수정"

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
# $PSScriptRoot = ...\scripts → 프로젝트 루트는 한 단계 위
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "Node.js가 PATH에 없습니다. https://nodejs.org 에서 설치 후 다시 실행하세요."
}

& node (Join-Path $PSScriptRoot "sync-site-links.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Message) {
    & node (Join-Path $PSScriptRoot "push-to-github.mjs") $Message
} else {
    & node (Join-Path $PSScriptRoot "push-to-github.mjs")
}
exit $LASTEXITCODE
