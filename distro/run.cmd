@for %%a in (%0) do set ROOT=%%~dpa
@PATH %ROOT%bin\;%PATH%
@if NOT EXIST %ROOT%bin\node_modules\npm\package.json @(
  @echo Extracting bin/node_modules.tgz...
  @pushd %ROOT%bin
  tar xzf node_modules.tgz
  @popd
)
@call npm i --production --no-audit --no-fund
node .
pause

