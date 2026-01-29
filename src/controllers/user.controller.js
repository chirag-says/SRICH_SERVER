const User = require('../models/User.model');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin, Supervisor)
exports.getUsers = async (req, res) => {
    try {
        let query = User.find();

        // Filter by role
        if (req.query.role) {
            query = query.where('role').equals(req.query.role);
        }

        // Filter by batch
        if (req.query.batch) {
            query = query.where('batch').equals(req.query.batch);
        }

        // Filter by semester
        if (req.query.semester) {
            query = query.where('semester').equals(req.query.semester);
        }

        // Search by name or email
        if (req.query.search) {
            query = query.or([
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } }
            ]);
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        query = query.skip(skip).limit(limit)
            .populate('supervisor', 'name email')
            .sort({ createdAt: -1 });

        const users = await query;
        const total = await User.countDocuments(query.getFilter());

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('supervisor', 'name email');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching user',
            error: error.message
        });
    }
};

// @desc    Create user (Admin only)
// @route   POST /api/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
    try {
        const user = await User.create(req.body);

        res.status(201).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating user',
            error: error.message
        });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin)
exports.updateUser = async (req, res) => {
    try {
        // Don't allow password update through this route
        delete req.body.password;

        const user = await User.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating user',
            error: error.message
        });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin)
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Soft delete - just deactivate
        user.isActive = false;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'User deactivated',
            data: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting user',
            error: error.message
        });
    }
};

// @desc    Get students by supervisor
// @route   GET /api/users/my-students
// @access  Private (Supervisor)
exports.getMyStudents = async (req, res) => {
    try {
        const students = await User.find({
            supervisor: req.user.id,
            role: 'Student',
            isActive: true
        }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching students',
            error: error.message
        });
    }
};

// @desc    Assign supervisor to student
// @route   PUT /api/users/:id/assign-supervisor
// @access  Private (Admin)
exports.assignSupervisor = async (req, res) => {
    try {
        const { supervisorId } = req.body;

        // Verify supervisor exists and has the correct role
        const supervisor = await User.findOne({ _id: supervisorId, role: 'Supervisor' });
        if (!supervisor) {
            return res.status(404).json({
                success: false,
                message: 'Supervisor not found'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { supervisor: supervisorId },
            { new: true }
        ).populate('supervisor', 'name email');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error assigning supervisor',
            error: error.message
        });
    }
};

// @desc    Update student hours
// @route   PUT /api/users/:id/update-hours
// @access  Private (Admin, Supervisor)
exports.updateHours = async (req, res) => {
    try {
        const { totalAllottedHours, completedHours } = req.body;

        const updateData = {};
        if (totalAllottedHours !== undefined) updateData.totalAllottedHours = totalAllottedHours;
        if (completedHours !== undefined) updateData.completedHours = completedHours;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating hours',
            error: error.message
        });
    }
};
