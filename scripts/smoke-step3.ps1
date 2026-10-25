$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$pwd = "DevOnly_ChangeMe_2026!"

$server = Start-Process -FilePath "node" -ArgumentList "--env-file=.env.local","node_modules/next/dist/bin/next","start" -PassThru -WindowStyle Hidden -RedirectStandardOutput "scripts/.server.log" -RedirectStandardError "scripts/.server.err"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $code = curl.exe -s -o NUL -m 3 -w "%{http_code}" "$base/login"
  if ($code -eq "200") { $ready = $true; break }
}
if (-not $ready) { Write-Output "SERVER NOT READY"; Stop-Process -Id $server.Id -Force; exit 1 }

function Test-Role($label, $email, $page, $expectText) {
  $jar = "scripts/.cookies.txt"
  $bodyFile = "scripts/.login-body.json"
  if (Test-Path $jar) { Remove-Item $jar }
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) $bodyFile), ('{"email":"' + $email + '","password":"' + $pwd + '"}'))
  $login = curl.exe -s -o NUL -w "%{http_code}" -c $jar -X POST "$base/api/auth/login" -H "Origin: $base" -H "Content-Type: application/json" --data-binary "@$bodyFile"
  $html = (curl.exe -s -b $jar -w "`n__STATUS__%{http_code}" "$base$page") -join "`n"
  $status = ($html -split "__STATUS__")[-1].Trim()
  $found = $html.Contains($expectText)
  Write-Output ("{0,-13} login={1} {2,-20} status={3} contient '{4}'={5}" -f $label, $login, $page, $status, $expectText, $found)
  Remove-Item $jar, $bodyFile -ErrorAction SilentlyContinue
}

Test-Role "PLATFORM"     "platform.admin@plateforme-recrutement.test" "/platform" "Console Plateforme"
Test-Role "AGENCY_ADMIN" "admin@stratosconseil.test" "/admin" "Stratos Conseil"
Test-Role "AGENCY_ADMIN" "admin@stratosconseil.test" "/admin/journal" "Journal d&#x27;audit"
Test-Role "CONSULTANT"   "consultant@stratosconseil.test" "/admin/entreprises" "Entreprises clientes"
Test-Role "CONSULTANT"   "consultant@stratosconseil.test" "/admin" "Journal d&#x27;audit"
Test-Role "CLIENT"       "client@techcorp.test" "/client" "TechCorp Ivoire SA"
Test-Role "CANDIDAT"     "jean.dupont@candidat.test" "/candidat" "Mon espace"
Test-Role "CABINET2"     "admin@cabinet-demo.test" "/admin" "Cabinet Démo"
Test-Role "CLIENT->admin" "client@techcorp.test" "/admin" "Stratos"

$noCookie = curl.exe -s -o NUL -w "%{http_code} -> %{redirect_url}" "$base/admin"
Write-Output "Sans cookie /admin : $noCookie"

Stop-Process -Id $server.Id -Force
Remove-Item scripts/.server.log, scripts/.server.err -ErrorAction SilentlyContinue
