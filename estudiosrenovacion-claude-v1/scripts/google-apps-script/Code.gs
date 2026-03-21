/**
 * Google Apps Script Backend for Report Publishing System
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com/
 * 2. Create a new project
 * 3. Copy this entire code into Code.gs
 * 4. Update the SPREADSHEET_ID and DRIVE_FOLDER_ID constants below
 * 5. Click Deploy > New deployment > Web app
 * 6. Set "Execute as" to "Me" and "Who has access" to "Anyone"
 * 7. Copy the deployment URL and use it in your frontend
 */

// ==================== CONFIGURATION ====================
const SPREADSHEET_ID = '1qVKcTtsxPCSppm3EZmpGuUfS_laTcybXBImJpD017qs';
const DRIVE_FOLDER_ID = '1W53dE7w0BAt2FDCulGhQO-Z4qTdBn1m_';

// Sheet names
const USERS_SHEET = 'Usuarios';
const REPORTS_SHEET = 'Informes';

// ==================== MAIN REQUEST HANDLER ====================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  // Enable CORS
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    const params = e.parameter;
    const action = params.action;
    
    let result;
    
    switch (action) {
      // Auth actions
      case 'login':
        result = handleLogin(params.email, params.password);
        break;
      case 'register':
        result = handleRegister(params.email, params.password, params.centro);
        break;
        
      // Report actions
      case 'getReports':
        result = getReports(params.centro);
        break;
      case 'getReport':
        result = getReportById(params.id);
        break;
      case 'createReport':
        result = createReport(JSON.parse(params.data));
        break;
      case 'updateReport':
        result = updateReport(params.id, JSON.parse(params.data));
        break;
      case 'deleteReport':
        result = deleteReport(params.id, params.userEmail, params.userRole);
        break;
        
      // Admin actions
      case 'getUsers':
        result = getUsers();
        break;
      case 'approveUser':
        result = approveUser(params.email);
        break;
      case 'rejectUser':
        result = rejectUser(params.email);
        break;
      case 'updateUserCentro':
        result = updateUserCentro(params.email, params.centro);
        break;
      case 'deleteUser':
        result = deleteUser(params.email);
        break;
        
      // File upload
      case 'uploadPDF':
        result = uploadPDF(e);
        break;
        
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    output.setContent(JSON.stringify(result));
    
  } catch (error) {
    output.setContent(JSON.stringify({
      success: false,
      error: error.toString()
    }));
  }
  
  return output;
}

// ==================== AUTHENTICATION ====================

function handleLogin(email, password) {
  if (!email || !password) {
    return { success: false, error: 'Email y contraseña son requeridos' };
  }
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const userEmail = row[0];
    const userPassword = row[1];
    const userCentro = row[2];
    const userApproved = row[3];
    const userRole = row[4];
    
    if (userEmail === email && userPassword === password) {
      // Check if user is approved (admin is always approved)
      if (userRole !== 'admin' && userApproved !== true && userApproved !== 'TRUE') {
        return { success: false, error: 'Tu cuenta aún no ha sido aprobada' };
      }
      
      return {
        success: true,
        user: {
          email: userEmail,
          centro: userCentro,
          role: userRole || 'user',
          approved: userApproved
        }
      };
    }
  }
  
  return { success: false, error: 'Email o contraseña incorrectos' };
}

function handleRegister(email, password, centro) {
  if (!email || !password || !centro) {
    return { success: false, error: 'Todos los campos son requeridos' };
  }
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  // Check if email already exists
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      return { success: false, error: 'Este email ya está registrado' };
    }
  }
  
  // Add new user (not approved by default)
  sheet.appendRow([email, password, centro, false, 'user']);
  
  return { success: true, message: 'Registro exitoso. Tu cuenta será revisada por un administrador.' };
}

// ==================== REPORTS ====================

function getReports(centro) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REPORTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  const reports = [];
  
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    // If no ID, skip
    if (!row[0]) continue;
    
    const report = {
      id: row[0],
      titulo: row[1],
      tag: row[2],
      centro: row[3],
      fecha: row[4],
      pdf_url: row[5],
      created_at: row[6]
    };
    
    // Filter by centro if specified
    if (!centro || centro === 'all' || report.centro === centro) {
      reports.push(report);
    }
  }
  
  // Sort by created_at descending (newest first)
  reports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  return { success: true, reports: reports };
}

function getReportById(id) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REPORTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return {
        success: true,
        report: {
          id: data[i][0],
          titulo: data[i][1],
          tag: data[i][2],
          centro: data[i][3],
          fecha: data[i][4],
          pdf_url: data[i][5],
          created_at: data[i][6]
        }
      };
    }
  }
  
  return { success: false, error: 'Informe no encontrado' };
}

function createReport(reportData) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REPORTS_SHEET);
  
  // Generate unique ID
  const id = Utilities.getUuid();
  const created_at = new Date().toISOString();
  
  // Add new report
  sheet.appendRow([
    id,
    reportData.titulo,
    reportData.tag,
    reportData.centro,
    reportData.fecha,
    reportData.pdf_url,
    created_at
  ]);
  
  return { 
    success: true, 
    message: 'Informe creado exitosamente',
    report: {
      id: id,
      titulo: reportData.titulo,
      tag: reportData.tag,
      centro: reportData.centro,
      fecha: reportData.fecha,
      pdf_url: reportData.pdf_url,
      created_at: created_at
    }
  };
}

function updateReport(id, reportData) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REPORTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // Update the row (keep id and created_at)
      sheet.getRange(i + 1, 2).setValue(reportData.titulo);
      sheet.getRange(i + 1, 3).setValue(reportData.tag);
      sheet.getRange(i + 1, 4).setValue(reportData.centro);
      sheet.getRange(i + 1, 5).setValue(reportData.fecha);
      if (reportData.pdf_url) {
        sheet.getRange(i + 1, 6).setValue(reportData.pdf_url);
      }
      
      return { success: true, message: 'Informe actualizado exitosamente' };
    }
  }
  
  return { success: false, error: 'Informe no encontrado' };
}

function deleteReport(id, userEmail, userRole) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(REPORTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const reportCentro = data[i][3];
      
      // Check permissions (admin can delete any, users only their centro)
      if (userRole !== 'admin') {
        // Get user's centro
        const usersSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
        const usersData = usersSheet.getDataRange().getValues();
        let userCentro = null;
        
        for (let j = 1; j < usersData.length; j++) {
          if (usersData[j][0] === userEmail) {
            userCentro = usersData[j][2];
            break;
          }
        }
        
        if (userCentro !== reportCentro) {
          return { success: false, error: 'No tienes permiso para eliminar informes de otro centro' };
        }
      }
      
      // Delete the row
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Informe eliminado exitosamente' };
    }
  }
  
  return { success: false, error: 'Informe no encontrado' };
}

// ==================== USER MANAGEMENT (Admin only) ====================

function getUsers() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  const users = [];
  
  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue;
    
    users.push({
      email: row[0],
      centro: row[2],
      approved: row[3],
      role: row[4] || 'user'
    });
  }
  
  return { success: true, users: users };
}

function approveUser(email) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      sheet.getRange(i + 1, 4).setValue(true);
      return { success: true, message: 'Usuario aprobado exitosamente' };
    }
  }
  
  return { success: false, error: 'Usuario no encontrado' };
}

function rejectUser(email) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Usuario rechazado y eliminado' };
    }
  }
  
  return { success: false, error: 'Usuario no encontrado' };
}

function updateUserCentro(email, centro) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      sheet.getRange(i + 1, 3).setValue(centro);
      return { success: true, message: 'Centro actualizado exitosamente' };
    }
  }
  
  return { success: false, error: 'Usuario no encontrado' };
}

function deleteUser(email) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      // Prevent deleting admin
      if (data[i][4] === 'admin') {
        return { success: false, error: 'No se puede eliminar al administrador' };
      }
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Usuario eliminado exitosamente' };
    }
  }
  
  return { success: false, error: 'Usuario no encontrado' };
}

// ==================== FILE UPLOAD ====================

function uploadPDF(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const fileName = postData.fileName;
    const fileData = postData.fileData; // Base64 encoded
    
    // Decode base64
    const decodedFile = Utilities.base64Decode(fileData);
    const blob = Utilities.newBlob(decodedFile, 'application/pdf', fileName);
    
    // Upload to Drive
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const file = folder.createFile(blob);
    
    // Make file publicly accessible
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Get the direct view URL
    const fileId = file.getId();
    const viewUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';
    
    return {
      success: true,
      fileId: fileId,
      url: viewUrl,
      name: fileName
    };
    
  } catch (error) {
    return { success: false, error: 'Error al subir archivo: ' + error.toString() };
  }
}

// ==================== INITIALIZATION ====================

function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Create Usuarios sheet if not exists
  let usersSheet = ss.getSheetByName(USERS_SHEET);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(USERS_SHEET);
    usersSheet.appendRow(['email', 'password', 'centro', 'approved', 'role']);
    // Add admin user
    usersSheet.appendRow(['tadeobessega', 'JMaynard36', '', true, 'admin']);
  }
  
  // Create Informes sheet if not exists
  let reportsSheet = ss.getSheetByName(REPORTS_SHEET);
  if (!reportsSheet) {
    reportsSheet = ss.insertSheet(REPORTS_SHEET);
    reportsSheet.appendRow(['id', 'titulo', 'tag', 'centro', 'fecha', 'pdf_url', 'created_at']);
  }
  
  return { success: true, message: 'Sheets initialized successfully' };
}
