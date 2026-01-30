const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User.model');

const seedProfessor = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📦 Connected to MongoDB');

        // Check if professor already exists
        const existingProfessor = await User.findOne({ email: 'professor@srish.edu.in' });

        if (existingProfessor) {
            console.log('⚠️  Professor already exists with this email');
            console.log('📧 Email:', existingProfessor.email);
            console.log('👤 Name:', existingProfessor.name);
            console.log('🎭 Role:', existingProfessor.role);
        } else {
            // Create professor user
            const professor = await User.create({
                name: 'Dr. Professor',
                email: 'professor@srish.edu.in',
                password: 'Professor@123',
                role: 'Supervisor',
                phone: '9876543210',
                isActive: true
            });

            console.log('✅ Professor created successfully!');
            console.log('📧 Email:', professor.email);
            console.log('🔑 Password: Professor@123');
            console.log('🎭 Role:', professor.role);
        }

        // Disconnect
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
};

seedProfessor();
