require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const createAdmin = async () => {
  const adminData = {
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin'
  };

  try {
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('Admin already exists:', existingAdmin.email);
      process.exit(0);
    }

    // Create new admin
    const admin = new Admin(adminData);
    await admin.save();
    console.log('Admin created successfully:', admin.email);
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err);
    process.exit(1);
  }
};

createAdmin();