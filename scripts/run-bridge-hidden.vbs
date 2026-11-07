' VBScript chay ngam PowerShell script tu dong ket noi Ollama ma khong hien cua so CMD
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File ""E:\REX\scripts\auto-start-bridge.ps1""", 0, False
