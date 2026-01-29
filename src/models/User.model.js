const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please provide a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    role: {
        type: String,
        enum: {
            values: ['Student', 'Supervisor', 'Admin'],
            message: 'Role must be Student, Supervisor, or Admin'
        },
        default: 'Student'
    },
    batch: {
        type: String,
        required: function () { return this.role === 'Student'; },
        trim: true
    },
    semester: {
        type: Number,
        min: [1, 'Semester must be at least 1'],
        max: [8, 'Semester cannot exceed 8'],
        required: function () { return this.role === 'Student'; }
    },
    totalAllottedHours: {
        type: Number,
        default: 500,
        min: [0, 'Total allotted hours cannot be negative']
    },
    completedHours: {
        type: Number,
        default: 0,
        min: [0, 'Completed hours cannot be negative']
    },
    profileImage: {
        type: String,
        default: null
    },
    phone: {
        type: String,
        match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
    },
    registrationNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    passwordResetToken: String,
    passwordResetExpires: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for hours completion percentage
UserSchema.virtual('hoursCompletionPercentage').get(function () {
    if (this.totalAllottedHours === 0) return 0;
    return Math.min(100, Math.round((this.completedHours / this.totalAllottedHours) * 100));
});

// Virtual for remaining hours
UserSchema.virtual('remainingHours').get(function () {
    return Math.max(0, this.totalAllottedHours - this.completedHours);
});

// Pre-save middleware to hash password
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
UserSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Method to generate JWT token
UserSchema.methods.getSignedJwtToken = function () {
    return jwt.sign(
        { id: this._id, role: this.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// Index for efficient queries
UserSchema.index({ role: 1, batch: 1 });
UserSchema.index({ supervisor: 1 });

module.exports = mongoose.model('User', UserSchema);
