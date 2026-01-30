const Attendance = require('../models/Attendance.model');
const User = require('../models/User.model');

// @desc    Check in
// @route   POST /api/attendance/check-in
// @access  Private
// @desc    Check in
// @route   POST /api/attendance/check-in
// @access  Private
exports.checkIn = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check if already checked in (active session)
        const activeSession = await Attendance.findOne({
            student: req.user.id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            },
            timeOut: null
        });

        if (activeSession) {
            return res.status(400).json({
                success: false,
                message: 'You are already checked in. Please check out first.'
            });
        }

        const attendance = await Attendance.create({
            student: req.user.id,
            date: today,
            timeIn: new Date(),
            location: req.body.location || 'Main Clinic',
            supervisor: req.user.supervisor
        });

        res.status(201).json({
            success: true,
            message: 'Checked in successfully',
            data: attendance
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error checking in',
            error: error.message
        });
    }
};

// @desc    Check out
// @route   PUT /api/attendance/check-out
// @access  Private
exports.checkOut = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find active session for today
        const attendance = await Attendance.findOne({
            student: req.user.id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            },
            timeOut: null
        });

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: 'No active check-in record found for today'
            });
        }

        attendance.timeOut = new Date();
        attendance.breakDuration = req.body.breakDuration || 0;
        attendance.notes = req.body.notes;

        // Calculate partial hours for this session if needed, but the model pre-save hook likely handles totalHours calculation
        // Assuming the model has logic or we calculate it here?
        // Let's assume the model handles it or we rely on the next fetch. 
        // But the previous code didn't calculate it explicitly before save, it relied on attendance.totalHours AFTER save?
        // Wait, previous code accessed attendance.totalHours. Let's ensure the model does it.

        // Calculate duration in hours
        const diffMs = attendance.timeOut - attendance.timeIn;
        const diffHrs = diffMs / (1000 * 60 * 60);
        attendance.totalHours = diffHrs - (attendance.breakDuration / 60);

        await attendance.save();

        // Update user's completed hours
        await User.findByIdAndUpdate(req.user.id, {
            $inc: { completedHours: attendance.totalHours }
        });

        res.status(200).json({
            success: true,
            message: 'Checked out successfully',
            data: {
                ...attendance.toJSON(),
                hoursWorked: attendance.totalHours
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error checking out',
            error: error.message
        });
    }
};

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
exports.getAttendance = async (req, res) => {
    try {
        let query;

        if (req.user.role === 'Student') {
            query = Attendance.find({ student: req.user.id });
        } else {
            query = Attendance.find();
            if (req.query.studentId) {
                query = query.where('student').equals(req.query.studentId);
            }
        }

        // Date range filter
        if (req.query.startDate && req.query.endDate) {
            query = query.where('date')
                .gte(new Date(req.query.startDate))
                .lte(new Date(req.query.endDate));
        }

        // Month filter
        if (req.query.month && req.query.year) {
            const startOfMonth = new Date(req.query.year, req.query.month - 1, 1);
            const endOfMonth = new Date(req.query.year, req.query.month, 0, 23, 59, 59);
            query = query.where('date').gte(startOfMonth).lte(endOfMonth);
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 31;
        const skip = (page - 1) * limit;

        query = query.skip(skip).limit(limit)
            .populate('student', 'name email batch')
            .populate('supervisor', 'name')
            .sort({ date: -1 });

        const attendance = await query;
        const total = await Attendance.countDocuments(query.getFilter());

        res.status(200).json({
            success: true,
            count: attendance.length,
            total,
            data: attendance
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance',
            error: error.message
        });
    }
};

// @desc    Get today's attendance status
// @route   GET /api/attendance/today
// @access  Private
exports.getTodayStatus = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Check for active session first
        let attendance = await Attendance.findOne({
            student: req.user.id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            },
            timeOut: null
        });

        // If no active session, get the latest session for today
        if (!attendance) {
            attendance = await Attendance.findOne({
                student: req.user.id,
                date: {
                    $gte: today,
                    $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                }
            }).sort({ createdAt: -1 });
        }

        res.status(200).json({
            success: true,
            data: {
                isCheckedIn: !!attendance?.timeIn,
                isCheckedOut: !!attendance?.timeOut,
                attendance
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching today\'s status',
            error: error.message
        });
    }
};

// @desc    Supervisor verify attendance
// @route   PUT /api/attendance/:id/verify
// @access  Private (Supervisor, Admin)
exports.verifyAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findByIdAndUpdate(
            req.params.id,
            {
                supervisorVerified: true,
                verifiedAt: new Date(),
                supervisor: req.user.id
            },
            { new: true }
        ).populate('student', 'name email');

        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found'
            });
        }

        res.status(200).json({
            success: true,
            data: attendance
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error verifying attendance',
            error: error.message
        });
    }
};

// @desc    Get monthly summary
// @route   GET /api/attendance/monthly-summary
// @access  Private
exports.getMonthlySummary = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;
        const studentId = req.user.role === 'Student' ? req.user.id : req.query.studentId;

        if (!studentId) {
            return res.status(400).json({
                success: false,
                message: 'Student ID is required'
            });
        }

        const summary = await Attendance.getMonthlySummary(studentId, year, month);

        res.status(200).json({
            success: true,
            data: {
                year,
                month,
                ...summary
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching monthly summary',
            error: error.message
        });
    }
};
