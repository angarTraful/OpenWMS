@echo off
echo ======================================================
echo Compilando WMS SSD para Windows (.exe instalable y portable)...
echo ======================================================

call npm run electron:build

if exist "release" (
    echo ======================================================
    echo COMPILACION DE WINDOWS EXITOSA!
    echo Los archivos .exe se generaron en la carpeta: release\
    echo ======================================================
    dir release\*.exe
) else (
    echo ERROR durante la compilacion.
)
