$ErrorActionPreference = "Continue"
$base = "http://localhost:3000"
$pwd = "DevOnly_ChangeMe_2026!"

# Le script fait plus de 10 connexions (limite du rate-limiter) : remise a zero des compteurs de dev.
node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/reset-ratelimit.ts

$server = Start-Process -FilePath "node" -ArgumentList "--env-file=.env.local","node_modules/next/dist/bin/next","start" -PassThru -WindowStyle Hidden -RedirectStandardOutput "scripts/.server.log" -RedirectStandardError "scripts/.server.err"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  $code = curl.exe -s -o NUL -m 3 -w "%{http_code}" "$base/login"
  if ($code -eq "200") { $ready = $true; break }
}
if (-not $ready) { Write-Output "SERVER NOT READY"; Stop-Process -Id $server.Id -Force; exit 1 }

# $expect  : texte attendu dans la page (ASCII uniquement, pour eviter les soucis d'encodage)
# $absent  : texte qui ne doit PAS apparaitre (controle d'isolation / de droits)
# $status  : code HTTP attendu
function Test-Role($label, $email, $page, $expect, $absent = $null, $wantStatus = 200) {
  $jar = "scripts/.cookies.txt"
  $bodyFile = "scripts/.login-body.json"
  if (Test-Path $jar) { Remove-Item $jar }
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) $bodyFile), ('{"email":"' + $email + '","password":"' + $pwd + '"}'))
  $login = curl.exe -s -o NUL -w "%{http_code}" -c $jar -X POST "$base/api/auth/login" -H "Origin: $base" -H "Content-Type: application/json" --data-binary "@$bodyFile"
  $html = (curl.exe -s -b $jar -w "`n__STATUS__%{http_code}" "$base$page") -join "`n"
  $status = [int](($html -split "__STATUS__")[-1].Trim())
  $okExpect = if ($expect) { $html.Contains($expect) } else { $true }
  $okAbsent = if ($absent) { -not $html.Contains($absent) } else { $true }
  $pass = ($login -eq "200") -and ($status -eq $wantStatus) -and $okExpect -and $okAbsent
  $verdict = if ($pass) { "PASS" } else { "FAIL" }
  Write-Output ("{0}  {1,-13} {2,-20} login={3} status={4}/{5} contient='{6}'={7} absent='{8}'={9}" -f $verdict, $label, $page, $login, $status, $wantStatus, $expect, $okExpect, $absent, $okAbsent)
  Remove-Item $jar, $bodyFile -ErrorAction SilentlyContinue
}

Test-Role "PLATFORM"      "platform.admin@plateforme-recrutement.test" "/platform"           "Console Plateforme"
Test-Role "AGENCY_ADMIN"  "admin@stratosconseil.test"      "/admin"               "Stratos Conseil"
Test-Role "AGENCY_ADMIN"  "admin@stratosconseil.test"      "/admin/journal"       "audit"
Test-Role "AGENCY_ADMIN"  "admin@stratosconseil.test"      "/admin"               "Param"                    $null
Test-Role "CONSULTANT"    "consultant@stratosconseil.test" "/admin/entreprises"   "Entreprises clientes"
Test-Role "CONSULTANT"    "consultant@stratosconseil.test" "/admin"               "Stratos Conseil"          "Param"
Test-Role "CLIENT"        "client@techcorp.test"           "/client"              "TechCorp Ivoire SA"       "Entreprise partenaire"
Test-Role "CANDIDAT"      "jean.dupont@candidat.test"      "/candidat"            "Mon espace"
Test-Role "CABINET2"      "admin@cabinet-demo.test"        "/admin"               "Cabinet D"                "Stratos Conseil"
Test-Role "CLIENT2"       "client@finagro.test"            "/client"              "FinAgro Industrie SAS"    "TechCorp"
Test-Role "CLIENT->admin" "client@techcorp.test"           "/admin"               $null                      $null 403
Test-Role "CAND->platform" "jean.dupont@candidat.test"     "/platform"            $null                      $null 403

$noCookie = curl.exe -s -o NUL -w "%{http_code} -> %{redirect_url}" "$base/admin"
Write-Output "Sans cookie /admin : $noCookie"

Stop-Process -Id $server.Id -Force
Remove-Item scripts/.server.log, scripts/.server.err -ErrorAction SilentlyContinue
