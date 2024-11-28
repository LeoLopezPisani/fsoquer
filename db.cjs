// db.js

const sqlite3 = require('sqlite3').verbose();

// Open or create a database
let db = new sqlite3.Database('./fsoquer_db.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

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
const getAllByFilter = (filter, value, table = null, groupby = null, callback) => {
    let query = `SELECT * FROM ${table ? table : "templates"} WHERE ${filter} = ?`;
    
    if (groupby) {
      query += ` GROUP BY ${groupby}`;
    }

    db.all(query, [value], (err, rows) => {
      if (err) {
        return callback(err, null);
      }
      callback(null, rows);
    });
  };

const getDataByFilter = (filters, table, sortColumn = null, sortDirection = 'ASC', limit = 0, distinct = false, groupby = null, column = null,callback) => {
    // Build the conditions array based on the filters and operators
    const conditions = filters.map((filter, index) => {
      const { column, operator, value } = filter;
      
      // Handle specific operators
      switch (operator) {
        case 'BETWEEN':
          return `${column} BETWEEN ? AND ?`;  // For BETWEEN operator
        case 'LIKE':
          return `${column} LIKE ? COLLATE NOCASE`;  // For LIKE operator
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
  
    // Execute the query with the values
    db.all(query, queryValues, (err, rows) => {
      if (err) {
        return callback(err, null);
      }
      callback(null, rows);
    });
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