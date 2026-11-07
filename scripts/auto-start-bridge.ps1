# Script tu dong khoi dong cau noi Ollama + Ngrok va dong bo len Vercel
$ErrorActionPreference = "SilentlyContinue"

# 1. Kiem tra va khoi dong Ollama neu chua chay
$ollamaProc = Get-Process ollama -ErrorAction SilentlyContinue
if (-not $ollamaProc) {
    Start-Process "ollama" -ArgumentList "app" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# 2. Kiem tra va khoi dong Ngrok neu chua chay
$ngrokProc = Get-Process ngrok -ErrorAction SilentlyContinue
if (-not $ngrokProc) {
    Start-Process "ngrok" -ArgumentList "http 11434 --host-header=localhost:11434" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

# 3. Lay URL public moi nhat tu Ngrok API
$tunnelUrl = ""
for ($i = 0; $i -lt 10; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
        if ($res.tunnels -and $res.tunnels.Count -gt 0) {
            $tunnelUrl = $res.tunnels[0].public_url
            if ($tunnelUrl) { break }
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if (-not $tunnelUrl) {
    exit 0
}

# 4. Luu URL vao file cache cuc bo
$dataDir = "E:\REX\data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force }
$currentUrlFile = Join-Path $dataDir "current_tunnel.txt"
$oldUrl = ""
if (Test-Path $currentUrlFile) { $oldUrl = (Get-Content $currentUrlFile -Raw).Trim() }

Set-Content -Path $currentUrlFile -Value $tunnelUrl -Force

# 5. Neu URL thay doi, tu dong cap nhat vao api/ai/chat.js, api/ai/models.js va push len GitHub cho Vercel
if ($tunnelUrl -ne $oldUrl -and (Test-Path "E:\REX\.git")) {
    Set-Location "E:\REX"
    
    # Cap nhat DEFAULT_OLLAMA_URL trong api/ai/chat.js
    $chatFile = "E:\REX\api\ai\chat.js"
    if (Test-Path $chatFile) {
        $content = Get-Content $chatFile -Raw
        $content = $content -replace "https://[a-zA-Z0-9\-]+\.ngrok-free\.app", $tunnelUrl
        Set-Content -Path $chatFile -Value $content -NoNewline
    }

    # Cap nhat DEFAULT_OLLAMA_URL trong api/ai/models.js
    $modelsFile = "E:\REX\api\ai\models.js"
    if (Test-Path $modelsFile) {
        $content = Get-Content $modelsFile -Raw
        $content = $content -replace "https://[a-zA-Z0-9\-]+\.ngrok-free\.app", $tunnelUrl
        Set-Content -Path $modelsFile -Value $content -NoNewline
    }

    # Cap nhat link mac dinh trong js/chat.js
    $clientChatFile = "E:\REX\js\chat.js"
    if (Test-Path $clientChatFile) {
        $content = Get-Content $clientChatFile -Raw
        $content = $content -replace "https://[a-zA-Z0-9\-]+\.ngrok-free\.app", $tunnelUrl
        Set-Content -Path $clientChatFile -Value $content -NoNewline
    }

    # Push commit len GitHub de Vercel tu dong cap nhat
    git add api/ai/chat.js api/ai/models.js js/chat.js data/current_tunnel.txt
    git commit -m "chore: auto-sync ngrok tunnel url ($tunnelUrl)"
    git push origin main
}
