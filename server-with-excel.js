const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const port = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// SQLite database
const db = new sqlite3.Database('./db/database.db');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS demographics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name TEXT,
    student_age INTEGER,
    student_class TEXT,
    student_gender TEXT,
    school_name TEXT,
    teacher_name TEXT,
    primary_language TEXT,
    secondary_language TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS questionnaire (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demographic_id INTEGER,
    en_score INTEGER,
    kn_score INTEGER,
    FOREIGN KEY(demographic_id) REFERENCES demographics(id)
  )`);
});

// Landing page redirect
app.get('/', (req, res) => {
  res.redirect('/landing.html');
});

// Demographic form submission
app.post('/submit-form1', (req, res) => {
  const {
    student_name,
    student_age,
    student_class,
    student_gender,
    school_name,
    teacher_name,
    primary_language,
    primary_language_other,
    secondary_language,
    secondary_language_other
  } = req.body;

  const primary = primary_language === 'other' ? primary_language_other : primary_language;
  const secondary = secondary_language === 'other' ? secondary_language_other : secondary_language;

  db.run(`INSERT INTO demographics 
    (student_name, student_age, student_class, student_gender, school_name, teacher_name, primary_language, secondary_language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_name, student_age, student_class, student_gender, school_name, teacher_name, primary, secondary],
    function (err) {
      if (err) {
        console.error(err.message);
        res.status(500).send('Failed to store demographic data.');
      } else {
        res.json({ id: this.lastID });
      }
    });
});

// Questionnaire submission
app.post('/submit-form2', (req, res) => {
  const demographicId = req.query.id;
  const { en_score, kn_score } = req.body;

  db.run(`INSERT INTO questionnaire (demographic_id, en_score, kn_score) VALUES (?, ?, ?)`,
    [demographicId, en_score, kn_score],
    (err) => {
      if (err) {
        console.error(err.message);
        res.status(500).send('Failed to store questionnaire data.');
      } else {
        res.send(`
          <h2>Thank you for completing M-Troll</h2>
          <p>English Score: ${en_score}</p>
          <p>Kannada Score: ${kn_score}</p>
          <p>${en_score >= 87 && kn_score >= 87 ? 'No risk of learning disability' : 'Child is at risk. Please consult a professional.'}</p>
        `);
      }
    });
});

// Excel export route
app.get('/export-excel', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Assessment Data');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 5 },
    { header: 'Name', key: 'student_name', width: 20 },
    { header: 'Age', key: 'student_age', width: 10 },
    { header: 'Class', key: 'student_class', width: 15 },
    { header: 'Gender', key: 'student_gender', width: 10 },
    { header: 'School', key: 'school_name', width: 20 },
    { header: 'Teacher', key: 'teacher_name', width: 20 },
    { header: 'Primary Language', key: 'primary_language', width: 15 },
    { header: 'Secondary Language', key: 'secondary_language', width: 15 },
    { header: 'English Score', key: 'en_score', width: 15 },
    { header: 'Kannada Score', key: 'kn_score', width: 15 }
  ];

  db.all(`
    SELECT d.*, q.en_score, q.kn_score
    FROM demographics d
    LEFT JOIN questionnaire q ON d.id = q.demographic_id
  `, [], async (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send('Error fetching data');
    }

    rows.forEach(row => {
      const risk = (row.en_score != null && row.kn_score != null && row.en_score >= 87 && row.kn_score >= 87)
        ? 'No Risk' : (row.en_score != null ? 'At Risk' : 'No Data');
      sheet.addRow({ ...row, risk_status: risk });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="assessment_data.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
