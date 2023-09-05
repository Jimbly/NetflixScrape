:: Created by npm, please don't edit manually.
@ECHO OFF

SETLOCAL

SET "NODE_EXE=%~dp0\node.exe"
IF NOT EXIST "%NODE_EXE%" (
  SET "NODE_EXE=node"
)

SET "NPM_CLI_JS=%~dp0\node_modules\npm\bin\npm-cli.js"
@REM JE: Modified this to not use global NPM install folder, which gets yet a different version of npm!
@REM FOR /F "delims=" %%F IN ('CALL "%NODE_EXE%" "%NPM_CLI_JS%" prefix -g') DO (
@REM   SET "NPM_PREFIX_NPM_CLI_JS=%%F\node_modules\npm\bin\npm-cli.js"
@REM )
@REM IF EXIST "%NPM_PREFIX_NPM_CLI_JS%" (
@REM   SET "NPM_CLI_JS=%NPM_PREFIX_NPM_CLI_JS%"
@REM )

"%NODE_EXE%" "%NPM_CLI_JS%" %*
