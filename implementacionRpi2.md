# 🍓 Guía de Implementación: WMS SSD en Raspberry Pi 2 (Linux)

Esta guía detalla paso a paso cómo desplegar y servir el sistema **WMS SSD** en una **Raspberry Pi 2** utilizando **Linux (Raspberry Pi OS / Debian)** y un servidor web ultraligero optimizado (**Nginx**).

---

## 🏗️ 1. Arquitectura y Consideraciones de Hardware

### Especificaciones de la Raspberry Pi 2 (Modelo B)
* **Procesador:** Quad-Core ARM Cortex-A7 @ 900 MHz (32-bit).
* **Memoria RAM:** 1 GB SDRAM (compartida con GPU).
* **Almacenamiento:** Tarjeta MicroSD.
* **Red:** Puerto Ethernet 10/100 Mbps o adaptador Wi-Fi USB.

### ⚠️ Regla de Oro: Compilar en PC, Servir en Raspberry
* **NO compilar dentro de la Raspberry Pi 2:** El proceso de construcción (`npm run build`, TypeScript y Vite) requiere Node.js moderno y puede consumir más de 1 GB de RAM. En una Raspberry Pi 2 provocaría saturación de memoria (*Out of Memory*), congelamiento del sistema y desgaste severo de la tarjeta MicroSD por uso excesivo de swap.
* **Modelo desacoplado:** Toda la base de datos y la lógica pesada residen en **Supabase** (en la nube). La Raspberry Pi 2 únicamente actúa como un **servidor web estático local**, consumiendo **menos de 20 MB de RAM y 0% de CPU en reposo**.

---

## 📋 2. Requisitos Previos

1. **Raspberry Pi 2** con Raspberry Pi OS (recomendado: *Raspberry Pi OS Lite* de 32 bits, o Desktop si usas pantalla local).
2. Raspberry conectada a la misma red local que los clientes (vía cable de red Ethernet o Wi-Fi).
3. Conocer la dirección IP local de la Raspberry Pi (ejemplo: `192.168.0.50`).
4. Acceso SSH habilitado o terminal física con teclado y monitor.

---

## 💻 3. Paso 1: Compilar la Aplicación en la PC (Windows)

En tu computadora de desarrollo donde está el código fuente:

1. Abre la terminal (PowerShell o CMD) en la carpeta del proyecto:
   ```powershell
   cd C:\Users\intra\Documents\SISTEMAS\WMS_SSD
   ```

2. Compila el frontend optimizado para producción:
   ```powershell
   npm run build
   ```

3. Verifica que se haya generado la carpeta **`dist\`** con los archivos estáticos (`index.html`, carpeta `assets/`, etc.).

---

## 📦 4. Paso 2: Transferir los Archivos a la Raspberry Pi 2

Elige el método que te resulte más cómodo:

### Opción A: Transferencia directa por SSH / SCP (Recomendada)
Desde PowerShell en tu PC:
```powershell
# Reemplaza 'pi' por tu usuario y la IP por la de tu Raspberry
scp -r dist/* pi@192.168.0.XX:/tmp/wms-dist/
```

### Opción B: Mediante Pendrive USB
1. Copia el contenido de la carpeta `dist` en un pendrive USB formateado en FAT32 o NTFS.
2. Conecta el pendrive en cualquier puerto USB de la Raspberry Pi 2.
3. Cópialo al directorio de la aplicación (ver siguiente paso).

### Opción C: Mediante SFTP (FileZilla / WinSCP)
* Conéctate usando el protocolo SFTP a la IP de la Raspberry, puerto 22, con tu usuario y contraseña.
* Sube los archivos de `dist\` a `/var/www/wms-ssd/`.

---

## 🐧 5. Paso 3: Configurar Nginx en la Raspberry Pi 2

Conéctate por SSH a la Raspberry (o abre su terminal):

### 1. Actualizar repositorios e instalar Nginx
```bash
sudo apt update
sudo apt install -y nginx
```

### 2. Crear el directorio de la aplicación y asignar permisos
```bash
sudo mkdir -p /var/www/wms-ssd
sudo chown -R $USER:$USER /var/www/wms-ssd
sudo chmod -R 755 /var/www/wms-ssd
```

Si transferiste los archivos a `/tmp/wms-dist/`, muévelos al destino final:
```bash
cp -r /tmp/wms-dist/* /var/www/wms-ssd/
rm -rf /tmp/wms-dist
```

### 3. Crear el archivo de configuración virtual de Nginx
Crea un archivo nuevo para el sitio:
```bash
sudo nano /etc/nginx/sites-available/wms-ssd
```

Pega la siguiente configuración optimizada para **React SPA** y bajo consumo de recursos:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    root /var/www/wms-ssd;
    index index.html;

    # 1. Soporte para Single Page Application (React Router / Vite)
    # Si la ruta no existe físicamente, redirige internamente a index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 2. Caché estático prolongado para assets (reduce lecturas de la microSD)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
        access_log off; # Evita escrituras innecesarias en la SD
    }

    # 3. Compresión GZIP activa (reduce tamaño de descarga y acelera clientes)
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
    gzip_disable "MSIE [1-6]\.";

    # 4. Seguridad básica en cabeceras
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
}
```
> Para guardar en `nano`: presiona `Ctrl + O`, luego `Enter`, y sal con `Ctrl + X`.

### 4. Activar el sitio y reiniciar Nginx
```bash
# Deshabilitar el sitio por defecto de Nginx
sudo rm -f /etc/nginx/sites-enabled/default

# Habilitar la configuración de WMS SSD
sudo ln -s /etc/nginx/sites-available/wms-ssd /etc/nginx/sites-enabled/

# Validar que no existan errores de sintaxis
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx

# Asegurar que Nginx inicie automáticamente al encender la Raspberry
sudo systemctl enable nginx
```

---

## ⚡ 6. Paso 4: Optimización de la Raspberry Pi 2

Para garantizar que la Raspberry Pi 2 funcione de manera confiable las 24/7 sin desgastar la tarjeta MicroSD:

### 1. Fijar IP Estática (Recomendado)
Para evitar que el router cambie la IP de la Raspberry tras un reinicio:

Edita la configuración de red:
```bash
sudo nano /etc/dhcpcd.conf
```
Agrega al final (ajustando a tu rango de red):
```text
interface eth0
static ip_address=192.168.0.50/24
static routers=192.168.0.1
static domain_name_servers=192.168.0.1 8.8.8.8
```

### 2. Reducir escrituras en la tarjeta MicroSD (Extender vida útil)
Crea discos temporales en memoria RAM (`tmpfs`) para los logs y archivos temporales:
```bash
sudo nano /etc/fstab
```
Agrega las siguientes líneas al final:
```text
tmpfs    /tmp        tmpfs    defaults,noatime,nosuid,size=64M    0    0
tmpfs    /var/log    tmpfs    defaults,noatime,nosuid,mode=0755,size=32M    0    0
```

---

## 🖥️ 7. Paso 5 (Opcional): Modo Pantalla / Terminal Kiosk

Si vas a conectar la Raspberry Pi 2 directamente a una pantalla por cable HDMI para usarla como puesto fijo de consulta en el almacén:

1. **Instalar Chromium y herramientas de pantalla:**
   ```bash
   sudo apt install --no-install-recommends -y xserver-xorg x11-xserver-utils xinit openbox chromium-browser unclutter
   ```

2. **Crear script de inicio Kiosk:**
   ```bash
   nano ~/.xinitrc
   ```
   Pega lo siguiente:
   ```bash
   #!/bin/bash
   xset -dpms
   xset s off
   xset s noblank
   unclutter -idle 0.5 -root &
   sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' ~/.config/chromium/Default/Preferences
   sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' ~/.config/chromium/Default/Preferences
   chromium-browser --noerrdialogs --disable-infobars --kiosk http://localhost &
   exec openbox-session
   ```
   Asigna permisos de ejecución:
   ```bash
   chmod +x ~/.xinitrc
   ```

3. **Aumentar memoria Swap (Vital para Chromium en 1 GB de RAM):**
   ```bash
   sudo nano /etc/dphys-swapfile
   ```
   Cambia `CONF_SWAPSIZE=100` por:
   ```text
   CONF_SWAPSIZE=1024
   ```
   Reinicia el servicio de swap:
   ```bash
   sudo /etc/init.d/dphys-swapfile restart
   ```

---

## 🔄 8. Script Rápido para Actualizaciones Futuras

Cada vez que hagas cambios en el código en tu PC con Windows, puedes desplegar la nueva versión con este flujo:

1. En tu PC:
   ```powershell
   npm run build
   scp -r dist/* pi@192.168.0.XX:/var/www/wms-ssd/
   ```
2. ¡Listo! Como son archivos estáticos, no hace falta reiniciar servicios ni reiniciar la Raspberry; los cambios se reflejan al instante al recargar la página en los clientes.

---

## 📱 9. Conexión de Dispositivos del Almacén

* **Computadoras y Laptops:** Abrir cualquier navegador web e ingresar `http://<IP_DE_LA_RASPBERRY>`.
* **Tablets y Teléfonos (Android/iOS):** Acceder desde el navegador y tocar **"Agregar a la pantalla de inicio"** para usarla en pantalla completa como app nativa.
* **Colectores de datos Android (Zebra / Honeywell):**
  * Pueden usar el navegador web accediendo a la IP local.
  * O bien instalar el archivo APK compilado disponible en la raíz del proyecto: `wms-ssd-debug.apk`.

---

## 🛠️ Comandos de Diagnóstico Rápido

* **Ver estado del servidor web:**
  ```bash
  sudo systemctl status nginx
  ```
* **Comprobar consumo de memoria RAM y CPU:**
  ```bash
  htop
  # o también:
  free -h
  ```
* **Reiniciar Nginx:**
  ```bash
  sudo systemctl restart nginx
  ```
* **Ver logs de error de Nginx:**
  ```bash
  sudo tail -f /var/log/nginx/error.log
  ```
