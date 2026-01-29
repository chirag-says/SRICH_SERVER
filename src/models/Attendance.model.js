const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Student ID is required']
    },
    date: {
        type: Date,
        required: [true, 'Date is required'],
        default: Date.now
    },
    timeIn: {
        type: Date,
        required: [true, 'Check-in time is required']
    },
    timeOut: {
        type: Date
    },
    breakDuration: {
        type: Number, // Duration in minutes
        default: 0,
        min: [0, 'Break duration cannot be negative']
    },
    location: {
        type: String,
        enum: ['Main Clinic', 'OPD', 'Audiology Lab', 'Speech Lab', 'Ward', 'Camp', 'Other'],
        default: 'Main Clinic'
    },
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    supervisorVerified: {
        type: Boolean,
        default: false
    },
    verifiedAt: {
        type: Date
    },
    notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    isManualEntry: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for regular hours worked (max 8 hours)
AttendanceSchema.virtual('regularHours').get(function () {
    if (!this.timeIn || !this.timeOut) return 0;

    const diffMs = this.timeOut - this.timeIn;
    const diffHrs = diffMs / (1000 * 60 * 60);
    const netHours = Math.max(0, diffHrs - (this.breakDuration / 60));

    return Math.min(8, netHours);
});

// Virtual for extra hours (beyond 8 hours)
AttendanceSchema.virtual('extraHours').get(function () {
    if (!this.timeIn || !this.timeOut) return 0;

    const diffMs = this.timeOut - this.timeIn;
    const diffHrs = diffMs / (1000 * 60 * 60);
    const netHours = Math.max(0, diffHrs - (this.breakDuration / 60));

    return Math.max(0, netHours - 8);
});

// Virtual for total hours worked
AttendanceSchema.virtual('totalHours').get(function () {
    if (!this.timeIn || !this.timeOut) return 0;

    const diffMs = this.timeOut - this.timeIn;
    const diffHrs = diffMs / (1000 * 60 * 60);

    return Math.max(0, diffHrs - (this.breakDuration / 60));
});

// Virtual for formatted duration
AttendanceSchema.virtual('formattedDuration').get(function () {
    const total = this.totalHours;
    const hours = Math.floor(total);
    const minutes = Math.round((total - hours) * 60);
    return `${hours}h ${minutes}m`;
});

// Pre-save validation to ensure timeOut is after timeIn
AttendanceSchema.pre('save', function (next) {
    if (this.timeOut && this.timeIn && this.timeOut <= this.timeIn) {
        next(new Error('Check-out time must be after check-in time'));
    }
    next();
});

// Compound index for unique attendance per student per day
AttendanceSchema.index({ student: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ date: -1 });
AttendanceSchema.index({ supervisor: 1, supervisorVerified: 1 });

// Static method to get monthly summary for a student
AttendanceSchema.statics.getMonthlySummary = async function (studentId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const result = await this.aggregate([
        {
            $match: {
                student: new mongoose.Types.ObjectId(studentId),
                date: { $gte: startDate, $lte: endDate },
                timeOut: { $ne: null }
            }
        },
        {
            $project: {
                totalMs: { $subtract: ['$timeOut', '$timeIn'] },
                breakMinutes: '$breakDuration'
            }
        },
        {
            $project: {
                netHours: {
                    $subtract: [
                        { $divide: ['$totalMs', 3600000] },
                        { $divide: ['$breakMinutes', 60] }
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                totalDays: { $sum: 1 },
                totalHours: { $sum: '$netHours' }
            }
        }
    ]);

    return result[0] || { totalDays: 0, totalHours: 0 };
};

module.exports = mongoose.model('Attendance', AttendanceSchema);
