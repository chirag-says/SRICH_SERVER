const LeaveRequest = require('../models/LeaveRequest.model');

// @desc    Create leave request
// @route   POST /api/leave-requests
// @access  Private
exports.createLeaveRequest = async (req, res) => {
    try {
        const { leaveType, startDate, endDate, reason, isEmergency } = req.body;

        // Check for overlapping leave requests
        const hasOverlap = await LeaveRequest.hasOverlappingLeave(
            req.user.id,
            new Date(startDate),
            new Date(endDate)
        );

        if (hasOverlap) {
            return res.status(400).json({
                success: false,
                message: 'You already have a leave request for some of these dates'
            });
        }

        const leaveRequest = await LeaveRequest.create({
            student: req.user.id,
            createdBy: req.user.id,
            leaveType,
            startDate,
            endDate,
            reason,
            isEmergency: isEmergency || false
        });

        res.status(201).json({
            success: true,
            data: leaveRequest
        });
    } catch (error) {
        console.error('Create leave request error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating leave request',
            error: error.message
        });
    }
};

// @desc    Get all leave requests
// @route   GET /api/leave-requests
// @access  Private
exports.getLeaveRequests = async (req, res) => {
    try {
        let query;

        // Students can only see their own leave requests
        if (req.user.role === 'Student') {
            query = LeaveRequest.find({ student: req.user.id });
        } else {
            query = LeaveRequest.find();
        }

        // Filter by status
        if (req.query.status) {
            query = query.where('status').equals(req.query.status);
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        query = query.skip(skip).limit(limit)
            .populate('student', 'name email batch semester')
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 });

        const leaveRequests = await query;
        const total = await LeaveRequest.countDocuments(query.getFilter());

        res.status(200).json({
            success: true,
            count: leaveRequests.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: leaveRequests
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching leave requests',
            error: error.message
        });
    }
};

// @desc    Get single leave request
// @route   GET /api/leave-requests/:id
// @access  Private
exports.getLeaveRequest = async (req, res) => {
    try {
        const leaveRequest = await LeaveRequest.findById(req.params.id)
            .populate('student', 'name email batch semester')
            .populate('reviewedBy', 'name email');

        if (!leaveRequest) {
            return res.status(404).json({
                success: false,
                message: 'Leave request not found'
            });
        }

        // Check authorization
        if (req.user.role === 'Student' && leaveRequest.student._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this leave request'
            });
        }

        res.status(200).json({
            success: true,
            data: leaveRequest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching leave request',
            error: error.message
        });
    }
};

// @desc    Update leave request
// @route   PUT /api/leave-requests/:id
// @access  Private
exports.updateLeaveRequest = async (req, res) => {
    try {
        let leaveRequest = await LeaveRequest.findById(req.params.id);

        if (!leaveRequest) {
            return res.status(404).json({
                success: false,
                message: 'Leave request not found'
            });
        }

        // Only allow updates to pending requests by the student who created it
        if (req.user.role === 'Student') {
            if (leaveRequest.student.toString() !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to update this leave request'
                });
            }

            if (leaveRequest.status !== 'Pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot modify a leave request that is not pending'
                });
            }
        }

        // Check for overlapping dates if dates are being changed
        if (req.body.startDate || req.body.endDate) {
            const hasOverlap = await LeaveRequest.hasOverlappingLeave(
                leaveRequest.student,
                new Date(req.body.startDate || leaveRequest.startDate),
                new Date(req.body.endDate || leaveRequest.endDate),
                leaveRequest._id
            );

            if (hasOverlap) {
                return res.status(400).json({
                    success: false,
                    message: 'You already have a leave request for some of these dates'
                });
            }
        }

        leaveRequest = await LeaveRequest.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: leaveRequest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating leave request',
            error: error.message
        });
    }
};

// @desc    Cancel leave request
// @route   PUT /api/leave-requests/:id/cancel
// @access  Private
exports.cancelLeaveRequest = async (req, res) => {
    try {
        const leaveRequest = await LeaveRequest.findById(req.params.id);

        if (!leaveRequest) {
            return res.status(404).json({
                success: false,
                message: 'Leave request not found'
            });
        }

        // Only the student who created it or admin can cancel
        if (req.user.role === 'Student' && leaveRequest.student.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to cancel this leave request'
            });
        }

        // Can only cancel pending or approved requests
        if (!['Pending', 'Approved'].includes(leaveRequest.status)) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel this leave request'
            });
        }

        leaveRequest.status = 'Cancelled';
        await leaveRequest.save();

        res.status(200).json({
            success: true,
            data: leaveRequest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error cancelling leave request',
            error: error.message
        });
    }
};

// @desc    Review leave request (approve/reject)
// @route   PUT /api/leave-requests/:id/review
// @access  Private (Supervisor, Admin)
exports.reviewLeaveRequest = async (req, res) => {
    try {
        const { status, reviewComments } = req.body;

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be Approved or Rejected'
            });
        }

        const leaveRequest = await LeaveRequest.findById(req.params.id);

        if (!leaveRequest) {
            return res.status(404).json({
                success: false,
                message: 'Leave request not found'
            });
        }

        if (leaveRequest.status !== 'Pending') {
            return res.status(400).json({
                success: false,
                message: 'This leave request has already been reviewed'
            });
        }

        leaveRequest.status = status;
        leaveRequest.reviewedBy = req.user.id;
        leaveRequest.reviewedAt = new Date();
        leaveRequest.reviewComments = reviewComments;

        await leaveRequest.save();

        await leaveRequest.populate([
            { path: 'student', select: 'name email' },
            { path: 'reviewedBy', select: 'name email' }
        ]);

        res.status(200).json({
            success: true,
            data: leaveRequest
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error reviewing leave request',
            error: error.message
        });
    }
};

// @desc    Get pending leave requests count
// @route   GET /api/leave-requests/pending-count
// @access  Private (Supervisor, Admin)
exports.getPendingCount = async (req, res) => {
    try {
        const count = await LeaveRequest.countDocuments({ status: 'Pending' });

        res.status(200).json({
            success: true,
            data: { pendingCount: count }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching pending count',
            error: error.message
        });
    }
};
