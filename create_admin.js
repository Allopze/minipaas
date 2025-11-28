
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./data/database.sqlite');

const email = 'debug@example.com';
const password = 'password123';

bcrypt.hash(password, 10, (err, hash) => {
    if (err) throw err;
    db.run("INSERT INTO users (email, password, role) VALUES (?, ?, ?)", [email, hash, 'admin'], (err) => {
        if (err) console.error(err);
        else console.log("Created debug admin user");
    });
});
