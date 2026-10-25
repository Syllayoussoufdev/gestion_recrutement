$server = Start-Process -FilePath "node" -ArgumentList "--env-file=.env.local","node_modules/next/dist/bin/next","start" -PassThru -WindowStyle Hidden -RedirectStandardOutput "scripts/.server.log" -RedirectStandardError "scripts/.server.err"
Start-Sleep -Seconds 8
Write-Output "--- curl localhost ---"
curl.exe -s -S -o NUL -m 5 -w "http=%{http_code}`n" "http://localhost:3000/login"
Write-Output "--- curl 127.0.0.1 ---"
curl.exe -s -S -o NUL -m 5 -w "http=%{http_code}`n" "http://127.0.0.1:3000/login"
Write-Output "--- listening ---"
netstat -ano | Select-String ":3000"
Write-Output "--- server log ---"
Get-Content scripts/.server.log, scripts/.server.err -ErrorAction SilentlyContinue
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
