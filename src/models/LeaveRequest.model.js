const mongoose = require('mongoose');

const LeaveRequestSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Student ID is required']
    },
    leaveType: {
        type: String,
        enum: {
            values: ['Sick Leave', 'Personal Leave', 'Emergency', 'Academic', 'Other'],
            message: 'Invalid leave type'
        },
        required: [true, 'Leave type is required']
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    },
    endDate: {
        type: Date,
        required: [true, 'End date is required']
    },
    reason: {
        type: String,
        required: [true, 'Reason is required'],
        minlength: [10, 'Reason must be at least 10 characters'],
        maxlength: [1000, 'Reason cannot exceed 1000 characters']
    },
    supportingDocuments: [{
        fileName: String,
        fileUrl: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    status: {
        type: String,
        enum: {
            values: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
            message: 'Invalid status'
        },
        default: 'Pending'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    },
    reviewComments: {
        type: String,
        maxlength: [500, 'Review comments cannot exceed 500 characters']
    },
    isEmergency: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for number of days
LeaveRequestSchema.virtual('numberOfDays').get(function () {
    if (!this.startDate || !this.endDate) return 0;
    const diffTime = Math.abs(this.endDate - this.startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // Include both start and end dates
});

// Virtual for leave status display
LeaveRequestSchema.virtual('statusDisplay').get(function () {
    const statusColors = {
        'Pending': '🟡',
        'Approved': '🟢',
        'Rejected': '🔴',
        'Cancelled': '⚪'
    };
    return `${statusColors[this.status] || ''} ${this.status}`;
});

// Pre-save validation
LeaveRequestSchema.pre('save', function (next) {
    if (this.endDate < this.startDate) {
        next(new Error('End date must be after or equal to start date'));
    }
    next();
});

// Indexes
LeaveRequestSchema.index({ student: 1, status: 1 });
LeaveRequestSchema.index({ status: 1, createdAt: -1 });
LeaveRequestSchema.index({ startDate: 1, endDate: 1 });
LeaveRequestSchema.index({ reviewedBy: 1 });

// Static method to check for overlapping leave requests
LeaveRequestSchema.statics.hasOverlappingLeave = async function (studentId, startDate, endDate, excludeId = null) {
    const query = {
        student: studentId,
        status: { $in: ['Pending', 'Approved'] },
        $or: [
            { startDate: { $lte: endDate }, endDate: { $gte: startDate } }
        ]
    };

    if (excludeId) {
        query._id = { $ne: excludeId };
    }

    const count = await this.countDocuments(query);
    return count > 0;
};

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema);
