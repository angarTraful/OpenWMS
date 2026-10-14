@echo off
set "JAVA_HOME=C:\Users\intra\Desktop\curso CodeAsis\pruebasAnti\AppBurguesas\llamadores-app\jdk-21"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "ANDROID_HOME=C:\Users\intra\Desktop\curso CodeAsis\pruebasAnti\AppBurguesas\llamadores-app\android-sdk"

echo Compilando proyecto web Vite...
call npm run build

echo Sincronizando assets de Capacitor...
call npx cap sync android

echo Compilando APK Debug con Gradle...
cd android
call gradlew.bat assembleDebug --no-daemon
cd ..

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    echo ======================================================
    echo COMPILACION EXITOSA!
    echo APK generado en: android\app\build\outputs\apk\debug\app-debug.apk
    copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "wms-ssd-debug.apk"
    echo Copiado directo como: wms-ssd-debug.apk
    echo ======================================================
) else (
    echo ERROR: No se encontro el archivo APK generado.
)
