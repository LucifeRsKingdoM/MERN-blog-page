const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = "qwertyuiop"; // 🔒 Change this to a secure key

// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "2003", // Using your MySQL password
  database: "todo_db",
});

db.connect((err) => {
  if (err) {
    console.log("Database Connection Failed", err);
  } else {
    console.log("Connected to MySQL Database");
  }
});

// Ensure Users Table Exists
db.query(
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) console.log("Error creating users table:", err);
  }
);

// Modified Todos Table - Using email instead of user_id
db.query(
  `CREATE TABLE IF NOT EXISTS todos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    task VARCHAR(255) NOT NULL,
    completed BOOLEAN DEFAULT false,
    due_date DATETIME NULL,
    priority ENUM('High', 'Medium', 'Low') DEFAULT 'Medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) console.log("Error creating todos table:", err);
  }
);

// Authentication middleware
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    // Handle both "Bearer token" and raw token formats
    const tokenValue = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    const decoded = jwt.verify(tokenValue, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid token" });
  }
};

// User Registration
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  // Validate input
  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Check if user already exists
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.length > 0) return res.status(400).json({ message: "Email already registered" });

      // Hash the password before storing
      const hashedPassword = await bcrypt.hash(password, 10);

      // Save user in the database
      db.query(
        "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
        [username, email, hashedPassword],
        (err, result) => {
          if (err) return res.status(500).json({ message: "Registration failed", error: err });
          
          // Generate JWT token for auto-login
          const token = jwt.sign(
            { id: result.insertId, email, username }, 
            SECRET_KEY, 
            { expiresIn: "1d" }
          );
          
          res.status(201).json({ 
            message: "User registered successfully",
            token,
            user: { id: result.insertId, username, email }
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// User Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (result.length === 0) return res.status(404).json({ message: "User not found" });

    const user = result[0];

    try {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

      const token = jwt.sign(
        { id: user.id, email: user.email, username: user.username }, 
        SECRET_KEY, 
        { expiresIn: "1d" }
      );

      res.json({ 
        message: "Login successful",
        token, 
        user: { id: user.id, username: user.username, email: user.email } 
      });
    } catch (error) {
      res.status(500).json({ message: "Authentication error" });
    }
  });
});

// Get All Todos (for logged-in user) - Using email
app.get("/todos", authenticateUser, (req, res) => {
  db.query(
    "SELECT id, task, completed, due_date, priority FROM todos WHERE user_email = ?", 
    [req.user.email], // Use email instead of ID
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      res.json(result);
    }
  );
});

// Add a New Task - Using email
app.post("/todos", authenticateUser, (req, res) => {
  const { task, due_date, priority } = req.body;
  const userEmail = req.user.email; // Use email instead of ID

  // Validate input
  if (!task) {
    return res.status(400).json({ message: "Task description is required" });
  }

  // Format due date properly if provided
  const formattedDueDate = due_date ? new Date(due_date).toISOString().slice(0, 19).replace("T", " ") : null;

  // Validate priority
  const validPriorities = ["High", "Medium", "Low"];
  const finalPriority = validPriorities.includes(priority) ? priority : "Medium";

  db.query(
    "INSERT INTO todos (user_email, task, due_date, priority) VALUES (?, ?, ?, ?)",
    [userEmail, task, formattedDueDate, finalPriority],
    (err, result) => {
      if (err) {
        console.error("Error inserting data:", err);
        return res.status(500).json({ message: "Failed to create task", error: err });
      }
      
      res.status(201).json({ 
        id: result.insertId, 
        task, 
        due_date: formattedDueDate, 
        priority: finalPriority, 
        completed: false,
        user_email: userEmail
      });
    }
  );
});

// Update Task Completion - Using email
app.put("/todos/:id", authenticateUser, (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  const userEmail = req.user.email; // Use email instead of ID

  // First check if the todo belongs to the user
  db.query(
    "SELECT * FROM todos WHERE id = ? AND user_email = ?",
    [id, userEmail],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.length === 0) return res.status(404).json({ message: "Task not found or unauthorized" });
      
      // Update the todo
      db.query(
        "UPDATE todos SET completed = ? WHERE id = ?",
        [completed, id],
        (err) => {
          if (err) return res.status(500).json({ message: "Update failed", error: err });
          res.json({ message: "Task updated successfully" });
        }
      );
    }
  );
});

// Delete Task - Using email
app.delete("/todos/:id", authenticateUser, (req, res) => {
  const { id } = req.params;
  const userEmail = req.user.email; // Use email instead of ID

  // First check if the todo belongs to the user
  db.query(
    "SELECT * FROM todos WHERE id = ? AND user_email = ?",
    [id, userEmail],
    (err, result) => {
      if (err) return res.status(500).json({ message: "Database error", error: err });
      if (result.length === 0) return res.status(404).json({ message: "Task not found or unauthorized" });
      
      // Delete the todo
      db.query(
        "DELETE FROM todos WHERE id = ?", 
        [id], 
        (err) => {
          if (err) return res.status(500).json({ message: "Delete failed", error: err });
          res.json({ message: "Task deleted successfully" });
        }
      );
    }
  );
});

// Start Server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});