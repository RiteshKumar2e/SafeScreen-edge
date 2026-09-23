# Builds SafeScreenHost.exe with PyInstaller. Run on the target architecture:
# on a Snapdragon PC use ARM64 Python with requirements-snapdragon.txt, so the
# executable is native ARM64 and bundles the QNN libraries.
#
#   powershell -ExecutionPolicy Bypass -File host\build-exe.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

npm run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }

$arch = python -c "import platform; print(platform.machine())"
$req = if ($arch -match 'ARM64') { 'host\requirements-snapdragon.txt' } else { 'host\requirements.txt' }
python -m pip install -r $req pyinstaller

$models = 'host\build\models'
New-Item -ItemType Directory -Force $models | Out-Null
Copy-Item public\models\easyocr\detector.int8.onnx $models
Copy-Item host\models\recognizer.int8.onnx $models

python -m PyInstaller --noconfirm --clean --onedir --name SafeScreenHost `
  --distpath host\dist --workpath host\build\work --specpath host\build `
  --collect-all onnxruntime `
  --add-data "$root\dist;app" `
  --add-data "$root\$models;models" `
  host\safescreen_host.py
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller failed' }

Copy-Item host\Start-SafeScreen.cmd host\dist\SafeScreenHost\
Write-Host "Built host\dist\SafeScreenHost ($arch). Run SafeScreenHost.exe or Start-SafeScreen.cmd."
