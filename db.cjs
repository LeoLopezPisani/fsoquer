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

// Function to create a table
const createTable = () => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT
  )`, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Users table is ready.');
    }
  });
};

// Function to insert a new user
const insertUser = (name, email, callback) => {
  db.run(`INSERT INTO users (name, email) VALUES (?, ?)`, [name, email], function (err) {
    if (err) {
      return callback(err, null);
    }
    callback(null, this.lastID);
  });
};

// Function to get all users
const getUsers = (callback) => {
  db.all('SELECT * FROM users', [], (err, rows) => {
    if (err) {
      return callback(err, null);
    }
    callback(null, rows);
  });
};

// Function to get users by a filter (name, email, etc.)
const getTemplateByFilter = (filter, value, callback) => {
    const query = `SELECT * FROM templates WHERE ${filter} = ?`;
    db.all(query, [value], (err, rows) => {
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
  createTable,
  insertUser,
  getUsers,
  getTemplateByFilter,
  closeDB
};