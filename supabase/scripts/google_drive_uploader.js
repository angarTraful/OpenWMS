/**
 * OPENWMS 3PL - Google Drive Uploader Web App
 * Motor: Google Apps Script (script.google.com)
 * 
 * Sube archivos a la carpeta exclusiva "OpenWMS_Documentos" en Google Drive y
 * retorna URLs públicas optimizadas para almacenamiento ligero en Supabase.
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
