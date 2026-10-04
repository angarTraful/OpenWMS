# Integración con Google Drive para Documentos y Remitos - OpenWMS 3PL

Para evitar sobrecargar la base de datos PostgreSQL con fotos y documentos pesados (evitando saturar el límite de almacenamiento de Supabase), OpenWMS 3PL almacena todos los archivos adjuntos en una **carpeta exclusiva de Google Drive** (`OpenWMS_Documentos`) y guarda **únicamente el enlace (URL público)** en la base de datos.

---

## 🚀 Pasos de Configuración (Solo toma 2 minutos)

### Paso 1: Crear el Script en Google Apps Script
1. Abre [script.google.com](https://script.google.com) con la cuenta de Google de la empresa.
2. Haz clic en **"Nuevo proyecto"** (arriba a la izquierda).
3. Nómbralo **`OpenWMS_GoogleDrive_Uploader`**.
4. Borra el código por defecto y pega el siguiente código:

```javascript
/**
 * OPENWMS 3PL - Google Drive Uploader Web App
 * Guarda fotos de remitos conformados y documentos en una carpeta exclusiva de Drive.
 */
function doPost(e) {
  try {
    var contents = e.postData.contents;
    var data = JSON.parse(contents);
    
    // 1. Obtener o crear carpeta raíz exclusiva
    var rootFolderName = data.rootFolder || "OpenWMS_Documentos";
    var rootFolder = getOrCreateFolder(DriveApp.getRootFolder(), rootFolderName);
    
    // 2. Obtener o crear subcarpeta (ej. Remitos_Conformados, Recepciones)
    var targetFolder = rootFolder;
    if (data.folder) {
      targetFolder = getOrCreateFolder(rootFolder, data.folder);
    }
    
    // 3. Procesar datos del archivo
    var base64Data = data.base64;
    if (base64Data.indexOf(",") > -1) {
      base64Data = base64Data.split(",")[1];
    }
    var decoded = Utilities.base64Decode(base64Data);
    var mimeType = data.mimeType || "image/jpeg";
    var fileName = data.fileName || ("Doc_" + Utilities.formatDate(new Date(), "GMT-3", "yyyyMMdd_HHmmss") + ".jpg");
    
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var file = targetFolder.createFile(blob);
    
    // 4. Compartir para visualización con enlace
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var fileId = file.getId();
    var viewUrl = file.getUrl();
    var directUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
    var thumbnailUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1200";
    
    var response = {
      success: true,
      fileId: fileId,
      fileName: fileName,
      folder: targetFolder.getName(),
      viewUrl: viewUrl,
      directUrl: directUrl,
      thumbnailUrl: thumbnailUrl,
      url: thumbnailUrl
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: "online",
      message: "OpenWMS Google Drive Uploader activo.",
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(parent, name) {
  var folders = parent.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parent.createFolder(name);
}
```

---

### Paso 2: Implementar (Deploy) como Aplicación Web
1. Haz clic en el botón azul **"Implementar" ➔ "Nueva implementación"** (arriba a la derecha).
2. En el engranaje a la izquierda, selecciona **"Aplicación web"**.
3. Configura:
   - **Descripción**: `OpenWMS Uploader`
   - **Ejecutar como**: **`Yo (tu_correo@gmail.com)`**
   - **Quién tiene acceso**: **`Cualquier usuario`** *(Imprescindible para que las tablets de los choferes y despachantes puedan enviar fotos sin pedir login de Google)*.
4. Haz clic en **"Implementar"**.
5. Concede los permisos a Google Drive cuando lo solicite.
6. **Copia la "URL de la aplicación web"** (que termina en `/exec`).

---

### Paso 3: Activar en OpenWMS
Puedes activarlo de 2 formas muy simples:

1. **Desde la interfaz del WMS**:
   - En el menú superior o en cualquier ventana de adjuntar documentos, haz clic en **"Configurar Google Drive"** (icono de nube/Drive).
   - Pega la URL de la aplicación web y haz clic en **"Probar y Guardar"**.

2. **O en el archivo `.env`**:
   ```env
   VITE_GOOGLE_DRIVE_WEBHOOK_URL=https://script.google.com/macros/s/AKfycb.../exec
   ```

---

## 📂 Organización de Carpetas en tu Google Drive

El script creará automáticamente en la raíz de tu Google Drive:

```
📁 OpenWMS_Documentos/
   ├── 📁 Remitos_Conformados/   (Fotos de remitos firmados, sellados, POD de choferes)
   ├── 📁 Recepciones/           (Remitos de proveedores, fotos de precintos, BL, aduana)
   └── 📁 Despachos/             (Constancias y manifiestos de salida)
```

## 🛡️ En la Base de Datos (Supabase)
En la tabla `rutas_paradas_itinerario`, la columna `foto_remito_url` contendrá únicamente:
`https://drive.google.com/thumbnail?id=1AbCdEf...&sz=w1200`
(Ocupando apenas 80 bytes por registro en vez de 1 MB de base64).
