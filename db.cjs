// db.js

const Database = require('better-sqlite3');
const db = new Database('./fsoquer_db.db');

// Función para normalizar los textos (eliminar acentos)
const removeAccents = (str) => {
  str = str.toLowerCase();
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

db.function('remove_accents', removeAccents);

// Function to insert a new template
const insertTemplate = (nid, description, type, body, options, callback) => {
  db.run(`INSERT INTO templates (nid, description, type, body, options) VALUES (?, ?)`, [nid, description, type, body, options], function (err) {
    if (err) {
      return callback(err, null);
    }
    callback(null, this.lastID);
  });
};

// Function to get all templates
const getTemplates = (callback) => {
  db.all('SELECT * FROM templates', [], (err, rows) => {
    if (err) {
      return callback(err, null);
    }
    callback(null, rows);
  });
};

// Function to get templates by a filter
const getAllByFilter = (filter, value, table = "templates", groupby = null) => {
  if (!Array.isArray(value)) {
      value = [value];  // Asegúrate de que 'value' sea un array
  }

  // Construir la consulta base
  let query = `SELECT * FROM ${table} WHERE ${filter} = ?`;
  
  // Si se proporciona 'groupby', agregar la cláusula GROUP BY
  if (groupby) {
    query += ` GROUP BY ${groupby}`;
  }

  try {
    const rows = db.prepare(query).all(...value);
    
    return rows;
  } catch (err) {
    // En caso de error, manejar la excepción y mostrar un mensaje
    console.error('Error executing query:', err);
    throw err;
  }
};

  const getDataByFilter = (filters, table, sortColumn = null, sortDirection = 'ASC', limit = 0, distinct = false, groupby = null, column = null) => {
    // Build the conditions array based on the filters and operators
    const conditions = filters.map((filter, index) => {
      const { column, operator, value } = filter;
      
      // Handle specific operators
      switch (operator) {
        case 'BETWEEN':
          return `${column} BETWEEN ? AND ?`;  // For BETWEEN operator
        case 'LIKE':
          return `remove_accents(${column}) LIKE ? COLLATE NOCASE`;  // For LIKE operator
        case '>':
        case '<':
        case '>=':
        case '<=':
        case '=':
          return `${column} ${operator} ?`;  // For other operators
        default:
          return `${column} = ?`;  // Default is equality
      }
    }).join(' AND ');
  
    // Extract values for the query
    const queryValues = filters.flatMap((filter) => {
      if (filter.operator === 'BETWEEN') {
        return filter.value; // If BETWEEN, we have two values (start and end)
      }
      return [filter.value];  // For other operators, one value
    });
  
    // Construct the base query with the conditions
    let query = `SELECT ${distinct ? "DISTINCT" : ""} ${column ? column : "*"} FROM ${table} WHERE ${conditions}`;
  
    if (groupby) {
      query += ` GROUP BY ${groupby}`;
    }

    // If a sortColumn is provided, add the ORDER BY clause
    if (sortColumn) {
      // Sanitize sort direction to ensure it's either 'ASC' or 'DESC'
      const validDirections = ['ASC', 'DESC'];
      const direction = validDirections.includes(sortDirection.toUpperCase()) ? sortDirection.toUpperCase() : 'ASC';
      
      query += ` ORDER BY ${sortColumn} ${direction}`;
    }

    if (limit > 0) {
      query += ` LIMIT ${limit}`;
    }

    try {
      // Ejecutamos la consulta sincrónica
      const rows = db.prepare(query).all(...queryValues);

      // Devuelves los resultados, ya que ahora todo es sincrónico
      return rows;
    } catch (err) {
      // En caso de error, lanzar una excepción (o manejarla como desees)
      console.error(err);
      throw err;
    }
};
// Function to close the database connection
const closeDB = () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing the database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
  });
};

// Export the functions to be used in other files
module.exports = {
  insertTemplate,
  getTemplates,
  getAllByFilter,
  getDataByFilter,
  closeDB
};