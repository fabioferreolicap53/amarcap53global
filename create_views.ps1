# Script para criar 6 View Collections no PocketBase
# Execute: powershell -ExecutionPolicy Bypass -File create_views.ps1

$baseUrl = "https://centraldedados.dev.br"

# Auth
$authBody = '{"identity":"fabioferreoli@gmail.com","password":"@Ffo260480"}'
$authResp = Invoke-RestMethod -Uri "$baseUrl/api/collections/_superusers/auth-with-password" -Method POST -ContentType "application/json" -Body $authBody
$token = $authResp.token
$headers = @{ Authorization = $token; "Content-Type" = "application/json" }

$views = @(
  @{
    name = "v_total_equipe"
    query = "SELECT ROW_NUMBER() OVER (ORDER BY count(*) DESC) as id, equipe, count(*) as total FROM amarcap53_pacientes WHERE equipe != '' GROUP BY equipe ORDER BY total DESC"
  },
  @{
    name = "v_total_unidade"
    query = "SELECT ROW_NUMBER() OVER (ORDER BY count(*) DESC) as id, unidade, count(*) as total FROM amarcap53_pacientes WHERE unidade != '' GROUP BY unidade ORDER BY total DESC"
  },
  @{
    name = "v_total_equipe_micro"
    query = "SELECT ROW_NUMBER() OVER (ORDER BY count(*) DESC) as id, equipe, microarea, count(*) as total FROM amarcap53_pacientes WHERE equipe != '' GROUP BY equipe, microarea ORDER BY total DESC"
  },
  @{
    name = "v_semcito_equipe"
    query = "SELECT ROW_NUMBER() OVER (ORDER BY count(*) DESC) as id, equipe, count(*) as total FROM amarcap53_pacientes WHERE (cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL) AND equipe != '' GROUP BY equipe ORDER BY total DESC"
  },
  @{
    name = "v_semcito_unidade"
    query = "SELECT ROW_NUMBER() OVER (ORDER BY count(*) DESC) as id, unidade, count(*) as total FROM amarcap53_pacientes WHERE (cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL) AND unidade != '' GROUP BY unidade ORDER BY total DESC"
  },
  @{
    name = "v_semcito_equipe_micro"
    query = "SELECT ROW_NUMBER() OVER (ORDER BY count(*) DESC) as id, equipe, microarea, count(*) as total FROM amarcap53_pacientes WHERE (cito_lab = '' OR cito_lab IS NULL) AND (cito_pep = '' OR cito_pep IS NULL) AND equipe != '' GROUP BY equipe, microarea ORDER BY total DESC"
  }
)

foreach ($view in $views) {
  $body = @{ name = $view.name; type = "view"; viewQuery = $view.query; fields = @() } | ConvertTo-Json -Depth 3
  try {
    $r = Invoke-RestMethod -Uri "$baseUrl/api/collections" -Method POST -Headers $headers -Body $body
    Write-Host "OK: $($r.name) (id=$($r.id))" -ForegroundColor Green
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.Value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    Write-Host "FAIL: $($view.name) - $statusCode - $errorBody" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Views criadas! Verifique em: $baseUrl/_/" -ForegroundColor Cyan
