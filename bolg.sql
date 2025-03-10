-- Create the BlogApp database
CREATE DATABASE blog_db;
USE blog_db;

-- Table for user registration and login
CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY, -- Unique user ID
    email VARCHAR(255) UNIQUE NOT NULL, -- User's email (used for login)
    password VARCHAR(255) NOT NULL, -- User's password (should be stored securely)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Timestamp of account creation
);
