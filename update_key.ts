import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'schedulearr.db');
const db = new Database(dbPath);

console.log('Current instances:');
const rows = db.prepare('SELECT * FROM instances').all();
console.log(rows);

const stmt = db.prepare('UPDATE instances SET api_key = ? WHERE url = ?');
const info = stmt.run('ec7078e261fb4841ba2ceaed1dda1921', 'http://192.168.1.125:9797');

console.log('Update result:', info);

const updatedRows = db.prepare('SELECT * FROM instances').all();
console.log('Updated instances:');
console.log(updatedRows);
