const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const PORT = 8000;

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const vouchersDir = path.join(__dirname, 'vouchers');
    cb(null, vouchersDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voucher_' + uniqueSuffix + '.pdf');
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'), false);
    }
  }
});

// Configuración de middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configuración de la base de datos MySQL
const dbConfig = {
  host: 'mysql-roberth.alwaysdata.net',
  database: 'roberth_basededatos',
  user: 'roberth',
  password: '73814322',
  charset: 'utf8mb4'
};

// Función para obtener conexión a la base de datos
async function getConnection() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    return connection;
  } catch (error) {
    console.error('Error conectando a la base de datos:', error);
    throw error;
  }
}

// Ruta para servir el archivo HTML principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API para obtener departamentos
app.get('/api/departamentos', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute("SELECT DISTINCT D_DPTO FROM instituciones ORDER BY D_DPTO");
    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error de conexión: ' + error.message });
  }
});

// API para obtener provincias por departamento
app.get('/api/provincias', async (req, res) => {
  try {
    const departamento = req.query.departamento;
    
    if (!departamento) {
      return res.json([]);
    }
    
    const connection = await getConnection();
    const [rows] = await connection.execute(
      "SELECT DISTINCT D_PROV FROM instituciones WHERE D_DPTO = ? ORDER BY D_PROV",
      [departamento]
    );
    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error de conexión: ' + error.message });
  }
});

// API para obtener distritos por departamento y provincia
app.get('/api/distritos', async (req, res) => {
  try {
    const { departamento, provincia } = req.query;
    
    if (!departamento || !provincia) {
      return res.json([]);
    }
    
    const connection = await getConnection();
    const [rows] = await connection.execute(
      "SELECT DISTINCT D_DIST FROM instituciones WHERE D_DPTO = ? AND D_PROV = ? ORDER BY D_DIST",
      [departamento, provincia]
    );
    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error de conexión: ' + error.message });
  }
});

// API para obtener colegios filtrados por nivel (solo primaria y secundaria)
app.get('/api/colegios', async (req, res) => {
  try {
    const { departamento, provincia, distrito, nivel } = req.query;
    
    if (!departamento || !provincia || !distrito) {
      return res.json([]);
    }
    
    let nivelFiltro = '';
    if (nivel === 'primario') {
      nivelFiltro = "AND (D_NIV_MOD LIKE '%Primaria%' OR D_NIV_MOD LIKE '%Primario%')";
    } else if (nivel === 'secundario') {
      nivelFiltro = "AND (D_NIV_MOD LIKE '%Secundaria%' OR D_NIV_MOD LIKE '%Secundario%')";
    } else {
      // Si no se especifica nivel, mostrar solo primaria y secundaria
      nivelFiltro = "AND (D_NIV_MOD LIKE '%Primaria%' OR D_NIV_MOD LIKE '%Primario%' OR D_NIV_MOD LIKE '%Secundaria%' OR D_NIV_MOD LIKE '%Secundario%')";
    }
    
    const connection = await getConnection();
    const [rows] = await connection.execute(`
      SELECT COD_MOD, CEN_EDU, D_NIV_MOD, D_GESTION 
      FROM instituciones 
      WHERE D_DPTO = ? AND D_PROV = ? AND D_DIST = ? ${nivelFiltro}
      ORDER BY CEN_EDU
    `, [departamento, provincia, distrito]);
    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error de conexión: ' + error.message });
  }
});

// API para obtener detalle de un colegio
app.get('/api/detalle', async (req, res) => {
  try {
    const codigo = req.query.codigo;
    
    if (!codigo) {
      return res.json([]);
    }
    
    const connection = await getConnection();
    const [rows] = await connection.execute(`
      SELECT COD_MOD, CEN_EDU, D_NIV_MOD, D_GESTION, DIRECTOR, 
             TELEFONO, EMAIL, DIR_CEN, TALUMNO, TDOCENTE, D_ESTADO,
             D_DPTO, D_PROV, D_DIST
      FROM instituciones 
      WHERE COD_MOD = ?
    `, [codigo]);
    await connection.end();
    res.json(rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error de conexión: ' + error.message });
  }
});

// Ruta de prueba de conexión
app.get('/api/test-connection', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute('SELECT 1 as test');
    await connection.end();
    res.json({ 
      success: true, 
      message: 'Conexión exitosa a la base de datos',
      result: rows 
    });
  } catch (error) {
    console.error('Error de conexión:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error de conexión: ' + error.message 
    });
  }
});

// Ruta para ver las tablas disponibles
app.get('/api/tables', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute('SHOW TABLES');
    await connection.end();
    res.json({ 
      success: true, 
      tables: rows 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error: ' + error.message 
    });
  }
});

// Ruta para ver la estructura de la tabla instituciones
app.get('/api/structure', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute('DESCRIBE instituciones');
    await connection.end();
    res.json({ 
      success: true, 
      structure: rows 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error: ' + error.message 
    });
  }
});

// Ruta para ver algunos datos de ejemplo
app.get('/api/sample-data', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute('SELECT * FROM instituciones LIMIT 5');
    await connection.end();
    res.json({ 
      success: true, 
      data: rows 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error: ' + error.message 
    });
  }
});

// Crear tablas si no existen
app.get('/api/setup-database', async (req, res) => {
  try {
    const connection = await getConnection();
    
    // Tabla de inscripciones
    const createInscripcionesQuery = `
      CREATE TABLE IF NOT EXISTS inscripciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        apellidos VARCHAR(100) NOT NULL,
        nombres VARCHAR(100) NOT NULL,
        region VARCHAR(50) NOT NULL,
        provincia VARCHAR(50) NOT NULL,
        distrito VARCHAR(50) NOT NULL,
        institucion_educativa VARCHAR(200) NOT NULL,
        codigo_modular VARCHAR(20) NOT NULL,
        nivel VARCHAR(20) NOT NULL,
        grado VARCHAR(10) NOT NULL,
        dni VARCHAR(8) NOT NULL UNIQUE,
        voucher_filename VARCHAR(255) DEFAULT NULL,
        fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado VARCHAR(20) DEFAULT 'pendiente'
      )
    `;
    
    
    await connection.execute(createInscripcionesQuery);
    await connection.end();
    
    res.json({ 
      success: true, 
      message: 'Tablas creadas exitosamente' 
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error creando tablas: ' + error.message 
    });
  }
});

// API para inscripción de estudiantes
app.post('/api/inscripcion', upload.single('voucher'), async (req, res) => {
  try {
    const {
      apellidos,
      nombres,
      region,
      provincia,
      distrito,
      institucion_educativa,
      codigo_modular,
      nivel,
      grado,
      dni
    } = req.body;

    // Validar campos requeridos
    if (!apellidos || !nombres || !region || !provincia || !distrito || 
        !institucion_educativa || !codigo_modular || !nivel || !grado || !dni) {
      return res.status(400).json({ 
        success: false, 
        error: 'Todos los campos son requeridos' 
      });
    }

    // Validar que el DNI tenga 8 dígitos
    if (!/^\d{8}$/.test(dni)) {
      return res.status(400).json({ 
        success: false, 
        error: 'El DNI debe tener exactamente 8 dígitos' 
      });
    }

    const connection = await getConnection();
    
    // Usar voucher subido por el estudiante o generar uno demo si no se subió
    let voucherFilename = null;
    if (req.file) {
      // El estudiante subió su voucher
      voucherFilename = req.file.filename;
    } else {
      // No se subió archivo, generar voucher demo
      const nombreCompleto = `${nombres} ${apellidos}`;
      voucherFilename = await generarVoucherPDF(nombreCompleto);
    }
    
    const insertQuery = `
      INSERT INTO inscripciones 
      (apellidos, nombres, region, provincia, distrito, institucion_educativa, 
       codigo_modular, nivel, grado, dni, voucher_filename) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await connection.execute(insertQuery, [
      apellidos, nombres, region, provincia, distrito, 
      institucion_educativa, codigo_modular, nivel, grado, dni, voucherFilename
    ]);
    
    await connection.end();
    
    res.json({ 
      success: true, 
      message: 'Inscripción guardada exitosamente',
      inscripcion_id: result.insertId,
      voucher_filename: voucherFilename
    });
    
  } catch (error) {
    console.error('Error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ 
        success: false, 
        error: 'Ya existe una inscripción con este DNI' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Error guardando inscripción: ' + error.message 
      });
    }
  }
});

// API para obtener inscripciones (con paginación y filtros)
app.get('/api/inscripciones', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', nivel = '', estado = '', grado = '' } = req.query;
    const offset = (page - 1) * limit;
    
    const connection = await getConnection();
    
    let whereConditions = [];
    let searchParams = [];
    
    // Filtro de búsqueda por texto
    if (search) {
      whereConditions.push('(apellidos LIKE ? OR nombres LIKE ? OR dni LIKE ?)');
      const searchTerm = `%${search}%`;
      searchParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    // Filtro por nivel educativo
    if (nivel) {
      whereConditions.push('nivel = ?');
      searchParams.push(nivel);
    }
    
    // Filtro por estado
    if (estado) {
      whereConditions.push('estado = ?');
      searchParams.push(estado);
    }
    
    // Filtro por grado
    if (grado) {
      whereConditions.push('grado = ?');
      searchParams.push(grado);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // Obtener total de registros
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM inscripciones ${whereClause}`,
      searchParams
    );
    
    // Obtener registros paginados
    const [rows] = await connection.execute(`
      SELECT * FROM inscripciones 
      ${whereClause}
      ORDER BY fecha_inscripcion DESC
      LIMIT ? OFFSET ?
    `, [...searchParams, parseInt(limit), parseInt(offset)]);
    
    await connection.end();
    
    res.json({ 
      success: true, 
      data: rows,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error obteniendo inscripciones: ' + error.message 
    });
  }
});

// API para actualizar inscripción
app.put('/api/inscripcion/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const connection = await getConnection();
    
    // Si solo se está actualizando el estado (aprobación)
    if (Object.keys(data).length === 1 && data.estado) {
      const updateQuery = `UPDATE inscripciones SET estado = ? WHERE id = ?`;
      const [result] = await connection.execute(updateQuery, [data.estado, id]);
      
      await connection.end();
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Inscripción no encontrada' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Estado actualizado exitosamente' 
      });
      return;
    }

    // Actualización completa de datos
    const {
      apellidos,
      nombres,
      region,
      provincia,
      distrito,
      institucion_educativa,
      codigo_modular,
      nivel,
      grado,
      dni,
      estado
    } = data;

    // Validar campos requeridos para actualización completa
    if (!apellidos || !nombres || !region || !provincia || !distrito || 
        !institucion_educativa || !nivel || !grado || !dni) {
      await connection.end();
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan campos requeridos' 
      });
    }
    
    const updateQuery = `
      UPDATE inscripciones 
      SET apellidos = ?, nombres = ?, region = ?, provincia = ?, distrito = ?,
          institucion_educativa = ?, codigo_modular = ?, nivel = ?, grado = ?, 
          dni = ?, estado = ?
      WHERE id = ?
    `;
    
    const [result] = await connection.execute(updateQuery, [
      apellidos, nombres, region, provincia, distrito, 
      institucion_educativa, codigo_modular || '0000000', nivel, grado, dni, estado || 'pendiente', id
    ]);
    
    await connection.end();
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Inscripción no encontrada' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Inscripción actualizada exitosamente' 
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error actualizando inscripción: ' + error.message 
    });
  }
});




// Crear directorio para vouchers si no existe
const vouchersDir = path.join(__dirname, 'vouchers');
if (!fs.existsSync(vouchersDir)) {
  fs.mkdirSync(vouchersDir);
}

// Función para generar voucher PDF
function generarVoucherPDF(nombre, monto = '50.00', fecha = new Date().toLocaleDateString()) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const fileName = `voucher_${Date.now()}.pdf`;
    const filePath = path.join(vouchersDir, fileName);
    
    // Configurar stream de salida
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    
    // Contenido del PDF
    doc.fontSize(20).text('COMPROBANTE DE PAGO', 100, 50);
    doc.fontSize(14).text('Banco Nacional del Perú', 100, 100);
    doc.text('-------------------------------', 100, 120);
    doc.text(`Fecha: ${fecha}`, 100, 150);
    doc.text(`Nombre: ${nombre}`, 100, 180);
    doc.text(`Concepto: Inscripción Educativa`, 100, 210);
    doc.text(`Monto: S/ ${monto}`, 100, 240);
    doc.text(`Número de Operación: ${Math.floor(Math.random() * 1000000)}`, 100, 270);
    doc.text('-------------------------------', 100, 300);
    doc.text('Estado: PAGADO ✓', 100, 330);
    doc.text('Este es un comprobante válido', 100, 360);
    
    // Finalizar PDF
    doc.end();
    
    stream.on('finish', () => {
      resolve(fileName);
    });
    
    stream.on('error', (err) => {
      reject(err);
    });
  });
}

// API para generar PDF de voucher de ejemplo
app.get('/api/generar-voucher', (req, res) => {
  const { nombre = 'Juan Pérez', monto = '50.00', fecha = new Date().toLocaleDateString() } = req.query;
  
  generarVoucherPDF(nombre, monto, fecha)
    .then(fileName => {
      const filePath = path.join(vouchersDir, fileName);
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error('Error enviando archivo:', err);
          res.status(500).json({ error: 'Error generando voucher' });
        }
      });
    })
    .catch(err => {
      console.error('Error generando voucher:', err);
      res.status(500).json({ error: 'Error generando voucher' });
    });
});

// API para generar vouchers para estudiantes existentes sin voucher
app.post('/api/generar-vouchers-faltantes', async (req, res) => {
  try {
    const connection = await getConnection();
    
    // Obtener estudiantes sin voucher
    const [estudiantesSinVoucher] = await connection.execute(`
      SELECT id, nombres, apellidos 
      FROM inscripciones 
      WHERE voucher_filename IS NULL
    `);
    
    let vouchersGenerados = 0;
    
    for (const estudiante of estudiantesSinVoucher) {
      try {
        const nombreCompleto = `${estudiante.nombres} ${estudiante.apellidos}`;
        const voucherFilename = await generarVoucherPDF(nombreCompleto);
        
        // Actualizar el registro con el nombre del voucher
        await connection.execute(
          'UPDATE inscripciones SET voucher_filename = ? WHERE id = ?',
          [voucherFilename, estudiante.id]
        );
        
        vouchersGenerados++;
      } catch (err) {
        console.error(`Error generando voucher para estudiante ${estudiante.id}:`, err);
      }
    }
    
    await connection.end();
    
    res.json({
      success: true,
      message: `Se generaron ${vouchersGenerados} vouchers para estudiantes existentes`,
      vouchers_generados: vouchersGenerados
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error generando vouchers: ' + error.message
    });
  }
});

// Servir archivos estáticos de vouchers
app.use('/vouchers', express.static(vouchersDir));

// API para exportar inscripciones a Excel
app.get('/api/export-excel', async (req, res) => {
  try {
    const { nivel = '', estado = '', grado = '', search = '' } = req.query;
    
    const connection = await getConnection();
    
    let whereConditions = [];
    let searchParams = [];
    
    // Aplicar filtros igual que en la API de inscripciones
    if (search) {
      whereConditions.push('(apellidos LIKE ? OR nombres LIKE ? OR dni LIKE ?)');
      const searchTerm = `%${search}%`;
      searchParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (nivel) {
      whereConditions.push('nivel = ?');
      searchParams.push(nivel);
    }
    
    if (estado) {
      whereConditions.push('estado = ?');
      searchParams.push(estado);
    }
    
    if (grado) {
      whereConditions.push('grado = ?');
      searchParams.push(grado);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // Obtener todos los registros filtrados
    const [rows] = await connection.execute(`
      SELECT id, dni, apellidos, nombres, region, provincia, distrito, 
             institucion_educativa, nivel, grado, estado, 
             DATE_FORMAT(fecha_inscripcion, '%d/%m/%Y') as fecha_inscripcion
      FROM inscripciones 
      ${whereClause}
      ORDER BY fecha_inscripcion DESC
    `, searchParams);
    
    await connection.end();
    
    // Crear libro de Excel
    const workbook = XLSX.utils.book_new();
    
    // Preparar datos para Excel
    const excelData = rows.map(row => ({
      'ID': row.id,
      'DNI': row.dni,
      'Apellidos': row.apellidos,
      'Nombres': row.nombres,
      'Región': row.region,
      'Provincia': row.provincia,
      'Distrito': row.distrito,
      'Institución Educativa': row.institucion_educativa,
      'Nivel': row.nivel,
      'Grado': row.grado,
      'Estado': row.estado,
      'Fecha Inscripción': row.fecha_inscripcion
    }));
    
    // Crear hoja de cálculo
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inscripciones');
    
    // Generar nombre de archivo con filtros aplicados
    let fileName = 'inscripciones';
    if (nivel) fileName += `_${nivel}`;
    if (estado) fileName += `_${estado}`;
    if (grado) fileName += `_grado${grado}`;
    fileName += `_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Generar buffer del archivo Excel
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    res.send(excelBuffer);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error exportando datos: ' + error.message 
    });
  }
});

// API para exportar inscripciones a PDF
app.get('/api/export-pdf', async (req, res) => {
  try {
    const { nivel = '', estado = '', grado = '', search = '' } = req.query;
    
    const connection = await getConnection();
    
    let whereConditions = [];
    let searchParams = [];
    
    // Aplicar filtros igual que en la API de inscripciones
    if (search) {
      whereConditions.push('(apellidos LIKE ? OR nombres LIKE ? OR dni LIKE ?)');
      const searchTerm = `%${search}%`;
      searchParams.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (nivel) {
      whereConditions.push('nivel = ?');
      searchParams.push(nivel);
    }
    
    if (estado) {
      whereConditions.push('estado = ?');
      searchParams.push(estado);
    }
    
    if (grado) {
      whereConditions.push('grado = ?');
      searchParams.push(grado);
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // Obtener todos los registros filtrados
    const [rows] = await connection.execute(`
      SELECT id, dni, apellidos, nombres, region, provincia, distrito, 
             institucion_educativa, nivel, grado, estado, 
             DATE_FORMAT(fecha_inscripcion, '%d/%m/%Y') as fecha_inscripcion
      FROM inscripciones 
      ${whereClause}
      ORDER BY apellidos, nombres
    `, searchParams);
    
    await connection.end();
    
    // Crear documento PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    
    // Generar nombre de archivo con filtros aplicados
    let fileName = 'inscripciones';
    if (nivel) fileName += `_${nivel}`;
    if (estado) fileName += `_${estado}`;
    if (grado) fileName += `_grado${grado}`;
    fileName += `_${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    doc.pipe(res);
    
    // Título del documento
    doc.fontSize(16).text('REPORTE DE INSCRIPCIONES EDUCATIVAS', { align: 'center' });
    doc.fontSize(10).text(`Generado el: ${new Date().toLocaleDateString()}`, { align: 'center' });
    
    // Información de filtros aplicados
    let filtrosTexto = 'Filtros aplicados: ';
    const filtrosAplicados = [];
    if (nivel) filtrosAplicados.push(`Nivel: ${nivel}`);
    if (estado) filtrosAplicados.push(`Estado: ${estado}`);
    if (grado) filtrosAplicados.push(`Grado: ${grado}°`);
    if (search) filtrosAplicados.push(`Búsqueda: "${search}"`);
    
    if (filtrosAplicados.length > 0) {
      filtrosTexto += filtrosAplicados.join(', ');
    } else {
      filtrosTexto += 'Ninguno (todos los registros)';
    }
    
    doc.text(filtrosTexto, { align: 'center' });
    doc.text(`Total de registros: ${rows.length}`, { align: 'center' });
    doc.moveDown(2);
    
    // Headers de tabla
    const startY = doc.y;
    let currentY = startY;
    const rowHeight = 15;
    const margin = 40;
    
    // Configurar columnas
    const cols = [
      { header: 'N°', width: 30, x: margin },
      { header: 'DNI', width: 60, x: margin + 30 },
      { header: 'Apellidos y Nombres', width: 120, x: margin + 90 },
      { header: 'Institución', width: 100, x: margin + 210 },
      { header: 'Nivel', width: 50, x: margin + 310 },
      { header: 'Grado', width: 40, x: margin + 360 },
      { header: 'Estado', width: 50, x: margin + 400 }
    ];
    
    // Dibujar headers
    doc.fontSize(8).font('Helvetica-Bold');
    cols.forEach(col => {
      doc.text(col.header, col.x, currentY, { width: col.width, align: 'center' });
    });
    
    currentY += rowHeight;
    doc.moveTo(margin, currentY).lineTo(500, currentY).stroke();
    currentY += 5;
    
    // Dibujar filas de datos
    doc.font('Helvetica').fontSize(7);
    rows.forEach((row, index) => {
      if (currentY > 750) { // Nueva página si es necesario
        doc.addPage();
        currentY = 50;
        
        // Redibujar headers en nueva página
        doc.fontSize(8).font('Helvetica-Bold');
        cols.forEach(col => {
          doc.text(col.header, col.x, currentY, { width: col.width, align: 'center' });
        });
        currentY += rowHeight;
        doc.moveTo(margin, currentY).lineTo(500, currentY).stroke();
        currentY += 5;
        doc.font('Helvetica').fontSize(7);
      }
      
      // Dibujar datos de la fila
      doc.text((index + 1).toString(), cols[0].x, currentY, { width: cols[0].width, align: 'center' });
      doc.text(row.dni, cols[1].x, currentY, { width: cols[1].width, align: 'center' });
      doc.text(`${row.apellidos}, ${row.nombres}`, cols[2].x, currentY, { width: cols[2].width });
      doc.text(row.institucion_educativa.substring(0, 25) + '...', cols[3].x, currentY, { width: cols[3].width });
      doc.text(row.nivel, cols[4].x, currentY, { width: cols[4].width, align: 'center' });
      doc.text(row.grado + '°', cols[5].x, currentY, { width: cols[5].width, align: 'center' });
      doc.text(row.estado.toUpperCase(), cols[6].x, currentY, { width: cols[6].width, align: 'center' });
      
      currentY += rowHeight;
    });
    
    doc.end();
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error exportando PDF: ' + error.message 
    });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
  console.log('✓ Base de datos configurada correctamente');
  console.log('Sistema de inscripción educativa listo');
});

// Mantener el servidor vivo
server.keepAliveTimeout = 60000;
server.headersTimeout = 65000;

// Prevenir que el proceso termine
process.stdin.resume();